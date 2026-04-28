'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { listMyCampaigns, publishCampaign } from '@/lib/api';
import type { Campaign } from '@castrar-cr/types';

const API_READY = !!process.env['NEXT_PUBLIC_API_URL'];

const estadoStyle: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-700',
  activa: 'bg-green-100 text-green-700',
  finalizada: 'bg-blue-100 text-blue-700',
  cancelada: 'bg-red-100 text-red-700',
};

export default function AdminCampanasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(API_READY);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!API_READY) return;
    listMyCampaigns()
      .then(setCampaigns)
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handlePublish = async (campaignId: string) => {
    setPublishing(campaignId);
    try {
      await publishCampaign(campaignId);
      setCampaigns((prev) =>
        prev.map((c) => (c.campaignId === campaignId ? { ...c, estado: 'activa' } : c)),
      );
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Campañas</h1>
          <p className="text-gray-600 mt-1">Todas tus campañas de esterilización</p>
        </div>
        <Link
          href="/campanas/nueva"
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          + Nueva campaña
        </Link>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-5xl mb-4">📋</div>
          <p>No tienes campañas aún.</p>
          <Link href="/campanas/nueva" className="text-brand-600 font-medium mt-2 block">Crear tu primera campaña →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.campaignId} className="bg-white border rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-bold text-gray-900">{c.titulo}</h2>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${estadoStyle[c.estado] ?? 'bg-gray-100 text-gray-700'}`}>
                    {c.estado}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  📅 {new Date(c.fechaInicio).toLocaleDateString('es-CR')} ·{' '}
                  {c.venues?.length ?? 0} sede(s) · {c.slots?.length ?? 0} turno(s)
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href={`/campanas/${c.campaignId}`}
                  className="text-sm text-brand-600 hover:underline font-medium"
                >
                  Gestionar
                </Link>
                {c.estado === 'borrador' && (
                  <button
                    onClick={() => handlePublish(c.campaignId)}
                    disabled={publishing === c.campaignId}
                    className="text-sm bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {publishing === c.campaignId ? '…' : 'Publicar'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
