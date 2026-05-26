export type CampaignStatus = 'borrador' | 'activa' | 'finalizada' | 'cancelada';

export interface CampaignVenue {
  venueId: string;
  nombre: string;
  direccion: string;
  coordenadas: {
    lat: number;
    lng: number;
  };
  cuposTotal: number;
  cuposDisponibles: number;
  geohash: string;
}

export interface CampaignSlot {
  slotId: string;
  horaInicio: string; // HH:mm
  horaFin?: string;   // HH:mm, opcional
  venueId: string;
  cuposTotal: number;
  cuposDisponibles: number;
}

export interface CampaignVet {
  vetId: string;
  nombre: string;
  colegiatura: string;
  visiblePublico: boolean;
}

export type Especie = 'perro' | 'gato' | 'otro';

export interface TipoAnimal {
  tipoId: string;
  especie: Especie;
  descripcion?: string;   // ej: "mayor a 10 kg", "cachorro"
  cantidad: number;
  pesoMin?: number;       // kg, opcional
  pesoMax?: number;       // kg, opcional
  edadMin?: number;       // meses, opcional
  edadMax?: number;       // meses, opcional
  /** Precio en CRC por mascota. 0 o ausente = gratuita */
  precioCRC?: number;
}

export interface Campaign {
  campaignId: string;
  titulo: string;
  descripcion: string;
  estado: CampaignStatus;
  organizadorId: string;
  orgRescateId: string;
  plantillaPostOp: string;
  fechaInicio: string; // ISO 8601
  fechaFin: string;
  venues: CampaignVenue[];
  slots: CampaignSlot[];
  vets: CampaignVet[];
  tiposAnimales?: TipoAnimal[];
  /**
   * Precio base por mascota en CRC (colones).
   * 0 o ausente = campaña gratuita.
   * Si tiposAnimales tiene precioCRC, ese tiene precedencia sobre este campo.
   */
  precioPorMascotaCRC?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignInput {
  titulo: string;
  descripcion: string;
  orgRescateId: string;
  fechaInicio: string;
  fechaFin: string;
}
