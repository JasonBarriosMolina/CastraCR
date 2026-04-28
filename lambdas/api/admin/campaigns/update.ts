import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID as uuidv4 } from 'crypto';
import { ddb, TABLE_NAME } from '../../../shared/db.js';
import { ok, errorResponse } from '../../../shared/response.js';
import { getAuthContext, requireRole, requireResourceOwnership } from '../../../shared/auth.js';
import { encodeGeohash } from '@castrar-cr/utils';
import { NotFoundError } from '@castrar-cr/utils';
import type { CampaignVenue, CampaignSlot, CampaignVet, TipoAnimal } from '@castrar-cr/types';

interface UpdateCampaignInput {
  // Scalar fields
  titulo?: string;
  descripcion?: string;
  plantillaPostOp?: string;
  fechaInicio?: string;
  fechaFin?: string;
  // Venues
  addVenue?: Omit<CampaignVenue, 'venueId' | 'geohash' | 'cuposDisponibles'>;
  editVenue?: { venueId: string; nombre?: string; direccion?: string; coordenadas?: { lat: number; lng: number }; cuposTotal?: number };
  removeVenue?: { venueId: string };
  // Slots
  addSlot?: Omit<CampaignSlot, 'slotId' | 'cuposDisponibles'>;
  editSlot?: { slotId: string; horaInicio?: string; horaFin?: string | null; venueId?: string; cuposTotal?: number };
  removeSlot?: { slotId: string };
  // Vets
  addVet?: Omit<CampaignVet, 'vetId'>;
  removeVet?: { vetId: string };
  // Animal types
  addAnimalType?: Omit<TipoAnimal, 'tipoId'>;
  removeAnimalType?: { tipoId: string };
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Organizador', 'SuperAdmin');

