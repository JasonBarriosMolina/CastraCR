import type { SurgeryStatus } from './pet.js';

export type RegistrationStatus = 'confirmada' | 'cancelada' | 'lista_espera' | 'completada';

export interface Registration {
  regId: string;
  userId: string;
  campaignId: string;
  slotId: string;
  venueId: string;
  estado: RegistrationStatus;
  qrToken: string;
  checkedIn: boolean;
  checkedInAt?: string;
  pets: RegistrationPetSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationPetSummary {
  petId: string;
  nombre: string;
  estadoCirugia: SurgeryStatus;
}

export interface CreateRegistrationInput {
  campaignId: string;
  slotId: string;
  venueId: string;
  petIds: string[];
}
