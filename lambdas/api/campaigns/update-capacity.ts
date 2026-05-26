/**
 * PATCH /campaigns/{id}/capacity
 * Reduce o aumenta la capacidad de un slot específico.
 * Si se reduce por debajo de las reservaciones existentes, el exceso pasa a lista de espera.
 *
 * Body: {
 *   slot_id: string
 *   new_capacity: number     — nuevo total de cupos
 *   move_excess_to_waitlist?: boolean  — default true
 * }
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { NotFoundError } from '@castrar-cr/utils';

const e = (statusCode: number, error: string, code?: string) => ({
  statusCode,
  body: JSON.stringify({ error, ...(code ? { code } : {}) }),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const campaignId = event.pathParameters?.id;
    if (!campaignId) return e(400, 'Falta campaignId');

    let body: { slot_id: string; new_capacity: number; move_excess_to_waitlist?: boolean };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return e(400, 'JSON inválido');
    }
    if (!body.slot_id) return e(400, 'slot_id es requerido');
    if (typeof body.new_capacity !== 'number' || body.new_capacity < 0) {
      return e(400, 'new_capacity debe ser un número >= 0');
    }

    const moveExcess = body.move_excess_to_waitlist !== false; // default true

    // 1. Get current slot availability item
    const slotRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CAMPAIGN#${campaignId}`,
        SK: `SLOT#${body.slot_id}#AVAIL`,
      },
    }));
    if (!slotRes.Item) throw new NotFoundError('Slot');

    const slot = slotRes.Item;
    const currentTotal: number = (slot['cuposTotales'] as number | undefined) ?? 0;
    const currentAvail: number = (slot['cuposDisponibles'] as number | undefined) ?? 0;
    const currentUsed = currentTotal - currentAvail;
    const delta = body.new_capacity - currentTotal;
    const newAvail = Math.max(0, currentAvail + delta);

    const now = new Date().toISOString();
    let movedToWaitlist = 0;

    // 2. If reducing below used slots, move excess confirmations to waitlist
    if (body.new_capacity < currentUsed && moveExcess) {
      const excess = currentUsed - body.new_capacity;

      // Query confirmed regs for this slot
      const regsRes = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI4-estado',
        KeyConditionExpression: 'GSI4PK = :pk',
        FilterExpression: 'campaignId = :cid AND slotId = :sid AND estado = :confirmed',
        ExpressionAttributeValues: {
          ':pk': 'REG',
          ':cid': campaignId,
          ':sid': body.slot_id,
          ':confirmed': 'confirmada',
        },
      }));

      const toDowngrade = (regsRes.Items ?? [])
        .sort((a, b) =>
          new Date(b['createdAt'] as string).getTime() -
          new Date(a['createdAt'] as string).getTime(), // newest first gets moved
        )
        .slice(0, excess);

      await Promise.all(
        toDowngrade.map((reg) =>
          ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `REG#${reg['regId']}`, SK: 'METADATA' },
            UpdateExpression: 'SET estado = :wl, updatedAt = :now, GSI4SK = :gsi4sk',
            ExpressionAttributeValues: {
              ':wl': 'lista_espera',
              ':now': now,
              ':gsi4sk': `lista_espera#${now}`,
            },
          })).then(() => { movedToWaitlist++; }).catch(() => {}),
        ),
      );
    }

    // 3. Update slot capacity
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CAMPAIGN#${campaignId}`,
        SK: `SLOT#${body.slot_id}#AVAIL`,
      },
      UpdateExpression: 'SET cuposTotales = :total, cuposDisponibles = :avail, updatedAt = :now',
      ExpressionAttributeValues: {
        ':total': body.new_capacity,
        ':avail': newAvail,
        ':now': now,
      },
    }));

    return ok({
      campaign_id: campaignId,
      slot_id: body.slot_id,
      old_capacity: currentTotal,
      new_capacity: body.new_capacity,
      available_slots: newAvail,
      moved_to_waitlist: movedToWaitlist,
      updated_at: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
