import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { NotFoundError } from '@castrar-cr/utils';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const campaignId = event.pathParameters?.['id'];
    if (!campaignId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'id es requerido', code: 'INVALID_PARAMS' }) };
    }

    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
    }));

    if (!result.Item) throw new NotFoundError('Campaña');

    // Strip internal DDB keys
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI4PK, GSI4SK, ...campaignRaw } = result.Item;
    // Garantizar que los arrays nunca sean undefined (compatibilidad con ítems viejos en DDB)
    const campaign = {
      ...campaignRaw,
      venues: (campaignRaw['venues'] as unknown[]) ?? [],
      slots:  (campaignRaw['slots']  as unknown[]) ?? [],
      vets:   (campaignRaw['vets']   as unknown[]) ?? [],
    };
    return ok({ campaign });
  } catch (error) {
    return errorResponse(error);
  }
};
