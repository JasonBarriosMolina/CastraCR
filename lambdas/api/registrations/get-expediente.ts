import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { NotFoundError } from '@castrar-cr/utils';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Veterinario', 'Organizador', 'SuperAdmin');

    const regId = event.pathParameters?.['regId'];
    if (!regId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'regId es requerido', code: 'INVALID_PARAMS' }) };
    }

    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
    }));

    if (!result.Item) throw new NotFoundError('Expediente');

    // Limpiar campos internos de DynamoDB
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { PK, SK, ...expediente } = result.Item as Record<string, unknown>;

    return ok({ expediente });
  } catch (error) {
    return errorResponse(error);
  }
};
