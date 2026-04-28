import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_NAME } from '../../../shared/db.js';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole } from '../../../shared/auth.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'SuperAdmin');

    const body = JSON.parse(event.body ?? '{}') as {
      nombre?: string;
      email?: string;
      telefono?: string;
      descripcion?: string;
    };

    const { nombre, email, telefono, descripcion } = body;
    if (!nombre || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'nombre y email son requeridos', code: 'INVALID_BODY' }),
      };
    }

    const orgId = randomUUID();
    const now = new Date().toISOString();

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${orgId}`,
        SK: 'PROFILE',
        orgId,
        nombre,
        email,
        telefono: telefono ?? '',
        descripcion: descripcion ?? '',
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));

    return ok({ orgId, nombre, email }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
