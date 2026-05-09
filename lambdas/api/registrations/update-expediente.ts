import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { NotFoundError } from '@castrar-cr/utils';
import type { UpdateExpedienteInput } from '@castrar-cr/types';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Veterinario', 'Organizador', 'SuperAdmin');

    const regId = event.pathParameters?.['regId'];
    if (!regId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'regId es requerido', code: 'INVALID_PARAMS' }) };
    }

    const body = JSON.parse(event.body ?? '{}') as UpdateExpedienteInput;
    const { fase, datos } = body;

    const fasesValidas: UpdateExpedienteInput['fase'][] = ['recepcion', 'preOp', 'intraOp', 'egreso'];
    if (!fase || !fasesValidas.includes(fase)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'fase debe ser: recepcion, preOp, intraOp o egreso', code: 'INVALID_FASE' }) };
    }

    if (!datos || typeof datos !== 'object') {
      return { statusCode: 400, body: JSON.stringify({ error: 'datos es requerido', code: 'INVALID_BODY' }) };
    }

    // Verificar que el expediente existe
    const expResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
    }));
    if (!expResult.Item) throw new NotFoundError('Expediente');

    const now = new Date().toISOString();

    // Calcular duracionMinutos si se está cerrando intraOp con inicio y fin
    const datosConDuracion = { ...datos } as Record<string, unknown>;
    if (fase === 'intraOp') {
      const d = datos as Record<string, unknown>;
      if (d['cirugiaInicio'] && d['cirugiaFin']) {
        const inicio = new Date(`1970-01-01T${d['cirugiaInicio']}:00`);
        const fin = new Date(`1970-01-01T${d['cirugiaFin']}:00`);
        datosConDuracion['duracionMinutos'] = Math.round((fin.getTime() - inicio.getTime()) / 60000);
      }
    }

    // Actualización parcial: solo sobreescribe la fase indicada, no toca las demás
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
      UpdateExpression: 'SET #fase = :datos, actualizadoEn = :now',
      ExpressionAttributeNames: { '#fase': fase },
      ExpressionAttributeValues: {
        ':datos': datosConDuracion,
        ':now': now,
      },
    }));

    return ok({ regId, fase, actualizadoEn: now });
  } catch (error) {
    return errorResponse(error);
  }
};
