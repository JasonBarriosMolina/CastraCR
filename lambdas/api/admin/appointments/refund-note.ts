/**
 * POST /admin/appointments/{id}/refund-note
 * Marca una cita como reembolso_pendiente o reembolsada.
 * El reembolso real se hace manualmente desde el dashboard de OnvoPay.
 * Solo accesible por Organizador / SuperAdmin.
 *
 * Body: {
 *   accion: 'marcar_pendiente' | 'marcar_procesado'
 *   nota?: string
 * }
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../../shared/db.js';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole } from '../../../shared/auth.js';
import { NotFoundError } from '@castrar-cr/utils';

const e = (statusCode: number, error: string, code?: string) => ({
  statusCode,
  body: JSON.stringify({ error, ...(code ? { code } : {}) }),
});

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Organizador', 'SuperAdmin');

    const regId = event.pathParameters?.id;
    if (!regId) return e(400, 'Falta appointment id');

    const body = JSON.parse(event.body ?? '{}') as {
      accion: 'marcar_pendiente' | 'marcar_procesado';
      nota?: string;
    };

    if (!body.accion || !['marcar_pendiente', 'marcar_procesado'].includes(body.accion)) {
      return e(400, 'accion debe ser marcar_pendiente o marcar_procesado');
    }

    // Verificar que la reservación existe y tiene monto
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) throw new NotFoundError('Reservación');

    const reg = regRes.Item;
    const montoCRC = (reg['montoCRC'] as number | undefined) ?? 0;
    if (montoCRC <= 0) {
      return e(400, 'Esta cita es gratuita, no requiere reembolso.', 'FREE_CAMPAIGN');
    }

    const now = new Date().toISOString();
    const nuevoEstado = body.accion === 'marcar_pendiente'
      ? 'reembolso_pendiente'
      : 'reembolsada';

    const reembolsoData = body.accion === 'marcar_procesado'
      ? {
          estado: 'procesado',
          notaAdmin: body.nota ?? '',
          procesadoEn: now,
          procesadoPor: authCtx.userId,
        }
      : {
          estado: 'pendiente',
          notaAdmin: body.nota ?? '',
        };

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
      UpdateExpression: 'SET estado = :estado, reembolso = :reembolso, updatedAt = :now',
      ExpressionAttributeValues: {
        ':estado': nuevoEstado,
        ':reembolso': reembolsoData,
        ':now': now,
      },
    }));

    return ok({
      regId,
      estado: nuevoEstado,
      montoCRC,
      reembolso: reembolsoData,
      mensaje: body.accion === 'marcar_procesado'
        ? 'Reembolso marcado como procesado. El dueño debería recibir el monto en 3-5 días hábiles según OnvoPay.'
        : 'Cita marcada como reembolso pendiente. Procesá el reembolso desde el dashboard de OnvoPay.',
    });
  } catch (error) {
    return errorResponse(error);
  }
};
