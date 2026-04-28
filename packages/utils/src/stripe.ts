import type { OrgPlan } from '@castrar-cr/types';

export const PLAN_PRICE_IDS: Record<OrgPlan, Record<string, string>> = {
  starter: {
    dev: 'price_starter_dev',
    staging: 'price_starter_staging',
    prod: 'price_starter_prod',
  },
  pro: {
    dev: 'price_pro_dev',
    staging: 'price_pro_staging',
    prod: 'price_pro_prod',
  },
  ong: {
    dev: 'price_ong_dev',
    staging: 'price_ong_staging',
    prod: 'price_ong_prod',
  },
};

/**
 * Calculates the split for a plan payment.
 * 50% goes to rescue org, 50% to castrar.cr
 */
export function calculatePlanSplit(amountCents: number): {
  rescueOrgAmountCents: number;
  platformAmountCents: number;
} {
  const rescueOrgAmountCents = Math.round(amountCents * 0.5);
  const platformAmountCents = amountCents - rescueOrgAmountCents;
  return { rescueOrgAmountCents, platformAmountCents };
}

/**
 * Validates that donation amount is within safe bounds.
 * Min: $1 USD, Max: $10,000 USD
 */
export function validateDonationAmount(amountCents: number): boolean {
  return amountCents >= 100 && amountCents <= 1_000_000;
}

/**
 * Calculates Stripe fee to pass on (if user chooses to cover it).
 * Stripe CR fee: 2.9% + $0.30
 */
export function calculateStripeFee(amountCents: number): number {
  return Math.ceil(amountCents * 0.029 + 30);
}
