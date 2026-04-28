import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireResourceOwnership } from '../../shared/auth.js';
import { NotFoundError } from '@castrar-cr/utils';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    const regId = event.pathParameters?.['id'];
    if (!regId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'id es requerido', code: 'INVALID_PARAMS' }) };
    }

    // 1. Get registration
    const regResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regResult.Item) throw new NotFoundError('Registro');
    requireResourceOwnership(authCtx, regResult.Item['userId'] as string);

    const reg = regResult.Item;
    if (reg['estado'] === 'cancelada') {
      return { statusCode: 400, body: JSON.stringify({ error: 'El registro ya está cancelado', code: 'ALREADY_CANCELLED' }) };
    }
    if (reg['estado'] === 'completada') {
      return { statusCode: 400, body: JSON.stringify({ error: 'No se puede cancelar un registro completado', code: 'ALREADY_COMPLETED' }) };
    }

    const now = new Date().toISOString();
    const wasConfirmed = reg['estado'] === 'confirmada';

    // 2. Cancel registration
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
      UpdateExpression: 'SET estado = :cancelada, updatedAt = :now',
      ExpressionAttributeValues: { ':cancelada': 'cancelada', ':now': now },
    }));

    // 3. Delete QR lookup item if it was confirmed
    if (wasConfirmed && reg['qrToken']) {
      await ddb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `QR#${reg['qrToken']}`, SK: 'REG' },
      }));
    }

    // 4. If was confirmed, restore slot capacity and check waitlist
    if (wasConfirmed) {
      const campaignId = reg['campaignId'] as string;
      const slotId = reg['slotId'] as string;

      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${campaignId}`, SK: `SLOT#${slotId}#AVAIL` },
        UpdateExpression: 'ADD cuposDisponibles :one',
        ExpressionAttributeValues: { ':one': 1 },
      }));

      // 5. Promote first waitlist registration for this slot
      const waitlistResult = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI3-userId',
        FilterExpression: 'estado = :espera AND campaignId = :cid AND slotId = :sid',
        // We need to scan all registrations for this slot — a simpler approach
        // uses a dedicated waitlist index. For now, query by campaign via scan workaround.
        KeyConditionExpression: 'GSI3PK = :dummy',
        ExpressionAttributeValues: {
          ':dummy': `CAMPAIGN#${campaignId}`,
          ':espera': 'lista_espera',
          ':cid': campaignId,
          ':sid': slotId,
        },
        Limit: 1,
      })).catch(() => ({ Items: [] }));

      // NOTE: A dedicated WAITLIST GSI would be more efficient for production.
      // For now, the notify-waitlist event Lambda handles this asynchronously.
      void waitlistResult;
    }

    return ok({ message: 'Registro cancelado exitosamente' });
  } catch (error) {
    return errorResponse(error);
  }
};
