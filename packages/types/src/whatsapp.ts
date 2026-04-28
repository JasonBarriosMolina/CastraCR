export type ConversationStep =
  | 'inicio'
  | 'seleccion_campana'
  | 'datos_mascota_1'
  | 'datos_mascota_2'
  | 'datos_mascota_3'
  | 'seleccion_turno'
  | 'confirmacion'
  | 'completado';

export interface ConversationState {
  telefono: string;
  estado: ConversationStep;
  campaignId?: string;
  slotId?: string;
  datosRecolectados: Partial<{
    nombre: string;
    especie: string;
    raza: string;
    peso: number;
    sexo: string;
    condicionSalud: string;
  }>[];
  ttl: number; // Unix timestamp, 24h
}
