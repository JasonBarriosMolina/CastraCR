/**
 * EventBridge — rate(5 minutes)
 * Libera cupos de citas en estado pendiente_pago cuyo TTL de pago venció.
 * El TTL se setea 20 minutos después de crear el appointment.
 */
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';

export const handler = async (): Promise<void> => {
  const now = Math.floor(Date.now() / 1000); // Unix epoch

  // Buscar registros pendiente_pago con paymentTtl vencido
  // GSI4PK = 'REG' + estado para filtrar eficientemente
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression:
      'SK = :sk AND estado = :estado AND paymentTtl < :now',
    ExpressionAttributeValues: {
      ':sk': 'METADATA',
      ':estado': 'pendiente_pago',
      ':now': now,
    },
    ProjectionExpression: 'PK, regId, campaignId, pets',
  }));

  const items = result.Items ?? [];
  console.log(`release-pending-payments: encontrados ${items.length} appointment(s) vencidos`);

  const nowIso = new Date().toISOString();

  for (const item of items) {
    const regId = item['regId'] as string;
    const pk = item['PK'] as string;

    try {
      // Marcar como expirada — idempotente con ConditionExpression
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: 'METADATA' },
        UpdateExpression: 'SET estado = :exp, updatedAt = :now',
        ConditionExpression: 'estado = :pend',
        ExpressionAttributeValues: {
          ':exp': 'expirada',
          ':pend': 'pendiente_pago',
          ':now': nowIso,
        },
      }));

      // Liberar cupos — incrementar cuposDisponibles en cada slot de los pets
      type PetSummary = { slotId?: string; venueId?: string };
      const pets: PetSummary[] = (item['pets'] as PetSummary[] | undefined) ?? [];
      const slotIds = [...new Set(pets.map((p) => p.slotId).filter(Boolean))] as string[];
      const campaignId = item['campaignId'] as string;

      for (const slotId of slotIds) {
        await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `CAMPAIGN#${campaignId}`, SK: `SLOT#${slotId}#AVAIL` },
          UpdateExpression: 'ADD cuposDisponibles :one',
          ExpressionAttributeValues: { ':one': 1 },
        }));
      }

      console.log(`release-pending-payments: appointment ${regId} expirado, ${slotIds.length} slot(s) liberados`);
    } catch (err: unknown) {
      // ConditionalCheckFailedException = otro proceso ya lo marcó, OK
      const errName = (err as { name?: string }).name;
      if (errName !== 'ConditionalCheckFailedException') {
        console.error(`release-pending-payments: error procesando ${regId}:`, err);
      }
    }
  }
};
