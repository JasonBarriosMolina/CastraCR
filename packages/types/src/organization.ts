// Plan por volumen — precio según campañas y cupos mensuales
export type OrgPlan = 'libre' | 'starter' | 'pro' | 'escala';
export type OrgStatus = 'pendiente' | 'activa' | 'suspendida';

export interface Organization {
  orgId: string;
  nombre: string;
  cedulaJuridica: string;
  plan: OrgPlan;
  esOng: boolean;          // true → aplica 30% descuento automático
  estado: OrgStatus;
  esRescate: boolean;
  // Datos bancarios para distribución mensual manual (SINPE / transferencia)
  sinpeMovil?: string;     // Número de teléfono para SINPE Móvil (ej: "88001234")
  iban?: string;           // IBAN para transferencia bancaria (ej: "CR21015201001026284066")
  nombreBanco?: string;    // Nombre del banco (ej: "BAC Credomatic")
  createdAt: string;
  updatedAt: string;
}

// Tipo simplificado para orgs rescatistas (no necesitan plan ni cédula)
export interface OrgRescatista {
  orgId: string;
  nombre: string;
  email: string;
  telefono?: string;
  descripcion?: string;
  sinpeMovil?: string;
  iban?: string;
  nombreBanco?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanConfig {
  /** Precio base mensual en centavos (USD) */
  amountCents: number;
  /** Precio con descuento ONG (30% off) en centavos */
  amountCentsOng: number;
  isRecurring: boolean;
  /** null = ilimitado */
  maxCampaignasMes: number | null;
  /** null = ilimitado */
  maxCuposMes: number | null;
  botWhatsapp: boolean;
  donaciones: boolean;
}

/**
 * Modelo de precios por volumen.
 * El precio escala con la cantidad de campañas y cupos que necesita la org.
 * ONGs registradas (esOng=true) reciben 30% de descuento automático.
 *
 * Costo infra estimado por plan:
 *  libre:   ~$0    (Lambda/DDB barely used)
 *  starter: ~$1    (WA conversations + SES + Lambda)
 *  pro:     ~$3-4  (mayor volumen WA + emails)
 *  escala:  ~$8-12 (volumen alto, aún rentable)
 */
export const PLAN_CONFIG: Record<OrgPlan, PlanConfig> = {
  libre: {
    amountCents: 0,
    amountCentsOng: 0,
    isRecurring: false,
    maxCampaignasMes: 1,
    maxCuposMes: 25,
    botWhatsapp: false,
    donaciones: false,
  },
  starter: {
    amountCents: 900,        // $9/mes
    amountCentsOng: 630,     // $6.30/mes (30% off)
    isRecurring: true,
    maxCampaignasMes: 4,
    maxCuposMes: 150,
    botWhatsapp: true,
    donaciones: false,
  },
  pro: {
    amountCents: 1900,       // $19/mes
    amountCentsOng: 1330,    // $13.30/mes (30% off)
    isRecurring: true,
    maxCampaignasMes: 12,
    maxCuposMes: 600,
    botWhatsapp: true,
    donaciones: true,
  },
  escala: {
    amountCents: 3400,       // $34/mes
    amountCentsOng: 2380,    // $23.80/mes (30% off)
    isRecurring: true,
    maxCampaignasMes: null,  // ilimitado
    maxCuposMes: null,       // ilimitado
    botWhatsapp: true,
    donaciones: true,
  },
};

/** Precio efectivo según plan y si es ONG */
export function getPlanPrice(plan: OrgPlan, esOng: boolean): number {
  const cfg = PLAN_CONFIG[plan];
  return esOng ? cfg.amountCentsOng : cfg.amountCents;
}

/** Verifica si una org puede publicar más campañas este mes */
export function isWithinCampaignLimit(
  plan: OrgPlan,
  campaignasMesActual: number,
): boolean {
  const limit = PLAN_CONFIG[plan].maxCampaignasMes;
  return limit === null || campaignasMesActual < limit;
}

/** Verifica si una org puede agregar más cupos este mes */
export function isWithinCuposLimit(
  plan: OrgPlan,
  cuposMesActual: number,
  cuposNuevos: number,
): boolean {
  const limit = PLAN_CONFIG[plan].maxCuposMes;
  return limit === null || cuposMesActual + cuposNuevos <= limit;
}

// Retrocompatibilidad — usar PLAN_CONFIG en código nuevo
export const PLAN_PRICES = {
  libre:   { amountCents: 0,    isRecurring: false },
  starter: { amountCents: 900,  isRecurring: true },
  pro:     { amountCents: 1900, isRecurring: true },
  escala:  { amountCents: 3400, isRecurring: true },
} as const;

export const DONATION_SPLIT_RATIO = 0.7; // 70% a org de rescate, 30% plataforma
