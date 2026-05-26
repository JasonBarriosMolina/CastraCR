/**
 * GET /owners/lookup?phone={phone}
 * Busca un dueño por teléfono.
 * Retorna datos del dueño + mascotas registradas + historial de cirugías.
 * Público — el bot externo lo llama para identificar usuarios recurrentes.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';

const e = (statusCode: number, error: string) => ({
  statusCode,
  body: JSON.stringify({ error }),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const phone = event.queryStringParameters?.phone;
    if (!phone) return e(400, 'Falta parámetro phone');

    const normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.length < 8) return e(400, 'Teléfono inválido');

    // 1. Query all registrations for this phone (both bot-created and user-created)
    // Bot-created: GSI3PK = PHONE#{phone}
    const botRegsRes = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI3-userId',
      KeyConditionExpression: 'GSI3PK = :pk AND begins_with(GSI3SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `PHONE#${normalizedPhone}`,
        ':prefix': 'REG#',
      },
    }));

    const registrations = (botRegsRes.Items ?? []).map((reg) => {
      const { PK, SK, GSI3PK, GSI3SK, GSI4PK, GSI4SK, ...rest } = reg;
      return rest;
    });

    // 2. Extract owner info from most recent registration
    const sorted = [...registrations].sort((a, b) =>
      new Date(b['createdAt'] as string).getTime() -
      new Date(a['createdAt'] as string).getTime(),
    );

    const latest = sorted[0];

    if (!latest) {
      return ok({ found: false, phone: normalizedPhone, registrations: [], pets: [] });
    }

    // 3. Collect all unique pets across registrations
    const petsMap = new Map<string, Record<string, unknown>>();
    for (const reg of registrations) {
      const pets = reg['pets'] as Array<Record<string, unknown>> | undefined;
      if (pets) {
        for (const pet of pets) {
          const petId = pet['petId'] as string;
          if (!petsMap.has(petId)) {
            petsMap.set(petId, pet);
          }
        }
      }
    }

    return ok({
      found: true,
      phone: normalizedPhone,
      owner: {
        name: latest['ownerNombre'] as string | undefined,
        phone: normalizedPhone,
      },
      registrations_count: registrations.length,
      pets: Array.from(petsMap.values()),
      recent_registrations: sorted.slice(0, 5).map((r) => ({
        appointment_id: r['regId'],
        campaign_id: r['campaignId'],
        status: r['estado'],
        created_at: r['createdAt'],
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
};
