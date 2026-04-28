import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext } from '../../shared/auth.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);

    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI3-userId',
      KeyConditionExpression: 'GSI3PK = :pk AND begins_with(GSI3SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${authCtx.userId}`,
        ':sk': 'REG#',
      },
    }));

    const registrations = (result.Items ?? []).map(({ PK, SK, GSI3PK, GSI3SK, ...reg }) => reg);
    return ok({ registrations });
  } catch (error) {
    return errorResponse(error);
  }
};
