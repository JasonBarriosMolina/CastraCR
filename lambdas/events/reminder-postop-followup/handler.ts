import type { EventBridgeHandler } from 'aws-lambda';
import { QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import twilio from 'twilio';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { getSecrets } from '../../shared/secrets.js';

const MSGS_FOLLOWUP: Record<number, (nombre: string) => string> = {
  1: (n) => `🐾 ¡Buenos días! Han pasado *24 horas* desde la cirugía de *${n}*.\n\n¿Cómo está? Describinos cómo se ve la herida y cómo está comiendo y bebiendo. Podés respondernos por voz o texto 🎤`,
  3: (n) => `🐾 ¡Hola! Ya van *3 días* desde la operación de *${n}*.\n\n¿Cómo sigue? Fijate que la herida esté limpia y seca, sin mal olor ni secreción. Contanos cómo está 🎤`,
  7: (n) => `🐾 ¡Una semana de recuperación de *${n}*! 🎉\n\nEsta semana suelen quitarse los puntos. ¿Cómo está la herida? ¿Ya visitaste al vet para el control? Contanos 🎤`,
  15: (n) => `🐾 ¡15 días desde la cirugía de *${n}*! La recuperación casi siempre está completa.\n\n¿Cómo está? Si todo va bien, esto es nuestro último chequeo. ¡Gracias por cuidar a tu mascota! 🐾 Contanos cómo está 🎤`,
};

async function sendWhatsApp(
  to: string,
  message: string,
  secrets: Record<string, string>,
): Promise<void> {
  const client = twilio(secrets['TWILIO_ACCOUNT_SID'], secrets['TWILIO_AUTH_TOKEN']);
  await client.messages.create({
    from: `whatsapp:${secrets['TWILIO_WHATSAPP_NUMBER']}`,
    to,
    body: message,
  });
}

/**
 * Corre cada 30 minutos via EventBridge.
 * Consulta POSTOP_DUE#hoy via GSI_POSTOP y envía los follow-ups programados.
 * Luego abre el modo post-op en la conversación del usuario para que el bot
 * pueda recibir y clasificar la respuesta.
 */
export const handler: EventBridgeHandler<'Scheduled Event', unknown, void> = async () => {
  const secrets = await getSecrets();
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

  // Consultar todos los follow-ups de hoy via GSI_POSTOP
  const dueResult = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI_POSTOP',
    KeyConditionExpression: 'POSTOP_DUE_DATE = :today',
    ExpressionAttributeValues: { ':today': today },
  }));

  const items = dueResult.Items ?? [];
  console.log(`[postop-followup] Items de hoy: ${items.length}`);

  for (const item of items) {
    const regId = item['regId'] as string;
    const dia = item['dia'] as 1 | 3 | 7 | 15;
    const telefono = item['telefono'] as string;
    const petNombre = item['petNombre'] as string;
    const petId = item['petId'] as string;
    const petEspecie = item['petEspecie'] as string;
    const campaignId = item['campaignId'] as string;

    // Idempotencia
    const idempKey = { PK: `REMINDER#${regId}`, SK: `POSTOP_D${dia}` };
    const existing = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: idempKey }));
    if (existing.Item) {
      console.log(`[postop-followup] Ya enviado: regId=${regId} D${dia}`);
      continue;
    }

    // Enviar WhatsApp
    const msgFn = MSGS_FOLLOWUP[dia];
    if (!msgFn) continue;

    try {
      await sendWhatsApp(telefono, msgFn(petNombre), secrets);
    } catch (err) {
      console.error(`[postop-followup] Error WA regId=${regId} D${dia}:`, err);
      continue;
    }

    // Marcar idempotencia
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 86400 * 30;
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...idempKey, regId, dia, enviadoEn: now, ttl },
      ConditionExpression: 'attribute_not_exists(PK)',
    })).catch(() => { /* race condition, ignorar */ });

    // Abrir modo post-op en la conversación del usuario
    // Esto hace que cuando el dueño responda, el bot clasifique la respuesta con Haiku
    const ttlConversacion = Math.floor(Date.now() / 1000) + 86400 * 16;
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `CONVERSATION#${telefono}`,
        SK: 'WA_STATE',
        telefono,
        modo: 'postop',
        estado: 'postop_seguimiento',
        datos: {},
        regId,
        petId,
        petNombre,
        petEspecie,
        campaignId,
        postopDia: dia,
        ttl: ttlConversacion,
      },
    }));

    // Actualizar expediente — marcamos que este día fue contactado
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
      UpdateExpression: 'SET #d = :enviado, actualizadoEn = :now',
      ExpressionAttributeNames: { '#d': `followupD${dia}EnviadoEn` },
      ExpressionAttributeValues: { ':enviado': now, ':now': now },
    })).catch(() => { /* expediente puede no existir */ });

    console.log(`[postop-followup] ✓ regId=${regId} D${dia} → ${telefono}`);
  }
};
