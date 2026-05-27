import { fetchAuthSession } from 'aws-amplify/auth';
import type { Campaign, PetProfile, Registration, Donation } from '@castrar-cr/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? '';

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error('API no configurada. Agrega NEXT_PUBLIC_API_URL en .env.local');

  const authHeaders = await getAuthHeader();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
  });

  if (res.status === 401 || res.status === 403) {
    const err = new Error('Debes iniciar sesión para ver esta página.');
    (err as Error & { code: string }).code = 'UNAUTHORIZED';
    throw err;
  }

  const text = await res.text();
  let json: { data?: T; error?: string; code?: string; message?: string };
  try {
    json = JSON.parse(text) as { data?: T; error?: string; code?: string; message?: string };
  } catch {
    throw new Error(`Error del servidor (${res.status})`);
  }

  if (!res.ok) {
    const msg = json.error ?? json.message ?? `Error HTTP ${res.status}`;
    const err = new Error(msg);
    (err as Error & { code?: string; status?: number }).status = res.status;
    if (json.code) (err as Error & { code?: string }).code = json.code as string;
    throw err;
  }
  return json.data as T;
}

// Campaigns
export async function listNearbyCampaigns(lat: number, lng: number): Promise<Campaign[]> {
  // El CDK define la ruta como GET /campaigns (no /campaigns/nearby)
  const result = await apiFetch<{ campaigns: Campaign[] }>(`/campaigns?lat=${lat}&lng=${lng}`);
  return result.campaigns;
}

export async function getCampaign(id: string): Promise<Campaign> {
  const result = await apiFetch<{ campaign: Campaign }>(`/campaigns/${id}`);
  return result.campaign;
}

// Pets
export async function listMyPets(): Promise<PetProfile[]> {
  const result = await apiFetch<{ pets: PetProfile[] }>('/pets');
  return result.pets;
}

export async function createPet(data: Omit<PetProfile, 'petId' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<{ petId: string }> {
  return apiFetch('/pets', { method: 'POST', body: JSON.stringify(data) });
}

export async function getPet(id: string): Promise<PetProfile> {
  const result = await apiFetch<{ pet: PetProfile }>(`/pets/${id}`);
  return result.pet;
}

export async function getUploadUrl(
  petId: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string; cdnUrl: string }> {
  const encoded = encodeURIComponent(contentType);
  return apiFetch(`/pets/${petId}/upload-url?contentType=${encoded}`, { method: 'POST', body: '{}' });
}

export async function updatePetPhoto(petId: string, s3Key: string): Promise<{ cdnUrl: string }> {
  return apiFetch(`/pets/${petId}/photo`, { method: 'PUT', body: JSON.stringify({ s3Key }) });
}

// Registrations
export async function listMyRegistrations(): Promise<Registration[]> {
  const result = await apiFetch<{ registrations: Registration[] }>('/registrations');
  return result.registrations;
}

export async function createRegistration(data: {
  campaignId: string;
  slotId: string;
  venueId: string;
  petIds: string[];
}): Promise<{ regId: string; qrToken: string; estado: string }> {
  return apiFetch('/registrations', { method: 'POST', body: JSON.stringify(data) });
}

export async function cancelRegistration(id: string): Promise<void> {
  await apiFetch(`/registrations/${id}/cancel`, { method: 'POST' });
}

// Donations
export async function createDonationIntent(data: {
  monto: number;
  orgRescateId: string;
  campaignId?: string;
  cubrimientoDeFee?: boolean;
}): Promise<{ paymentToken: string; paymentIntentId: string; amount: number }> {
  return apiFetch('/donations', { method: 'POST', body: JSON.stringify(data) });
}

export async function listMyDonations(): Promise<Donation[]> {
  const result = await apiFetch<{ donations: Donation[] }>('/donations');
  return result.donations;
}

// Screening de mascotas
export interface ScreeningResult {
  nombre?: string;
  especie?: string;
  sexo?: string;
  pesoKg?: number;
  edadMeses?: number;
  condicionSaludRaw?: string;
  vacunasAlDia?: boolean;
  tratamientosActivos?: string;
  estadoReproductivo?: string;
  criptorquidismo?: boolean;
  aptoCirugia: boolean;
  razonRechazo?: string;
  alertasVet: string[];
}

export interface ScreeningAudioResponse {
  extracted: ScreeningResult;
  aptoCirugia: boolean;
  alertasVet: string[];
  razonRechazo?: string;
}

export async function updatePet(petId: string, data: Partial<ScreeningResult> & Record<string, unknown>): Promise<void> {
  await apiFetch(`/pets/${petId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function submitScreeningAudio(
  petId: string,
  audioBlob: Blob,
  petContext?: { nombre?: string; especie?: string; sexo?: string },
): Promise<ScreeningAudioResponse> {
  // Convertir blob a base64
  const arrayBuffer = await audioBlob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]!);
  const audioBase64 = btoa(binary);

  const result = await apiFetch<ScreeningAudioResponse>(`/pets/${petId}/screening-audio`, {
    method: 'POST',
    body: JSON.stringify({
      audioBase64,
      mediaType: audioBlob.type || 'audio/webm',
      ...petContext,
    }),
  });
  return result;
}
