/**
 * POST /donations
 * Crea un payment intent en OnvoPay para una donación voluntaria en CRC.
 * El 100% del monto va a la organización rescatista — la plataforma no retiene nada.
 *
 * Seguridad:
 *  - Rate limit doble: 3 req/min por IP + 5 req/hora por userId
 *  - Monto validado contra donacionMaxima de la org en DDB
 *  - Verificación de que la org existe y acepta donaciones
 *
 * Body: { montoCRC, orgRescateId, campaignId?, cubrimientoFee? }
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { getSecrets } from '../../shared/secrets.js';
import { getClientIp, checkRateLimit, rateLimitResponse } from '../../shared/rate-limit.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { NotFoundError } from '@castrar-cr/utils';
import type { CreateDonationInput } from '@castrar-cr/types';

const ONVOPAY_API = 'https://api.onvopay.com/v1';
const MONTO_MINIMO_CRC = 500;
const MONTO_MAXIMO_DEFAULT_CRC = 100_000;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  // ── Rate limit por IP (capa 1) ────────────────────────────────────────────
  const ip = getClientIp(event as unknown as Parameters<typeof getClientIp>[0]);
  const ipLimited = await checkRateLimit(ip, 'donation-ip', 3, 60); // 3 req/min por IP
  if (ipLimited) return rateLimitResponse(60);

  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Dueno', 'Organizador', 'SuperAdmin');

    // ── Rate limit por userId (capa 2) ──────────────────────────────────────
    // Previene que un usuario cree múltiples intents activos en paralelo
    const userLimited = await checkRateLimit(authCtx.userId, 'donation-user', 5, 3600); // 5/hora
    if (userLimited) return rateLimitResponse(3600);

    const body = JSON.parse(event.body ?? '{}') as CreateDonationInput;
    const { montoCRC, orgRescateId, campaignId, cubrimientoFee } = body;

    if (!montoCRC || !orgRescateId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'montoCRC y orgRescateId son requeridos', code: 'INVALID_BODY' }),
      };
    }

    if (!Number.isInteger(montoCRC) || montoCRC < MONTO_MINIMO_CRC) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `El monto mínimo es ₡${MONTO_MINIMO_CRC.toLocaleString()}`, code: 'INVALID_AMOUNT' }),
      };
    }

    // Validar org, que acepte donaciones y respetar su límite
    const orgRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ORG_RESCATE#${orgRescateId}`, SK: 'PROFILE' },
    }));
    if (!orgRes.Item) throw new NotFoundError('Organización rescatista');

    // Si la org tiene aceptaDonaciones = false explícitamente, rechazar
    const aceptaDonaciones = orgRes.Item['aceptaDonaciones'];
    if (aceptaDonaciones === false) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Esta organización no acepta donaciones en este momento.',
          code: 'ORG_NOT_ACCEPTING_DONATIONS',
        }),
      };
    }

    const donacionMaxima = (orgRes.Item['donacionMaximaCRC'] as number | undefined) ?? MONTO_MAXIMO_DEFAULT_CRC;
    if (montoCRC > donacionMaxima) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `El monto máximo de donación para esta organización es ₡${donacionMaxima.toLocaleString()}`,
          code: 'AMOUNT_EXCEEDS_LIMIT',
          maxCRC: donacionMaxima,
        }),
      };
    }

    // Si el donante cubre el fee, ajustar monto para que la org reciba el monto exacto
    // Fee OnvoPay ≈ 3.9% + ₡215 fijos. Calculamos el gross necesario:
    //   gross = (montoCRC + 215) / (1 - 0.039)
    const montoFinal = cubrimientoFee
      ? Math.ceil((montoCRC + 215) / (1 - 0.039))
      : montoCRC;

    const secrets = await getSecrets();
    const apiKey = secrets['ONVOPAY_SECRET_KEY'] ?? '';

    const orgNombre = orgRes.Item['nombre'] as string ?? 'Organización rescatista';

    const response = await fetch(`${ONVOPAY_API}/payment-intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        amount: montoFinal,
        currency: 'CRC',
        description: `Donación a ${orgNombre}`,
        metadata: {
          tipo: 'donacion',
          userId: authCtx.userId,
          orgRescateId,
          campaignId: campaignId ?? '',
          cubrimientoFee: cubrimientoFee ? 'true' : 'false',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OnvoPay donation intent error:', errText);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Error al crear el pago', code: 'PAYMENT_PROVIDER_ERROR' }),
      };
    }

    const data = await response.json() as { id: string; token: string; clientSecret?: string };

    return ok({
      paymentToken: data.token ?? data.clientSecret ?? data.id,
      paymentIntentId: data.id,
      montoCRC: montoFinal,
      montoOriginalCRC: montoCRC,
      cubrimientoFee: cubrimientoFee ?? false,
      orgNombre,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
