/**
 * Sanitizes user input before sending to Claude API.
 * Prevents prompt injection by removing control characters
 * and limiting length.
 */
export function sanitizeForAI(input: string): string {
  return input
    .replace(/[\x00-\x1F\x7F]/g, ' ') // Remove control characters
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .trim()
    .slice(0, 2000);                   // Max 2000 chars
}

/**
 * Sanitizes filename for S3 upload.
 * Returns a safe filename preserving extension.
 */
export function sanitizeFilename(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
  const allowed = ['jpg', 'jpeg', 'png', 'webp'];
  if (!allowed.includes(ext)) {
    throw new Error(`Tipo de archivo no permitido: ${ext}`);
  }
  return ext;
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export function isAllowedImageType(mimeType: string): mimeType is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}
