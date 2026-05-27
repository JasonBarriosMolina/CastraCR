/**
 * POST /appointments/{id}/no-show
 * Staff marca una reservación como no-show. Libera el slot.
 * Body: { staff_id?: string, notes?: string }
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

    let staffId: string | undefined;
    let notes: string | undefined;
    try {
      const body = JSON.parse(event.body ?? '{}');
      staffId = body.staff_id;
      notes = body.notes;
    } catch { /* optional */ }

    // 1. Get appointment
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) throw new NotFoundError('Reservación');
    const reg = regRes.Item;

    if (reg['estado'] === 'cancelada' || reg['estado'] === 'no_show') {
      return e(409, `La reservación ya está en estado: ${reg['estado']}`, 'INVALID_STATE');
    }
    if (reg['checkedIn'] === true) {
      return e(409, 'No se puede marcar como no-show: ya hizo check-in', 'ALREADY_CHECKED_IN');
    }

    const now = new Date().toISOString();

    // 2. Mark as no-show
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
      UpdateExpression: 'SET estado = :ns, noShowAt = :now, updatedAt = :now, GSI4SK = :gsi4sk' +
        (staffId ? ', noShowStaffId = :staffId' : '') +
        (notes ? ', noShowNotes = :notes' : ''),
      ExpressionAttributeValues: {
        ':ns': 'no_show',
        ':now': now,
        ':gsi4sk': `no_show#${now}`,
        ...(staffId ? { ':staffId': staffId } : {}),
        ...(notes ? { ':notes': notes } : {}),
      },
    }));

    // 3. Release slot
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

    return ok({
      appointment_id: regId,
      status: 'no_show',
      slot_released: reg['estado'] === 'confirmada',
      marked_at: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
