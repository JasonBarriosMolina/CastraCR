/**
 * PATCH /appointments/{id}/close
 * Cierra formalmente el seguimiento post-operatorio de una reservación.
 * El bot llama este endpoint al completar el día 15 con status "good".
 *
 * Body: {
 *   outcome: 'recovered' | 'complication'
 *   notes?: string
 * }
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { NotFoundError } from '@castrar-cr/utils';

const e = (statusCode: number, error: string, code?: string) => ({
  statusCode,
  body: JSON.stringify({ error, ...(code ? { code } : {}) }),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const regId = event.pathParameters?.id;
    if (!regId) return e(400, 'Falta appointment id');

    let outcome: 'recovered' | 'complication' = 'recovered';
    let notes: string | undefined;
    try {
      const body = JSON.parse(event.body ?? '{}');
      if (body.outcome && ['recovered', 'complication'].includes(body.outcome)) {
        outcome = body.outcome;
      }
      notes = body.notes;
    } catch { /* optional body */ }

    // 1. Get appointment
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) throw new NotFoundError('Reservación');
    const reg = regRes.Item;

    if (reg['postopClosed'] === true) {
      return e(409, 'El seguimiento post-op ya fue cerrado', 'ALREADY_CLOSED');
    }

    const now = new Date().toISOString();

    // 2. Mark registration as post-op closed
    const estadoCirugia = outcome === 'recovered' ? 'completada' : 'complicacion';

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
      UpdateExpression: 'SET postopClosed = :closed, postopOutcome = :outcome, postopClosedAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':closed': true,
        ':outcome': outcome,
        ':now': now,
      },
    }));

    // 3. Update pets estadoCirugia in the registration
    const pets: Array<Record<string, unknown>> = reg['pets'] as Array<Record<string, unknown>> ?? [];
    if (pets.length > 0) {
      const updatedPets = pets.map((p) => ({
        ...p,
        estadoCirugia,
      }));
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `REG#${regId}`, SK: 'METADATA' },
        UpdateExpression: 'SET pets = :pets',
        ExpressionAttributeValues: { ':pets': updatedPets },
      }));
    }

    // 4. Close expediente if it exists
    const expRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
    }));

    if (expRes.Item) {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
        UpdateExpression: 'SET cerradoEn = :now, resultadoFinal = :outcome' +
          (notes ? ', notasCierre = :notes' : '') +
          ', actualizadoEn = :now',
        ExpressionAttributeValues: {
          ':now': now,
          ':outcome': outcome,
          ...(notes ? { ':notes': notes } : {}),
        },
      }));
    }

    return ok({
      appointment_id: regId,
      outcome,
      pets_updated: pets.length,
      closed_at: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
