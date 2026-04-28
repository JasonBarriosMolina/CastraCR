import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { NotFoundError } from '@castrar-cr/utils';
import type { VetStatus } from '@castrar-cr/types';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Organizador', 'SuperAdmin');

    const vetId = event.pathParameters?.['id'];
    if (!vetId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'id es requerido', code: 'INVALID_PARAMS' }) };
    }

    const { estado } = JSON.parse(event.body ?? '{}') as { estado?: VetStatus };
    if (!estado || !['aprobado', 'rechazado'].includes(estado)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'estado debe ser aprobado o rechazado', code: 'INVALID_BODY' }) };
    }

    const vetResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `VET#${vetId}`, SK: 'METADATA' },
    }));
    if (!vetResult.Item) throw new NotFoundError('Veterinario');

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `VET#${vetId}`, SK: 'METADATA' },
      UpdateExpression: 'SET estado = :estado, updatedAt = :now',
      ExpressionAttributeValues: {
        ':estado': estado,
        ':now': new Date().toISOString(),
      },
    }));

    return ok({ vetId, estado });
  } catch (error) {
    return errorResponse(error);
  }
};
