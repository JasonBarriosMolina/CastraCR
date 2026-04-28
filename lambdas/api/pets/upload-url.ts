import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID as uuidv4 } from 'crypto';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';

const BUCKET_NAME = process.env['PHOTOS_BUCKET_NAME'] ?? '';
const CDN_DOMAIN  = process.env['CDN_DOMAIN'] ?? '';
const EXPIRES_IN  = 15 * 60; // 15 minutos

const s3 = new S3Client({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Dueno', 'SuperAdmin');

    const petId = event.pathParameters?.['petId'];
    if (!petId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'petId requerido', code: 'INVALID_PARAMS' }) };
    }

    // Verificar que la mascota pertenece al usuario
    const petResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `PET#${petId}`, SK: 'METADATA' },
      ProjectionExpression: 'userId',
    }));

    if (!petResult.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Mascota no encontrada', code: 'NOT_FOUND' }) };
    }
    if (petResult.Item['userId'] !== authCtx.userId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'No tienes permiso para esta mascota', code: 'FORBIDDEN' }) };
    }

    // Determinar extensión desde query param
    const contentType = (event.queryStringParameters?.['contentType'] ?? 'image/jpeg').toLowerCase();
    const ext = EXT_MAP[contentType] ?? 'jpg';
    const safeContentType = EXT_MAP[contentType] ? contentType : 'image/jpeg';

    const fileId = uuidv4();
    const key = `pets/${petId}/${fileId}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: safeContentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: EXPIRES_IN });
    const cdnUrl = `https://${CDN_DOMAIN}/${key}`;

    return ok({ uploadUrl, key, cdnUrl });
  } catch (error) {
    return errorResponse(error);
  }
};
