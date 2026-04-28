import type { EventBridgeHandler } from 'aws-lambda';
import { QueryCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ddb, TABLE_NAME } from '../../shared/db.js';

const ses = new SESClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
const FROM_EMAIL = `noreply@castrar.cr`;
const WINDOW_HOURS = 2;

/**
 * Runs every 15 minutes via EventBridge.
 * Sends 2h-before reminders to confirmed registrations.
 */
export const handler: EventBridgeHandler<'Scheduled Event', unknown, void> = async () => {
  const now = new Date();
  const windowStart = new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(windowStart.getTime() + 15 * 60 * 1000); // 15 min window

  // Query active campaigns starting in ~2h
  const campaignsResult = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI4-estado',
    KeyConditionExpression: 'GSI4PK = :pk',
    FilterExpression: 'fechaInicio BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': 'ESTADO#activa',
      ':start': windowStart.toISOString(),
      ':end': windowEnd.toISOString(),
    },
  }));

  const campaigns = campaignsResult.Items ?? [];
  console.log(`Found ${campaigns.length} campaigns starting in ~${WINDOW_HOURS}h`);

  for (const campaign of campaigns) {
    const campaignId = campaign['campaignId'] as string;

    const regsResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'campaignId = :cid AND estado = :confirmada',
      KeyConditionExpression: 'GSI4PK = :dummy',
      ExpressionAttributeValues: {
        ':dummy': `CAMPAIGN_REGS#${campaignId}`,
        ':cid': campaignId,
        ':confirmada': 'confirmada',
      },
    })).catch(() => ({ Items: [] }));

    const registrations = regsResult.Items ?? [];

    for (const reg of registrations) {
      const regId = reg['regId'] as string;
      const userId = reg['userId'] as string;

      // Idempotency
      const reminderKey = `REMINDER#${regId}`;
      const existingReminder = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: reminderKey, SK: '2H' },
      }));
      if (existingReminder.Item) continue;

      const userResult = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      }));
      const user = userResult.Item;
      if (!user?.['email']) continue;

      const campaignTitle = campaign['titulo'] as string;
      const slots = (campaign['slots'] as Array<{ slotId: string; hora: string }>) ?? [];
      const regSlot = slots.find((s) => s.slotId === reg['slotId']);
      const hora = regSlot?.hora ?? '';

      try {
        await ses.send(new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [user['email'] as string] },
          Message: {
            Subject: { Data: `⏰ Tu cita es en 2 horas — ${campaignTitle}` },
            Body: {
              Html: {
                Data: `
                  <h2>¡Tu cita es en 2 horas!</h2>
                  <p>Hola ${user['nombre'] as string},</p>
                  <p>Tu turno en <strong>${campaignTitle}</strong> es a las <strong>${hora}</strong>.</p>
                  <p>No olvides traer tu código QR para el check-in.</p>
                  <p>— Equipo CastraCR</p>
                `,
              },
            },
          },
        }));

        await ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: reminderKey,
            SK: '2H',
            regId,
            sentAt: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + 7 * 86400,
          },
        }));

        console.log(`Sent 2h reminder to ${user['email'] as string} for regId ${regId}`);
      } catch (err) {
        console.error(`Failed to send 2h reminder for regId ${regId}:`, err);
      }
    }
  }
};
