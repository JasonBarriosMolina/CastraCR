import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import Stripe from 'stripe';
import { randomUUID as uuidv4 } from 'crypto';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { getSecrets } from '../../shared/secrets.js';
import { calculatePlanSplit } from '@castrar-cr/utils';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const secrets = await getSecrets();
  const stripe = new Stripe(secrets['STRIPE_SECRET_KEY'] ?? '');

  const signature = event.headers['stripe-signature'] ?? '';
  let stripeEvent: Stripe.Event;

  try {
    // ALWAYS verify Stripe signature — never trust raw body
    stripeEvent = stripe.webhooks.constructEvent(
      event.body ?? '',
      signature,
      secrets['STRIPE_WEBHOOK_SECRET'] ?? '',
    );
  } catch (err) {
    console.error('Stripe signature verification failed:', err);
    return { statusCode: 400, body: 'Signature verification failed' };
  }

  // Idempotency check — prevent double processing
  const idempotencyKey = `STRIPE_EVENT#${stripeEvent.id}`;
  const existing = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: idempotencyKey, SK: 'PROCESSED' },
  }));

  if (existing.Item) {
    console.log(`Event ${stripeEvent.id} already processed, skipping`);
    return { statusCode: 200, body: 'Already processed' };
  }

  // Mark as processed BEFORE handling — prevents race conditions
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: idempotencyKey,
      SK: 'PROCESSED',
      timestamp: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 30 * 86400, // 30d retention
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  }));

  switch (stripeEvent.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
      const { organizadorId, planId, tipo } = paymentIntent.metadata;

      if (tipo === 'plan' && organizadorId && planId) {
        // Calculate 50/50 split — ALWAYS in backend
        const totalAmount = paymentIntent.amount;
        const { rescueOrgAmountCents } = calculatePlanSplit(totalAmount);

        // Get rescue org Stripe Connect account
        const orgResult = await ddb.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `ORG#${paymentIntent.metadata['orgRescateId']}`, SK: 'PROFILE' },
        }));

        if (orgResult.Item?.['stripeConnectAccountId']) {
          await stripe.transfers.create({
            amount: rescueOrgAmountCents,
            currency: 'usd',
            destination: orgResult.Item['stripeConnectAccountId'] as string,
            transfer_group: paymentIntent.id,
          });
        }

        // Activate plan in DynamoDB
        await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `ORG#${organizadorId}`, SK: 'PROFILE' },
          UpdateExpression: 'SET #plan = :plan, estado = :activa, stripeCustomerId = :customerId, updatedAt = :now',
          ExpressionAttributeNames: { '#plan': 'plan' },
          ExpressionAttributeValues: {
            ':plan': planId,
            ':activa': 'activa',
            ':customerId': paymentIntent.customer ?? '',
            ':now': new Date().toISOString(),
          },
        }));
      }

      if (tipo === 'donacion') {
        // Record voluntary donation
        const donationId = uuidv4();
        const userId = paymentIntent.metadata['userId'] ?? '';
        await ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `DONATION#${donationId}`,
            SK: 'METADATA',
            donationId,
            monto: paymentIntent.amount,
            tipo: 'voluntaria',
            userId,
            campaignId: paymentIntent.metadata['campaignId'],
            orgRescateId: paymentIntent.metadata['orgRescateId'] ?? '',
            stripeEventId: stripeEvent.id,
            estado: 'completada',
            // GSI3: per-user index (enables donations/list endpoint)
            GSI3PK: `USER#${userId}`,
            GSI3SK: `DONATION#${donationId}`,
            // GSI4: per-estado index (enables monthly-close pool aggregation)
            GSI4PK: 'DONATION_ESTADO#completada',
            GSI4SK: `DONATION#${donationId}`,
            createdAt: new Date().toISOString(),
          },
        }));
      }
      break;
    }

    default:
      console.log(`Unhandled Stripe event type: ${stripeEvent.type}`);
  }

  return { statusCode: 200, body: 'OK' };
};
