import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../../shared/db.js';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole } from '../../../shared/auth.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'SuperAdmin', 'Organizador');

    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk',
      ExpressionAttributeValues: {
        ':prefix': 'ORG#',
        ':sk': 'PROFILE',
      },
      ProjectionExpression: 'orgId, nombre, email, telefono, descripcion, createdAt',
    }));

    const orgs = (result.Items ?? []).sort((a, b) =>
      (a['nombre'] as string ?? '').localeCompare(b['nombre'] as string ?? ''),
    );

    return ok({ orgs });
  } catch (error) {
    return errorResponse(error);
  }
};
