import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import twilio from 'twilio';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { getSecrets } from '../../shared/secrets.js';
import { sanitizeForAI } from '@castrar-cr/utils';
import type {
  ConversationState,
  DatosRegistro,
  ElegibilidadResult,
  EstadoReproductivoResult,
  PostOpEvaluacionResult,
} from '@castrar-cr/types';

const RATE_LIMIT_HOURLY = 30;

// ─────────────────────────────────────────────
// PROMPTS DE SISTEMA
// ─────────────────────────────────────────────

const SYSTEM_SCREENING = `Sos un asistente médico veterinario que evalúa si una mascota es
candidata segura para cirugía de castración bajo anestesia general.
Respondé SOLO con el resultado de la herramienta, sin texto adicional.

Criterios de RECHAZO (apto=false):
- Vomitando, con diarrea activa, o con fiebre
- Menos de 4 meses de edad
- Menos de 2 kg de peso
- Cirugía o anestesia en las últimas 3 semanas
- Diabetes, insuficiencia renal o hepática conocida
- Convulsiones activas o epilepsia no controlada

Alertas para el vet (apto=true pero alertas no vacías):
- Criptorquidismo: "requiere procedimiento especializado"
- Medicamentos activos: mencionar cuáles
- Edad muy avanzada (>8 años): "evaluar en el evento"
- Condición crónica controlada: indicar cuál`;

const SYSTEM_REPRODUCTIVO = `Extraé el estado reproductivo de una hembra (perra o gata)
desde la respuesta del dueño. Respondé SOLO con el resultado de la herramienta.`;

const SYSTEM_POSTOP = (dia: number, especie: string) =>
  `Sos asistente veterinario evaluando post-operatorio de castración. Día ${dia} post-cirugía. Especie: ${especie}.

Signos URGENTES (nivel=urgente):
- Sangrado activo o herida abierta
- No come ni bebe hace más de 24 horas
- Convulsiones o pérdida de conciencia
- Jadeo excesivo o dificultad respiratoria
- Abdomen muy inflamado o duro
- Temperatura muy alta (el dueño lo menciona)
- Animal inconsciente o no reacciona

Signos de OBSERVACIÓN (nivel=observacion):
- Leve hinchazón alrededor de la herida
- Lamido ocasional de la herida
- Algo de letargo o tristeza (primer o segundo día es normal)
- Poco apetito en las primeras 12 horas

NORMAL: animal activo, come y bebe, herida limpia y cerrada.

Respondé SOLO con el resultado de la herramienta.`;

// ─────────────────────────────────────────────
// HERRAMIENTAS HAIKU (tool-use para structured output)
// ─────────────────────────────────────────────

const TOOL_ELEGIBILIDAD: Anthropic.Tool = {
  name: 'evaluar_elegibilidad',
  description: 'Evalúa si la mascota es apta para cirugía de castración',
  input_schema: {
    type: 'object' as const,
    required: ['apto', 'alertas'],
    properties: {
      apto: { type: 'boolean', description: 'true si puede operarse con seguridad hoy' },
      razon: { type: 'string', description: 'Solo si apto=false: razón breve en español' },
      alertas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Alertas para el veterinario (puede estar vacío)',
      },
    },
  },
};

const TOOL_DATOS_BASICOS: Anthropic.Tool = {
  name: 'extraer_datos_mascota',
  description: 'Extrae los datos básicos de la mascota del mensaje del dueño',
  input_schema: {
    type: 'object' as const,
    required: [],
    properties: {
      nombre: { type: 'string' },
      especie: { type: 'string', enum: ['perro', 'gato', 'otro'] },
      sexo: { type: 'string', enum: ['macho', 'hembra'] },
      pesoKg: { type: 'number' },
      edadMeses: { type: 'number', description: 'edad en meses totales' },
    },
  },
};

const TOOL_REPRODUCTIVO: Anthropic.Tool = {
  name: 'evaluar_estado_reproductivo',
  description: 'Extrae el estado reproductivo de una hembra',
  input_schema: {
    type: 'object' as const,
    required: ['estado'],
    properties: {
      estado: {
        type: 'string',
        enum: ['prenada', 'celo', 'lactando', 'normal'],
      },
      semanasGestacion: { type: 'number', description: 'Si prenada, semanas estimadas' },
      semanasCachorros: { type: 'number', description: 'Si lactando, edad cachorros en semanas' },
    },
  },
};

