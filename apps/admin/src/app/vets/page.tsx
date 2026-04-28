'use client';

import { useState, useEffect } from 'react';
import { listVets, approveVet } from '@/lib/api';

interface VetItem {
  vetId: string;
  nombre: string;
  colegiatura: string;
  especialidad?: string;
  estado: string;
  createdAt: string;
}

const API_READY = !!process.env['NEXT_PUBLIC_API_URL'];

export default function VetsPage() {
  const [vets, setVets] = useState<VetItem[]>([]);
  const [loading, setLoading] = useState(API_READY);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [tab, setTab] = useState<'pendiente' | 'aprobado' | 'rechazado'>('pendiente');

  useEffect(() => {
    if (!API_READY) return;
    setLoading(true);
    listVets(tab)
      .then((data) => setVets(data as VetItem[]))
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [tab]);

  const handleApprove = async (vetId: string, estado: 'aprobado' | 'rechazado') => {
    setProcessing(vetId);
    try {
      await approveVet(vetId, estado);
      setVets((prev) => prev.filter((v) => v.vetId !== vetId));
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Veterinarios</h1>
        <p className="text-gray-600 mt-1">Gestiona solicitudes de veterinarios</p>
      </div>

      <div className="flex gap-2">
        {(['pendiente', 'aprobado', 'rechazado'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-brand-600 text-white' : 'border text-gray-600 hover:border-gray-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : vets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No hay veterinarios en estado &quot;{tab}&quot;.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vets.map((vet) => (
            <div key={vet.vetId} className="bg-white border rounded-2xl p-5 flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-bold text-gray-900">{vet.nombre}</p>
                <p className="text-sm text-gray-600">Colegiatura: {vet.colegiatura}</p>
                {vet.especialidad && <p className="text-xs text-gray-500">{vet.especialidad}</p>}
                <p className="text-xs text-gray-400">Solicitó el {new Date(vet.createdAt).toLocaleDateString('es-CR')}</p>
              </div>
              {tab === 'pendiente' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(vet.vetId, 'aprobado')}
                    disabled={processing === vet.vetId}
                    className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    ✓ Aprobar
                  </button>
                  <button
                    onClick={() => handleApprove(vet.vetId, 'rechazado')}
                    disabled={processing === vet.vetId}
                    className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    ✕ Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
