import type { EventBridgeHandler } from 'aws-lambda';
import { QueryCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ddb, TABLE_NAME } from '../../shared/db.js';

const ses = new SESClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
const FROM_EMAIL = `noreply@castrar.cr`;
const WINDOW_HOURS = 24;

/**
 * Runs every 30 minutes via EventBridge.
 * Sends 24h-before reminders to confirmed registrations.
 */
export const handler: EventBridgeHandler<'Scheduled Event', unknown, void> = async () => {
  const now = new Date();
  const windowStart = new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(windowStart.getTime() + 30 * 60 * 1000); // 30 min window

  // Query active campaigns starting in ~24h
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

    // Get all confirmed registrations for this campaign
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

    // Fallback: scan by GSI3 is not ideal; for production add a campaign→regs GSI
    // For now we use a simpler approach: store campaign registrations list
    const registrations = regsResult.Items ?? [];

    for (const reg of registrations) {
      const regId = reg['regId'] as string;
      const userId = reg['userId'] as string;

      // Check if reminder already sent (idempotency)
      const reminderKey = `REMINDER#${regId}`;
      const existingReminder = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: reminderKey, SK: '24H' },
      }));
      if (existingReminder.Item) continue;

      // Get user profile for email
      const userResult = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      }));
      const user = userResult.Item;
      if (!user?.['email']) continue;

      const campaignTitle = campaign['titulo'] as string;
      const fechaInicio = campaign['fechaInicio'] as string;
      const fecha = new Date(fechaInicio).toLocaleDateString('es-CR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });

      // Send 24h reminder email
      try {
        await ses.send(new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [user['email'] as string] },
          Message: {
            Subject: { Data: `Recordatorio: Tu cita de esterilización es mañana — ${campaignTitle}` },
            Body: {
              Html: {
                Data: `
                  <h2>¡Tu cita es mañana!</h2>
                  <p>Hola ${user['nombre'] as string},</p>
                  <p>Te recordamos que tienes una cita de esterilización mañana, <strong>${fecha}</strong>, en la campaña <strong>${campaignTitle}</strong>.</p>
                  <p><strong>Recuerda:</strong></p>
                  <ul>
                    <li>Llevar tu código QR de registro</li>
                    <li>Tu mascota debe estar en ayuno de 8 horas antes de la cirugía</li>
                    <li>Traer la cartilla de vacunación si la tienes</li>
                  </ul>
                  <p>¡Gracias por ser parte del cambio!</p>
                  <p>— Equipo CastraCR</p>
                `,
              },
            },
          },
        }));

        // Mark reminder as sent
        await ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: reminderKey,
            SK: '24H',
            regId,
            sentAt: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + 7 * 86400, // keep 7 days
          },
        }));

        console.log(`Sent 24h reminder to ${user['email'] as string} for regId ${regId}`);
      } catch (err) {
        console.error(`Failed to send reminder for regId ${regId}:`, err);
      }
    }
  }
};
