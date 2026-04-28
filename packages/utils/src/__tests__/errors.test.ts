import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  formatErrorResponse,
} from '../errors.js';

describe('AppError', () => {
  it('tiene code, message y statusCode correctos', () => {
    const err = new AppError('TEST_CODE', 'mensaje de prueba', 422);
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('mensaje de prueba');
    expect(err.statusCode).toBe(422);
    expect(err.name).toBe('AppError');
  });

  it('statusCode por defecto es 400', () => {
    const err = new AppError('X', 'msg');
    expect(err.statusCode).toBe(400);
  });

  it('es instancia de Error', () => {
    expect(new AppError('X', 'msg')).toBeInstanceOf(Error);
  });
});

describe('NotFoundError', () => {
  it('genera mensaje con el recurso', () => {
    const err = new NotFoundError('Campaña');
    expect(err.message).toBe('Campaña no encontrado');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });
});

describe('UnauthorizedError', () => {
  it('tiene statusCode 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});

describe('ForbiddenError', () => {
  it('tiene statusCode 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});

describe('ConflictError', () => {
  it('tiene statusCode 409 y mensaje personalizado', () => {
    const err = new ConflictError('Ya registrado');
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Ya registrado');
    expect(err.code).toBe('CONFLICT');
  });
});

describe('RateLimitError', () => {
  it('tiene statusCode 429', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT');
  });
});

describe('formatErrorResponse', () => {
  it('formatea AppError correctamente', () => {
    const err = new NotFoundError('Mascota');
    const result = formatErrorResponse(err);
    expect(result).toEqual({ error: 'Mascota no encontrado', code: 'NOT_FOUND' });
  });

  it('devuelve INTERNAL_ERROR para errores desconocidos', () => {
    const result = formatErrorResponse(new Error('algo raro'));
    expect(result).toEqual({ error: 'Ha ocurrido un error inesperado', code: 'INTERNAL_ERROR' });
  });

  it('maneja strings como error desconocido', () => {
    const result = formatErrorResponse('error string');
    expect(result.code).toBe('INTERNAL_ERROR');
  });
});
