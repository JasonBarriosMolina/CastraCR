import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getGeohashesForRadius } from '@castrar-cr/utils';
import type { Campaign } from '@castrar-cr/types';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const { lat, lng } = event.queryStringParameters ?? {};
    if (!lat || !lng) {
      return { statusCode: 400, body: JSON.stringify({ error: 'lat y lng son requeridos', code: 'INVALID_PARAMS' }) };
    }

    const geohashes = getGeohashesForRadius(parseFloat(lat), parseFloat(lng));

    const campaigns: Campaign[] = [];
    for (const geohash of geohashes) {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2-geohash',
        KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `GEOHASH#${geohash}`,
          ':sk': 'CAMPAIGN#',
          ':active': 'activa',
        },
        FilterExpression: '#estado = :active',
        ExpressionAttributeNames: { '#estado': 'estado' },
      }));

      // Map DDB items to Campaign type — garantizar arrays nunca undefined
      for (const item of result.Items ?? []) {
        const camp = item as Campaign;
        if (!camp.venues) (camp as Record<string, unknown>)['venues'] = [];
        if (!camp.slots)  (camp as Record<string, unknown>)['slots']  = [];
        if (!camp.vets)   (camp as Record<string, unknown>)['vets']   = [];
        campaigns.push(camp);
      }
    }

    return ok({ campaigns });
  } catch (error) {
    return errorResponse(error);
  }
};
