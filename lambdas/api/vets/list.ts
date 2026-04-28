import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';

/**
 * Lists approved veterinarians. Public endpoint.
 * NOTE: This performs a scan via FilterExpression — for production scale
 * add a GSI on estado if the vet count grows large.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const { estado = 'aprobado' } = event.queryStringParameters ?? {};

    // Since VETs don't have a dedicated GSI by estado, we use begins_with on PK
    // and filter. Acceptable for the current data volumes.
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI4-estado',
      KeyConditionExpression: 'GSI4PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `VET_ESTADO#${estado}`,
      },
    }));

    // Fallback: if GSI4 not populated for vets, return empty
    const vets = (result.Items ?? []).map(({ PK, SK, GSI4PK, GSI4SK, ...vet }) => vet);
    return ok({ vets });
  } catch (error) {
    return errorResponse(error);
  }
};
