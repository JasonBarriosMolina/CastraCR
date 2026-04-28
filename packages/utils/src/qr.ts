import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a cryptographically random QR token (UUID v4).
 * The QR contains ONLY this opaque token — no sensitive data.
 */
export function generateQRToken(): string {
  return uuidv4();
}

/**
 * Generates a QR code as a data URL for a given token.
 */
export async function generateQRDataURL(token: string): Promise<string> {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 300,
  });
}

/**
 * Generates a QR code as SVG string for PDF embedding.
 */
export async function generateQRSVG(token: string): Promise<string> {
  return QRCode.toString(token, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 2,
  });
}
