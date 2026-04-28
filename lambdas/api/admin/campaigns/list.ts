import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../../shared/db.js';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole } from '../../../shared/auth.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Organizador', 'SuperAdmin');

    // SuperAdmin can query any organizador; Organizador only sees their own
    const organizadorId = authCtx.roles.includes('SuperAdmin')
      ? (event.queryStringParameters?.['organizadorId'] ?? authCtx.userId)
      : authCtx.userId;

    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1-organizadorId',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ORG#${organizadorId}`,
        ':sk': 'CAMPAIGN#',
      },
    }));

    const campaigns = (result.Items ?? []).map(({ PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI4PK, GSI4SK, ...c }) => c);
    return ok({ campaigns });
  } catch (error) {
    return errorResponse(error);
  }
};
