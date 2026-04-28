'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { listNearbyCampaigns } from '@/lib/api';
import type { Campaign } from '@castrar-cr/types';

const API_READY = !!process.env['NEXT_PUBLIC_API_URL'];

export default function CampanasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(API_READY);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!API_READY) return;
    if (!navigator.geolocation) {
      fetchCampaigns(9.9281, -84.0907);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => fetchCampaigns(coords.latitude, coords.longitude),
      () => fetchCampaigns(9.9281, -84.0907),
    );
  }, []);

  async function fetchCampaigns(lat: number, lng: number) {
    try {
      const data = await listNearbyCampaigns(lat, lng);
      setCampaigns(data);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Error al cargar campañas');
    } finally {
      setLoading(false);
    }
  }

  const filtered = campaigns.filter((c) =>
    c.titulo.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      {/* Header hero */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-500 px-4 pt-8 pb-10">
        <div className="max-w-2xl mx-auto">
          <p className="text-brand-100 text-xs font-semibold mb-1 uppercase tracking-widest">Costa Rica</p>
          <h1 className="text-2xl font-extrabold text-white mb-1">Campañas cercanas</h1>
          <p className="text-brand-100 text-sm">Campañas activas de esterilización cerca de ti</p>
        </div>
      </div>

      {/* Search bar overlapping hero */}
      <div className="px-4 -mt-7 mb-5 max-w-2xl mx-auto md:max-w-5xl">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar campaña…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-100 shadow-md rounded-2xl pl-11 pr-4 py-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all"
          />
        </div>
      </div>

      <div className="px-4 max-w-2xl mx-auto md:max-w-5xl space-y-4 pb-4">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">
            ⚠️ {error}
          </div>
        )}

        {loading && (
          <div className="grid md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-44 skeleton" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🔍</span>
            </div>
            <p className="font-semibold text-slate-700 text-lg">Sin campañas cercanas</p>
            <p className="text-slate-500 text-sm mt-1">Vuelve pronto o amplía tu área de búsqueda.</p>
          </div>
        )}

        {!loading && (
          <div className="grid md:grid-cols-2 gap-4">
            {filtered.map((campaign) => (
              <CampaignCard key={campaign.campaignId} campaign={campaign} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const availableSlots = campaign.venues?.reduce((sum, v) => sum + (v.cuposDisponibles ?? 0), 0) ?? 0;
  const isFull = availableSlots === 0;

  return (
    <Link href={`/campanas/${campaign.campaignId}`} className="block group">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-brand-400 to-cyan-400" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h2 className="font-bold text-slate-800 text-sm leading-snug group-hover:text-brand-600 transition-colors">
              {campaign.titulo}
            </h2>
            <span className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full ${
              isFull ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
            }`}>
              {isFull ? 'Lista espera' : 'Activa'}
            </span>
          </div>

          {campaign.descripcion && (
            <p className="text-xs text-slate-500 line-clamp-2 mb-3">{campaign.descripcion}</p>
          )}

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(campaign.fechaInicio).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}
            </span>
            {campaign.venues?.[0] && (
              <span className="flex items-center gap-1 truncate">
                <svg className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <span className="truncate">{campaign.venues[0].nombre}</span>
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              {isFull ? '⏳ Sin cupos' : `🎫 ${availableSlots} cupos`}
            </span>
            <span className="text-brand-500 text-xs font-semibold group-hover:translate-x-1 transition-transform inline-block">
              Ver →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
