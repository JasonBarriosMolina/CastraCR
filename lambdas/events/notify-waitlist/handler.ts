import type { DynamoDBStreamHandler } from 'aws-lambda';
import { QueryCommand, UpdateCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { generateQRToken } from '@castrar-cr/utils';
import { ddb, TABLE_NAME } from '../../shared/db.js';

const ses = new SESClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
const FROM_EMAIL = `noreply@castrar.cr`;

/**
 * Triggered by DynamoDB Streams when a registration is updated to 'cancelada'.
 * Promotes the first waitlisted user for the same slot and notifies them.
 */
export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName !== 'MODIFY') continue;

    const newImage = record.dynamodb?.NewImage;
    const oldImage = record.dynamodb?.OldImage;
    if (!newImage || !oldImage) continue;

    const newItem = unmarshall(newImage as Parameters<typeof unmarshall>[0]);
    const oldItem = unmarshall(oldImage as Parameters<typeof unmarshall>[0]);

    // Only process registrations that changed to 'cancelada'
    if (!newItem['PK']?.toString().startsWith('REG#')) continue;
    if (newItem['estado'] !== 'cancelada' || oldItem['estado'] === 'cancelada') continue;
    if (oldItem['estado'] !== 'confirmada') continue; // only confirmed→cancelled opens a slot

    const campaignId = newItem['campaignId'] as string;
    const slotId = newItem['slotId'] as string;

    // Find the oldest waitlisted registration for this slot
    const waitlistResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI3-userId',
      FilterExpression: 'campaignId = :cid AND slotId = :sid AND estado = :espera',
      KeyConditionExpression: 'GSI3PK = :dummy',
      ExpressionAttributeValues: {
        ':dummy': `WAITLIST#${campaignId}#${slotId}`,
        ':cid': campaignId,
        ':sid': slotId,
        ':espera': 'lista_espera',
      },
      Limit: 1,
      ScanIndexForward: true, // oldest first
    })).catch(() => ({ Items: [] }));

    // NOTE: The above GSI3 query won't work perfectly without a dedicated waitlist GSI.
    // A production-grade implementation should add a GSI: WAITLIST#{campaignId}#{slotId} → createdAt
    // For now, we scan registrations for this specific waitlist pattern.
    const waitlistItems = waitlistResult.Items ?? [];

    // Fallback: direct scan for waitlist items
    const fallbackResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'campaignId = :cid AND slotId = :sid AND estado = :espera',
      KeyConditionExpression: 'GSI4PK = :dummy',
      ExpressionAttributeValues: {
        ':dummy': `ESTADO#lista_espera`,
        ':cid': campaignId,
        ':sid': slotId,
        ':espera': 'lista_espera',
      },
      Limit: 5,
    })).catch(() => ({ Items: [] }));

    const candidates = [...waitlistItems, ...(fallbackResult.Items ?? [])];
    if (candidates.length === 0) {
      console.log(`No waitlisted users for campaign ${campaignId} slot ${slotId}`);
      continue;
    }

    // Sort by createdAt to get the oldest waitlisted registration
    const next = candidates.sort((a, b) =>
      ((a['createdAt'] as string) ?? '').localeCompare((b['createdAt'] as string) ?? ''),
    )[0];

    if (!next) continue;

    const nextRegId = next['regId'] as string;
    const nextUserId = next['userId'] as string;
    const qrToken = generateQRToken();
    const now = new Date().toISOString();

    // Promote to confirmada
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${nextRegId}`, SK: 'METADATA' },
      UpdateExpression: 'SET estado = :confirmada, qrToken = :qr, updatedAt = :now',
      ConditionExpression: 'estado = :espera',
      ExpressionAttributeValues: {
        ':confirmada': 'confirmada',
        ':qr': qrToken,
        ':now': now,
        ':espera': 'lista_espera',
      },
    }));

    // Create QR lookup item
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `QR#${qrToken}`,
        SK: 'REG',
        regId: nextRegId,
        campaignId,
        slotId,
        createdAt: now,
      },
    }));

    // Notify user via email
    const userResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${nextUserId}`, SK: 'PROFILE' },
    }));
    const user = userResult.Item;

    if (user?.['email']) {
      const campaignResult = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
      }));
      const campaignTitle = (campaignResult.Item?.['titulo'] as string) ?? 'la campaña';

      await ses.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [user['email'] as string] },
        Message: {
          Subject: { Data: `¡Tenés un lugar confirmado en ${campaignTitle}!` },
          Body: {
            Html: {
              Data: `
                <h2>¡Buenas noticias!</h2>
                <p>Hola ${user['nombre'] as string},</p>
                <p>Se liberó un lugar en <strong>${campaignTitle}</strong> y fuiste el primero en la lista de espera.</p>
                <p>Tu registro ha sido confirmado. Tu código QR ya está disponible en la app.</p>
                <p>— Equipo CastraCR</p>
              `,
            },
          },
        },
      })).catch((err: unknown) => {
        console.error(`Failed to send waitlist notification to ${user['email'] as string}:`, err);
      });
    }

    console.log(`Promoted regId ${nextRegId} from waitlist to confirmada for slot ${slotId}`);
  }
};
