/**
 * POST /campaigns/{id}/cancel
 * Cancela una campaña completa y todas sus reservaciones confirmadas.
 * Body: { reason: string, notify_all?: boolean }
 *
 * - Estado de campaña → 'cancelada'
 * - Todas las REGs con estado 'confirmada' → 'cancelada'
 * - Si notify_all=true, registra para que el evento notify-waitlist
 *   envíe notificación (vía DDB Streams existente)
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

    let reason = 'Campaña cancelada';
    let notifyAll = false;
    try {
      const body = JSON.parse(event.body ?? '{}');
      if (body.reason) reason = body.reason;
      if (body.notify_all === true) notifyAll = true;
    } catch { /* optional */ }

    // 1. Validate campaign exists
    const campaignRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
    }));
    if (!campaignRes.Item) throw new NotFoundError('Campaña');
    if (campaignRes.Item['estado'] === 'cancelada') {
      return e(409, 'La campaña ya está cancelada', 'ALREADY_CANCELLED');
    }

    const now = new Date().toISOString();

    // 2. Cancel campaign itself
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
      UpdateExpression: 'SET estado = :cancelled, cancelReason = :reason, cancelledAt = :now, updatedAt = :now, GSI4SK = :gsi4sk, notifyAll = :notify',
      ExpressionAttributeValues: {
        ':cancelled': 'cancelada',
        ':reason': reason,
        ':now': now,
        ':gsi4sk': `cancelada#${now}`,
        ':notify': notifyAll,
      },
    }));

    // 3. Query all confirmed registrations for this campaign (GSI1: by organizador → not ideal)
    // Instead query by GSI4 PK='REG' + filter by campaignId
    // Note: this is a scan-with-filter — acceptable for campaign cancel (rare op)
    const regsRes = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI4-estado',
      KeyConditionExpression: 'GSI4PK = :pk',
      FilterExpression: 'campaignId = :cid AND estado = :confirmed',
      ExpressionAttributeValues: {
        ':pk': 'REG',
        ':cid': campaignId,
        ':confirmed': 'confirmada',
      },
    }));

    const registrations = regsRes.Items ?? [];
    let cancelledCount = 0;

    // 4. Cancel each registration in parallel (batch of 25 max to avoid throttling)
    const BATCH = 25;
    for (let i = 0; i < registrations.length; i += BATCH) {
      const slice = registrations.slice(i, i + BATCH);
      await Promise.all(
        slice.map((reg) =>
          ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `REG#${reg['regId']}`, SK: 'METADATA' },
            UpdateExpression: 'SET estado = :cancelled, cancelReason = :reason, cancelledAt = :now, updatedAt = :now, GSI4SK = :gsi4sk',
            ConditionExpression: 'estado = :confirmed',
            ExpressionAttributeValues: {
              ':cancelled': 'cancelada',
              ':confirmed': 'confirmada',
              ':reason': `Campaña cancelada: ${reason}`,
              ':now': now,
              ':gsi4sk': `cancelada#${now}`,
            },
          })).then(() => { cancelledCount++; }).catch(() => {/* race ok */}),
        ),
      );
    }

    return ok({
      campaign_id: campaignId,
      status: 'cancelada',
      registrations_cancelled: cancelledCount,
      notify_all: notifyAll,
      cancelled_at: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
