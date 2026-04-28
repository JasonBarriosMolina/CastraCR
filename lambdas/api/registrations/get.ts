import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
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

    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));

    if (!result.Item) throw new NotFoundError('Registro');

    requireResourceOwnership(authCtx, result.Item['userId'] as string);

    const { PK, SK, GSI3PK, GSI3SK, ...registration } = result.Item;
    return ok({ registration });
  } catch (error) {
    return errorResponse(error);
  }
};
