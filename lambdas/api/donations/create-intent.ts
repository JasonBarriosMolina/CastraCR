import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { getSecrets } from '../../shared/secrets.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { NotFoundError } from '@castrar-cr/utils';
import type { CreateDonationInput } from '@castrar-cr/types';

const ONVOPAY_API = 'https://api.onvopay.com/v1';

// Validar monto entre $1 y $10,000 (en centavos)
function validateAmount(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 100 && cents <= 1_000_000;
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Dueno', 'Organizador', 'SuperAdmin');

    const body = JSON.parse(event.body ?? '{}') as CreateDonationInput;
    const { monto, orgRescateId, campaignId } = body;

    if (!monto || !orgRescateId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'monto y orgRescateId son requeridos', code: 'INVALID_BODY' }) };
    }
    if (!validateAmount(monto)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'El monto debe estar entre $1 y $10,000', code: 'INVALID_AMOUNT' }) };
    }

    // Validar que la org existe
    const orgResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ORG#${orgRescateId}`, SK: 'PROFILE' },
    }));
    if (!orgResult.Item) throw new NotFoundError('Organización de rescate');

    const secrets = await getSecrets();
    const apiKey = secrets['ONVOPAY_SECRET_KEY'] ?? '';

    // Crear payment intent en OnvoPay
    // Docs: POST /v1/payment-intents
    // Currency: USD o CRC (centavos)
    const response = await fetch(`${ONVOPAY_API}/payment-intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        amount: monto,
        currency: 'USD',
        metadata: {
          tipo: 'donacion',
          userId: authCtx.userId,
          orgRescateId,
          campaignId: campaignId ?? '',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OnvoPay error:', errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Error al crear pago', code: 'PAYMENT_PROVIDER_ERROR' }) };
    }

    const data = await response.json() as { id: string; token: string; clientSecret?: string };

    return ok({
      paymentToken: data.token ?? data.clientSecret ?? data.id,
      paymentIntentId: data.id,
      amount: monto,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
