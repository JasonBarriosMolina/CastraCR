export type VetStatus = 'pendiente' | 'aprobado' | 'rechazado';

export interface Vet {
  vetId: string;
  userId: string;
  nombre: string;
  colegiatura: string;
  foto?: string;
  especialidad?: string;
  estado: VetStatus;
  historialCampanas: string[]; // campaignIds
  createdAt: string;
  updatedAt: string;
}
