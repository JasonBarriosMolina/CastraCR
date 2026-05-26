import type { EventBridgeHandler } from 'aws-lambda';
import { QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import twilio from 'twilio';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { getSecrets } from '../../shared/secrets.js';

const WINDOW_MINUTES = 15;

const MSG_NOCHE = (mascota: string, orgTel?: string) =>
  `🐾 *Buenas noches!* ${mascota} ya salió de su cirugía de castración. Esta noche es muy importante:

• Mantené a ${mascota} en un lugar cálido y tranquilo
• No la dejés sola las primeras horas
• Asegurate de que no se lama la herida (dejá el cono puesto)
• Si ves sangrado activo, llevala al vet de inmediato${orgTel ? `\n• Emergencias: ${orgTel}` : ''}

Mañana te escribimos para saber cómo está. ¡Gracias por cuidarla! 🐾`;

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
 * Corre cada 15 minutos via EventBridge.
 * Detecta campañas que acaban de finalizar y:
 * 1. Envía WhatsApp de instrucciones para la noche
 * 2. Agenda los follow-ups de días 1, 3, 7, 15
 */
export const handler: EventBridgeHandler<'Scheduled Event', unknown, void> = async () => {
  const secrets = await getSecrets();
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);

  // Buscar campañas finalizadas en los últimos 15 min (fechaFin en la ventana)
  const campaignsResult = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI4-estado',
    KeyConditionExpression: 'GSI4PK = :pk',
    FilterExpression: 'fechaFin BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': 'ESTADO#finalizada',
      ':start': windowStart.toISOString(),
      ':end': now.toISOString(),
    },
  }));

  const campaigns = campaignsResult.Items ?? [];
  console.log(`[postop-init] Campañas finalizadas en ventana: ${campaigns.length}`);

  for (const campaign of campaigns) {
    const campaignId = campaign['campaignId'] as string;
    const orgTel = campaign['orgTelWhatsApp'] as string | undefined;

    // Obtener registros completados de esta campaña
    // Nota: para producción agregar GSI campaignId → regs
    const regsResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI4-estado',
      KeyConditionExpression: 'GSI4PK = :pk',
      FilterExpression: 'campaignId = :cid AND checkedIn = :true',
      ExpressionAttributeValues: {
        ':pk': 'ESTADO#completada',
        ':cid': campaignId,
        ':true': true,
      },
    })).catch(() => ({ Items: [] }));

    const registros = regsResult.Items ?? [];
    console.log(`[postop-init] campaignId=${campaignId}: ${registros.length} registros completados`);

    for (const reg of registros) {
      const regId = reg['regId'] as string;
      const userId = reg['userId'] as string;

      // Idempotencia: solo enviar una vez por registro
      const idempKey = { PK: `REMINDER#${regId}`, SK: 'POSTOP_INIT' };
      const existing = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: idempKey }));
      if (existing.Item) continue;

      // Obtener teléfono WhatsApp del usuario
      const userResult = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      }));
      const telefonoWA = userResult.Item?.['telefonoWhatsApp'] as string | undefined;
      if (!telefonoWA) {
        console.warn(`[postop-init] Usuario ${userId} sin telefonoWhatsApp`);
        continue;
      }

      // Nombre de la primera mascota del registro
      const pets = (reg['petSummaries'] as Array<{ nombre: string }>) ?? [];
      const mascotaNombre = pets[0]?.nombre ?? 'tu mascota';

      // 1. Enviar mensaje de la noche
      try {
        await sendWhatsApp(telefonoWA, MSG_NOCHE(mascotaNombre, orgTel), secrets);
      } catch (err) {
        console.error(`[postop-init] Error enviando WA a ${telefonoWA}:`, err);
        continue;
      }

      // 2. Marcar idempotencia
      const ttl = Math.floor(Date.now() / 1000) + 86400 * 30;
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...idempKey, regId, ttl, enviadoEn: now.toISOString() },
        ConditionExpression: 'attribute_not_exists(PK)',
      }));

      // 3. Agendar follow-ups días 1, 3, 7, 15
      const diasFollowUp: (1 | 3 | 7 | 15)[] = [1, 3, 7, 15];
      for (const dia of diasFollowUp) {
        const fechaDue = new Date(now.getTime() + dia * 86400 * 1000);
        const dateBucket = fechaDue.toISOString().slice(0, 10); // yyyy-mm-dd

        await ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `POSTOP_DUE#${dateBucket}`,
            SK: `${regId}#D${dia}`,
            POSTOP_DUE_DATE: dateBucket, // atributo para GSI_POSTOP
            regId,
            dia,
            telefono: telefonoWA,
            petNombre: mascotaNombre,
            petId: (reg['petSummaries'] as Array<{ petId: string }>)[0]?.petId ?? '',
            petEspecie: (reg['petSummaries'] as Array<{ especie?: string }>)[0]?.especie ?? '',
            campaignId,
            userId,
            ttl,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        })).catch(() => { /* ya existe, ignorar */ });
      }

      // 4. Actualizar expediente con timestamp de primera noche
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `REG#${regId}`, SK: 'EXPEDIENTE' },
        UpdateExpression: 'SET postopIniciadoEn = :now, actualizadoEn = :now',
        ExpressionAttributeValues: { ':now': now.toISOString() },
      })).catch(() => { /* expediente puede no existir aún */ });

      console.log(`[postop-init] ✓ regId=${regId}, mascota=${mascotaNombre}`);
    }
  }
};
