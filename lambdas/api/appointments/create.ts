/**
 * POST /campaigns/{id}/appointments
 * Crea una o más reservaciones (una por mascota) en una campaña.
 * Diseñado para ser consumido por bots externos — sin JWT, con X-API-Key.
 *
 * Body:
 * {
 *   owner: {
 *     name: string
 *     id_type: 'cedula' | 'dimex' | 'pasaporte'
 *     id_number: string
 *     phone: string
 *     phone_alternate?: string
 *     canton?: string
 *     is_rescue_org?: boolean
 *   }
 *   pets: Array<{
 *     name: string
 *     species: 'dog' | 'cat' | 'other'
 *     sex: 'male' | 'female'
 *     breed?: string
 *     age_months: number
 *     weight_kg: number
 *     color?: string
 *     slot_id: string
 *     venue_id: string
 *     vaccinated_rabies?: boolean
 *     vaccinated_polyvalent?: boolean
 *     dewormed?: boolean
 *     both_testicles?: boolean        // machos
 *     in_heat?: boolean               // hembras
 *     pregnant?: boolean              // hembras
 *     nursing?: boolean               // hembras
 *     dangerous_breed?: boolean
 *     has_muzzle?: boolean
 *     microchip?: string
 *     current_medication?: string
 *     health_notes?: string
 *     vet_alerts?: string[]
 *     photo?: string                  // base64 JPG/PNG, opcional
 *   }>
 * }
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { generateQRToken } from '@castrar-cr/utils';
import { NotFoundError } from '@castrar-cr/utils';

const e = (statusCode: number, error: string, code?: string) => ({
  statusCode,
  body: JSON.stringify({ error, ...(code ? { code } : {}) }),
});

interface OwnerInput {
  name: string;
  id_type: 'cedula' | 'dimex' | 'pasaporte';
  id_number: string;
  phone: string;
  phone_alternate?: string;
  canton?: string;
  is_rescue_org?: boolean;
}

interface PetInput {
  name: string;
  species: 'dog' | 'cat' | 'other';
  sex: 'male' | 'female';
  breed?: string;
  age_months: number;
  weight_kg: number;
  color?: string;
  slot_id: string;
  venue_id: string;
  vaccinated_rabies?: boolean;
  vaccinated_polyvalent?: boolean;
  dewormed?: boolean;
  both_testicles?: boolean;
  in_heat?: boolean;
  pregnant?: boolean;
  nursing?: boolean;
  dangerous_breed?: boolean;
  has_muzzle?: boolean;
  microchip?: string;
  current_medication?: string;
  health_notes?: string;
  vet_alerts?: string[];
  photo?: string;
}

interface AppointmentBody {
  owner: OwnerInput;
  pets: PetInput[];
}

const speciesMap: Record<string, string> = { dog: 'perro', cat: 'gato', other: 'otro' };

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const campaignId = event.pathParameters?.id;
    if (!campaignId) return e(400, 'Falta campaignId');

    let body: AppointmentBody;
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return e(400, 'JSON inválido');
    }

    const { owner, pets } = body;

    if (!owner?.phone || !owner?.name || !owner?.id_type || !owner?.id_number) {
      return e(400, 'owner.phone, owner.name, owner.id_type y owner.id_number son requeridos');
    }
    if (!pets?.length) {
      return e(400, 'pets[] es requerido y debe tener al menos una mascota');
    }

    // Validate each pet has required fields
    for (let i = 0; i < pets.length; i++) {
      const p = pets[i]!;
      if (!p.name || !p.species || !p.sex || !p.weight_kg || !p.age_months || !p.slot_id || !p.venue_id) {
        return e(400, `pets[${i}]: name, species, sex, weight_kg, age_months, slot_id y venue_id son requeridos`);
      }
    }

    // 1. Validate campaign
    const campaignRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
    }));
    if (!campaignRes.Item) throw new NotFoundError('Campaña');
    if (campaignRes.Item['estado'] !== 'activa' && campaignRes.Item['estado'] !== 'publicada') {
      return e(400, 'La campaña no está activa', 'CAMPAIGN_NOT_ACTIVE');
    }

    const now = new Date().toISOString();
    const phone = owner.phone.replace(/\D/g, '');

    // 2. Check for duplicate appointment (same phone + campaign)
    const existingRes = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI3-userId',
      KeyConditionExpression: 'GSI3PK = :pk AND begins_with(GSI3SK, :prefix)',
      FilterExpression: 'campaignId = :cid AND estado <> :cancelled',
      ExpressionAttributeValues: {
        ':pk': `PHONE#${phone}`,
        ':prefix': 'REG#',
        ':cid': campaignId,
        ':cancelled': 'cancelada',
      },
    }));
    if ((existingRes.Items?.length ?? 0) > 0) {
      return e(409, 'Ya existe una reservación activa para este teléfono en esta campaña', 'DUPLICATE_APPOINTMENT');
    }

    // 3. Atomically decrement one slot per pet (each pet may have a different slot_id)
    const slotStatuses = new Map<string, 'confirmada' | 'lista_espera'>();

    for (const pet of pets) {
      if (!slotStatuses.has(pet.slot_id)) {
        try {
          await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `CAMPAIGN#${campaignId}`, SK: `SLOT#${pet.slot_id}#AVAIL` },
            UpdateExpression: 'SET cuposDisponibles = cuposDisponibles - :one',
            ConditionExpression: 'cuposDisponibles > :zero',
            ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
          }));
          slotStatuses.set(pet.slot_id, 'confirmada');
        } catch (err: unknown) {
          if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
            slotStatuses.set(pet.slot_id, 'lista_espera');
          } else {
            throw err;
          }
        }
      }
    }

    // Overall status: confirmada only if ALL slots were secured
    const overallStatus: 'confirmada' | 'lista_espera' =
      [...slotStatuses.values()].every((s) => s === 'confirmada') ? 'confirmada' : 'lista_espera';

    // 4. Build pet summaries
    const petSummaries = pets.map((p) => {
      const vetAlerts: string[] = [...(p.vet_alerts ?? [])];

      // Auto-generate vet alerts from clinical flags
      if (p.both_testicles === false) vetAlerts.push('Criptorquidia — costo adicional aplicado');
      if (p.dangerous_breed && p.has_muzzle) vetAlerts.push('Raza peligrosa — verificar bozal al llegar');
      if (p.vaccinated_rabies === false || p.vaccinated_polyvalent === false) vetAlerts.push('Vacunas no al día — verificar cartilla');
      if (p.current_medication) vetAlerts.push(`Medicamento activo: ${p.current_medication}`);

      const slotStatus = slotStatuses.get(p.slot_id) ?? 'lista_espera';

      return {
        petId: randomUUID(),
        nombre: p.name,
        especie: speciesMap[p.species] ?? 'otro',
        raza: p.breed,
        sexo: p.sex === 'male' ? 'macho' : 'hembra',
        pesoKg: p.weight_kg,
        edadMeses: p.age_months,
        color: p.color,
        slotId: p.slot_id,
        venueId: p.venue_id,
        slotStatus,
        estadoCirugia: 'pendiente',
        // Vacunas
        vacunadoRabia: p.vaccinated_rabies,
        vacunadoPolivalente: p.vaccinated_polyvalent,
        desparasitado: p.dewormed,
        // Triage clínico
        ambosTesticulos: p.both_testicles,
        enCelo: p.in_heat,
        prenada: p.pregnant,
        amamantando: p.nursing,
        razaPeligrosa: p.dangerous_breed,
        tieneBozal: p.has_muzzle,
        microchip: p.microchip,
        medicamentoActual: p.current_medication,
        condicionSaludRaw: p.health_notes,
        alertasVet: vetAlerts,
        // Foto (base64) — almacenada inline en el resumen
        // Para fotos grandes se recomienda usar /pets/{id}/upload-url
        foto: p.photo ? p.photo.substring(0, 50) + '...[truncated]' : undefined,
      };
    });

    // 5. Create single registration item with all pets
    const regId = randomUUID();
    const qrToken = generateQRToken();

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `REG#${regId}`,
        SK: 'METADATA',
        regId,
        // Owner info
        ownerPhone: phone,
        ownerPhoneAlternate: owner.phone_alternate?.replace(/\D/g, ''),
        ownerNombre: owner.name,
        ownerIdType: owner.id_type,
        ownerIdNumber: owner.id_number,
        ownerCanton: owner.canton,
        ownerIsRescueOrg: owner.is_rescue_org ?? false,
        campaignId,
        estado: overallStatus,
        qrToken,
        checkedIn: false,
        pets: petSummaries,
        // GSI3: by phone
        GSI3PK: `PHONE#${phone}`,
        GSI3SK: `REG#${regId}`,
        // GSI4: by estado
        GSI4PK: 'REG',
        GSI4SK: `${overallStatus}#${now}`,
        source: 'bot_externo',
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));

    // 6. QR token lookup (O(1) check-in) — only for confirmed
    if (overallStatus === 'confirmada') {
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `QR#${qrToken}`,
          SK: 'REG',
          regId,
          campaignId,
          createdAt: now,
        },
      }));
    }

    // 7. Build per-pet result (which got confirmed vs waitlist)
    const petsResult = petSummaries.map((p) => ({
      pet_id: p.petId,
      pet_name: p.nombre,
      slot_id: p.slotId,
      slot_status: p.slotStatus,
    }));

    return ok({
      appointment_id: regId,
      qr_token: overallStatus === 'confirmada' ? qrToken : undefined,
      status: overallStatus,
      pets: petsResult,
      message: overallStatus === 'confirmada'
        ? 'Reservación confirmada'
        : 'Uno o más cupos en lista de espera',
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
