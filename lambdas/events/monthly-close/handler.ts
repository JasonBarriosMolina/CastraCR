import type { EventBridgeHandler } from 'aws-lambda';
import { QueryCommand, UpdateCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';

/**
 * Monthly close Lambda — runs last day of month at 11pm UTC.
 * 1. Calculate votes for each rescue org
 * 2. Query actual donation pool for the month from DynamoDB (GSI4)
 * 3. Record distribution amounts — admin makes SINPE transfers manually
 * 4. Reset vote counts for next month
 *
 * NOTE: Sin Stripe Connect. El admin hace las transferencias via SINPE/IBAN
 * basándose en los registros DIST#{mes}/ORG#{id} creados aquí.
 */
export const handler: EventBridgeHandler<'Scheduled Event', unknown, void> = async () => {
  const mes = new Date().toISOString().slice(0, 7); // e.g. "2026-03"

  // 1. Obtener votos del mes
  const votesResult = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `VOTE#${mes}`,
      ':sk': 'ORG#',
    },
  }));

  const votes = votesResult.Items ?? [];
  const totalVotes = votes.reduce((sum, v) => sum + ((v['cantidadVotos'] as number) ?? 0), 0);

  if (totalVotes === 0) {
    console.log('No votes this month, skipping distribution');
    return;
  }

  // 2. Sumar donaciones completadas del mes
  let poolCents = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const donationsPage = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI4-estado',
      KeyConditionExpression: 'GSI4PK = :pk',
      FilterExpression: 'begins_with(createdAt, :mes)',
      ExpressionAttributeValues: {
        ':pk': 'DONATION_ESTADO#completada',
        ':mes': mes,
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const donation of donationsPage.Items ?? []) {
      poolCents += (donation['monto'] as number) ?? 0;
    }
    lastEvaluatedKey = donationsPage.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  console.log(`Pool ${mes}: ${poolCents} cents ($${(poolCents / 100).toFixed(2)})`);

  if (poolCents < 100) {
    console.log('Donation pool below $1, skipping distribution');
    return;
  }

  // 3. Calcular distribución proporcional y guardar en DDB para pago manual
  for (const vote of votes) {
    const orgId = ((vote['SK'] as string) ?? '').replace('ORG#', '');
    const orgVotes = (vote['cantidadVotos'] as number) ?? 0;
    const proportion = orgVotes / totalVotes;
    const amountCents = Math.floor(poolCents * proportion);

    if (amountCents < 100) continue; // Skip < $1

    // Obtener datos bancarios de la org para el reporte
    const orgResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ORG#${orgId}`, SK: 'PROFILE' },
      ProjectionExpression: 'nombre, sinpeMovil, iban, nombreBanco',
    }));

    const org = orgResult.Item;
    const sinpeMovil  = (org?.['sinpeMovil']  as string | undefined) ?? null;
    const iban        = (org?.['iban']        as string | undefined) ?? null;
    const nombreBanco = (org?.['nombreBanco'] as string | undefined) ?? null;
    const orgNombre   = (org?.['nombre']      as string | undefined) ?? orgId;

    // Audit record: estado 'pendiente' → admin marca como 'pagado' al hacer la transferencia
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `DIST#${mes}`,
        SK: `ORG#${orgId}`,
        mes,
        orgId,
        orgNombre,
        amountCents,
        amountUSD: (amountCents / 100).toFixed(2),
        poolCents,
        proportion: proportion.toFixed(4),
        porcentaje: `${(proportion * 100).toFixed(1)}%`,
        votos: orgVotes,
        // Datos bancarios snapshot (para historial aunque cambien después)
        sinpeMovil,
        iban,
        nombreBanco,
        estado: 'pendiente', // → 'pagado' cuando admin transfiere
        createdAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 365 * 86400, // 1 año
      },
    }));

    console.log(`[DIST] ${orgNombre}: $${(amountCents / 100).toFixed(2)} (${(proportion * 100).toFixed(1)}%) - SINPE: ${sinpeMovil ?? 'N/A'} - IBAN: ${iban ?? 'N/A'}`);
  }

  // 4. Expirar votos del mes (TTL 24h para que se borren solos)
  for (const vote of votes) {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: vote['PK'], SK: vote['SK'] },
      UpdateExpression: 'SET #ttl = :ttl',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':ttl': Math.floor(Date.now() / 1000) + 86400 },
    }));
  }

  console.log(`Monthly close ${mes} completed. Pending SINPE transfers recorded in DIST#${mes}/*`);
};
