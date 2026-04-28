import type { EventBridgeHandler } from 'aws-lambda';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';

const PENDING_TIMEOUT_MINUTES = 30;

/**
 * Runs every 15 minutes via EventBridge.
 * Releases slots held by registrations stuck in 'lista_espera' that were
 * never confirmed after a long time, cleaning up stale state.
 *
 * Also handles any registrations in a transitional state older than the timeout.
 */
export const handler: EventBridgeHandler<'Scheduled Event', unknown, void> = async () => {
  const cutoff = new Date(Date.now() - PENDING_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  // Find waitlist registrations older than the timeout that have never been promoted
  // We query via GSI4 for lista_espera status
  const staleResult = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI4-estado',
    KeyConditionExpression: 'GSI4PK = :pk',
    FilterExpression: 'createdAt < :cutoff',
    ExpressionAttributeValues: {
      ':pk': 'ESTADO#lista_espera',
      ':cutoff': cutoff,
    },
    Limit: 100,
  })).catch(() => ({ Items: [] }));

  const staleItems = staleResult.Items ?? [];
  console.log(`Found ${staleItems.length} stale waitlist registrations older than ${PENDING_TIMEOUT_MINUTES}min`);

  // NOTE: For waitlist items, we don't cancel them — they stay valid.
  // release-slots is more relevant for a "reservation hold" flow where
  // users initiate payment but don't complete it. Since we use Stripe's
  // PaymentIntent flow (no pre-hold on slots), this Lambda mainly:
  // 1. Logs stale waitlist state for monitoring
  // 2. Can clean up orphaned slot availability items if any

  for (const item of staleItems) {
    const campaignId = item['campaignId'] as string | undefined;
    const slotId = item['slotId'] as string | undefined;
    const regId = item['regId'] as string | undefined;

    if (!campaignId || !slotId || !regId) continue;

    // Verify slot availability is consistent
    const slotAvailResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `CAMPAIGN#${campaignId}`,
        ':sk': `SLOT#${slotId}#AVAIL`,
      },
    })).catch(() => ({ Items: [] }));

    const slotAvail = slotAvailResult.Items?.[0];
    if (slotAvail && (slotAvail['cuposDisponibles'] as number) < 0) {
      // Correct negative availability (shouldn't happen but defensive)
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${campaignId}`, SK: `SLOT#${slotId}#AVAIL` },
        UpdateExpression: 'SET cuposDisponibles = :zero',
        ConditionExpression: 'cuposDisponibles < :zero',
        ExpressionAttributeValues: { ':zero': 0 },
      })).catch(() => { /* ignore */ });
    }

    console.log(`Processed stale waitlist regId ${regId} for campaign ${campaignId}`);
  }

  console.log('release-slots completed');
};
