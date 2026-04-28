import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';

const CDN_DOMAIN = process.env['CDN_DOMAIN'] ?? '';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Dueno', 'SuperAdmin');

    const petId = event.pathParameters?.['petId'];
    if (!petId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'petId requerido', code: 'INVALID_PARAMS' }) };
    }

    const body = JSON.parse(event.body ?? '{}') as { s3Key?: string };
    const { s3Key } = body;
    if (!s3Key) {
      return { statusCode: 400, body: JSON.stringify({ error: 's3Key requerido', code: 'INVALID_BODY' }) };
    }

    // Verificar propiedad de la mascota
    const petResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `PET#${petId}`, SK: 'METADATA' },
      ProjectionExpression: 'userId',
    }));

    if (!petResult.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Mascota no encontrada', code: 'NOT_FOUND' }) };
    }
    if (petResult.Item['userId'] !== authCtx.userId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'No tienes permiso para esta mascota', code: 'FORBIDDEN' }) };
    }

    const now = new Date().toISOString();

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `PET#${petId}`, SK: 'METADATA' },
      UpdateExpression: 'SET fotosS3Keys = list_append(if_not_exists(fotosS3Keys, :empty), :newKey), updatedAt = :now',
      ExpressionAttributeValues: {
        ':newKey': [s3Key],
        ':empty':  [],
        ':now':    now,
      },
    }));

    const cdnUrl = `https://${CDN_DOMAIN}/${s3Key}`;
    return ok({ cdnUrl });
  } catch (error) {
    return errorResponse(error);
  }
};
