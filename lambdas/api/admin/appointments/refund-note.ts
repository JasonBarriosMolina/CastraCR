/**
 * POST /admin/appointments/{id}/refund-note
 * Marca una cita como reembolso_pendiente o reembolsada.
 * El reembolso real se hace manualmente desde el dashboard de OnvoPay.
 *
 * Seguridad:
 *  - Solo Organizador / SuperAdmin
 *  - Organizador solo puede tocar citas de sus propias campañas (ownership check)
 *  - SuperAdmin puede operar sobre cualquier cita
 *
 * Body: { accion: 'marcar_pendiente' | 'marcar_procesado', nota?: string }
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../../shared/db.js';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole } from '../../../shared/auth.js';
import { NotFoundError } from '@castrar-cr/utils';

const e = (statusCode: number, error: string, code?: string) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
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

    // Cargar la reservación
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) throw new NotFoundError('Reservación');

    const reg = regRes.Item;

    // ── OWNERSHIP CHECK ────────────────────────────────────────────────────────
    // Un Organizador solo puede reembolsar citas de campañas que él organizó.
    // SuperAdmin puede operar sobre cualquier cita.
    if (!authCtx.roles.includes('SuperAdmin')) {
      const campaignId = reg['campaignId'] as string | undefined;
      if (campaignId) {
        const campRes = await ddb.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
        }));
        const campOrganizadorId = campRes.Item?.['organizadorId'] as string | undefined;
        if (campOrganizadorId !== authCtx.userId) {
          return e(403, 'No tenés permiso para gestionar reembolsos de esta campaña.', 'FORBIDDEN');
        }
      }
    }

    // Verificar que hay monto a reembolsar
    const montoCRC = (reg['montoCRC'] as number | undefined) ?? 0;
    if (montoCRC <= 0) {
      return e(400, 'Esta cita es gratuita, no requiere reembolso.', 'FREE_CAMPAIGN');
    }

    // Evitar marcar como procesado si ya está procesado
    const reembolsoActual = reg['reembolso'] as { estado?: string } | undefined;
    if (body.accion === 'marcar_procesado' && reembolsoActual?.estado === 'procesado') {
      return e(409, 'Este reembolso ya fue marcado como procesado.', 'ALREADY_PROCESSED');
    }

    const now = new Date().toISOString();
    const nuevoEstado = body.accion === 'marcar_pendiente' ? 'reembolso_pendiente' : 'reembolsada';

    const reembolsoData = body.accion === 'marcar_procesado'
      ? {
          estado: 'procesado',
          notaAdmin: body.nota?.slice(0, 500) ?? '', // limitar longitud
          procesadoEn: now,
          procesadoPor: authCtx.userId,
        }
      : {
          estado: 'pendiente',
          notaAdmin: body.nota?.slice(0, 500) ?? '',
          marcadoEn: now,
          marcadoPor: authCtx.userId,
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

    console.info(`refund-note: ${regId} → ${nuevoEstado} por ${authCtx.userId}`);

    return ok({
      regId,
      estado: nuevoEstado,
      montoCRC,
      reembolso: reembolsoData,
      mensaje: body.accion === 'marcar_procesado'
        ? 'Reembolso marcado como procesado. El dueño recibirá el monto según los plazos de OnvoPay.'
        : 'Cita marcada para reembolso. Procesá el reembolso desde el dashboard de OnvoPay.',
    });
  } catch (error) {
    return errorResponse(error);
  }
};
