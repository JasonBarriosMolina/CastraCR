export type DonationType = 'plan' | 'voluntaria';
export type DonationStatus = 'pendiente' | 'completada' | 'fallida' | 'reembolsada';

export interface Donation {
  donationId: string;
  monto: number; // in cents
  tipo: DonationType;
  userId: string;
  campaignId?: string;
  orgRescateId: string;
  stripeEventId: string;
  estado: DonationStatus;
  createdAt: string;
}

export interface CreateDonationInput {
  monto: number;
  campaignId?: string;
  orgRescateId: string;
  cubrimientoDeFee?: boolean;
}
