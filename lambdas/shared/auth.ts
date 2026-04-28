import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { ForbiddenError, UnauthorizedError } from '@castrar-cr/utils';
import type { UserRole } from '@castrar-cr/types';

export interface AuthContext {
  userId: string;
  email: string;
  roles: UserRole[];
}

export function getAuthContext(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): AuthContext {
  const claims = event.requestContext.authorizer.jwt.claims;
  const sub = claims['sub'];
  const email = claims['email'];

  if (!sub || !email) {
    throw new UnauthorizedError();
  }

  // API Gateway HTTP API serializa cognito:groups como "[SuperAdmin]" (sin comillas internas)
  // que NO es JSON válido. Hay que strip de brackets y split por coma.
  const rawGroups = claims['cognito:groups'];
  let groups: string[] = [];
  if (Array.isArray(rawGroups)) {
    groups = rawGroups as string[];
  } else if (typeof rawGroups === 'string' && rawGroups.length > 0) {
    if (rawGroups.startsWith('[') && rawGroups.endsWith(']')) {
      // Intentar JSON válido primero ("["SuperAdmin"]"), luego el formato API GW ("[SuperAdmin]")
      try {
        groups = JSON.parse(rawGroups) as string[];
      } catch {
        groups = rawGroups.slice(1, -1).split(',').map((g) => g.trim()).filter(Boolean);
      }
    } else {
      groups = rawGroups.split(',').map((g) => g.trim());
    }
  }

  return {
    userId: sub as string,
    email: email as string,
    roles: groups as UserRole[],
  };
}

export function requireRole(context: AuthContext, ...roles: UserRole[]): void {
  const hasRole = roles.some((role) => context.roles.includes(role));
  if (!hasRole) {
    throw new ForbiddenError();
  }
}

export function requireResourceOwnership(
  context: AuthContext,
  resourceOwnerId: string,
): void {
  if (context.userId !== resourceOwnerId && !context.roles.includes('SuperAdmin')) {
    throw new ForbiddenError();
  }
}
