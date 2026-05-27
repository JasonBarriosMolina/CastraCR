/**
 * Lambda Authorizer (HTTP API payload format 2.0)
 * Valida el header X-API-Key contra BOT_API_KEY en Secrets Manager.
 * Usado para proteger los endpoints del bot externo.
 */
import type { APIGatewaySimpleAuthorizerWithContextResult, APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { getSecrets } from '../shared/secrets.js';

export const handler = async (
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<Record<string, string>>> => {
  try {
    const incomingKey = event.headers?.['x-api-key'] ?? event.headers?.['X-Api-Key'] ?? '';

    if (!incomingKey) {
      return { isAuthorized: false, context: {} };
    }

    const secrets = await getSecrets();
    const validKey = secrets['BOT_API_KEY'] ?? '';

    if (!validKey || incomingKey !== validKey) {
      return { isAuthorized: false, context: {} };
    }

    return {
      isAuthorized: true,
      context: { source: 'bot_externo' },
    };
  } catch {
    return { isAuthorized: false, context: {} };
  }
};
