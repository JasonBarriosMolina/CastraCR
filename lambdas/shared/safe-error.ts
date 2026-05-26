/**
 * Sanitiza mensajes de error para respuestas HTTP.
 * En producción, los errores 5xx retornan un mensaje genérico —
 * el detalle va solo a CloudWatch Logs.
 *
 * Los errores de negocio (4xx) SÍ se muestran al cliente
 * porque son informativos y no exponen internals.
 */

const IS_PROD = process.env['APP_ENV'] === 'prod';

const SAFE_ERROR_CODES = new Set([
  'RATE_LIMIT_EXCEEDED',
  'ALREADY_PAID',
  'EXPIRED',
  'FREE_CAMPAIGN',
  'INVALID_STATUS',
  'INVALID_BODY',
  'INVALID_AMOUNT',
  'AMOUNT_EXCEEDS_LIMIT',
  'ALREADY_CLOSED',
  'ALREADY_PROCESSED',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'PAYMENT_TIMEOUT',
]);

/**
 * Retorna un mensaje seguro para enviar al cliente.
 * Si el error es 5xx y estamos en prod, retorna mensaje genérico.
 */
export function safeErrorMessage(
  error: unknown,
  statusCode: number,
  originalMessage: string,
): string {
  if (statusCode >= 500 && IS_PROD) {
    // Loguear el detalle real solo en CloudWatch
    console.error('[INTERNAL_ERROR]', {
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
      timestamp: new Date().toISOString(),
    });
    return 'Error interno del servidor. Intentá de nuevo en unos minutos.';
  }
  return originalMessage;
}

/**
 * Verifica si un código de error es seguro para exponer al cliente.
 */
export function isSafeCode(code: string | undefined): boolean {
  return !code || SAFE_ERROR_CODES.has(code);
}
