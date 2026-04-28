import { fetchAuthSession } from 'aws-amplify/auth';
import type { Campaign, Registration } from '@castrar-cr/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? '';

async function getAuthHeader(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('No autenticado');
  return { Authorization: `Bearer ${token}` };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error('API no configurada');
  const authHeaders = await getAuthHeader();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
  });

  const text = await res.text();
  let json: { data?: T; error?: string };
  try {
    json = JSON.parse(text) as { data?: T; error?: string };
  } catch {
    throw new Error(`Error del servidor (${res.status})`);
  }
  if (!res.ok) throw new Error(json.error ?? 'Error desconocido');
  return json.data as T;
}

// Campaigns
export async function listMyCampaigns(): Promise<Campaign[]> {
  const result = await apiFetch<{ campaigns: Campaign[] }>('/admin/campaigns');
  return result.campaigns;
}

export async function createCampaign(data: {
  titulo: string;
  descripcion: string;
  orgRescateId: string;
  fechaInicio: string;
  fechaFin: string;
}): Promise<{ campaignId: string }> {
  return apiFetch('/campaigns', { method: 'POST', body: JSON.stringify(data) });
}

export async function getCampaign(id: string): Promise<Campaign> {
  const result = await apiFetch<{ campaign: Campaign }>(`/campaigns/${id}`);
  return result.campaign;
}

export async function updateCampaign(id: string, data: Record<string, unknown>): Promise<void> {
  await apiFetch(`/admin/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function publishCampaign(id: string): Promise<void> {
  await apiFetch(`/admin/campaigns/${id}/publish`, { method: 'POST' });
}

// Registrations (for check-in)
export async function scanQR(qrToken: string): Promise<{ registration: Registration }> {
  return apiFetch('/checkin/scan', { method: 'POST', body: JSON.stringify({ qrToken }) });
}

// Vets
export interface ApprovedVet {
  vetId: string;
  nombre: string;
  colegiatura: string;
  especialidad?: string;
  estado: string;
}

export async function listVets(estado = 'pendiente'): Promise<unknown[]> {
  const result = await apiFetch<{ vets: unknown[] }>(`/vets?estado=${estado}`);
  return result.vets;
}

export async function listApprovedVets(): Promise<ApprovedVet[]> {
  const result = await apiFetch<{ vets: ApprovedVet[] }>('/vets?estado=aprobado');
  return result.vets;
}

export interface PlatformStats {
  totalDonaciones: number;
  donacionesCount: number;
  campanasActivas: number;
  campanasBorrador: number;
  totalRegistros: number;
  checkinHoy: number;
  totalDonacionesMes: number;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const result = await apiFetch<{ stats: PlatformStats }>('/impact');
  return result.stats;
}

export async function approveVet(vetId: string, estado: 'aprobado' | 'rechazado'): Promise<void> {
  await apiFetch(`/vets/${vetId}/approve`, { method: 'POST', body: JSON.stringify({ estado }) });
}

// Orgs rescatistas
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
}

export interface OrgRescatistaInput {
  nombre: string;
  email: string;
  telefono?: string;
  descripcion?: string;
  sinpeMovil?: string;
  iban?: string;
  nombreBanco?: string;
}

export async function listOrgs(): Promise<OrgRescatista[]> {
  const result = await apiFetch<{ orgs: OrgRescatista[] }>('/admin/orgs');
  return result.orgs;
}

export async function createOrg(data: OrgRescatistaInput): Promise<{ orgId: string }> {
  return apiFetch('/admin/orgs', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateOrg(orgId: string, data: Partial<OrgRescatistaInput>): Promise<void> {
  await apiFetch(`/admin/orgs/${orgId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// Users (SuperAdmin only)
export interface OrgUser {
  userId: string;
  email: string;
  nombre: string;
  confirmado: boolean;
  createdAt: string;
}

export async function createOrganizador(nombre: string, email: string): Promise<OrgUser> {
  return apiFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ nombre, email, group: 'Organizador' }),
  });
}

export async function listOrganizadores(): Promise<OrgUser[]> {
  const result = await apiFetch<{ users: OrgUser[] }>('/admin/users?group=Organizador');
  return result.users;
}
