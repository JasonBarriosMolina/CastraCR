/**
 * PATCH /appointments/{id}/reschedule
 * Cambia el slot de una reservación.
 * Body: { new_slot_id: string, new_venue_id?: string }
 *
 * - Libera el slot anterior
 * - Intenta reservar el nuevo slot
 * - Si el nuevo slot no tiene cupos → error 409
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

    let body: { new_slot_id: string; new_venue_id?: string };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return e(400, 'JSON inválido');
    }
    if (!body.new_slot_id) return e(400, 'new_slot_id es requerido');

    // 1. Get current appointment
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) throw new NotFoundError('Reservación');
    const reg = regRes.Item;

    if (reg['estado'] === 'cancelada') {
      return e(409, 'No se puede reagendar una reservación cancelada', 'CANCELLED');
    }
    if (reg['slotId'] === body.new_slot_id) {
      return e(400, 'El nuevo slot es igual al actual', 'SAME_SLOT');
    }

    // 2. Atomically take the new slot
    try {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `CAMPAIGN#${reg['campaignId']}`,
          SK: `SLOT#${body.new_slot_id}#AVAIL`,
        },
        UpdateExpression: 'SET cuposDisponibles = cuposDisponibles - :one',
        ConditionExpression: 'cuposDisponibles > :zero AND attribute_exists(PK)',
        ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
      }));
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        return e(409, 'El nuevo slot no tiene cupos disponibles', 'SLOT_FULL');
      }
      throw err;
    }

    // 3. Release old slot
    if (reg['slotId'] && reg['estado'] === 'confirmada') {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `CAMPAIGN#${reg['campaignId']}`,
          SK: `SLOT#${reg['slotId']}#AVAIL`,
        },
        UpdateExpression: 'SET cuposDisponibles = cuposDisponibles + :one',
        ExpressionAttributeValues: { ':one': 1 },
      })).catch(() => {/* ignore */});
    }

    // 4. Update appointment
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      ':slotId': body.new_slot_id,
      ':now': now,
      ':confirmed': 'confirmada',
    };
    let updateExpr = 'SET slotId = :slotId, estado = :confirmed, updatedAt = :now';
    if (body.new_venue_id) {
      updates[':venueId'] = body.new_venue_id;
      updateExpr += ', venueId = :venueId';
    }

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
      UpdateExpression: updateExpr,
      ExpressionAttributeValues: updates,
    }));

    return ok({
      appointment_id: regId,
      old_slot_id: reg['slotId'],
      new_slot_id: body.new_slot_id,
      status: 'confirmada',
      rescheduled_at: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
