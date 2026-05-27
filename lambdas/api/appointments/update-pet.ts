/**
 * PATCH /appointments/{id}/pet
 * Edita datos de la mascota en una reservación (hasta 12h antes de la cirugía).
 * Body: Partial<{ pet_name, species, breed, weight_kg, age_months, sex,
 *                  vaccines_up_to_date, active_treatments, health_notes, vet_alerts }>
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { NotFoundError } from '@castrar-cr/utils';

const e = (statusCode: number, error: string, code?: string) => ({
  statusCode,
  body: JSON.stringify({ error, ...(code ? { code } : {}) }),
});

const speciesMap: Record<string, string> = { dog: 'perro', cat: 'gato', other: 'otro' };

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const regId = event.pathParameters?.id;
    if (!regId) return e(400, 'Falta appointment id');

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return e(400, 'JSON inválido');
    }

    // 1. Get appointment + campaign for time check
    const regRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
    }));
    if (!regRes.Item) throw new NotFoundError('Reservación');
    const reg = regRes.Item;

    if (reg['estado'] === 'cancelada') {
      return e(409, 'No se puede modificar una reservación cancelada', 'CANCELLED');
    }

    // 2. Check 12h cutoff
    const campaignRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${reg['campaignId']}`, SK: 'METADATA' },
    }));
    if (campaignRes.Item) {
      const fechaInicio = campaignRes.Item['fechaInicio'] as string | undefined;
      if (fechaInicio) {
        const hoursUntil = (new Date(fechaInicio).getTime() - Date.now()) / 3_600_000;
        if (hoursUntil < 12) {
          return e(400, 'No se pueden modificar datos de la mascota con menos de 12 horas de anticipación', 'TOO_LATE');
        }
      }
    }

    // 3. Build updated pet summary (pets[0] — bot-created registrations have single pet)
    const existingPets: unknown[] = reg['pets'] as unknown[] ?? [];
    if (!existingPets.length) return e(500, 'No hay mascotas en esta reservación');

    const pet = { ...(existingPets[0] as Record<string, unknown>) };

    if (body['pet_name']) pet['nombre'] = body['pet_name'];
    if (body['species']) pet['especie'] = speciesMap[body['species'] as string] ?? body['species'];
    if (body['breed'] !== undefined) pet['raza'] = body['breed'];
    if (body['weight_kg']) pet['pesoKg'] = body['weight_kg'];
    if (body['age_months']) pet['edadMeses'] = body['age_months'];
    if (body['sex']) pet['sexo'] = body['sex'] === 'male' ? 'macho' : 'hembra';
    if (body['vaccines_up_to_date'] !== undefined) pet['vacunasAlDia'] = body['vaccines_up_to_date'];
    if (body['active_treatments'] !== undefined) pet['tratamientosActivos'] = body['active_treatments'];
    if (body['health_notes'] !== undefined) pet['condicionSaludRaw'] = body['health_notes'];
    if (body['vet_alerts']) pet['alertasVet'] = body['vet_alerts'];

    const updatedPets = [pet, ...existingPets.slice(1)];
    const now = new Date().toISOString();

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REG#${regId}`, SK: 'METADATA' },
      UpdateExpression: 'SET pets = :pets, updatedAt = :now',
      ExpressionAttributeValues: { ':pets': updatedPets, ':now': now },
    }));

    return ok({
      appointment_id: regId,
      pet: updatedPets[0],
      updated_at: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
