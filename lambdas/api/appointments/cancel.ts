/**
 * DELETE /appointments/{id}
 * Cancela una reservación y libera el slot.
 * Body opcional: { reason?: string }
 * Retorna: { refund_eligible: boolean }
 *
 * refund_eligible = true si se cancela con más de 24h de anticipación al evento.
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

    let reason = 'Cancelado por el usuario';
    try {
      const body = JSON.parse(event.body ?? '{}');
      if (body.reason) reason = body.reason;
    } catch { /* optional body */ }

    // 1. Get appointment
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) throw new NotFoundError('Reservación');

    const reg = regRes.Item;
    if (reg['estado'] === 'cancelada') {
      return e(409, 'La reservación ya está cancelada', 'ALREADY_CANCELLED');
    }

    // 2. Get campaign to determine surgery date and refund eligibility
    const campaignRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${reg['campaignId']}`, SK: 'METADATA' },
    }));

    let refundEligible = false;
    if (campaignRes.Item) {
      const campaignDate = campaignRes.Item['fechaInicio'] as string | undefined;
      if (campaignDate) {
        const eventMs = new Date(campaignDate).getTime();
        const hoursUntil = (eventMs - Date.now()) / 3_600_000;
        refundEligible = hoursUntil > 24;
      }
    }

    const now = new Date().toISOString();

    // 3. Mark as cancelled
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
      UpdateExpression: 'SET estado = :cancelled, cancelReason = :reason, cancelledAt = :now, updatedAt = :now, GSI4SK = :gsi4sk',
      ConditionExpression: 'estado <> :cancelled',
      ExpressionAttributeValues: {
        ':cancelled': 'cancelada',
        ':reason': reason,
        ':now': now,
        ':gsi4sk': `cancelada#${now}`,
      },
    }));

    // 4. Release slot (if was confirmed)
    if (reg['estado'] === 'confirmada' && reg['slotId']) {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `CAMPAIGN#${reg['campaignId']}`,
          SK: `SLOT#${reg['slotId']}#AVAIL`,
        },
        UpdateExpression: 'SET cuposDisponibles = cuposDisponibles + :one',
        ExpressionAttributeValues: { ':one': 1 },
      })).catch(() => {/* slot might not exist — ignore */});
    }

    return ok({
      appointment_id: regId,
      status: 'cancelada',
      refund_eligible: refundEligible,
      cancelled_at: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
