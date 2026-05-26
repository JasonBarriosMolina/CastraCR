/**
 * POST /appointments/{id}/pay-intent
 * Crea un payment intent en OnvoPay para pagar una cita de castración.
 * Público — no requiere JWT (el dueño llega desde WhatsApp sin cuenta).
 * El appointmentId es UUID v4 (inaccesible sin el link del bot).
 *
 * Returns: { paymentToken, paymentIntentId, montoCRC, mascotas[] }
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getSecrets } from '../../shared/secrets.js';
import { NotFoundError } from '@castrar-cr/utils';

const ONVOPAY_API = 'https://api.onvopay.com/v1';

const e = (statusCode: number, error: string, code?: string) => ({
  statusCode,
  body: JSON.stringify({ error, ...(code ? { code } : {}) }),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const regId = event.pathParameters?.id;
    if (!regId) return e(400, 'Falta appointment id');

    // 1. Cargar la reservación
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) throw new NotFoundError('Reservación');
    const reg = regRes.Item;

    // 2. Validar estado — solo pendiente_pago puede iniciar pago
    if (reg['estado'] === 'confirmada') {
      return e(409, 'Esta cita ya está pagada y confirmada.', 'ALREADY_PAID');
    }
    if (reg['estado'] === 'expirada') {
      return e(410, 'Este link de pago venció. Contactá a la organización.', 'EXPIRED');
    }
    if (reg['estado'] !== 'pendiente_pago') {
      return e(409, `Estado inválido para pago: ${reg['estado'] as string}`, 'INVALID_STATUS');
    }

    const montoCRC = (reg['montoCRC'] as number | undefined) ?? 0;
    if (montoCRC <= 0) {
      return e(400, 'Esta campaña es gratuita, no requiere pago.', 'FREE_CAMPAIGN');
    }

    // 3. Cargar campaña para el título
    const campRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${reg['campaignId'] as string}`, SK: 'METADATA' },
    }));
    const campTitulo = (campRes.Item?.['titulo'] as string | undefined) ?? 'Campaña de esterilización';

    // 4. Mascotas para mostrar en el resumen
    type PetSummary = { nombre?: string; especie?: string };
    const pets: PetSummary[] = (reg['pets'] as PetSummary[] | undefined) ?? [];

    // 5. Crear payment intent en OnvoPay en CRC
    const secrets = await getSecrets();
    const apiKey = secrets['ONVOPAY_SECRET_KEY'] ?? '';

    const response = await fetch(`${ONVOPAY_API}/payment-intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        amount: montoCRC,
        currency: 'CRC',
        description: `Cita de esterilización — ${campTitulo}`,
        metadata: {
          tipo: 'cita',
          regId,
          campaignId: reg['campaignId'] as string,
          orgRescateId: reg['orgRescateId'] as string ?? '',
          mascotas: pets.map((p) => p.nombre ?? '').join(', '),
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OnvoPay pay-intent error:', errText);
      return e(502, 'Error al crear el pago. Intentá de nuevo.', 'PAYMENT_PROVIDER_ERROR');
    }

    const data = await response.json() as { id: string; token: string; clientSecret?: string };

    return ok({
      paymentToken: data.token ?? data.clientSecret ?? data.id,
      paymentIntentId: data.id,
      montoCRC,
      mascotas: pets.map((p) => ({ nombre: p.nombre, especie: p.especie })),
      campTitulo,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
