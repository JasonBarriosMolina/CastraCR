import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID as uuidv4 } from 'crypto';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import { generateQRToken } from '@castrar-cr/utils';
import { NotFoundError } from '@castrar-cr/utils';
import type { CreateRegistrationInput } from '@castrar-cr/types';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Dueno', 'SuperAdmin');

    const body = JSON.parse(event.body ?? '{}') as CreateRegistrationInput;
    const { campaignId, slotId, venueId, petIds } = body;

    if (!campaignId || !slotId || !venueId || !petIds?.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'campaignId, slotId, venueId y petIds son requeridos', code: 'INVALID_BODY' }) };
    }

    // 1. Validate campaign exists and is active
    const campaignResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
    }));
    if (!campaignResult.Item) throw new NotFoundError('Campaña');
    if (campaignResult.Item['estado'] !== 'activa') {
      return { statusCode: 400, body: JSON.stringify({ error: 'La campaña no está activa', code: 'CAMPAIGN_NOT_ACTIVE' }) };
    }

    // 2. Validate all pets belong to the user
    const petKeys = petIds.map((petId) => ({ PK: `PET#${petId}`, SK: 'METADATA' }));
    const petsResult = await ddb.send(new BatchGetCommand({
      RequestItems: { [TABLE_NAME]: { Keys: petKeys } },
    }));
    const pets = petsResult.Responses?.[TABLE_NAME] ?? [];
    if (pets.length !== petIds.length) throw new NotFoundError('Una o más mascotas');
    for (const pet of pets) {
      if (pet['userId'] !== authCtx.userId) {
        return { statusCode: 403, body: JSON.stringify({ error: 'No tienes permiso sobre una o más mascotas', code: 'FORBIDDEN' }) };
      }
    }

    // 3. Atomically decrement slot availability
    const slotAvailPK = `CAMPAIGN#${campaignId}`;
    const slotAvailSK = `SLOT#${slotId}#AVAIL`;
    let registrationStatus: 'confirmada' | 'lista_espera' = 'confirmada';

    try {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: slotAvailPK, SK: slotAvailSK },
        UpdateExpression: 'SET cuposDisponibles = cuposDisponibles - :one',
        ConditionExpression: 'cuposDisponibles > :zero',
        ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
      }));
    } catch (err: unknown) {
      const condErr = err as { name?: string };
      if (condErr.name === 'ConditionalCheckFailedException') {
        // No available slots — add to waitlist
        registrationStatus = 'lista_espera';
      } else {
        throw err;
      }
    }

    // 4. Build registration
    const regId = uuidv4();
    const qrToken = generateQRToken();
    const now = new Date().toISOString();

    const petSummaries = pets.map((p) => ({
      petId: p['petId'] as string,
      nombre: p['nombre'] as string,
      estadoCirugia: 'pendiente',
    }));

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `REG#${regId}`,
        SK: 'METADATA',
        regId,
        userId: authCtx.userId,
        campaignId,
        slotId,
        venueId,
        estado: registrationStatus,
        qrToken,
        checkedIn: false,
        pets: petSummaries,
        // GSI3: per-user index
        GSI3PK: `USER#${authCtx.userId}`,
        GSI3SK: `REG#${regId}`,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));

    // 5. Create QR token lookup item (enables O(1) check-in by QR)
    if (registrationStatus === 'confirmada') {
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `QR#${qrToken}`,
          SK: 'REG',
          regId,
          campaignId,
          slotId,
          createdAt: now,
        },
      }));
    }

    return ok({ regId, qrToken, estado: registrationStatus }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
