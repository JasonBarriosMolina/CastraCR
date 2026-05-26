/**
 * POST /appointments/{id}/pay-intent
 * Crea un payment intent en OnvoPay para pagar una cita de castración.
 * Público — no requiere JWT (el dueño llega desde WhatsApp sin cuenta).
 * El appointmentId es UUID v4 (inaccesible sin el link del bot).
 *
 * Seguridad:
 *  - Rate limit: 5 requests / 60s por IP
 *  - Monto re-validado contra la campaña en DDB (no se confía en el dato del appointment)
 *  - UUID inaccesible sin el link del bot
 *
 * Returns: { paymentToken, paymentIntentId, montoCRC, mascotas[] }
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok } from '../../shared/response.js';
import { getSecrets } from '../../shared/secrets.js';
import { getClientIp, checkRateLimit, rateLimitResponse } from '../../shared/rate-limit.js';
import { NotFoundError } from '@castrar-cr/utils';
import type { TipoAnimal } from '@castrar-cr/types';

const ONVOPAY_API = 'https://api.onvopay.com/v1';

// Límites de rate: 5 intentos por minuto por IP — suficiente para uso legítimo
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_SEC = 60;

const e = (statusCode: number, error: string, code?: string) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error, ...(code ? { code } : {}) }),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // ── Rate limit por IP ─────────────────────────────────────────────────────
  const ip = getClientIp(event);
  const isLimited = await checkRateLimit(ip, 'pay-intent', RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SEC);
  if (isLimited) return rateLimitResponse(RATE_LIMIT_WINDOW_SEC);

  try {
    const regId = event.pathParameters?.id;
    if (!regId) return e(400, 'Falta appointment id');

    // Validar formato UUID básico para evitar DDB queries con keys inválidas
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(regId)) return e(400, 'ID de appointment inválido', 'INVALID_ID');

    // 1. Cargar la reservación
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) return e(404, 'Reservación no encontrada', 'NOT_FOUND');
    const reg = regRes.Item;

    // 2. Validar estado
    if (reg['estado'] === 'confirmada') {
      return e(409, 'Esta cita ya está pagada y confirmada.', 'ALREADY_PAID');
    }
    if (reg['estado'] === 'expirada') {
      return e(410, 'Este link de pago venció. Contactá a la organización.', 'EXPIRED');
    }
    if (reg['estado'] !== 'pendiente_pago') {
      return e(409, `La cita no está disponible para pago.`, 'INVALID_STATUS');
    }

    // 3. Re-validar monto desde la CAMPAÑA (fuente de verdad) — no confiar solo en el appointment
    const campaignId = reg['campaignId'] as string | undefined;
    if (!campaignId) return e(500, 'Error interno', 'MISSING_CAMPAIGN');

    const campRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
    }));
    if (!campRes.Item) return e(404, 'Campaña no encontrada', 'NOT_FOUND');
    const camp = campRes.Item;

    // Calcular precio: por TipoAnimal si existe, sino precioPorMascotaCRC de la campaña
    type PetSummary = { nombre?: string; especie?: string; species?: string };
    const pets: PetSummary[] = (reg['pets'] as PetSummary[] | undefined) ?? [];
    const tiposAnimales: TipoAnimal[] = (camp['tiposAnimales'] as TipoAnimal[] | undefined) ?? [];
    const campPrecioBase = (camp['precioPorMascotaCRC'] as number | undefined) ?? 0;

    let montoCRC = 0;
    for (const pet of pets) {
      const especie = pet.especie ?? pet.species;
      // Buscar el tipo de animal correspondiente para obtener su precio
      const tipo = tiposAnimales.find(
        (t) => t.especie === especie || t.especie === 'otro',
      );
      const precioPet = tipo?.precioCRC ?? campPrecioBase;
      montoCRC += precioPet;
    }

    if (montoCRC <= 0) {
      return e(400, 'Esta campaña es gratuita, no requiere pago.', 'FREE_CAMPAIGN');
    }

    // Validar que el monto guardado en el appointment coincide (detectar tampering)
    const montoGuardado = (reg['montoCRC'] as number | undefined) ?? 0;
    if (montoGuardado > 0 && Math.abs(montoGuardado - montoCRC) > 0) {
      console.warn(`pay-intent: monto en appointment (${montoGuardado}) difiere del calculado (${montoCRC}) para reg ${regId}`);
      // Usar el calculado desde la campaña — es la fuente de verdad
    }

    const campTitulo = (camp['titulo'] as string | undefined) ?? 'Campaña de esterilización';

    // 4. Crear payment intent en OnvoPay
    const secrets = await getSecrets();
    const apiKey = secrets['ONVOPAY_SECRET_KEY'] ?? '';

    if (!apiKey) {
      console.error('pay-intent: ONVOPAY_SECRET_KEY no configurada');
      return e(503, 'Sistema de pagos no disponible temporalmente.', 'PAYMENT_UNAVAILABLE');
    }

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
          campaignId,
          orgRescateId: (reg['orgRescateId'] as string | undefined) ?? '',
          mascotas: pets.map((p) => p.nombre ?? '').join(', '),
          // Incluir IP para auditoría en OnvoPay
          clientIp: ip,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('pay-intent: OnvoPay error:', errText);
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
    console.error('pay-intent: error inesperado:', (error as Error)?.message);
    return e(500, 'Error interno del servidor. Intentá de nuevo en unos minutos.');
  }
};
