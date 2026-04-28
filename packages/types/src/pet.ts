export type PetSpecies = 'perro' | 'gato' | 'otro';
export type PetSex = 'macho' | 'hembra';
export type SurgeryStatus = 'pendiente' | 'operado' | 'cancelado' | 'complicacion';

export interface PetProfile {
  petId: string;
  userId: string;
  nombre: string;
  especie: PetSpecies;
  raza?: string;
  edadAnios?: number;
  edadMeses?: number;
  pesoKg?: number;
  sexo: PetSex;
  condicionSalud?: string;
  vacunas?: string[];
  fotosS3Keys?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationPet extends PetProfile {
  estadoCirugia: SurgeryStatus;
  notasVet?: string; // KMS-encrypted
  alertaRiesgo?: boolean;
}
