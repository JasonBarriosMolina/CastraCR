export type UserRole = 'SuperAdmin' | 'Organizador' | 'Veterinario' | 'Dueno';

export interface UserProfile {
  userId: string;
  nombre: string;
  email: string;
  telefono?: string;
  rol: UserRole;
  ubicacionGeohash?: string;
  cognitoSub: string;
  createdAt: string;
  updatedAt: string;
}
