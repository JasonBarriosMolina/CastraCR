import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole } from '../../../shared/auth.js';

const cognito = new CognitoIdentityProviderClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
const USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'] ?? '';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'SuperAdmin');

    const group = event.queryStringParameters?.['group'] ?? 'Organizador';

    const result = await cognito.send(new ListUsersInGroupCommand({
      UserPoolId: USER_POOL_ID,
      GroupName: group,
      Limit: 60,
    }));

    const users = (result.Users ?? []).map((u) => {
      const attrs = Object.fromEntries(
        (u.Attributes ?? []).map((a) => [a.Name, a.Value]),
      );
      return {
        userId: attrs['sub'] ?? u.Username ?? '',
        email: attrs['email'] ?? '',
        nombre: attrs['name'] ?? '',
        confirmado: u.UserStatus === 'CONFIRMED',
        createdAt: u.UserCreateDate?.toISOString() ?? new Date().toISOString(),
      };
    });

    return ok({ users });
  } catch (error) {
    return errorResponse(error);
  }
};
