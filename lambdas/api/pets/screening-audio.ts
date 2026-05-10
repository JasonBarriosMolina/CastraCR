/**
 * POST /pets/{petId}/screening-audio
 *
 * Recibe audio en base64 desde el app del dueño.
 * Haiku transcribe Y extrae todos los datos de screening en una sola llamada.
 * Persiste los datos en PET#${petId}/METADATA y devuelve el resultado para
 * que el app confirme los datos extraídos.
 *
 * Body: {
 *   audioBase64: string,   // audio WebM/OGG/MP4 en base64
 *   mediaType: string,     // "audio/webm" | "audio/ogg" | "audio/mp4"
 *   petNombre?: string,    // nombre del pet (para contexto en el prompt)
 *   petEspecie?: string,   // "perro" | "gato" (para contexto)
 *   petSexo?: string,      // "macho" | "hembra" (para contexto)
 * }
 *
 * Response: {
 *   extracted: ScreeningData,
 *   aptoCirugia: boolean,
 *   alertasVet: string[],
 *   razonRechazo?: string,
 * }
 */

import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import Anthropic from '@anthropic-ai/sdk';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { NotFoundError } from '@castrar-cr/utils';

const anthropic = new Anthropic();

// ── Tool para extracción completa en una sola llamada ──────────────────────────

const TOOL_SCREENING_COMPLETO: Anthropic.Tool = {
  name: 'extraer_screening_completo',
  description: 'Extrae TODOS los datos de screening médico pre-operatorio desde el audio del dueño',
  input_schema: {
    type: 'object' as const,
    required: ['aptoCirugia', 'alertasVet'],
    properties: {
      // Datos básicos de la mascota (si el dueño los menciona)
      nombre: { type: 'string', description: 'Nombre de la mascota si lo menciona' },
      especie: { type: 'string', enum: ['perro', 'gato', 'otro'] },
      sexo: { type: 'string', enum: ['macho', 'hembra'] },
      pesoKg: { type: 'number', description: 'Peso en kg (convertir si dice libras: 1 lb = 0.45 kg)' },
      edadMeses: { type: 'number', description: 'Edad en meses totales (si dice "2 años" = 24 meses)' },

      // Salud general
      condicionSaludRaw: { type: 'string', description: 'Descripción textual del estado de salud según el dueño' },
      vacunasAlDia: { type: 'boolean', description: 'true si dice que tiene vacunas al día o actualizadas' },
      tratamientosActivos: { type: 'string', description: 'Medicamentos o tratamientos activos que mencione, o null' },

      // Específico hembras
      estadoReproductivo: {
        type: 'string',
        enum: ['prenada', 'celo', 'lactando', 'normal'],
        description: 'Estado reproductivo si es hembra',
      },

      // Específico machos
      criptorquidismo: {
        type: 'boolean',
        description: 'true si menciona que el perro/gato tiene un testículo no descendido o "criptorquidismo"',
      },

      // Evaluación médica
      aptoCirugia: {
        type: 'boolean',
        description: 'true si el animal parece ser candidato seguro para cirugía de castración',
      },
      razonRechazo: {
        type: 'string',
        description: 'Solo si aptoCirugia=false: razón breve en español amigable para el dueño',
      },
      alertasVet: {
        type: 'array',
        items: { type: 'string' },
        description: 'Alertas para el veterinario aunque aptoCirugia=true. Puede estar vacío []',
      },
    },
  },
};

const SYSTEM_PROMPT = `Sos un asistente médico veterinario que evalúa si una mascota puede
operarse de castración bajo anestesia general. El dueño va a hablar en un audio.

Tu tarea: escuchá el audio, extraé TODA la información relevante y evaluá si la mascota es apta.

CRITERIOS DE RECHAZO (aptoCirugia=false):
- Vomitando, con diarrea activa, o fiebre en este momento
- Menos de 4 meses de edad
- Menos de 2 kg de peso
- Cirugía o anestesia en las últimas 3 semanas
- Diabetes, insuficiencia renal o hepática
- Convulsiones o epilepsia no controlada
- Hembra preñada o en celo

ALERTAS (aptoCirugia=true pero alertas no vacías):
- Criptorquidismo → "Un testículo no descendido — requiere procedimiento especializado"
- Medicamentos activos → "Tratamiento activo con [nombre]: evaluar interacción con anestesia"
- Edad avanzada (>10 años) → "Animal de edad avanzada: evaluación extra el día del evento"
- Hembra lactando → "Lactando — verificar edad de cachorros el día del evento"
- Condición crónica controlada → "Condición crónica [cuál]: informar al vet"

Si el dueño no menciona un dato, dejá ese campo sin incluir (undefined/ausente).
Respondé SOLO con el resultado de la herramienta, sin texto adicional.`;

// ── Handler ────────────────────────────────────────────────────────────────────