const TOOL_SALUD_ADICIONAL: Anthropic.Tool = {
  name: 'extraer_salud_adicional',
  description: 'Extrae información de vacunas y tratamientos activos',
  input_schema: {
    type: 'object' as const,
    required: ['vacunasAlDia'],
    properties: {
      vacunasAlDia: { type: 'boolean' },
      tratamientosActivos: {
        type: 'string',
        description: 'Descripción de medicamentos o tratamientos activos, o null si ninguno',
      },
    },
  },
};

const TOOL_POSTOP: Anthropic.Tool = {
  name: 'evaluar_estado_postop',
  description: 'Clasifica el estado post-operatorio de la mascota',
  input_schema: {
    type: 'object' as const,
    required: ['nivel', 'descripcion', 'signosPreocupantes'],
    properties: {
      nivel: { type: 'string', enum: ['normal', 'observacion', 'urgente'] },
      descripcion: { type: 'string', description: 'Resumen de 1 oración del estado' },
      signosPreocupantes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Lista de signos preocupantes detectados (puede estar vacía)',
      },
    },
  },
};

// ─────────────────────────────────────────────
// DynamoDB helpers
// ─────────────────────────────────────────────

async function getRateLimitCount(telefono: string): Promise<number> {
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
  const result = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `RATE#${telefono}`, SK: 'HOURLY' },
  }));
  const item = result.Item;
  if (!item || (item['windowStart'] as number) < oneHourAgo) return 0;
  return (item['count'] as number) ?? 0;
}

async function incrementRateLimit(telefono: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `RATE#${telefono}`, SK: 'HOURLY' },
    UpdateExpression:
      'SET #count = if_not_exists(#count, :zero) + :one, windowStart = if_not_exists(windowStart, :now), #ttl = :ttl',
    ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':now': now, ':ttl': now + 7200 },
  }));
}

async function getConversation(telefono: string): Promise<ConversationState | null> {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `CONVERSATION#${telefono}`, SK: 'WA_STATE' },
  }));
  return (result.Item as ConversationState | undefined) ?? null;
}

async function saveConversation(state: ConversationState, ttlSeconds?: number): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + (ttlSeconds ?? 86400); // 24h default
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { PK: `CONVERSATION#${state.telefono}`, SK: 'WA_STATE', ...state, ttl },
  }));
}

async function getCampaignasCercanas(provincia: string): Promise<{ campaignId: string; titulo: string; fecha: string; cupos: number }[]> {
  // Por ahora devuelve campañas activas — idealmente filtrar por geohash
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI4-estado',
    KeyConditionExpression: 'GSI4PK = :estado',
    ExpressionAttributeValues: { ':estado': 'ESTADO#activa' },
    Limit: 5,
  }));
  return (result.Items ?? []).map((item) => ({
    campaignId: item['campaignId'] as string,
    titulo: item['titulo'] as string,
    fecha: item['fechaInicio'] as string,
    cupos: item['cuposDisponibles'] as number ?? 0,
  }));
}

async function getSlots(campaignId: string): Promise<{ slotId: string; horaInicio: string; cupos: number }[]> {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
  }));
  const slots = (result.Item?.['slots'] ?? []) as { slotId: string; horaInicio: string; cuposDisponibles: number }[];
  return slots
    .filter((s) => s.cuposDisponibles > 0)
    .map((s) => ({ slotId: s.slotId, horaInicio: s.horaInicio, cupos: s.cuposDisponibles }));
}

// ─────────────────────────────────────────────
// Twilio helpers
// ─────────────────────────────────────────────

async function responder(
  to: string,
  message: string,
  secrets: Record<string, string>,
): Promise<void> {
  const client = twilio(secrets['TWILIO_ACCOUNT_SID'], secrets['TWILIO_AUTH_TOKEN']);
  await client.messages.create({
    from: `whatsapp:${secrets['TWILIO_WHATSAPP_NUMBER']}`,
    to,
    body: message,
  });
}

