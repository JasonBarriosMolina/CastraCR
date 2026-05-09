import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { NotFoundError } from '@castrar-cr/utils';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Organizador', 'Veterinario', 'SuperAdmin');

    const { qrToken } = JSON.parse(event.body ?? '{}') as { qrToken?: string };
    if (!qrToken) {
      return { statusCode: 400, body: JSON.stringify({ error: 'qrToken es requerido', code: 'INVALID_BODY' }) };
    }

    // 1. Lookup O(1) por QR token
    const qrResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `QR#${qrToken}`, SK: 'REG' },
    }));
    if (!qrResult.Item) throw new NotFoundError('QR inválido o registro no encontrado');

    const regId = qrResult.Item['regId'] as string;

    // 2. Obtener registro completo
    const regResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regResult.Item) throw new NotFoundError('Registro');

    const reg = regResult.Item;

    if (reg['checkedIn']) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Este registro ya fue procesado', code: 'ALREADY_CHECKED_IN' }) };
    }
    if (reg['estado'] !== 'confirmada') {
      return { statusCode: 400, body: JSON.stringify({ error: 'El registro no está confirmado', code: 'INVALID_STATUS' }) };
    }

    const now = new Date().toISOString();

    // 3. Obtener datos clínicos de cada mascota (alertasVet, condición, etc.)
    const petSummaries = (reg['pets'] as Array<{ petId: string; nombre: string; estadoCirugia: string; alertasVet?: string[] }>) ?? [];
    const petKeys = petSummaries.map((p) => ({ PK: `PET#${p.petId}`, SK: 'METADATA' }));

    let petProfiles: Record<string, Record<string, unknown>> = {};
    if (petKeys.length > 0) {
      const batchResult = await ddb.send(new BatchGetCommand({
        RequestItems: { [TABLE_NAME]: { Keys: petKeys } },
      }));
      const items = batchResult.Responses?.[TABLE_NAME] ?? [];
      petProfiles = Object.fromEntries(items.map((p) => [p['petId'] as string, p]));
    }

    // 4. Construir pet summaries enriquecidos con datos clínicos del vet
    const updatedPets = petSummaries.map((p) => {
      const profile = petProfiles[p.petId] ?? {};
      return {
        petId: p.petId,
        nombre: p.nombre,
        estadoCirugia: 'operado',
        // Datos de screening visibles para el vet
        alertasVet: p.alertasVet ?? (profile['alertasVet'] as string[] | undefined) ?? [],
        especie: profile['especie'],
        sexo: profile['sexo'],
        pesoKg: profile['pesoKg'],
        edadMeses: profile['edadMeses'],
        edadAnios: profile['edadAnios'],
        vacunasAlDia: profile['vacunasAlDia'],
        tratamientosActivos: profile['tratamientosActivos'],
        condicionSalud: profile['condicionSalud'],
        criptorquidismo: profile['criptorquidismo'],
        estadoReproductivo: profile['estadoReproductivo'],
        aptoCirugia: profile['aptoCirugia'],
      };
    });

    // 5. Actualizar registro → completado
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
      UpdateExpression:
        'SET checkedIn = :true, checkedInAt = :now, estado = :completada, pets = :pets, updatedAt = :now',
      ExpressionAttributeValues: {
        ':true': true,
        ':now': now,
        ':completada': 'completada',
        ':pets': updatedPets,
      },
    }));

    // 6. Crear expediente clínico vacío (listo para que el vet lo llene)
    const expedienteExistente = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
    }));

    if (!expedienteExistente.Item) {
      // Solo el primer pet del registro — en ferias la mayoría registra 1 pet
      const primerPet = petSummaries[0];
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `REG#${regId}`,
          SK: 'EXPEDIENTE',
          regId,
          petId: primerPet?.petId ?? '',
          campaignId: reg['campaignId'] as string,
          seguimiento: [],
          creadoEn: now,
          actualizadoEn: now,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }));
    }

    // Limpiar campos internos de DynamoDB antes de retornar
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { PK, SK, GSI3PK, GSI3SK, ...regLimpio } = reg as Record<string, unknown>;

    return ok({
      registration: {
        ...regLimpio,
        checkedIn: true,
        checkedInAt: now,
        estado: 'completada',
        pets: updatedPets,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
};