    const campaignId = event.pathParameters?.['id'];
    if (!campaignId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'id es requerido', code: 'INVALID_PARAMS' }) };
    }

    const campaignResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
    }));
    if (!campaignResult.Item) throw new NotFoundError('Campaña');
    requireResourceOwnership(authCtx, campaignResult.Item['organizadorId'] as string);

    if (campaignResult.Item['estado'] === 'finalizada' || campaignResult.Item['estado'] === 'cancelada') {
      return { statusCode: 400, body: JSON.stringify({ error: 'No se puede editar una campaña finalizada o cancelada', code: 'INVALID_STATE' }) };
    }

    const body = JSON.parse(event.body ?? '{}') as UpdateCampaignInput;
    const now = new Date().toISOString();

    // Separate SET and REMOVE clauses for DynamoDB UpdateExpression
    const setParts: string[] = ['updatedAt = :now'];
    const removeParts: string[] = [];
    const exprValues: Record<string, unknown> = { ':now': now };

    // ── Scalar fields ────────────────────────────────────────────────────────
    if (body.titulo)                    { setParts.push('titulo = :titulo');           exprValues[':titulo'] = body.titulo; }
    if (body.descripcion !== undefined) { setParts.push('descripcion = :desc');        exprValues[':desc']   = body.descripcion; }
    if (body.plantillaPostOp !== undefined) { setParts.push('plantillaPostOp = :pop'); exprValues[':pop']    = body.plantillaPostOp; }
    if (body.fechaInicio)               { setParts.push('fechaInicio = :fi');          exprValues[':fi']     = body.fechaInicio; }
    if (body.fechaFin)                  { setParts.push('fechaFin = :ff');             exprValues[':ff']     = body.fechaFin; }

    // ── Add venue ────────────────────────────────────────────────────────────
    if (body.addVenue) {
      const venueId = uuidv4();
      const geohash = encodeGeohash(body.addVenue.coordenadas.lat, body.addVenue.coordenadas.lng);
      const venue: CampaignVenue = { ...body.addVenue, venueId, geohash, cuposDisponibles: body.addVenue.cuposTotal };
      setParts.push('venues = list_append(if_not_exists(venues, :emptyV), :newVenue)');
      setParts.push('GSI2PK = :g2pk, GSI2SK = :g2sk');
      exprValues[':newVenue'] = [venue];
      exprValues[':emptyV']   = [];
      exprValues[':g2pk']     = `GEOHASH#${geohash}`;
      exprValues[':g2sk']     = `CAMPAIGN#${campaignId}`;
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: `CAMPAIGN#${campaignId}`, SK: `VENUE#${venueId}#AVAIL`, cuposTotal: venue.cuposTotal, cuposDisponibles: venue.cuposTotal, venueId, campaignId },
      }));
    }

    // ── Edit venue ───────────────────────────────────────────────────────────
    if (body.editVenue) {
      const venues = (campaignResult.Item['venues'] as CampaignVenue[] | undefined) ?? [];
      const idx = venues.findIndex((v) => v.venueId === body.editVenue!.venueId);
      if (idx < 0) return { statusCode: 404, body: JSON.stringify({ error: 'Sede no encontrada', code: 'NOT_FOUND' }) };
      const prev = venues[idx]!;
      const newCoords = body.editVenue.coordenadas ?? prev.coordenadas;
      const updated: CampaignVenue = {
        ...prev,
        nombre:     body.editVenue.nombre     ?? prev.nombre,
        direccion:  body.editVenue.direccion  ?? prev.direccion,
        coordenadas: newCoords,
        cuposTotal: body.editVenue.cuposTotal ?? prev.cuposTotal,
        geohash:    body.editVenue.coordenadas ? encodeGeohash(newCoords.lat, newCoords.lng) : prev.geohash,
      };
      setParts.push(`venues[${idx}] = :venueUpd`);
      exprValues[':venueUpd'] = updated;
    }

    // ── Remove venue ─────────────────────────────────────────────────────────
    if (body.removeVenue) {
      const venues = (campaignResult.Item['venues'] as CampaignVenue[] | undefined) ?? [];
      const idx = venues.findIndex((v) => v.venueId === body.removeVenue!.venueId);
      if (idx >= 0) removeParts.push(`venues[${idx}]`);
    }

    // ── Add slot ─────────────────────────────────────────────────────────────
    if (body.addSlot) {
      const slotId = uuidv4();
      const slot: CampaignSlot = { ...body.addSlot, slotId, cuposDisponibles: body.addSlot.cuposTotal };
      setParts.push('slots = list_append(if_not_exists(slots, :emptyS), :newSlot)');
      exprValues[':newSlot'] = [slot];
      exprValues[':emptyS']  = [];
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: `CAMPAIGN#${campaignId}`, SK: `SLOT#${slotId}#AVAIL`, cuposTotal: slot.cuposTotal, cuposDisponibles: slot.cuposTotal, slotId, venueId: body.addSlot.venueId, campaignId },
      }));
    }

    // ── Edit slot ────────────────────────────────────────────────────────────
    if (body.editSlot) {
      const slots = (campaignResult.Item['slots'] as CampaignSlot[] | undefined) ?? [];
      const idx = slots.findIndex((s) => s.slotId === body.editSlot!.slotId);
      if (idx < 0) return { statusCode: 404, body: JSON.stringify({ error: 'Turno no encontrado', code: 'NOT_FOUND' }) };
      const prev = slots[idx]!;
      const updated: CampaignSlot = {
        ...prev,
        horaInicio: body.editSlot.horaInicio ?? prev.horaInicio,
        horaFin:    body.editSlot.horaFin !== undefined ? (body.editSlot.horaFin ?? undefined) : prev.horaFin,
        venueId:    body.editSlot.venueId   ?? prev.venueId,
        cuposTotal: body.editSlot.cuposTotal ?? prev.cuposTotal,
      };
      setParts.push(`slots[${idx}] = :slotUpd`);
      exprValues[':slotUpd'] = updated;
    }

    // ── Remove slot ──────────────────────────────────────────────────────────
    if (body.removeSlot) {
      const slots = (campaignResult.Item['slots'] as CampaignSlot[] | undefined) ?? [];
      const idx = slots.findIndex((s) => s.slotId === body.removeSlot!.slotId);
      if (idx >= 0) removeParts.push(`slots[${idx}]`);
    }

    // ── Add vet ──────────────────────────────────────────────────────────────
    if (body.addVet) {
      const vet: CampaignVet = { ...body.addVet, vetId: uuidv4() };
      setParts.push('vets = list_append(if_not_exists(vets, :emptyVets), :newVet)');
      exprValues[':newVet']    = [vet];
      exprValues[':emptyVets'] = [];
    }

    // ── Remove vet ───────────────────────────────────────────────────────────
    if (body.removeVet) {
      const vets = (campaignResult.Item['vets'] as CampaignVet[] | undefined) ?? [];
      const idx = vets.findIndex((v) => v.vetId === body.removeVet!.vetId);
      if (idx >= 0) removeParts.push(`vets[${idx}]`);
    }

    // ── Add animal type ──────────────────────────────────────────────────────
    if (body.addAnimalType) {
      const tipo: TipoAnimal = { ...body.addAnimalType, tipoId: uuidv4() };
      setParts.push('tiposAnimales = list_append(if_not_exists(tiposAnimales, :emptyTipos), :newTipo)');
      exprValues[':newTipo']     = [tipo];
      exprValues[':emptyTipos']  = [];
    }

    // ── Remove animal type ───────────────────────────────────────────────────
    if (body.removeAnimalType) {
      const tipos = (campaignResult.Item['tiposAnimales'] as TipoAnimal[] | undefined) ?? [];
      const idx = tipos.findIndex((t) => t.tipoId === body.removeAnimalType!.tipoId);
      if (idx >= 0) removeParts.push(`tiposAnimales[${idx}]`);
    }

    // Nothing to do?
    const hasChanges = setParts.length > 1 || removeParts.length > 0;
    if (!hasChanges) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No hay campos para actualizar', code: 'NO_CHANGES' }) };
    }

    // Build combined UpdateExpression (SET ... REMOVE ...)
    let updateExpression = '';
    if (setParts.length > 0) updateExpression += `SET ${setParts.join(', ')}`;
    if (removeParts.length > 0) updateExpression += ` REMOVE ${removeParts.join(', ')}`;

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
      UpdateExpression: updateExpression.trim(),
      ExpressionAttributeValues: exprValues,
    }));

    return ok({ campaignId, updated: true });
  } catch (error) {
    return errorResponse(error);
  }
};
