'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { listNearbyCampaigns } from '@/lib/api';
import type { Campaign } from '@castrar-cr/types';

const API_READY = !!process.env['NEXT_PUBLIC_API_URL'];

// Ciudades principales de Costa Rica como fallback de búsqueda
const CIUDADES_CR: Record<string, { lat: number; lng: number }> = {
  'San José':    { lat: 9.9281,  lng: -84.0907 },
  'Turrialba':   { lat: 9.9013,  lng: -83.6792 },
  'Cartago':     { lat: 9.8645,  lng: -83.9195 },
  'Heredia':     { lat: 9.9985,  lng: -84.1168 },
  'Alajuela':    { lat: 10.0159, lng: -84.2144 },
  'Liberia':     { lat: 10.6344, lng: -85.4400 },
  'Puntarenas':  { lat: 9.9760,  lng: -84.8364 },
  'Limón':       { lat: 9.9907,  lng: -83.0359 },
  'Pérez Zeledón': { lat: 9.3730, lng: -83.6578 },
  'Nicoya':      { lat: 10.1478, lng: -85.4516 },
};

export default function CampanasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(API_READY);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);

  useEffect(() => {
    if (!API_READY) return;
    if (!navigator.geolocation) {
      setLocationLabel('San José (por defecto)');
      setShowCityPicker(true);
      fetchCampaigns(9.9281, -84.0907);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationLabel('Tu ubicación actual');
        fetchCampaigns(coords.latitude, coords.longitude);
      },
      () => {
        // Usuario denegó o falló la geolocalización
        setLocationLabel('San José (por defecto)');
        setShowCityPicker(true);
        fetchCampaigns(9.9281, -84.0907);
      },
      { timeout: 8000 },
    );
  }, []);

  async function fetchCampaigns(lat: number, lng: number) {
    setLoading(true);
    try {
      const data = await listNearbyCampaigns(lat, lng);
      setCampaigns(data);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Error al cargar campañas');
    } finally {
      setLoading(false);
    }
  }

  function handleCitySelect(city: string) {
    const coords = CIUDADES_CR[city];
    if (!coords) return;
    setLocationLabel(city);
    setShowCityPicker(false);
    fetchCampaigns(coords.lat, coords.lng);
  }

  const filtered = campaigns.filter((c) =>
    c.titulo.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="md:-mx-4 md:-mt-6">
      {/* Header hero */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-cyan-500 px-6 pt-6 pb-6 relative overflow-hidden">
        {/* Círculos decorativos */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute bottom-0 -left-12 w-52 h-52 rounded-full bg-white/10" />
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-white/5" />

        <div className="max-w-md mx-auto relative text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 mb-4 group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-xl"
            aria-label="Volver al inicio de CastraCR"
          >
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-colors shadow-sm">
              <span className="text-2xl" aria-hidden>🐾</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">CastraCR</span>
          </Link>
          <h1 className="text-3xl font-extrabold text-white mb-2">Campañas cercanas</h1>
          <p className="text-white/70 text-sm">Campañas activas de esterilización cerca de ti</p>
        </div>
      </div>

      {/* Search bar + location overlapping hero */}
      <div className="px-4 mt-4 mb-4 max-w-2xl mx-auto md:max-w-5xl space-y-2">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filtrar por nombre de campaña…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-100 shadow-md rounded-2xl pl-11 pr-4 py-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all"
          />
        </div>

        {/* Indicador de ubicación + selector de ciudad */}
        {locationLabel && (
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-2.5 text-xs">
            <span className="text-slate-500 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Mostrando campañas cerca de <strong className="text-slate-700 ml-1">{locationLabel}</strong>
            </span>
            <button
              onClick={() => setShowCityPicker((v) => !v)}
              className="text-brand-600 font-semibold hover:text-brand-700 transition-colors focus:outline-none focus-visible:underline"
            >
              Cambiar
            </button>
          </div>
        )}

        {/* City picker dropdown */}
        {showCityPicker && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {Object.keys(CIUDADES_CR).map((city) => (
              <button
                key={city}
                onClick={() => handleCitySelect(city)}
                className={`text-xs font-medium px-3 py-2 rounded-xl border transition-all text-left ${
                  locationLabel === city
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'border-slate-100 text-slate-700 hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                📍 {city}
              </button>
            ))}
          </div>
        )}
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
