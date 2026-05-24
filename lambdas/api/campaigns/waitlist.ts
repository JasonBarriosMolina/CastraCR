import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';

const e = (statusCode: number, error: string) => ({
  statusCode,
  body: JSON.stringify({ error }),
});

/**
 * POST /campaigns/{id}/waitlist
 * Agrega al dueño a la lista de espera de una campaña.
 * No requiere JWT — el bot llama directo con datos del dueño.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const campaignId = event.pathParameters?.id;
    if (!campaignId) return e(400, 'Falta campaignId');

    let body: {
      telefono: string;
      ownerNombre?: string;
      petNombre?: string;
      especie?: string;
      razon?: 'sin_cupos' | 'slots_no_consecutivos' | 'mascota_no_apta_temporal';
    };

    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return e(400, 'JSON inválido');
    }

    if (!body.telefono) return e(400, 'Falta teléfono');

    // Verificar que la campaña existe
    const now = new Date().toISOString();
    const timestamp = Date.now();

    // Contar posición actual en waitlist
    const existing = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `WAITLIST#${campaignId}`,
        ':prefix': 'TS#',
      },
    }));
    const posicion = (existing.Items?.length ?? 0) + 1;

    // Guardar en waitlist
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `WAITLIST#${campaignId}`,
        SK: `TS#${timestamp}#${body.telefono.replace(/\D/g, '')}`,
        campaignId,
        telefono: body.telefono,
        ownerNombre: body.ownerNombre,
        petNombre: body.petNombre,
        especie: body.especie,
        razon: body.razon ?? 'sin_cupos',
        posicion,
        notificado: false,
        creadoEn: now,
        // TTL: 90 días
        ttl: Math.floor(Date.now() / 1000) + 86400 * 90,
      },
      ConditionExpression: 'attribute_not_exists(PK)', // no duplicar mismo timestamp
    }).catch(() =>
      // Si hay colisión de timestamp, reintentar con +1ms — simplemente guardar
      ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `WAITLIST#${campaignId}`,
          SK: `TS#${timestamp + 1}#${body.telefono.replace(/\D/g, '')}`,
          campaignId,
          telefono: body.telefono,
          ownerNombre: body.ownerNombre,
          petNombre: body.petNombre,
          especie: body.especie,
          razon: body.razon ?? 'sin_cupos',
          posicion,
          notificado: false,
          creadoEn: now,
          ttl: Math.floor(Date.now() / 1000) + 86400 * 90,
        },
      })),
    ));

    return ok({ posicion, mensaje: 'Te notificaremos por WhatsApp si se libera un espacio' }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
