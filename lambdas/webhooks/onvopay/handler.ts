/**
 * OnvoPay Webhook Handler
 *
 * Recibe notificaciones de pago de OnvoPay.
 * Signature verification: HMAC-SHA256 obligatoria — rechaza si no hay secret configurado.
 * Header de firma: x-onvopay-signature (o x-signature como fallback).
 *
 * Tipos manejados:
 *  - tipo: 'cita'     → confirma appointment (pendiente_pago → confirmada)
 *  - tipo: 'donacion' → graba donación en DDB (100% a la org, sin split)
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createHmac } from 'crypto';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { getSecrets } from '../../shared/secrets.js';

interface OnvoPayEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      metadata?: Record<string, string>;
    };
  };
}

const resp = (statusCode: number, body: string) => ({ statusCode, body });

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const secrets = await getSecrets();
  const webhookSecret = secrets['ONVOPAY_WEBHOOK_SECRET'] ?? '';

  // ── Verificación de firma HMAC-SHA256 — OBLIGATORIA ─────────────────────────
  if (!webhookSecret) {
    console.error('ONVOPAY_WEBHOOK_SECRET no está configurado — rechazando request');
    return resp(500, 'Webhook secret not configured');
  }

  const signature = event.headers['x-onvopay-signature'] ?? event.headers['x-signature'] ?? '';
  const rawBody = event.body ?? '';

  if (!signature) {
    console.error('Request sin header de firma — rechazado');
    return resp(400, 'Missing signature');
  }

  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const signatureClean = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  if (signatureClean !== expected) {
    console.error('Firma inválida — rechazado');
    return resp(400, 'Invalid signature');
  }

  // ── Parseo del evento ────────────────────────────────────────────────────────
  let onvoEvent: OnvoPayEvent;
  try {
    onvoEvent = JSON.parse(rawBody) as OnvoPayEvent;
  } catch {
    return resp(400, 'Invalid JSON');
  }

  // ── Idempotencia — evitar doble procesamiento ─────────────────────────────
  const idempotencyKey = `ONVOPAY_EVENT#${onvoEvent.id}`;
  const existing = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: idempotencyKey, SK: 'PROCESSED' },
  }));

  if (existing.Item) {
    console.log(`Evento ${onvoEvent.id} ya procesado, skip`);
    return resp(200, 'Already processed');
  }

  // Marcar como procesado ANTES de actuar — evita race conditions
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: idempotencyKey,
        SK: 'PROCESSED',
        provider: 'onvopay',
        timestamp: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 30 * 86_400, // 30 días
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return resp(200, 'Already processed (race)');
    }
    throw err;
  }

  // ── Manejar evento ───────────────────────────────────────────────────────────
  const isPayment =
    onvoEvent.type === 'payment_intent.succeeded' ||
    onvoEvent.type === 'payment.completed';

  if (!isPayment) {
    console.log(`Evento no manejado: ${onvoEvent.type}`);
    return resp(200, 'OK');
  }

  const payObj = onvoEvent.data.object;
  const metadata = payObj.metadata ?? {};
  const tipo = metadata['tipo'];
  const now = new Date().toISOString();

  // ── TIPO: CITA ───────────────────────────────────────────────────────────────
  if (tipo === 'cita') {
    const regId = metadata['regId'];
    if (!regId) {
      console.error('Evento tipo cita sin regId en metadata');
      return resp(200, 'OK');
    }

    try {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `REG#${regId}`, SK: 'METADATA' },
        UpdateExpression: [
          'SET estado = :conf',
          'paymentIntentId = :pid',
          'montoCRC = :monto',
          'updatedAt = :now',
        ].join(', '),
        ConditionExpression: 'estado = :pend',
        ExpressionAttributeValues: {
          ':conf': 'confirmada',
          ':pend': 'pendiente_pago',
          ':pid': payObj.id,
          ':monto': payObj.amount,
          ':now': now,
        },
      }));
      console.log(`Cita ${regId} confirmada — ₡${payObj.amount.toLocaleString()}`);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        console.log(`Cita ${regId} ya no está en pendiente_pago — skip`);
      } else {
        throw err;
      }
    }
    return resp(200, 'OK');
  }

  // ── TIPO: DONACION ───────────────────────────────────────────────────────────
  if (tipo === 'donacion') {
    const donationId = randomUUID();
    const userId = metadata['userId'] ?? '';
    const orgRescateId = metadata['orgRescateId'] ?? '';
    const cubrimientoFee = metadata['cubrimientoFee'] === 'true';

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `DONATION#${donationId}`,
        SK: 'METADATA',
        donationId,
        montoCRC: payObj.amount, // CRC, sin decimales
        tipo: 'voluntaria',
        userId: userId || undefined,
        campaignId: metadata['campaignId'] || undefined,
        orgRescateId,
        onvoPayEventId: onvoEvent.id,
        proveedor: 'onvopay',
        estado: 'completada',
        cubrimientoFee,
        // 100% va a la org — sin split de plataforma
        // GSI3: por usuario (si existe)
        ...(userId ? { GSI3PK: `USER#${userId}`, GSI3SK: `DONATION#${donationId}` } : {}),
        // GSI4: por estado (para monthly-close y reportes)
        GSI4PK: 'DONATION_ESTADO#completada',
        GSI4SK: `DONATION#${donationId}`,
        createdAt: now,
      },
    }));

    console.log(`Donación ${donationId}: ₡${payObj.amount.toLocaleString()} → org ${orgRescateId}`);
    return resp(200, 'OK');
  }

  console.log(`Metadata tipo desconocido: ${tipo ?? '(sin tipo)'}`);
  return resp(200, 'OK');
};