async function responderInteractivo(
  to: string,
  body: string,
  botones: string[],
  secrets: Record<string, string>,
): Promise<void> {
  // Twilio WhatsApp interactive buttons — fallback a texto si no soportado
  const client = twilio(secrets['TWILIO_ACCOUNT_SID'], secrets['TWILIO_AUTH_TOKEN']);
  try {
    await (client.messages.create as Function)({
      from: `whatsapp:${secrets['TWILIO_WHATSAPP_NUMBER']}`,
      to,
      contentSid: undefined, // usar template si disponible
      body: `${body}\n\n${botones.map((b, i) => `${i + 1}. ${b}`).join('\n')}`,
    });
  } catch {
    // fallback texto plano
    await client.messages.create({
      from: `whatsapp:${secrets['TWILIO_WHATSAPP_NUMBER']}`,
      to,
      body: `${body}\n\n${botones.map((b, i) => `${i + 1}. ${b}`).join('\n')}`,
    });
  }
}

// ─────────────────────────────────────────────
// Haiku helpers
// ─────────────────────────────────────────────

async function callHaikuTool<T>(
  anthropic: Anthropic,
  systemPrompt: string,
  userMessage: string,
  tool: Anthropic.Tool,
  mediaBase64?: { data: string; mediaType: string },
): Promise<T | null> {
  const content: Anthropic.ContentBlockParam[] = mediaBase64
    ? [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaBase64.mediaType as 'image/jpeg', data: mediaBase64.data },
        },
        { type: 'text', text: userMessage },
      ]
    : [{ type: 'text', text: userMessage }];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content }],
  });

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') return null;
  return toolBlock.input as T;
}

async function fetchAudioBase64(
  mediaUrl: string,
  secrets: Record<string, string>,
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const response = await fetch(mediaUrl, {
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            `${secrets['TWILIO_ACCOUNT_SID']}:${secrets['TWILIO_AUTH_TOKEN']}`,
          ).toString('base64'),
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? 'audio/ogg';
    const buffer = await response.arrayBuffer();
    return { data: Buffer.from(buffer).toString('base64'), mediaType: contentType };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// DISPATCH DE REGISTRO
// ─────────────────────────────────────────────

interface StepResult {
  reply: string;
  nextState: ConversationState['estado'];
  datosUpdate?: Partial<DatosRegistro>;
  /** Actualizaciones a campos top-level del estado (campaignId, slotId, venueId, etc.) */
  stateUpdate?: Partial<Pick<ConversationState, 'campaignId' | 'slotId' | 'venueId' | 'regId' | 'petId'>>;
}

// ─────────────────────────────────────────────
// CREAR REGISTRO DESDE BOT
// ─────────────────────────────────────────────

async function crearRegistracionDesdeBot(
  state: ConversationState,
): Promise<{ regId: string; qrToken: string } | { error: string }> {
  const { campaignId, slotId, venueId, datos, telefono } = state;
  if (!campaignId || !slotId) return { error: 'Faltan datos de campaña o turno' };

  // userId virtual basado en teléfono (puede ser reclamado por el usuario real después)
  const rawPhone = telefono.replace('whatsapp:', '').replace('+', '');
  const botUserId = `WA_${rawPhone}`;

  // Obtener metadata de la campaña para validar y obtener venueId si falta
  const campaignItem = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
  }));
  if (!campaignItem.Item) return { error: 'Campaña no encontrada' };
  const campaign = campaignItem.Item;

  const resolvedVenueId = venueId
    ?? (campaign['venues'] as { venueId: string }[] | undefined)?.[0]?.venueId
    ?? 'default';

  // Generar IDs
  const petId = randomUUID();
  const regId = randomUUID();
  const qrToken = randomUUID();
  const now = new Date().toISOString();

  // 1. Decrementar slot atómicamente — si no hay cupos → lista de espera
  let enListaEspera = false;
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: `SLOT#${slotId}#AVAIL` },
      UpdateExpression: 'SET cuposDisponibles = cuposDisponibles - :one',
      ConditionExpression: 'cuposDisponibles > :zero',
      ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
    }));
  } catch {
    enListaEspera = true;
  }

  // 2. Crear perfil de mascota
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `PET#${petId}`,
      SK: 'METADATA',
      petId,
      userId: botUserId,
      nombre: datos.nombre ?? 'Sin nombre',
      especie: datos.especie ?? 'otro',
      sexo: datos.sexo ?? 'macho',
      pesoKg: datos.pesoKg,
      edadMeses: datos.edadMeses,
      condicionSaludRaw: datos.condicionSaludRaw,
      vacunasAlDia: datos.vacunasAlDia,
      tratamientosActivos: datos.tratamientosActivos,
      estadoReproductivo: datos.estadoReproductivo,
      criptorquidismo: datos.criptorquidismo,
      aptoCirugia: datos.aptoCirugia ?? true,
      razonRechazo: datos.razonRechazo,
      alertasVet: datos.alertasVet ?? [],
      screenedAt: now,
      provincia: datos.provincia,
      creadoViaBot: true,
      telefonoBot: rawPhone,
      creadoEn: now,
    },
  }));

  // 3. Crear registro
  const estado = enListaEspera ? 'lista_espera' : 'confirmada';
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `REG#${regId}`,
      SK: 'METADATA',
      regId,
      campaignId,
      slotId,
      venueId: resolvedVenueId,
      userId: botUserId,
      estado,
      qrToken,
      checkedIn: false,
      creadoViaBot: true,
      telefonoBot: rawPhone,
      petSummaries: [{
        petId,
        nombre: datos.nombre ?? 'Sin nombre',
        estadoCirugia: 'pendiente',
        alertasVet: datos.alertasVet ?? [],
      }],
      // GSI3 para que el usuario pueda ver sus registros al vincular su cuenta
      GSI3PK: `USER#${botUserId}`,
      GSI3SK: `REG#${regId}`,
      creadoEn: now,
      actualizadoEn: now,
    },
  }));

  // 4. Índice QR para check-in O(1)
  if (!enListaEspera) {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `QR#${qrToken}`,
        SK: 'REG',
        regId,
        campaignId,
        ttl: Math.floor(Date.now() / 1000) + 86400 * 90, // 90 días
      },
    }));
  }

  return { regId, qrToken };
}

