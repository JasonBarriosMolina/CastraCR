/**
 * Utilidades de pagos para CastraCR — OnvoPay
 * (Reemplazó Stripe en Mar 2026)
 */

// ─── Fee de feria (cobro por castración) ────────────────────────────────────

/** Porción de cada cobro de feria que va a la org (90%) */
export const ORG_FAIR_RATIO = 0.9;

/** Porción de cada cobro de feria que va a la plataforma (10%) */
export const PLATFORM_FAIR_RATIO = 0.1;

/**
 * Divide el cobro de una castración: 90% org / 10% plataforma.
 * Solo aplica a pagos procesados a través de la app (OnvoPay).
 * Pagos en efectivo → 100% org, no pasan por este cálculo.
 */
export function calculateFairSplit(amountCents: number): {
  orgAmountCents: number;
  platformAmountCents: number;
} {
  const platformAmountCents = Math.round(amountCents * PLATFORM_FAIR_RATIO);
  const orgAmountCents = amountCents - platformAmountCents;
  return { orgAmountCents, platformAmountCents };
}

// ─── Donaciones voluntarias ──────────────────────────────────────────────────

/** Las donaciones van 100% a la organización — la plataforma no retiene nada */
export const ORG_DONATION_RATIO = 1.0;
export const PLATFORM_DONATION_RATIO = 0.0;

/**
 * Las donaciones voluntarias son 100% para la org.
 * Se devuelve la misma firma que calculateFairSplit para consistencia.
 */
export function calculateDonationSplit(amountCents: number): {
  rescueOrgAmountCents: number;
  platformAmountCents: number;
} {
  return { rescueOrgAmountCents: amountCents, platformAmountCents: 0 };
}

/**
 * @deprecated Usar calculateDonationSplit — nombre más claro
 */
export const calculatePlanSplit = calculateDonationSplit;

/**
 * Valida que el monto de donación esté dentro de límites seguros.
 * Mín: $1 USD (100 centavos), Máx: $10,000 USD (1,000,000 centavos)
 */
export function validateDonationAmount(amountCents: number): boolean {
  return Number.isInteger(amountCents) && amountCents >= 100 && amountCents <= 1_000_000;
}

/**
 * Estima el fee de OnvoPay para mostrar al usuario si opta por cubrirlo.
 * Tarifa CR estimada: 3.5% + ₡150 colones (aprox $0.28 USD).
 * NOTA: confirmar tarifa exacta con OnvoPay antes de usar en producción.
 */
export function estimateOnvoPayFee(amountCents: number): number {
  return Math.ceil(amountCents * 0.035 + 28); // ~3.5% + $0.28
}
