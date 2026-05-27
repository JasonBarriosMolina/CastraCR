/**
 * GET /campaigns/{id}/slots?species=dog|cat
 * Retorna slots disponibles de una campaña, opcionalmente filtrado por especie.
 * Público — el bot externo lo llama sin JWT.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { NotFoundError } from '@castrar-cr/utils';

const e = (statusCode: number, error: string) => ({
  statusCode,
  body: JSON.stringify({ error }),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const campaignId = event.pathParameters?.id;
    if (!campaignId) return e(400, 'Falta campaignId');

    const species = event.queryStringParameters?.species; // 'dog' | 'cat' | undefined

    // 1. Get campaign metadata (to validate it exists + get tiposAnimales)
    const campaignRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
    }));
    if (!campaignRes.Item) throw new NotFoundError('Campaña');

    const campaign = campaignRes.Item;
    if (campaign['estado'] !== 'activa' && campaign['estado'] !== 'publicada') {
      return e(400, 'La campaña no está disponible');
    }

    // 2. Query all SLOT#...#AVAIL items for this campaign
    const slotsRes = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `CAMPAIGN#${campaignId}`,
        ':prefix': 'SLOT#',
      },
    }));

    const allSlots = (slotsRes.Items ?? []).filter((item) =>
      (item['SK'] as string).endsWith('#AVAIL'),
    );

    // 3. Filter by species if requested
    // tiposAnimales: [{ especie: 'perro'|'gato', pesoMin, pesoMax, cuposDisponibles }]
    const tiposAnimales: Array<{
      especie: string;
      pesoMin?: number;
      pesoMax?: number;
    }> = campaign['tiposAnimales'] ?? [];

    const speciesMap: Record<string, string> = { dog: 'perro', cat: 'gato' };
    const targetEspecie = species ? speciesMap[species] : undefined;

    const tiposAccepted = targetEspecie
      ? tiposAnimales.filter((t) => t.especie === targetEspecie)
      : tiposAnimales;

    // 4. Shape response
    const slots = allSlots
      .map((slot) => {
        const { PK, SK, ...rest } = slot;
        return rest;
      })
      .filter((slot) => {
        if (!targetEspecie) return true;
        // A slot is valid for species if campaign accepts that species
        return tiposAccepted.length > 0;
      });

    return ok({
      campaignId,
      species: targetEspecie ?? 'all',
      tiposAnimales: tiposAccepted,
      slots,
      total: slots.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
