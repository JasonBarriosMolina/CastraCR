/**
 * GET /pets/history?owner_id={phone}&pet_name={name}
 * Verifica historial de esterilización de una mascota.
 * Retorna si la mascota ya fue operada, cuándo y en qué campaña.
 * Público — el bot externo lo usa para prevenir doble registro.
 *
 * owner_id: teléfono del dueño (identificador en el sistema del bot)
 * pet_name: nombre de la mascota (búsqueda case-insensitive)
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
    const ownerId = event.queryStringParameters?.owner_id;
    const petName = event.queryStringParameters?.pet_name;

    if (!ownerId) return e(400, 'Falta parámetro owner_id');

    const normalizedPhone = ownerId.replace(/\D/g, '');
    const normalizedPetName = petName?.toLowerCase().trim();

    // Query registrations by phone
    const regsRes = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI3-userId',
      KeyConditionExpression: 'GSI3PK = :pk AND begins_with(GSI3SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `PHONE#${normalizedPhone}`,
        ':prefix': 'REG#',
      },
    }));

    const allRegs = regsRes.Items ?? [];

    // Filter by pet name if provided, look for completed surgeries
    const surgeryHistory: Array<{
      appointment_id: string;
      pet_id: string;
      pet_name: string;
      campaign_id: string;
      surgery_status: string;
      created_at: string;
    }> = [];

    for (const reg of allRegs) {
      const pets = reg['pets'] as Array<Record<string, unknown>> | undefined;
      if (!pets) continue;

      for (const pet of pets) {
        const name = (pet['nombre'] as string | undefined) ?? '';
        const nameMatch = !normalizedPetName || name.toLowerCase().includes(normalizedPetName);
        const surgeryStatus = pet['estadoCirugia'] as string | undefined;

        if (nameMatch) {
          surgeryHistory.push({
            appointment_id: reg['regId'] as string,
            pet_id: pet['petId'] as string,
            pet_name: name,
            campaign_id: reg['campaignId'] as string,
            surgery_status: surgeryStatus ?? reg['estado'] as string ?? 'desconocido',
            created_at: reg['createdAt'] as string,
          });
        }
      }
    }

    // Sort: most recent first
    surgeryHistory.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const sterilized = surgeryHistory.some(
      (h) => h.surgery_status === 'completada' || h.surgery_status === 'operada',
    );

    return ok({
      owner_id: normalizedPhone,
      pet_name: petName ?? 'all',
      sterilized,
      history: surgeryHistory,
      total: surgeryHistory.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
