export type PetSpecies = 'perro' | 'gato' | 'otro';
export type PetSex = 'macho' | 'hembra';
export type SurgeryStatus = 'pendiente' | 'operado' | 'cancelado' | 'complicacion';

export type EstadoReproductivo = 'prenada' | 'celo' | 'lactando' | 'normal';

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
  // ── Campos de screening médico (capturados por bot o manual) ──
  vacunasAlDia?: boolean;
  tratamientosActivos?: string;
  criptorquidismo?: boolean;              // machos — testículo no descendido
  estadoReproductivo?: EstadoReproductivo; // hembras
  // ── Resultado del screening de aptitud ──
  aptoCirugia?: boolean;
  razonRechazo?: string;
  alertasVet?: string[];
  screenedAt?: string;                    // ISO timestamp del último screening
  // ── Ubicación del dueño ──
  provincia?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationPet extends PetProfile {
  estadoCirugia: SurgeryStatus;
  notasVet?: string; // KMS-encrypted
  alertaRiesgo?: boolean;
}
