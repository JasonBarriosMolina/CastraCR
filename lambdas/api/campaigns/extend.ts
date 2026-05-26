/**
 * POST /campaigns/{id}/extend
 * Agrega cupos extra a un slot existente y notifica a la lista de espera.
 * Body: {
 *   slot_id: string
 *   extra_slots: number       — cupos a agregar
 *   notify_waitlist?: boolean — default true
 * }
 *
 * La notificación real a los de lista de espera se hace mediante
 * el evento DDB Streams (notify-waitlist lambda) al detectar el cambio
 * de estado. Aquí solo marcamos el slot y promovemos los primeros N
 * de la lista de espera a 'confirmada'.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { NotFoundError } from '@castrar-cr/utils';
import { generateQRToken } from '@castrar-cr/utils';

const e = (statusCode: number, error: string, code?: string) => ({
  statusCode,
  body: JSON.stringify({ error, ...(code ? { code } : {}) }),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const campaignId = event.pathParameters?.id;
    if (!campaignId) return e(400, 'Falta campaignId');

    let body: { slot_id: string; extra_slots: number; notify_waitlist?: boolean };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return e(400, 'JSON inválido');
    }
    if (!body.slot_id) return e(400, 'slot_id es requerido');
    if (typeof body.extra_slots !== 'number' || body.extra_slots <= 0) {
      return e(400, 'extra_slots debe ser un número > 0');
    }

    const notifyWaitlist = body.notify_waitlist !== false; // default true

    // 1. Validate slot exists
    const slotRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CAMPAIGN#${campaignId}`,
        SK: `SLOT#${body.slot_id}#AVAIL`,
      },
    }));
    if (!slotRes.Item) throw new NotFoundError('Slot');

    const slot = slotRes.Item;
    const now = new Date().toISOString();

    // 2. Update slot capacity
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CAMPAIGN#${campaignId}`,
        SK: `SLOT#${body.slot_id}#AVAIL`,
      },
      UpdateExpression: 'SET cuposTotales = cuposTotales + :extra, cuposDisponibles = cuposDisponibles + :extra, updatedAt = :now',
      ExpressionAttributeValues: {
        ':extra': body.extra_slots,
        ':now': now,
      },
    }));

    let promoted = 0;

    // 3. Promote from waitlist (those on lista_espera for this campaign/slot)
    if (notifyWaitlist && body.extra_slots > 0) {
      const waitlistRes = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI4-estado',
        KeyConditionExpression: 'GSI4PK = :pk',
        FilterExpression: 'campaignId = :cid AND slotId = :sid AND estado = :wl',
        ExpressionAttributeValues: {
          ':pk': 'REG',
          ':cid': campaignId,
          ':sid': body.slot_id,
          ':wl': 'lista_espera',
        },
      }));

      const candidates = (waitlistRes.Items ?? [])
        .sort((a, b) =>
          new Date(a['createdAt'] as string).getTime() -
          new Date(b['createdAt'] as string).getTime(), // oldest first = FIFO
        )
        .slice(0, body.extra_slots);

      await Promise.all(
        candidates.map(async (reg) => {
          const qrToken = generateQRToken();
          await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `REG#${reg['regId']}`, SK: 'METADATA' },
            UpdateExpression: 'SET estado = :confirmed, qrToken = :qr, promotedAt = :now, updatedAt = :now, GSI4SK = :gsi4sk',
            ConditionExpression: 'estado = :wl',
            ExpressionAttributeValues: {
              ':confirmed': 'confirmada',
              ':wl': 'lista_espera',
              ':qr': qrToken,
              ':now': now,
              ':gsi4sk': `confirmada#${now}`,
            },
          }));

          // Create QR token lookup
          await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qrToken}`, SK: 'REG' },
            UpdateExpression: 'SET regId = :regId, campaignId = :cid, slotId = :sid, createdAt = :now',
            ExpressionAttributeValues: {
              ':regId': reg['regId'],
              ':cid': campaignId,
              ':sid': body.slot_id,
              ':now': now,
            },
          }));

          promoted++;
        }),
      );
    }

    return ok({
      campaign_id: campaignId,
      slot_id: body.slot_id,
      extra_slots_added: body.extra_slots,
      promoted_from_waitlist: promoted,
      updated_at: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
