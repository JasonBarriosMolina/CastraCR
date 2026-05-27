export type ConversationStep =
  // ── Flujo de registro ──
  | 'inicio'
  | 'datos_basicos'           // nombre, especie, sexo, peso, edad
  | 'salud_general'           // condición de salud → Haiku screening
  | 'estado_reproductivo'     // SOLO hembras: embarazo/celo/lactancia
  | 'criptorquidismo'         // SOLO machos: testículo no descendido
  | 'vacunas_tratamientos'    // vacunas al día + medicamentos activos
  | 'direccion'               // provincia/cantón del dueño
  | 'seleccion_campana'       // lista de ferias cercanas
  | 'seleccion_turno'         // slots disponibles
  | 'confirmacion'            // resumen + pago
  | 'completado'              // QR enviado
  // ── Flujo post-operatorio ──
  | 'postop_seguimiento'      // días 1, 3, 7, 15 post-cirugía
  | 'postop_completado';

export type EstadoReproductivo = 'prenada' | 'celo' | 'lactando' | 'normal';
export type NivelPostOp = 'normal' | 'observacion' | 'urgente';
export type ModoConversacion = 'registro' | 'postop';

export interface DatosRegistro {
  // Básicos
  nombre?: string;
  especie?: 'perro' | 'gato' | 'otro';
  sexo?: 'macho' | 'hembra';
  pesoKg?: number;
  edadMeses?: number;
  // Salud general
  condicionSaludRaw?: string;       // texto libre del dueño
  aptoCirugia?: boolean;
  razonRechazo?: string;
  alertasVet?: string[];            // alertas para el veterinario
  // Sex-specific
  estadoReproductivo?: EstadoReproductivo;  // hembras
  criptorquidismo?: boolean;                // machos
  // Salud adicional
  vacunasAlDia?: boolean;
  tratamientosActivos?: string;
  // Ubicación
  provincia?: string;
  direccion?: string;
}

export interface ConversationState {
  telefono: string;
  modo: ModoConversacion;
  estado: ConversationStep;
  // Datos recolectados durante el registro
  datos: DatosRegistro;
  // Selección de campaña/turno
  campaignId?: string;
  slotId?: string;
  venueId?: string;
  // Modo post-op
  regId?: string;
  petId?: string;
  petNombre?: string;
  petEspecie?: string;
  postopDia?: 1 | 3 | 7 | 15;
  // Meta
  ttl: number; // Unix timestamp — 24h en registro, 16 días en post-op
}

// ── Resultado de evaluación de elegibilidad (Haiku tool-use) ──
export interface ElegibilidadResult {
  apto: boolean;
  razon?: string;       // solo si apto=false
  alertas: string[];    // avisos para el vet aunque apto=true
}

// ── Resultado de estado reproductivo (Haiku tool-use) ──
export interface EstadoReproductivoResult {
  estado: EstadoReproductivo;
  semanasGestacion?: number;
  semanasCachorros?: number; // si lactando, edad de los cachorros
}

// ── Resultado de follow-up post-op (Haiku tool-use) ──
export interface PostOpEvaluacionResult {
  nivel: NivelPostOp;
  descripcion: string;
  signosPreocupantes: string[];
}
