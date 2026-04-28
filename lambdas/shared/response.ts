import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { formatErrorResponse } from '@castrar-cr/utils';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ALLOWED_ORIGIN'] ?? '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

export function ok<T>(data: T, statusCode = 200): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ data }),
  };
}

export function created<T>(data: T): APIGatewayProxyResultV2 {
  return ok(data, 201);
}

export function errorResponse(error: unknown): APIGatewayProxyResultV2 {
  const { error: message, code } = formatErrorResponse(error);
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message, code }),
  };
}
