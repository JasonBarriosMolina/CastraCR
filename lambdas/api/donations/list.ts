import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext } from '../../shared/auth.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);

    // Donations don't have a GSI3 per-user index yet, so we scan with filter.
    // TODO: add GSI3 for donations in DataStack if this proves slow.
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI3-userId',
      KeyConditionExpression: 'GSI3PK = :pk AND begins_with(GSI3SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${authCtx.userId}`,
        ':sk': 'DONATION#',
      },
    }));

    const donations = (result.Items ?? []).map(({ PK, SK, GSI3PK, GSI3SK, ...d }) => d);
    return ok({ donations });
  } catch (error) {
    return errorResponse(error);
  }
};
