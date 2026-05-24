export type ConversationStep =
  // ── Flujo de registro ──
  | 'inicio'
  | 'datos_dueno'             // cédula, cantón, tutor legal si menor
  | 'datos_basicos'           // nombre, especie, sexo, peso, edad
  | 'salud_general'           // condición de salud → Haiku screening
  | 'estado_reproductivo'     // SOLO hembras: embarazo/celo/lactancia
  | 'criptorquidismo'         // SOLO machos: testículo no descendido
  | 'vacunas_tratamientos'    // vacunas al día + medicamentos activos
  | 'direccion'               // provincia/cantón del dueño
  | 'seleccion_campana'       // lista de ferias cercanas
  | 'seleccion_turno'         // slots disponibles
  | 'resumen_precio'          // precio total + SINPE antes de confirmar
  | 'confirmacion'            // resumen + confirmación final
  | 'completado'              // QR enviado
  // ── Flujo post-operatorio ──
  | 'postop_seguimiento'      // días 1, 3, 7, 15 post-cirugía
  | 'postop_completado';

export type EstadoReproductivo = 'prenada' | 'celo' | 'lactando' | 'normal';
export type NivelPostOp = 'normal' | 'observacion' | 'urgente';
export type ModoConversacion = 'registro' | 'postop';

export interface DatosRegistro {
  // Básicos mascota
  nombre?: string;
  especie?: 'perro' | 'gato' | 'otro';
  sexo?: 'macho' | 'hembra';
  pesoKg?: number;
  edadMeses?: number;
  // Salud general
  condicionSaludRaw?: string;
  aptoCirugia?: boolean;
  razonRechazo?: string;
  alertasVet?: string[];
  // Sex-specific
  estadoReproductivo?: EstadoReproductivo;
  criptorquidismo?: boolean;
  // Salud adicional
  vacunasAlDia?: boolean;
  tieneAntiRabica?: boolean;
  tratamientosActivos?: string;
  // Ubicación
  provincia?: string;
  direccion?: string;
  // Datos del dueño
  ownerNombre?: string;
  ownerTipoCedula?: 'cedula' | 'dimex' | 'pasaporte';
  ownerCedula?: string;
  ownerCanton?: string;
  esMenorDeEdad?: boolean;
  tutorLegal?: string;
  telefonoAlterno?: string;
}

export interface ConversationState {
  telefono: string;
  modo: ModoConversacion;
  estado: ConversationStep;
  datos: DatosRegistro;
  // Selección de campaña/turno
  campaignId?: string;
  slotId?: string;
  venueId?: string;
  // IDs creados
  regId?: string;
  petId?: string;
  // Modo post-op
  petNombre?: string;
  petEspecie?: string;
  postopDia?: 1 | 3 | 7 | 15;
  // Organizador para notificaciones postop urgentes
  orgTelefono?: string;
  // Meta
  ttl: number;
}

// ── Herramientas Haiku ──

export interface ElegibilidadResult {
  apto: boolean;
  razon?: string;
  alertas: string[];
}

export interface EstadoReproductivoResult {
  estado: EstadoReproductivo;
  semanasGestacion?: number;
  semanasCachorros?: number;
}

export interface PostOpEvaluacionResult {
  nivel: NivelPostOp;
  descripcion: string;
  signosPreocupantes: string[];
}

export interface DatosDuenoResult {
  nombre?: string;
  tipoCedula?: 'cedula' | 'dimex' | 'pasaporte';
  numeroCedula?: string;
  canton?: string;
  esMenorDeEdad?: boolean;
  tutorLegal?: string;
}

export interface SaludAdicionalResult {
  vacunasAlDia: boolean;
  tieneAntiRabica: boolean;
  tratamientosActivos?: string;
}
