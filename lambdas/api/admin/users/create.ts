import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_NAME } from '../../../shared/db.js';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole } from '../../../shared/auth.js';

const cognito = new CognitoIdentityProviderClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
const USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'] ?? '';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'SuperAdmin');

    const body = JSON.parse(event.body ?? '{}') as {
      nombre?: string;
      email?: string;
      group?: string;
    };

    if (!body.nombre || !body.email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'nombre y email son requeridos' }) };
    }

    const group = body.group ?? 'Organizador';
    const userId = randomUUID();

    // 1. Crear usuario en Cognito (envía email con contraseña temporal)
    try {
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: body.email,
        UserAttributes: [
          { Name: 'email', Value: body.email },
          { Name: 'name', Value: body.nombre },
          { Name: 'email_verified', Value: 'true' },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
        // Cognito genera una contraseña temporal y la envía por email automáticamente
      }));
    } catch (err) {
      if (err instanceof UsernameExistsException) {
        return { statusCode: 409, body: JSON.stringify({ error: 'Ya existe una cuenta con este correo' }) };
      }
      throw err;
    }

    // 2. Agregar al grupo correspondiente
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: body.email,
      GroupName: group,
    }));

    // 3. Crear perfil en DynamoDB
    const now = new Date().toISOString();
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
        userId,
        nombre: body.nombre,
        email: body.email,
        rol: group,
        cognitoSub: body.email, // Se actualizará al primer login con el sub real
        createdAt: now,
        updatedAt: now,
      },
    }));

    return ok({
      userId,
      email: body.email,
      nombre: body.nombre,
      confirmado: false,
      createdAt: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
