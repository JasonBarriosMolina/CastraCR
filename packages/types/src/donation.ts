export type DonationType = 'plan' | 'voluntaria';
export type DonationStatus = 'pendiente' | 'completada' | 'fallida' | 'reembolsada';

export interface Donation {
  donationId: string;
  /**
   * Monto en CRC (colones). Sin decimales — ₡5,000 = 5000.
   * 100% va a la org rescatista. La plataforma no retiene nada.
   */
  montoCRC: number;
  tipo: DonationType;
  userId?: string;        // opcional — donantes anónimos
  campaignId?: string;
  orgRescateId: string;
  onvoPayEventId: string; // era stripeEventId, renombrado
  estado: DonationStatus;
  cubrimientoFee: boolean; // true = el donante cubrió la comisión de OnvoPay
  createdAt: string;
}

export interface CreateDonationInput {
  /** Monto en CRC. Debe estar entre ₡500 y donacionMaxima de la org. */
  montoCRC: number;
  campaignId?: string;
  orgRescateId: string;
  cubrimientoFee?: boolean;
}
