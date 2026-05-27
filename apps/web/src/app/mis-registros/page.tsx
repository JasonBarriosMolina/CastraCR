'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { listMyRegistrations, cancelRegistration } from '@/lib/api';
import type { Registration } from '@castrar-cr/types';

const ESTADO_CONFIG: Record<string, { label: string; cls: string; icon: string }> = {
  confirmada:   { label: 'Confirmada',     cls: 'bg-green-100 text-green-700',  icon: '✓' },
  lista_espera: { label: 'Lista de espera', cls: 'bg-amber-100 text-amber-700',  icon: '⏳' },
  cancelada:    { label: 'Cancelada',       cls: 'bg-red-100 text-red-600',      icon: '✕' },
  completada:   { label: 'Completada',      cls: 'bg-brand-100 text-brand-700',  icon: '🎉' },
};

const API_READY = !!process.env['NEXT_PUBLIC_API_URL'];

export default function MisRegistrosPage() {
  const router = useRouter();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(API_READY);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState<string | null>(null);

  useEffect(() => {
    if (!API_READY) return;
    listMyRegistrations()
      .then(setRegistrations)
      .catch((err: unknown) => {
        const e = err as Error & { code?: string };
        if (e.code === 'UNAUTHORIZED') {
          router.push('/auth/login?redirect=/mis-registros');
          return;
        }
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleCancel = async (regId: string) => {
    if (!confirm('¿Seguro que deseas cancelar este registro?')) return;
    setCancelling(regId);
    try {
      await cancelRegistration(regId);
      setRegistrations((prev) =>
        prev.map((r) => (r.regId === regId ? { ...r, estado: 'cancelada' } : r)),
      );
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="md:-mx-4 md:-mt-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-cyan-500 px-6 pt-6 pb-6 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute bottom-0 -left-12 w-52 h-52 rounded-full bg-white/10" />
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-white/5" />
        <div className="max-w-md mx-auto relative text-center">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <span className="text-2xl" aria-hidden>🐾</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">CastraCR</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2">Mis Registros</h1>
          <p className="text-white/70 text-sm">Historial de campañas de esterilización</p>
        </div>
      </div>

      <div className="px-4 mt-4 max-w-2xl mx-auto space-y-4 pb-6">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">⚠️ {error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-40 skeleton" />)}
          </div>
        )}

        {/* Empty */}
        {!loading && registrations.length === 0 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-5xl">📋</span>
            </div>
            <p className="font-semibold text-slate-700 text-lg">Sin registros aún</p>
            <p className="text-slate-500 text-sm mt-1">Inscríbete en una campaña para comenzar.</p>
            <a href="/campanas" className="mt-5 btn-primary px-6 py-3 text-sm inline-block">
              Ver campañas
            </a>
          </div>
        )}

        {/* Registration cards */}
        {!loading && registrations.map((reg) => {
          const status = ESTADO_CONFIG[reg.estado] ?? { label: reg.estado, cls: 'bg-slate-100 text-slate-600', icon: '•' };
          return (
            <div key={reg.regId} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Color strip */}
              <div className={`h-1.5 ${reg.estado === 'confirmada' ? 'bg-gradient-to-r from-green-400 to-brand-400' : reg.estado === 'completada' ? 'bg-gradient-to-r from-brand-400 to-cyan-400' : 'bg-slate-100'}`} />

              <div className="p-5">
                {/* Status + date row */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${status.cls}`}>
                    {status.icon} {status.label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(reg.createdAt).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                {/* Pets */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mascotas</p>
                  <div className="flex flex-wrap gap-2">
                    {reg.pets.map((pet) => (
                      <span key={pet.petId} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-medium">
                        {pet.nombre}
                        <span className={`capitalize text-[10px] px-1.5 py-0.5 rounded-full ${pet.estadoCirugia === 'operado' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                          {pet.estadoCirugia}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                  {reg.estado === 'confirmada' && reg.qrToken && (
                    <button
                      onClick={() => setQrModal(reg.qrToken ?? null)}
                      className="flex items-center gap-1.5 bg-brand-50 text-brand-600 font-semibold text-xs px-4 py-2 rounded-xl hover:bg-brand-100 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3v-3m-6 6v-6m6 0h-2" />
                      </svg>
                      Ver QR
                    </button>
                  )}
                  {reg.estado === 'confirmada' && (
                    <button
                      onClick={() => handleCancel(reg.regId)}
                      disabled={cancelling === reg.regId}
                      className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 px-3 py-2"
                    >
                      {cancelling === reg.regId ? 'Cancelando…' : 'Cancelar registro'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* QR Modal */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setQrModal(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl animate-fade-up text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-slate-800 mb-1">Tu código QR</h3>
            <p className="text-xs text-slate-500 mb-5">Muéstralo en el check-in del evento</p>
            <div className="bg-slate-50 rounded-2xl p-4 inline-block mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrModal)}`}
                alt="QR de registro"
                width={180}
                height={180}
                className="rounded-lg"
              />
            </div>
            <p className="text-xs font-mono text-slate-400 mb-5">{qrModal.slice(0, 12)}…</p>
            <button
              onClick={() => setQrModal(null)}
              className="w-full btn-primary py-3 text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
