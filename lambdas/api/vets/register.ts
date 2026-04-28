import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID as uuidv4 } from 'crypto';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { ConflictError } from '@castrar-cr/utils';
import type { Vet } from '@castrar-cr/types';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Veterinario', 'SuperAdmin');

    const body = JSON.parse(event.body ?? '{}') as Pick<Vet, 'nombre' | 'colegiatura' | 'especialidad' | 'foto'>;
    const { nombre, colegiatura } = body;

    if (!nombre || !colegiatura) {
      return { statusCode: 400, body: JSON.stringify({ error: 'nombre y colegiatura son requeridos', code: 'INVALID_BODY' }) };
    }

    // Prevent duplicate registration by the same user
    const existingResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER_VET#${authCtx.userId}`, SK: 'VET_REF' },
    }));
    if (existingResult.Item) {
      throw new ConflictError('Ya tienes un perfil veterinario registrado');
    }

    const vetId = uuidv4();
    const now = new Date().toISOString();

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `VET#${vetId}`,
        SK: 'METADATA',
        vetId,
        userId: authCtx.userId,
        nombre,
        colegiatura,
        foto: body.foto,
        especialidad: body.especialidad,
        estado: 'pendiente',
        historialCampanas: [],
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));

    // Create reverse lookup: user → vet
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER_VET#${authCtx.userId}`,
        SK: 'VET_REF',
        vetId,
        createdAt: now,
      },
    }));

    return ok({ vetId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