async function dispatchRegistro(
  texto: string,
  state: ConversationState,
  anthropic: Anthropic,
  mediaBase64?: { data: string; mediaType: string },
): Promise<StepResult> {
  const datos = state.datos;

  switch (state.estado) {
    case 'inicio': {
      return {
        reply:
          '¡Hola! 🐾 Soy el asistente de *castrar.cr*. Te ayudo a inscribir a tu mascota en una feria de castración cercana.\n\n¿Cómo se llama tu mascota y qué especie es? (ej: "Mi perro se llama Max")',
        nextState: 'datos_basicos',
      };
    }

    case 'datos_basicos': {
      const extracted = await callHaikuTool<{
        nombre?: string; especie?: string; sexo?: string; pesoKg?: number; edadMeses?: number;
      }>(
        anthropic,
        'Extraé los datos básicos de la mascota del mensaje. Si el usuario no menciona algún dato, omitilo.',
        texto,
        TOOL_DATOS_BASICOS,
        mediaBase64,
      );

      const update: Partial<DatosRegistro> = {
        nombre: extracted?.nombre ?? datos.nombre,
        especie: (extracted?.especie as DatosRegistro['especie']) ?? datos.especie,
        sexo: (extracted?.sexo as DatosRegistro['sexo']) ?? datos.sexo,
        pesoKg: extracted?.pesoKg ?? datos.pesoKg,
        edadMeses: extracted?.edadMeses ?? datos.edadMeses,
      };

      const faltantes: string[] = [];
      if (!update.nombre) faltantes.push('el nombre');
      if (!update.especie) faltantes.push('la especie (perro o gato)');
      if (!update.sexo) faltantes.push('el sexo (macho o hembra)');
      if (!update.pesoKg) faltantes.push('el peso aproximado');

      if (faltantes.length > 0) {
        return {
          reply: `Gracias 🐾 Necesito un poco más de info: ¿me podés decir ${faltantes.join(', ')}?`,
          nextState: 'datos_basicos',
          datosUpdate: update,
        };
      }

      return {
        reply: `¡Perfecto! ${update.nombre} es un${update.especie === 'gato' ? 'a' : ''} ${update.especie} ${update.sexo} de ${update.pesoKg}kg.\n\n¿Tiene alguna enfermedad, malestar o condición especial de salud? (Si está bien, escribí "está sano/a")`,
        nextState: 'salud_general',
        datosUpdate: update,
      };
    }

    case 'salud_general': {
      const result = await callHaikuTool<ElegibilidadResult>(
        anthropic,
        SYSTEM_SCREENING,
        `La mascota se llama ${datos.nombre}, es ${datos.especie} ${datos.sexo} de ${datos.pesoKg}kg${datos.edadMeses ? ` y ${datos.edadMeses} meses de edad` : ''}. El dueño describe su salud así: "${texto}"`,
        TOOL_ELEGIBILIDAD,
      );

      if (!result) {
        return { reply: 'Hubo un problema procesando tu respuesta. ¿Podés repetirlo?', nextState: 'salud_general' };
      }

      if (!result.apto) {
        return {
          reply: `Lo sentimos 😔 *${datos.nombre}* no puede participar en esta feria por el momento.\n\n*Razón:* ${result.razon ?? 'condición de salud incompatible con anestesia general'}\n\nCuando mejore, podés volver a intentar el registro. ¡Gracias por cuidar a tu mascota!`,
          nextState: 'completado',
          datosUpdate: { condicionSaludRaw: texto, aptoCirugia: false, razonRechazo: result.razon, alertasVet: result.alertas },
        };
      }

      const update: Partial<DatosRegistro> = {
        condicionSaludRaw: texto,
        aptoCirugia: true,
        alertasVet: result.alertas,
      };

      // Rama hembras
      if (datos.sexo === 'hembra') {
        return {
          reply: `Entendido 👍\n\n¿${datos.nombre} está embarazada, en celo o amamantando cachorros actualmente?\n\n1. No, está normal\n2. Está embarazada\n3. Está en celo\n4. Amamantando`,
          nextState: 'estado_reproductivo',
          datosUpdate: update,
        };
      }

      // Rama machos
      return {
        reply: `Entendido 👍\n\n¿Alguno de los testículos de ${datos.nombre} no descendió correctamente? (criptorquidismo)\n\n1. No, los dos están normales\n2. Sí, uno o ambos no bajaron`,
        nextState: 'criptorquidismo',
        datosUpdate: update,
      };
    }

    case 'estado_reproductivo': {
      const result = await callHaikuTool<EstadoReproductivoResult>(
        anthropic,
        SYSTEM_REPRODUCTIVO,
        `El dueño respondió sobre el estado de ${datos.nombre} (${datos.especie} hembra): "${texto}"`,
        TOOL_REPRODUCTIVO,
      );

      const estado = result?.estado ?? 'normal';

      if (estado === 'prenada' || estado === 'celo') {
        const razon = estado === 'prenada'
          ? 'está embarazada — la cirugía no es segura durante la gestación'
          : 'está en celo — es necesario esperar al menos 2 meses después del celo';
        return {
          reply: `Lo sentimos 😔 *${datos.nombre}* no puede participar en esta feria porque ${razon}.\n\nCuando sea el momento indicado, ¡con gusto te ayudamos a inscribirla!`,
          nextState: 'completado',
          datosUpdate: { estadoReproductivo: estado, aptoCirugia: false, razonRechazo: razon },
        };
      }

      const alertas = datos.alertasVet ?? [];
      if (estado === 'lactando') {
        alertas.push(`Lactando${result?.semanasCachorros ? ` — cachorros de ${result.semanasCachorros} semanas` : ''}`);
      }

      return {
        reply: `Perfecto ✅\n\n¿${datos.nombre} tiene las vacunas al día? ¿Está tomando algún medicamento o tratamiento actualmente?\n\n1. Sí, vacunas al día y sin medicamentos\n2. Sí, vacunas al día pero toma medicamentos\n3. No tengo las vacunas al día`,
        nextState: 'vacunas_tratamientos',
        datosUpdate: { estadoReproductivo: estado, alertasVet: alertas },
      };
    }

    case 'criptorquidismo': {
      const tieneCripto = /\b(s[ií]|1|uno|no|ambos|solo|sólo)\b/i.test(texto) &&
        !/\b(no|normales|bien|dos)\b/i.test(texto);

      const alertas = datos.alertasVet ?? [];
      if (tieneCripto) {
        alertas.push('Criptorquidismo — requiere procedimiento especializado');
      }

      return {
        reply: `Anotado ✅\n\n¿${datos.nombre} tiene las vacunas al día? ¿Está tomando algún medicamento o tratamiento actualmente?\n\n1. Sí, vacunas al día y sin medicamentos\n2. Sí, vacunas al día pero toma medicamentos\n3. No tengo las vacunas al día`,
        nextState: 'vacunas_tratamientos',
        datosUpdate: { criptorquidismo: tieneCripto, alertasVet: alertas },
      };
    }

    case 'vacunas_tratamientos': {
      const result = await callHaikuTool<{ vacunasAlDia: boolean; tratamientosActivos?: string }>(
        anthropic,
        'Extraé información sobre vacunas y tratamientos activos de la mascota.',
        texto,
        TOOL_SALUD_ADICIONAL,
      );

      const alertas = datos.alertasVet ?? [];
      if (result?.tratamientosActivos) {
        alertas.push(`Medicamento activo: ${result.tratamientosActivos}`);
      }
      if (result?.vacunasAlDia === false) {
        alertas.push('Vacunas no al día — recordar traer cartilla');
      }

      return {
        reply: `¡Listo! 🎉\n\n¿En qué provincia o cantón vivís? Así te muestro las ferias más cercanas.`,
        nextState: 'direccion',
        datosUpdate: {
          vacunasAlDia: result?.vacunasAlDia,
          tratamientosActivos: result?.tratamientosActivos,
          alertasVet: alertas,
        },
      };
    }

    case 'direccion': {
      const provincia = sanitizeForAI(texto).slice(0, 80);
      const campanas = await getCampaignasCercanas(provincia);

      if (campanas.length === 0) {
        return {
          reply: `No encontré ferias disponibles cerca de *${provincia}* en este momento.\n\nTe avisamos cuando haya una nueva feria en tu zona. ¡Gracias!`,
          nextState: 'completado',
          datosUpdate: { provincia },
        };
      }

      const lista = campanas
        .map((c, i) => `${i + 1}. *${c.titulo}* — ${new Date(c.fecha).toLocaleDateString('es-CR')} (${c.cupos} cupos)`)
        .join('\n');

      return {
        reply: `Aquí están las ferias disponibles cerca de *${provincia}*:\n\n${lista}\n\nRespondé con el número de la feria que querés.`,
        nextState: 'seleccion_campana',
        datosUpdate: { provincia },
      };
    }

    case 'seleccion_campana': {
      const campanas = await getCampaignasCercanas(datos.provincia ?? '');
      const idx = parseInt(texto.trim()) - 1;
      const seleccionada = campanas[idx];

      if (!seleccionada) {
        const lista = campanas
          .map((c, i) => `${i + 1}. *${c.titulo}*`)
          .join('\n');
        return {
          reply: `Por favor elegí un número de la lista:\n\n${lista}`,
          nextState: 'seleccion_campana',
        };
      }

      const slots = await getSlots(seleccionada.campaignId);
      if (slots.length === 0) {
        return {
          reply: `Lo sentimos, *${seleccionada.titulo}* no tiene turnos disponibles. Elegí otra feria o escribí "volver".`,
          nextState: 'seleccion_campana',
          datosUpdate: {},
        };
      }

      const listaSlots = slots
        .map((s, i) => `${i + 1}. ${s.horaInicio} (${s.cupos} cupos)`)
        .join('\n');

      return {
        reply: `¡Excelente elección! 🎉 *${seleccionada.titulo}*\n\nElegí el horario que más te convenga:\n\n${listaSlots}`,
        nextState: 'seleccion_turno',
        stateUpdate: { campaignId: seleccionada.campaignId },
      };
    }

    case 'seleccion_turno': {
      if (!state.campaignId) {
        return { reply: 'Hubo un error. Por favor escribí "hola" para empezar de nuevo.', nextState: 'inicio' };
      }
      const slots = await getSlots(state.campaignId);
      const idx = parseInt(texto.trim()) - 1;
      const slot = slots[idx];

      if (!slot) {
        const lista = slots.map((s, i) => `${i + 1}. ${s.horaInicio}`).join('\n');
        return { reply: `Por favor elegí un número válido:\n\n${lista}`, nextState: 'seleccion_turno' };
      }

      return {
        reply: `*Confirmá tu inscripción* ✅\n\n🐾 *Mascota:* ${datos.nombre} (${datos.especie} ${datos.sexo})\n🕐 *Turno:* ${slot.horaInicio}\n\n¿Todo correcto?\n\n1. ✅ Confirmar\n2. ✏️ Cambiar algo`,
        nextState: 'confirmacion',
        stateUpdate: { slotId: slot.slotId },
      };
    }

    case 'confirmacion': {
      if (/^[2b]/i.test(texto.trim())) {
        return {
          reply: '¿Qué querés cambiar? Escribí "especie", "turno" o "feria".',
          nextState: 'confirmacion',
        };
      }

      // Crear registro real en DynamoDB
      const resultado = await crearRegistracionDesdeBot(state);

      if ('error' in resultado) {
        return {
          reply: `Hubo un problema al confirmar tu inscripción: ${resultado.error}. Por favor intentá de nuevo más tarde o registrate en castrar.cr`,
          nextState: 'completado',
        };
      }

      const { qrToken } = resultado;
      const esListaEspera = !qrToken; // si no hay QR es lista de espera (no debería pasar)

      const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${qrToken}`;

      return {
        reply: `¡Inscripción confirmada! 🎉\n\n*${datos.nombre}* está registrado/a. Guardá este código QR — lo necesitás el día del evento:\n\n${qrLink}\n\n📌 *Recordá:*\n• Ayuno de 8 horas antes\n• Traer cartilla de vacunación\n• Llegar puntual a tu turno\n\n¡Gracias por cuidar a tu mascota! 🐾`,
        nextState: 'completado',
        stateUpdate: { regId: resultado.regId },
      };
    }

    default:
      return {
        reply: '¡Hola! 🐾 ¿En qué puedo ayudarte? Escribí cualquier cosa para empezar.',
        nextState: 'inicio',
      };
  }
}

// ─────────────────────────────────────────────
// DISPATCH POST-OP
// ─────────────────────────────────────────────

async function handlePostopReply(
  texto: string,
  state: ConversationState,
  anthropic: Anthropic,
  secrets: Record<string, string>,
  mediaBase64?: { data: string; mediaType: string },
): Promise<StepResult> {
  const { petNombre, petEspecie, postopDia, regId } = state;
  const dia = postopDia ?? 1;

  const result = await callHaikuTool<PostOpEvaluacionResult>(
    anthropic,
    SYSTEM_POSTOP(dia, petEspecie ?? 'mascota'),
    texto,
    TOOL_POSTOP,
    mediaBase64,
  );

  if (!result) {
    return {
      reply: `Gracias por tu reporte sobre *${petNombre ?? 'tu mascota'}* 🐾. Si notás algo preocupante, escribínos.`,
      nextState: 'postop_completado',
    };
  }

  // Guardar respuesta en el expediente
  if (regId) {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `POSTOP_RESPONSE#${regId}`,
        SK: `D${dia}`,
        dia,
        fechaRespuesta: new Date().toISOString(),
        respuestaRaw: texto,
        nivelIA: result.nivel,
        descripcionIA: result.descripcion,
        signosPreocupantes: result.signosPreocupantes,
        ttl: Math.floor(Date.now() / 1000) + 86400 * 60,
      },
    }));
  }

  if (result.nivel === 'urgente') {
    // Actualizar estadoCirugia a 'complicacion'
    // (en producción buscaríamos el regId y actualizaríamos el pet)
    console.error(`POST-OP URGENTE: regId=${regId}, dia=${dia}, signos=${result.signosPreocupantes.join(', ')}`);

    return {
      reply: `⚠️ *ATENCIÓN:* Lo que describís sobre *${petNombre ?? 'tu mascota'}* requiere atención veterinaria *inmediata*.\n\n*Signos detectados:* ${result.signosPreocupantes.join(', ')}\n\n🏥 Llevá a tu mascota a una veterinaria YA. También estamos notificando al organizador del evento.\n\n¡La salud de ${petNombre ?? 'tu mascota'} es lo primero!`,
      nextState: 'postop_completado',
    };
  }

  if (result.nivel === 'observacion') {
    const tips: Record<number, string> = {
      1: 'Es normal un poco de letargo el primer día. Si empeora o no come mañana, consultá al vet.',
      3: 'Revisá que la herida esté limpia y seca. Si ves secreción o mal olor, consultá.',
      7: 'Esta semana generalmente se retiran los puntos. Verificá con el vet si los puntos están disueltos.',
      15: 'La recuperación casi siempre está completa a los 15 días. Si persiste algo, visitá al vet.',
    };
    return {
      reply: `Gracias por tu reporte 🐾 *${result.descripcion}*\n\n${tips[dia] ?? 'Seguí monitoreando a tu mascota.'}\n\nSi los síntomas empeoran, escribínos de inmediato.`,
      nextState: 'postop_completado',
    };
  }

  // Normal
  const mensajesNormal: Record<number, string> = {
    1: `¡Qué buenas noticias! 🎉 *${petNombre ?? 'Tu mascota'}* va muy bien. Recordá: ayuno corto ya no necesario, pero sí mantener el cono/vestido por 10 días más.`,
    3: `Excelente! 🐾 *${petNombre ?? 'Tu mascota'}* se está recuperando muy bien. Seguí con el antibiótico según indicaciones.`,
    7: `¡Maravilloso! *${petNombre ?? 'Tu mascota'}* casi completó su recuperación. Esta semana suelen quitarse los puntos — verificá con el vet.`,
    15: `¡Recuperación completa! 🎉 *${petNombre ?? 'Tu mascota'}* está perfecta. Gracias por ser parte del cambio — ¡una mascota más castrada hace una diferencia enorme! 🐾`,
  };

  return {
    reply: mensajesNormal[dia] ?? `¡Todo bien con *${petNombre ?? 'tu mascota'}*! Seguí monitoreando. 🐾`,
    nextState: dia === 15 ? 'postop_completado' : 'postop_seguimiento',
  };
}

