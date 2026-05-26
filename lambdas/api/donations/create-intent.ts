/**
 * POST /donations
 * Crea un payment intent en OnvoPay para una donación voluntaria en CRC.
 * El 100% del monto va a la organización rescatista — la plataforma no retiene nada.
 *
 * Body: { montoCRC, orgRescateId, campaignId?, cubrimientoFee? }
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { getSecrets } from '../../shared/secrets.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { NotFoundError } from '@castrar-cr/utils';
import type { CreateDonationInput } from '@castrar-cr/types';

const ONVOPAY_API = 'https://api.onvopay.com/v1';
const MONTO_MINIMO_CRC = 500;       // ₡500 mínimo
const MONTO_MAXIMO_DEFAULT_CRC = 100_000; // ₡100,000 si la org no configura límite

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Dueno', 'Organizador', 'SuperAdmin');

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

    // Validar org y respetar su límite de donación
    const orgRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ORG_RESCATE#${orgRescateId}`, SK: 'PROFILE' },
    }));
    if (!orgRes.Item) throw new NotFoundError('Organización rescatista');

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
