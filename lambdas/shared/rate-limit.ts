/**
 * Rate limiting por IP usando DynamoDB.
 * Patrón: ventana deslizante de N requests por M segundos.
 *
 * DDB key: RATELIMIT#{scope}#{ip} / WINDOW
 * TTL: expiración automática al final de la ventana.
 *
 * Uso:
 *   const ip = getClientIp(event);
 *   const limited = await checkRateLimit(ip, 'pay-intent', 5, 60); // 5 req/min
 *   if (limited) return rateLimitResponse();
 */
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from './db.js';

/**
 * Extrae la IP real del cliente, considerando proxies/CloudFront.
 * API Gateway HTTP API inyecta la IP en requestContext.http.sourceIp.
 * X-Forwarded-For puede ser manipulada — usar sourceIp como fuente de verdad.
 */
export function getClientIp(event: APIGatewayProxyEventV2): string {
  // sourceIp es la IP real que API Gateway vio — no manipulable por el cliente
  const sourceIp = event.requestContext.http.sourceIp;
  return sourceIp ?? 'unknown';
}

/**
 * Verifica y registra un request en la ventana de rate limit.
 * Retorna `true` si el request debe ser bloqueado (límite superado).
 *
 * @param ip       IP del cliente
 * @param scope    Nombre del endpoint (ej: 'pay-intent', 'donation')
 * @param limit    Máximo de requests permitidos en la ventana
 * @param windowSec Duración de la ventana en segundos
 */
export async function checkRateLimit(
  ip: string,
  scope: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  // Normalizar IPv6 loopback a IPv4 para evitar keys gigantes
  const normalizedIp = ip === '::1' ? '127.0.0.1' : ip;
  const pk = `RATELIMIT#${scope}#${normalizedIp}`;
  const now = Math.floor(Date.now() / 1000);
  const windowExpiry = now + windowSec;

  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: 'WINDOW' },
      UpdateExpression: [
        'SET #count = if_not_exists(#count, :zero) + :one',
        'windowStart = if_not_exists(windowStart, :now)',
        '#ttl = :expiry',
      ].join(', '),
      // Resetear contador si la ventana anterior ya expiró
      ConditionExpression: 'attribute_not_exists(windowStart) OR windowStart > :expired',
      ExpressionAttributeNames: {
        '#count': 'count',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1,
        ':now': now,
        ':expiry': windowExpiry,
        ':expired': now - windowSec,
      },
      ReturnValues: 'ALL_NEW',
    }));

    const count = (result.Attributes?.['count'] as number | undefined) ?? 1;
    return count > limit;

  } catch (err: unknown) {
    // ConditionalCheckFailedException = ventana expiró, resetear
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      // Crear nueva ventana desde cero
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: 'WINDOW' },
        UpdateExpression: 'SET #count = :one, windowStart = :now, #ttl = :expiry',
        ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':one': 1,
          ':now': now,
          ':expiry': windowExpiry,
        },
      }));
      return false; // primer request de la nueva ventana — siempre permitir
    }
    // Error inesperado — fail open (no bloquear) para no afectar UX
    console.error('rate-limit error (fail open):', err);
    return false;
  }
}

/**
 * Respuesta estándar 429 con headers Retry-After.
 */
export function rateLimitResponse(retryAfterSec = 60) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSec),
      'X-RateLimit-Limit': 'exceeded',
    },
    body: JSON.stringify({
      error: 'Demasiadas solicitudes. Intentá de nuevo en un momento.',
      code: 'RATE_LIMIT_EXCEEDED',
    }),
  };
}
