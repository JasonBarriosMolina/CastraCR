export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} no encontrado`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super('UNAUTHORIZED', 'No autorizado', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super('FORBIDDEN', 'Acceso denegado', 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('RATE_LIMIT', 'Límite de mensajes excedido. Por favor intentá más tarde 🙏', 429);
  }
}

/**
 * Formats error for API response — NEVER exposes internal details.
 */
export function formatErrorResponse(error: unknown): { error: string; code: string } {
  if (error instanceof AppError) {
    return { error: error.message, code: error.code };
  }
  // Generic message for unexpected errors
  console.error('Unexpected error:', error);
  return { error: 'Ha ocurrido un error inesperado', code: 'INTERNAL_ERROR' };
}
