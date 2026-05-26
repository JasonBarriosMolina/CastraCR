import type { SurgeryStatus, EstadoReproductivo } from './pet.js';

export type RegistrationStatus =
  | 'pendiente_pago'   // creada por bot, esperando pago (TTL 20 min si no se paga)
  | 'confirmada'
  | 'cancelada'
  | 'lista_espera'
  | 'completada'
  | 'expirada'         // no se pagó dentro del TTL
  | 'reembolso_pendiente'  // campaña cancelada, admin debe procesar reembolso manual
  | 'reembolsada';

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
  /** Precio total cobrado en CRC (suma de todos los pets). 0 = gratuita. */
  montoCRC?: number;
  /** OnvoPay payment intent id, presente si se inició un pago */
  paymentIntentId?: string;
  /** TTL Unix para expirar citas pendiente_pago (20 min tras creación) */
  paymentTtl?: number;
  /** Datos de reembolso manual (cuando campaña se cancela) */
  reembolso?: {
    estado: 'pendiente' | 'procesado';
    notaAdmin?: string;
    procesadoEn?: string;
    procesadoPor?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationPetSummary {
  petId: string;
  nombre: string;
  estadoCirugia: SurgeryStatus;
  alertasVet?: string[];  // heredadas del screening del bot, visibles al vet en check-in
}

export interface CreateRegistrationInput {
  campaignId: string;
  slotId: string;
  venueId: string;
  petIds: string[];
  // Datos de screening del bot — se persisten en el pet record
  petScreeningData?: Record<string, {
    vacunasAlDia?: boolean;
    tratamientosActivos?: string;
    criptorquidismo?: boolean;
    estadoReproductivo?: EstadoReproductivo;
    aptoCirugia?: boolean;
    razonRechazo?: string;
    alertasVet?: string[];
    screenedAt?: string;
    provincia?: string;
  }>;
}

// ── Expediente Clínico Digital ──
// Un expediente por procedimiento (REG#${regId} / EXPEDIENTE)

export type TipoProcedimiento =
  | 'castracion_estandar'
  | 'ovariohisterectomia'
  | 'criptorquidismo'
  | 'otro';

export type CondicionEgreso = 'buena' | 'regular' | 'requiere_observacion';
export type NivelPostOp = 'normal' | 'observacion' | 'urgente';
export type AccionPostOp = 'ninguna' | 'alerta_org' | 'derivado_vet';

export interface ExpedienteRecepcion {
  pesoKg: number;                    // peso real medido en el evento
  relajanteAplicado?: boolean;       // solo perros
  dosisMgKg?: number;
  consentimientoFirmado: boolean;
  consentimientoTimestamp: string;   // ISO
  llegadaHora: string;               // HH:mm
  numeroTurno: number;
}

export interface ExpedientePreOp {
  evaluadoPorVetId: string;
  evaluadoHora: string;              // HH:mm
  aptoCirugia: boolean;
  observacionesPreOp?: string;
  alertasActivas: string[];
  criptorquidismo?: boolean;
  estadoReproductivo?: EstadoReproductivo;
  pesoConfirmado: number;
}

export interface ExpedienteIntraOp {
  cirugiaInicio: string;             // HH:mm
  cirugiaFin: string;                // HH:mm
  duracionMinutos: number;
  tipoProcedimiento: TipoProcedimiento;
  complicaciones?: string;
  estadoFinal: 'exitosa' | 'complicacion' | 'suspendida';
  notasVet?: string;
}

export interface ExpedienteEgreso {
  egresoHora: string;                // HH:mm
  procedimientosAdicionales: {
    corteUnas: boolean;
    limpiezaOidos: boolean;
    cono: boolean;
    vestido: boolean;
  };
  antibiotico?: {
    nombre: string;
    dosis: string;
    dias: number;
  };
  condicionEgreso: CondicionEgreso;
  entregadoA: string;
  firmaEntregaTimestamp: string;     // ISO
  indicacionesEntregadas: boolean;
}

export interface PostOpSeguimientoEntry {
  dia: 1 | 3 | 7 | 15;
  fechaRespuesta: string;            // ISO
  respuestaRaw: string;              // texto o transcripción de audio
  nivelIA: NivelPostOp;
  descripcionIA: string;
  signosPreocupantes: string[];
  accionTomada?: AccionPostOp;
  notaOrg?: string;
}

export interface ExpedienteClinico {
  regId: string;
  petId: string;
  campaignId: string;
  recepcion?: ExpedienteRecepcion;
  preOp?: ExpedientePreOp;
  intraOp?: ExpedienteIntraOp;
  egreso?: ExpedienteEgreso;
  seguimiento: PostOpSeguimientoEntry[];
  creadoEn: string;
  actualizadoEn: string;
}

export type FaseExpediente = 'recepcion' | 'preOp' | 'intraOp' | 'egreso';

export interface UpdateExpedienteInput {
  fase: FaseExpediente;
  datos:
    | Partial<ExpedienteRecepcion>
    | Partial<ExpedientePreOp>
    | Partial<ExpedienteIntraOp>
    | Partial<ExpedienteEgreso>;
}
