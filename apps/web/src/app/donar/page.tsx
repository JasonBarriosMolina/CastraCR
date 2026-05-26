'use client';

import { useState, useEffect, useRef } from 'react';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? '';
const ONVOPAY_KEY = process.env['NEXT_PUBLIC_ONVOPAY_PUBLIC_KEY'] ?? '';

// Presets en CRC (colones)
const PRESET_AMOUNTS_CRC = [1_000, 2_000, 5_000, 10_000];

declare global {
  interface Window {
    OnvoPay?: {
      init: (opts: { publicKey: string; locale?: string }) => void;
      mount: (
        selector: string,
        opts: {
          amount: number;
          currency: string;
          paymentToken: string;
          onSuccess: (r: { paymentIntentId: string }) => void;
          onError: (e: { message: string }) => void;
        },
      ) => { unmount: () => void };
    };
  }
}

interface OrgRescatista {
  orgId: string;
  nombre: string;
  descripcion: string;
  logoUrl: string | null;
  donacionMaximaCRC: number;
}

export default function DonarPage() {
  const [orgs, setOrgs] = useState<OrgRescatista[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  useEffect(() => {
    fetch(`${API}/orgs/rescate`)
      .then((r) => r.json())
      .then((d: { orgs?: OrgRescatista[] }) => setOrgs(d.orgs ?? []))
      .catch(() => setOrgs([]))
      .finally(() => setLoadingOrgs(false));
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-600 via-brand-500 to-cyan-500 px-4 pt-8 pb-5 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10" />
        <div className="max-w-lg mx-auto relative">
          <span className="inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
            100% a la organización · CastraCR no cobra comisión
          </span>
          <h1 className="text-2xl font-extrabold text-white mb-2">Apoya la causa 💙</h1>
          <p className="text-white/80 text-sm max-w-sm">
            Cada donación ayuda a más mascotas a acceder a esterilización gratuita en Costa Rica.
            No tenés que querer castrar una mascota para donar.
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="px-4 mt-4 max-w-lg mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <span className="text-green-600 text-xl mt-0.5" aria-hidden>✅</span>
          <div className="text-sm text-green-800">
            <p className="font-bold mb-0.5">100% de tu donación llega a la organización</p>
            <p className="text-green-700 text-xs leading-relaxed">
              CastraCR no retiene ningún porcentaje. La organización rescatista recibe el monto íntegro.
              La única comisión es la de procesamiento de OnvoPay (~3.9%), que podés elegir cubrir vos mismo
              para que <strong>absolutamente todo</strong> llegue a su destino.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 mt-4 max-w-lg mx-auto">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Tu impacto</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { value: '2,400+', label: 'Mascotas esterilizadas' },
              { value: '40+',    label: 'Orgs apoyadas' },
              { value: '100%',   label: 'Trazabilidad' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xl font-extrabold text-brand-600">{s.value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="px-4 pb-8 mt-4 max-w-lg mx-auto">
        {!ONVOPAY_KEY ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center">
            <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <span className="text-4xl">🐾</span>
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">¡Próximamente!</h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto">
              Estamos preparando el sistema de donaciones para que sea seguro y transparente.
            </p>
          </div>
        ) : loadingOrgs ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center text-slate-500 text-sm">
            No hay organizaciones disponibles para recibir donaciones en este momento.
          </div>
        ) : (
          <DonationForm orgs={orgs} />
        )}
      </div>
    </div>
  );
}

function DonationForm({ orgs }: { orgs: OrgRescatista[] }) {
  const [selectedOrg, setSelectedOrg] = useState<OrgRescatista | null>(null);
  const [amountCRC, setAmountCRC] = useState<number>(PRESET_AMOUNTS_CRC[1]!);
  const [customAmount, setCustomAmount] = useState('');
  const [cubrimientoFee, setCubrimientoFee] = useState(false);
  const [step, setStep] = useState<'org' | 'amount' | 'pay' | 'success'>('org');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentToken, setPaymentToken] = useState('');
  const [montoFinal, setMontoFinal] = useState(0);
  const widgetRef = useRef<{ unmount: () => void } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const finalAmountCRC = customAmount ? parseInt(customAmount, 10) : amountCRC;
  const maxCRC = selectedOrg?.donacionMaximaCRC ?? 100_000;

  const formatCRC = (n: number) => `₡${n.toLocaleString('es-CR')}`;

  // Cargar SDK
  useEffect(() => {
    if (typeof window === 'undefined' || window.OnvoPay) return;
    const script = document.createElement('script');
    script.src = 'https://js.onvopay.com/v1/onvopay.js';
    script.async = true;
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch { /* ignore */ } };
  }, []);

  // Montar widget OnvoPay
  useEffect(() => {
    if (step !== 'pay' || !paymentToken || !cardRef.current) return;

    const mount = () => {
      if (!window.OnvoPay) { setTimeout(mount, 300); return; }
      window.OnvoPay.init({ publicKey: ONVOPAY_KEY, locale: 'es' });
      widgetRef.current = window.OnvoPay.mount('#onvopay-donation-widget', {
        amount: montoFinal,
        currency: 'CRC',
        paymentToken,
        onSuccess: () => setStep('success'),
        onError: ({ message }) => setError(message ?? 'Error al procesar el pago'),
      });
    };
    mount();
    return () => { widgetRef.current?.unmount(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, paymentToken]);

  const handleProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    if (finalAmountCRC < 500) { setError('El monto mínimo es ₡500'); return; }
    if (finalAmountCRC > maxCRC) { setError(`El monto máximo para esta org es ${formatCRC(maxCRC)}`); return; }

    setLoading(true); setError('');
    try {
      // Necesita JWT — si no tiene sesión, redirigir a login
      const token = typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>)['__authToken__'] as string | undefined
        : undefined;

      const res = await fetch(`${API}/donations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          montoCRC: finalAmountCRC,
          orgRescateId: selectedOrg.orgId,
          cubrimientoFee,
        }),
      });

      const data = await res.json() as {
        paymentToken?: string;
        montoCRC?: number;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? 'Error al iniciar el pago');
        return;
      }

      setPaymentToken(data.paymentToken ?? '');
      setMontoFinal(data.montoCRC ?? finalAmountCRC);
      setStep('pay');
    } catch {
      setError('No se pudo conectar. Verificá tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  // ── PASO: Éxito ──────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-10 text-center animate-fade-up space-y-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800">¡Gracias por tu apoyo! 💙</h2>
        <p className="text-slate-500 text-sm">
          Tu donación de <strong>{formatCRC(montoFinal)}</strong> llegará directamente a{' '}
          <strong>{selectedOrg?.nombre}</strong>.
        </p>
        <p className="text-xs text-slate-400">
          CastraCR no retiene ningún porcentaje. El 100% es para la organización rescatista.
        </p>
        <button
          onClick={() => {
            setStep('org'); setSelectedOrg(null);
            setAmountCRC(PRESET_AMOUNTS_CRC[1]!); setCustomAmount('');
            setCubrimientoFee(false); setPaymentToken(''); setMontoFinal(0);
          }}
          className="btn-outline px-6 py-2 text-sm"
        >
          Hacer otra donación
        </button>
      </div>
    );
  }

  // ── PASO: Pago ───────────────────────────────────────────────────────────────
  if (step === 'pay') {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800">Información de pago</h2>
            <button
              onClick={() => { setStep('amount'); widgetRef.current?.unmount(); }}
              className="text-xs text-brand-600 hover:underline"
            >
              ← Cambiar monto
            </button>
          </div>

          <div className="bg-brand-50 rounded-2xl px-4 py-3 text-sm flex justify-between mb-4">
            <span className="text-slate-600">Donación a <strong>{selectedOrg?.nombre}</strong></span>
            <span className="font-bold text-brand-600">{formatCRC(montoFinal)}</span>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm mb-4">
              ⚠️ {error}
            </div>
          )}

          <div id="onvopay-donation-widget" ref={cardRef} className="min-h-[180px]">
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm gap-2">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Cargando formulario de pago…
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Pago seguro · CastraCR no almacena datos de tu tarjeta
        </p>
      </div>
    );
  }

  // ── PASO: Monto ──────────────────────────────────────────────────────────────
  if (step === 'amount' && selectedOrg) {
    const presets = PRESET_AMOUNTS_CRC.filter((a) => a <= maxCRC);

    return (
      <form onSubmit={handleProceed} className="space-y-4">

        {/* Org seleccionada */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold tracking-wide">Donando a</p>
            <p className="font-bold text-slate-800">{selectedOrg.nombre}</p>
          </div>
          <button type="button" onClick={() => setStep('org')} className="text-xs text-brand-600 hover:underline">
            Cambiar
          </button>
        </div>

        {/* Presets */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Monto de donación
          </label>
          <div className="grid grid-cols-4 gap-2">
            {presets.map((a) => {
              const sel = amountCRC === a && !customAmount;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => { setAmountCRC(a); setCustomAmount(''); }}
                  className={`py-3 rounded-2xl text-sm font-bold border-2 transition-all ${
                    sel
                      ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                      : 'border-slate-100 bg-slate-50 text-slate-700 hover:border-brand-300'
                  }`}
                >
                  {formatCRC(a)}
                </button>
              );
            })}
          </div>

          {/* Monto personalizado */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">₡</span>
            <input
              type="number"
              placeholder="Otro monto"
              value={customAmount}
              onChange={(e) => { setCustomAmount(e.target.value); setAmountCRC(0); }}
              min="500"
              max={maxCRC}
              step="100"
              className="input-field pl-8"
              aria-label="Monto personalizado en colones"
            />
          </div>

          {maxCRC < 100_000 && (
            <p className="text-xs text-slate-400">
              Esta organización acepta donaciones de hasta {formatCRC(maxCRC)} por transacción.
            </p>
          )}

          {/* Toggle cubrir comisión */}
          <label className="flex items-start gap-3 cursor-pointer pt-1">
            <div className="relative mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                checked={cubrimientoFee}
                onChange={(e) => setCubrimientoFee(e.target.checked)}
                className="sr-only"
                aria-label="Cubrir comisión de procesamiento para que el 100% llegue a la organización"
              />
              <div className={`w-10 h-6 rounded-full transition-colors ${cubrimientoFee ? 'bg-brand-500' : 'bg-slate-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm absolute top-1 transition-transform ${cubrimientoFee ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Cubrir comisión de procesamiento (~3.9%)</p>
              <p className="text-xs text-slate-500 mt-0.5">Para que el 100% de tu donación llegue a {selectedOrg.nombre}</p>
            </div>
          </label>

          {/* Resumen */}
          <div className="bg-brand-50 rounded-2xl p-4 text-sm">
            <div className="flex justify-between text-slate-600 mb-1">
              <span>Tu donación</span>
              <span>{formatCRC(finalAmountCRC || amountCRC)}</span>
            </div>
            {cubrimientoFee && (
              <div className="flex justify-between text-slate-500 text-xs mb-1">
                <span>+ comisión OnvoPay</span>
                <span>~{formatCRC(Math.ceil((finalAmountCRC || amountCRC) * 0.039 + 215))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-800 border-t pt-2 mt-1">
              <span>Total a pagar</span>
              <span className="text-brand-600">
                {cubrimientoFee
                  ? formatCRC(Math.ceil(((finalAmountCRC || amountCRC) + 215) / (1 - 0.039)))
                  : formatCRC(finalAmountCRC || amountCRC)}
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (finalAmountCRC || amountCRC) < 500}
            aria-busy={loading}
            className="w-full btn-primary py-4 text-sm flex items-center justify-center gap-2 min-h-[52px]"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Preparando pago…
              </>
            ) : (
              `Continuar con ${formatCRC(finalAmountCRC || amountCRC)} 💙`
            )}
          </button>
        </div>
      </form>
    );
  }

  // ── PASO: Seleccionar org ─────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-600 px-1">
        Seleccioná la organización que querés apoyar:
      </p>
      {orgs.map((org) => (
        <button
          key={org.orgId}
          type="button"
          onClick={() => { setSelectedOrg(org); setStep('amount'); }}
          className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm p-5 text-left hover:border-brand-300 hover:shadow-md transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-400"
          aria-label={`Donar a ${org.nombre}`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {org.logoUrl
                ? <img src={org.logoUrl} alt={`Logo ${org.nombre}`} className="w-full h-full object-cover" />
                : <span className="text-2xl">🐾</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 text-base">{org.nombre}</p>
              {org.descripcion && (
                <p className="text-slate-500 text-xs mt-0.5 truncate">{org.descripcion}</p>
              )}
            </div>
            <svg className="w-5 h-5 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}