// ─────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === 'GET') {
    return { statusCode: 200, body: 'OK' };
  }

  const secrets = await getSecrets();

  const bodyParams = Object.fromEntries(
    new URLSearchParams(event.body ?? '').entries(),
  ) as Record<string, string>;

  const telefono = bodyParams['From'] ?? '';
  const mensaje = bodyParams['Body'] ?? '';
  const mediaUrl = bodyParams['MediaUrl0'];
  const mediaContentType = bodyParams['MediaContentType0'] ?? '';

  // Validar firma Twilio
  const signature = event.headers['x-twilio-signature'] ?? '';
  const url = `https://${event.requestContext.domainName}${event.rawPath}`;
  const isValid = twilio.validateRequest(
    secrets['TWILIO_AUTH_TOKEN'] ?? '',
    signature,
    url,
    bodyParams,
  );

  if (!isValid) {
    console.warn('Invalid Twilio signature from:', telefono);
    return { statusCode: 403, body: 'Forbidden' };
  }

  // Rate limiting
  const msgCount = await getRateLimitCount(telefono);
  if (msgCount >= RATE_LIMIT_HOURLY) {
    await responder(telefono, 'Por favor intentá más tarde 🙏', secrets);
    return { statusCode: 200, body: '' };
  }
  await incrementRateLimit(telefono);

  // Cargar estado de conversación
  const estadoActual = await getConversation(telefono) ?? {
    telefono,
    modo: 'registro' as const,
    estado: 'inicio' as const,
    datos: {},
    ttl: 0,
  };

  const textoSanitizado = sanitizeForAI(mensaje);

  // Procesar audio o imagen si los hay
  let mediaBase64: { data: string; mediaType: string } | undefined;
  if (mediaUrl) {
    if (mediaContentType.startsWith('audio/')) {
      mediaBase64 = (await fetchAudioBase64(mediaUrl, secrets)) ?? undefined;
    } else if (mediaContentType.startsWith('image/')) {
      // Para imágenes usamos Sonnet — lo manejamos por separado si es necesario
      mediaBase64 = (await fetchAudioBase64(mediaUrl, secrets)) ?? undefined;
    }
  }

  const anthropic = new Anthropic({ apiKey: secrets['ANTHROPIC_API_KEY'] });

  // Dispatch según modo
  let result: StepResult;
  if (estadoActual.modo === 'postop') {
    result = await handlePostopReply(textoSanitizado, estadoActual, anthropic, secrets, mediaBase64);
  } else {
    result = await dispatchRegistro(textoSanitizado, estadoActual, anthropic, mediaBase64);
  }

  // Calcular TTL: 16 días en post-op, 24h en registro
  const ttlSeconds = estadoActual.modo === 'postop' ? 86400 * 16 : 86400;

  // Guardar estado actualizado
  const nuevoEstado: ConversationState = {
    ...estadoActual,
    ...result.stateUpdate,
    estado: result.nextState,
    datos: { ...estadoActual.datos, ...result.datosUpdate },
    ttl: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  await saveConversation(nuevoEstado, ttlSeconds);

  // Responder al usuario
  await responder(telefono, result.reply, secrets);

  return { statusCode: 200, body: '' };
};
