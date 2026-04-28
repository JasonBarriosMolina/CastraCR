import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../../shared/db.js';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole } from '../../../shared/auth.js';

type OrgUpdateBody = {
  nombre?: string;
  email?: string;
  telefono?: string;
  descripcion?: string;
  sinpeMovil?: string;
  iban?: string;
  nombreBanco?: string;
};

const ALLOWED_FIELDS: (keyof OrgUpdateBody)[] = [
  'nombre', 'email', 'telefono', 'descripcion',
  'sinpeMovil', 'iban', 'nombreBanco',
];

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'SuperAdmin');

    const orgId = event.pathParameters?.['orgId'];
    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId requerido', code: 'INVALID_PARAMS' }),
      };
    }

    // Verify org exists
    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ORG#${orgId}`, SK: 'PROFILE' },
      ProjectionExpression: 'orgId',
    }));
    if (!existing.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Organización no encontrada', code: 'NOT_FOUND' }),
      };
    }

    const body = JSON.parse(event.body ?? '{}') as OrgUpdateBody;

    // Collect fields to update
    const setParts: string[] = [];
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, unknown> = {};

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        const nameKey = `#${field}`;
        const valKey = `:${field}`;
        setParts.push(`${nameKey} = ${valKey}`);
        exprNames[nameKey] = field;
        exprValues[valKey] = (body[field] as string) ?? '';
      }
    }

    if (setParts.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Ningún campo para actualizar', code: 'INVALID_BODY' }),
      };
    }

    // Always update updatedAt
    setParts.push('#updatedAt = :updatedAt');
    exprNames['#updatedAt'] = 'updatedAt';
    exprValues[':updatedAt'] = new Date().toISOString();

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ORG#${orgId}`, SK: 'PROFILE' },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ConditionExpression: 'attribute_exists(PK)',
    }));

    return ok({ orgId });
  } catch (error) {
    return errorResponse(error);
  }
};
