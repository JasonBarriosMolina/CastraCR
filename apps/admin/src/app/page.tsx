'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getPlatformStats } from '@/lib/api';
import type { PlatformStats } from '@/lib/api';

const API_READY = !!process.env['NEXT_PUBLIC_API_URL'];

function StatCard({
  label,
  value,
  sub,
  icon,
  loading,
  color = 'brand',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  loading: boolean;
  color?: 'brand' | 'green' | 'amber' | 'purple';
}) {
  const colors: Record<string, string> = {
    brand:  'bg-brand-50 text-brand-600',
    green:  'bg-green-50 text-green-600',
    amber:  'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="bg-white border rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${colors[color]}`}>{icon}</div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-gray-100 rounded-lg animate-pulse" />
      ) : (
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      )}
      {sub && !loading && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function AdminHomePage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(API_READY);

  useEffect(() => {
    if (!API_READY) return;
    getPlatformStats()
      .then(setStats)
      .catch(() => {/* silencioso — API puede no tener datos aún */})
      .finally(() => setLoading(false));
  }, []);

  const fmt = (cents: number) => {
    const dollars = cents / 100;
    return dollars >= 1000 ? `$${(dollars / 1000).toFixed(1)}k` : `$${dollars.toFixed(0)}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Panel de administración</h1>
        <p className="text-gray-600 mt-1">Gestiona campañas, registros y veterinarios</p>
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Resumen de la plataforma</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Campañas activas"
            value={stats?.campanasActivas ?? 0}
            sub={`${stats?.campanasBorrador ?? 0} en borrador`}
            icon="📋"
            loading={loading}
            color="green"
          />
          <StatCard
            label="Registros totales"
            value={stats?.totalRegistros ?? 0}
            sub={`${stats?.checkinHoy ?? 0} check-ins hoy`}
            icon="🐾"
            loading={loading}
            color="brand"
          />
          <StatCard
            label="Donaciones este mes"
            value={stats ? fmt(stats.totalDonacionesMes) : '$0'}
            sub={`${stats?.donacionesCount ?? 0} donaciones totales`}
            icon="💰"
            loading={loading}
            color="amber"
          />
          <StatCard
            label="Total recaudado"
            value={stats ? fmt(stats.totalDonaciones) : '$0'}
            icon="📈"
            loading={loading}
            color="purple"
          />
        </div>
      </div>

      {/* Quick nav */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Accesos rápidos</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { href: '/campanas',       icon: '📋', title: 'Mis Campañas',    desc: 'Ver y gestionar todas tus campañas' },
            { href: '/campanas/nueva', icon: '➕', title: 'Nueva Campaña',   desc: 'Crear una nueva campaña de esterilización' },
            { href: '/checkin',        icon: '📱', title: 'Check-in QR',     desc: 'Escanear QR para registrar asistencia' },
            { href: '/vets',           icon: '🩺', title: 'Veterinarios',    desc: 'Aprobar o rechazar solicitudes de vets' },
            { href: '/orgs',           icon: '🏠', title: 'Org Rescatistas', desc: 'Gestionar organizaciones de rescate' },
            { href: '/usuarios',       icon: '👥', title: 'Usuarios',        desc: 'Crear y gestionar cuentas de organizadores' },
          ].map((card) => (
            <Link key={card.href} href={card.href}>
              <div className="bg-white border rounded-2xl p-6 hover:shadow-md transition-shadow cursor-pointer space-y-3">
                <div className="text-3xl">{card.icon}</div>
                <h3 className="font-bold text-gray-900">{card.title}</h3>
                <p className="text-sm text-gray-600">{card.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
