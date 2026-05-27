import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CastraCR',
    short_name: 'CastraCR',
    description: 'Campañas de esterilización de mascotas en Costa Rica',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#06b6d4',
    orientation: 'portrait-primary',
    categories: ['health', 'lifestyle'],
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Campañas', url: '/campanas', description: 'Ver campañas de esterilización' },
      { name: 'Mis mascotas', url: '/mis-mascotas', description: 'Gestionar mis mascotas' },
      { name: 'Donar', url: '/donar', description: 'Donar a organizaciones rescatistas' },
    ],
  };
}
