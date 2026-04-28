import { describe, it, expect } from 'vitest';
import {
  sanitizeForAI,
  sanitizeFilename,
  isAllowedImageType,
  ALLOWED_IMAGE_TYPES,
} from '../sanitize.js';

describe('sanitizeForAI', () => {
  it('elimina caracteres de control', () => {
    const input = 'Hola\x00mundo\x1F!';
    expect(sanitizeForAI(input)).toBe('Hola mundo !');
  });

  it('normaliza espacios múltiples', () => {
    expect(sanitizeForAI('foo   bar')).toBe('foo bar');
  });

  it('recorta a 2000 caracteres', () => {
    const long = 'a'.repeat(3000);
    expect(sanitizeForAI(long)).toHaveLength(2000);
  });

  it('hace trim', () => {
    expect(sanitizeForAI('  hola  ')).toBe('hola');
  });

  it('no modifica texto normal', () => {
    const text = 'Mi gato se llama Michi y tiene 3 años.';
    expect(sanitizeForAI(text)).toBe(text);
  });
});

describe('sanitizeFilename', () => {
  it('retorna la extensión para archivos permitidos', () => {
    expect(sanitizeFilename('foto.jpg')).toBe('jpg');
    expect(sanitizeFilename('imagen.PNG')).toBe('png');
    expect(sanitizeFilename('mascota.webp')).toBe('webp');
    expect(sanitizeFilename('foto.jpeg')).toBe('jpeg');
  });

  it('lanza error para extensiones no permitidas', () => {
    expect(() => sanitizeFilename('virus.exe')).toThrow('Tipo de archivo no permitido');
    expect(() => sanitizeFilename('script.js')).toThrow('Tipo de archivo no permitido');
    expect(() => sanitizeFilename('doc.pdf')).toThrow('Tipo de archivo no permitido');
  });
});

describe('isAllowedImageType', () => {
  it('acepta tipos MIME válidos', () => {
    expect(isAllowedImageType('image/jpeg')).toBe(true);
    expect(isAllowedImageType('image/png')).toBe(true);
    expect(isAllowedImageType('image/webp')).toBe(true);
  });

  it('rechaza tipos MIME no permitidos', () => {
    expect(isAllowedImageType('image/gif')).toBe(false);
    expect(isAllowedImageType('application/pdf')).toBe(false);
    expect(isAllowedImageType('')).toBe(false);
  });

  it('ALLOWED_IMAGE_TYPES tiene 3 tipos', () => {
    expect(ALLOWED_IMAGE_TYPES).toHaveLength(3);
  });
});