interface ScreeningAudioBody {
  audioBase64: string;
  mediaType: string;
  petNombre?: string;
  petEspecie?: string;
  petSexo?: string;
}

interface ScreeningResult {
  nombre?: string;
  especie?: string;
  sexo?: string;
  pesoKg?: number;
  edadMeses?: number;
  condicionSaludRaw?: string;
  vacunasAlDia?: boolean;
  tratamientosActivos?: string;
  estadoReproductivo?: string;
  criptorquidismo?: boolean;
  aptoCirugia: boolean;
  razonRechazo?: string;
  alertasVet: string[];
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Dueno', 'SuperAdmin');

    const petId = event.pathParameters?.['petId'];
    if (!petId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'petId es requerido', code: 'INVALID_PARAMS' }) };
    }

    const body = JSON.parse(event.body ?? '{}') as ScreeningAudioBody;
    const { audioBase64, mediaType, petNombre, petEspecie, petSexo } = body;

    if (!audioBase64 || !mediaType) {
      return { statusCode: 400, body: JSON.stringify({ error: 'audioBase64 y mediaType son requeridos', code: 'INVALID_BODY' }) };
    }

    // Validar que el pet pertenece al usuario
    const petResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `PET#${petId}`, SK: 'METADATA' },
    }));
    if (!petResult.Item) throw new NotFoundError('Mascota');
    if (petResult.Item['userId'] !== authCtx.userId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'No autorizado', code: 'FORBIDDEN' }) };
    }

    // Contexto adicional en el user message
    const contextLines: string[] = [];
    if (petNombre) contextLines.push(`Nombre de la mascota: ${petNombre}`);
    if (petEspecie) contextLines.push(`Especie: ${petEspecie}`);
    if (petSexo) contextLines.push(`Sexo: ${petSexo}`);

    const userText = contextLines.length > 0
      ? `Datos ya conocidos:\n${contextLines.join('\n')}\n\nEscuchá el audio y completá el screening:`
      : 'Escuchá el audio y completá el screening pre-operatorio:';

    // Llamada a Haiku con audio — transcribe Y extrae en una sola llamada
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [TOOL_SCREENING_COMPLETO],
      tool_choice: { type: 'tool', name: 'extraer_screening_completo' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: mediaType as 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/mpeg' | 'audio/wav',
                data: audioBase64,
              },
            } as unknown as Anthropic.TextBlockParam,
          ],
        },
      ],
    });

    // Extraer resultado del tool use
    const toolBlock = response.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
    if (!toolBlock) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Error procesando el audio', code: 'AI_ERROR' }) };
    }

    const extracted = toolBlock.input as ScreeningResult;
    const now = new Date().toISOString();

    // Persistir en DynamoDB — solo los campos presentes en el audio
    const updateParts: string[] = ['screenedAt = :screenedAt', 'actualizadoEn = :now'];
    const exprVals: Record<string, unknown> = { ':screenedAt': now, ':now': now };
    const exprNames: Record<string, string> = {};

    const fieldMap: Array<[keyof ScreeningResult, string]> = [
      ['nombre', 'nombre'],
      ['especie', 'especie'],
      ['sexo', 'sexo'],
      ['pesoKg', 'pesoKg'],
      ['edadMeses', 'edadMeses'],
      ['condicionSaludRaw', 'condicionSaludRaw'],
      ['vacunasAlDia', 'vacunasAlDia'],
      ['tratamientosActivos', 'tratamientosActivos'],
      ['estadoReproductivo', 'estadoReproductivo'],
      ['criptorquidismo', 'criptorquidismo'],
      ['aptoCirugia', 'aptoCirugia'],
      ['razonRechazo', 'razonRechazo'],
      ['alertasVet', 'alertasVet'],
    ];

    for (const [key, attr] of fieldMap) {
      if (extracted[key] !== undefined) {
        const placeholder = `:${key}`;
        // aptoCirugia y alertasVet siempre presentes (required en tool schema)
        updateParts.push(`#${attr} = ${placeholder}`);
        exprNames[`#${attr}`] = attr;
        exprVals[placeholder] = extracted[key];
      }
    }

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `PET#${petId}`, SK: 'METADATA' },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprVals,
    }));

    // Registrar costo de la llamada en el cost tracker (best-effort)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const campaignId = petResult.Item['campaignId'] as string | undefined;
    if (campaignId) {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'COSTS' },
        UpdateExpression: 'SET actualizadoEn = :now, campaignId = :cid ADD haikuCalls :one, haikuInputTokens :inp, haikuOutputTokens :out',
        ExpressionAttributeValues: {
          ':now': now,
          ':cid': campaignId,
          ':one': 1,
          ':inp': inputTokens,
          ':out': outputTokens,
        },
      })).catch(() => { /* cost tracking es best-effort */ });
    }

    return ok({
      extracted,
      aptoCirugia: extracted.aptoCirugia,
      alertasVet: extracted.alertasVet,
      razonRechazo: extracted.razonRechazo,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
