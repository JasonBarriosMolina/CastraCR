import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../../shared/db.js';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole, requireResourceOwnership } from '../../../shared/auth.js';
import { NotFoundError } from '@castrar-cr/utils';
import type { Campaign } from '@castrar-cr/types';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Organizador', 'SuperAdmin');

    const campaignId = event.pathParameters?.['id'];
    if (!campaignId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'id es requerido', code: 'INVALID_PARAMS' }) };
    }

    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
    }));
    if (!result.Item) throw new NotFoundError('Campaña');
    requireResourceOwnership(authCtx, result.Item['organizadorId'] as string);

    const campaign = result.Item as Campaign & Record<string, unknown>;

    if (campaign['estado'] !== 'borrador') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Solo se pueden publicar campañas en borrador', code: 'INVALID_STATE' }) };
    }

    const venues = (campaign['venues'] as Campaign['venues']) ?? [];
    const slots = (campaign['slots'] as Campaign['slots']) ?? [];

    if (venues.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'La campaña debe tener al menos una sede', code: 'NO_VENUES' }) };
    }
    if (slots.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'La campaña debe tener al menos un turno', code: 'NO_SLOTS' }) };
    }

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
      UpdateExpression: 'SET estado = :activa, GSI4PK = :g4pk, updatedAt = :now',
      ExpressionAttributeValues: {
        ':activa': 'activa',
        ':g4pk': 'ESTADO#activa',
        ':now': new Date().toISOString(),
      },
    }));

    return ok({ campaignId, estado: 'activa' });
  } catch (error) {
    return errorResponse(error);
  }
};
