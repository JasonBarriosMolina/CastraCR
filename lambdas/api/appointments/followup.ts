/**
 * POST /appointments/{id}/followup
 * Registra respuesta de seguimiento post-operatorio (día 7, 10, o 15).
 * El bot externo llama este endpoint con la respuesta del dueño.
 *
 * Body: {
 *   day: 7 | 10 | 15
 *   status: 'good' | 'concern' | 'urgent'
 *   notes: string
 *   owner_phone?: string   — para validar que corresponde al dueño
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

const LEVEL_MAP: Record<string, 'normal' | 'observacion' | 'urgente'> = {
  good: 'normal',
  concern: 'observacion',
  urgent: 'urgente',
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const regId = event.pathParameters?.id;
    if (!regId) return e(400, 'Falta appointment id');

    let body: { day: number; status: string; notes: string; owner_phone?: string };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return e(400, 'JSON inválido');
    }

    if (!body.day || ![7, 10, 15].includes(body.day)) {
      return e(400, 'day debe ser 7, 10 o 15');
    }
    if (!body.status || !LEVEL_MAP[body.status]) {
      return e(400, "status debe ser 'good', 'concern' o 'urgent'");
    }
    if (!body.notes) return e(400, 'notes es requerido');

    // 1. Get appointment
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) throw new NotFoundError('Reservación');
    const reg = regRes.Item;

    // 2. Optional phone validation
    if (body.owner_phone) {
      const phone = body.owner_phone.replace(/\D/g, '');
      const regPhone = ((reg['ownerPhone'] ?? '') as string).replace(/\D/g, '');
      if (phone && regPhone && phone !== regPhone) {
        return e(403, 'Teléfono no coincide con la reservación', 'PHONE_MISMATCH');
      }
    }

    const nivel = LEVEL_MAP[body.status]!;
    const now = new Date().toISOString();

    const entry = {
      dia: body.day,
      fechaRespuesta: now,
      respuestaRaw: body.notes,
      nivelIA: nivel,
      descripcionIA: body.notes,
      signosPreocupantes: nivel === 'urgente' ? [body.notes] : [],
      source: 'bot_externo',
    };

    // 3. Append to seguimiento array in expediente (or create it)
    // First try to get expediente
    const expRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
    }));

    if (expRes.Item) {
      const existing: unknown[] = (expRes.Item['seguimiento'] as unknown[] | undefined) ?? [];
      const updated = [...existing, entry];
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
        UpdateExpression: 'SET seguimiento = :seg, actualizadoEn = :now',
        ExpressionAttributeValues: { ':seg': updated, ':now': now },
      }));
    } else {
      // Create minimal expediente with just the followup
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
        UpdateExpression: 'SET regId = :regId, campaignId = :cid, seguimiento = :seg, creadoEn = :now, actualizadoEn = :now',
        ExpressionAttributeValues: {
          ':regId': regId,
          ':cid': reg['campaignId'],
          ':seg': [entry],
          ':now': now,
        },
      }));
    }

    // 4. If urgent — flag on registration itself for admin visibility
    if (nivel === 'urgente') {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `REG#${regId}`, SK: 'METADATA' },
        UpdateExpression: 'SET postopAlerta = :alerta, updatedAt = :now',
        ExpressionAttributeValues: { ':alerta': true, ':now': now },
      }));
    }

    return ok({
      appointment_id: regId,
      day: body.day,
      level: nivel,
      requires_attention: nivel !== 'normal',
      recorded_at: now,
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
