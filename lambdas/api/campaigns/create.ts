import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID as uuidv4 } from 'crypto';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import type { CreateCampaignInput } from '@castrar-cr/types';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Organizador', 'SuperAdmin');

    const body = JSON.parse(event.body ?? '{}') as CreateCampaignInput;
    const { titulo, descripcion, orgRescateId, fechaInicio, fechaFin } = body;

    if (!titulo || !orgRescateId || !fechaInicio || !fechaFin) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Campos requeridos faltantes', code: 'INVALID_BODY' }) };
    }

    const campaignId = uuidv4();
    const now = new Date().toISOString();

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `CAMPAIGN#${campaignId}`,
        SK: 'METADATA',
        campaignId,
        titulo,
        descripcion: descripcion ?? '',
        estado: 'borrador',
        organizadorId: authCtx.userId,
        orgRescateId,
        fechaInicio,
        fechaFin,
        plantillaPostOp: '',
        // GSI1: organizadorId index
        GSI1PK: `ORG#${authCtx.userId}`,
        GSI1SK: `CAMPAIGN#${campaignId}`,
        // GSI4: estado index
        GSI4PK: 'ESTADO#borrador',
        GSI4SK: `CAMPAIGN#${campaignId}`,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));

    return ok({ campaignId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
