import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

    // 1. Look up registration by QR token (O(1) via dedicated item)
    const qrResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `QR#${qrToken}`, SK: 'REG' },
    }));
    if (!qrResult.Item) throw new NotFoundError('QR inválido o registro no encontrado');

    const regId = qrResult.Item['regId'] as string;

    // 2. Get full registration
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

    // 3. Mark as checked in and update pets to 'operado'
    const updatedPets = ((reg['pets'] as Array<{ petId: string; nombre: string; estadoCirugia: string }>) ?? []).map((p) => ({
      ...p,
      estadoCirugia: 'operado',
    }));

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
      UpdateExpression: 'SET checkedIn = :true, checkedInAt = :now, estado = :completada, pets = :pets, updatedAt = :now',
      ExpressionAttributeValues: {
        ':true': true,
        ':now': now,
        ':completada': 'completada',
        ':pets': updatedPets,
      },
    }));

    const { PK, SK, GSI3PK, GSI3SK, ...registration } = { ...reg, checkedIn: true, checkedInAt: now, estado: 'completada', pets: updatedPets };
    return ok({ registration });
  } catch (error) {
    return errorResponse(error);
  }
};
