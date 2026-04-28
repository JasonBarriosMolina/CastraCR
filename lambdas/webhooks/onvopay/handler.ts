/**
 * OnvoPay Webhook Handler
 *
 * Recibe notificaciones de pago de OnvoPay y registra donaciones completadas.
 * Signature verification: HMAC-SHA256 del body con ONVOPAY_WEBHOOK_SECRET.
 * El header de firma es: x-onvopay-signature (ajustar si OnvoPay usa otro header).
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createHmac } from 'crypto';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID as uuidv4 } from 'crypto';
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

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const secrets = await getSecrets();
  const webhookSecret = secrets['ONVOPAY_WEBHOOK_SECRET'] ?? '';

  // Verificar firma HMAC-SHA256
  const signature = event.headers['x-onvopay-signature'] ?? event.headers['x-signature'] ?? '';
  const rawBody = event.body ?? '';

  if (webhookSecret && signature) {
    const expected = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    if (signature !== expected && signature !== `sha256=${expected}`) {
      console.error('OnvoPay signature verification failed');
      return { statusCode: 400, body: 'Signature verification failed' };
    }
  }

  let onvoEvent: OnvoPayEvent;
  try {
    onvoEvent = JSON.parse(rawBody) as OnvoPayEvent;
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Idempotencia — evitar procesar el mismo evento dos veces
  const idempotencyKey = `PAYMENT_EVENT#${onvoEvent.id}`;
  const existing = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: idempotencyKey, SK: 'PROCESSED' },
  }));

  if (existing.Item) {
    console.log(`Event ${onvoEvent.id} already processed, skipping`);
    return { statusCode: 200, body: 'Already processed' };
  }

  // Marcar como procesado ANTES de manejar — evita race conditions
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: idempotencyKey,
      SK: 'PROCESSED',
      provider: 'onvopay',
      timestamp: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 30 * 86400, // 30d retention
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  }));

  // Manejar evento según tipo
  // OnvoPay usa 'payment_intent.succeeded' o 'payment.completed' — ajustar según docs
  if (onvoEvent.type === 'payment_intent.succeeded' || onvoEvent.type === 'payment.completed') {
    const paymentObject = onvoEvent.data.object;
    const metadata = paymentObject.metadata ?? {};
    const tipo = metadata['tipo'];

    if (tipo === 'donacion') {
      const donationId = uuidv4();
      const userId = metadata['userId'] ?? '';
      const now = new Date().toISOString();

      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `DONATION#${donationId}`,
          SK: 'METADATA',
          donationId,
          monto: paymentObject.amount,
          tipo: 'voluntaria',
          userId,
          campaignId: metadata['campaignId'],
          orgRescateId: metadata['orgRescateId'] ?? '',
          paymentEventId: onvoEvent.id,
          proveedor: 'onvopay',
          estado: 'completada',
          // GSI3: por usuario
          GSI3PK: `USER#${userId}`,
          GSI3SK: `DONATION#${donationId}`,
          // GSI4: por estado (para monthly-close)
          GSI4PK: 'DONATION_ESTADO#completada',
          GSI4SK: `DONATION#${donationId}`,
          createdAt: now,
        },
      }));

      console.log(`Donation ${donationId} recorded: $${paymentObject.amount / 100} from user ${userId}`);
    }
  } else {
    console.log(`Unhandled OnvoPay event type: ${onvoEvent.type}`);
  }

  return { statusCode: 200, body: 'OK' };
};
