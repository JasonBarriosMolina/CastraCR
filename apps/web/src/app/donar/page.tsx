'use client';

import { useState, useEffect, useRef } from 'react';
import { createDonationIntent } from '@/lib/api';

const ONVOPAY_KEY = process.env['NEXT_PUBLIC_ONVOPAY_PUBLIC_KEY'] ?? '';
const PRESET_AMOUNTS = [500, 1000, 2500, 5000]; // cents
const ORG_ID = process.env['NEXT_PUBLIC_DEMO_ORG_ID'] ?? 'demo-org';

// ─── OnvoPay types (minimal) ──────────────────────────────────────────────────
declare global {
  interface Window {
    OnvoPay?: {
      init: (options: { publicKey: string; locale?: string }) => void;
      mount: (
        selector: string,
        options: {
          amount: number;
          currency: string;
          paymentToken: string;
          onSuccess: (result: { paymentIntentId: string }) => void;
          onError: (error: { message: string }) => void;
        },
      ) => { unmount: () => void };
    };
  }
}

export default function DonarPage() {
  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-600 via-brand-500 to-cyan-500 px-4 pt-8 pb-4 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10" />
        <div className="max-w-lg mx-auto relative">
          <span className="inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
            100% a rescatistas y refugios
          </span>
          <h1 className="text-2xl font-extrabold text-white mb-2">Apoya la causa 💙</h1>
          <p className="text-white/75 text-sm max-w-sm">
            Cada donación ayuda a más mascotas a acceder a esterilización gratuita en Costa Rica.
          </p>
        </div>
      </div>

      {/* Impact stats */}
      <div className="px-4 mt-4 max-w-lg mx-auto mb-5">
        <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-5">
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

      {/* Donation form */}
      <div className="px-4 pb-6 max-w-lg mx-auto">
        {ONVOPAY_KEY ? (
          <DonationForm />
        ) : (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center">
            <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <span className="text-4xl">🐾</span>
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">¡Próximamente!</h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto">
              En breve podrás darle una ayuda a un animalito que lo necesita. Estamos preparando el
              sistema de donaciones para que sea seguro y transparente.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-brand-500 text-sm font-semibold">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Muy pronto disponible
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DonationForm() {
  const [amount, setAmount]           = useState(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [coverFee, setCoverFee]       = useState(false);
  const [step, setStep]               = useState<'amount' | 'pay' | 'success'>('amount');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [paymentToken, setPaymentToken] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const cardMountRef = useRef<HTMLDivElement>(null);
  const widgetRef    = useRef<{ unmount: () => void } | null>(null);

  const finalAmount = customAmount ? Math.round(parseFloat(customAmount) * 100) : amount;

  // Load OnvoPay script
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.OnvoPay) return;
    const script = document.createElement('script');
    script.src = 'https://js.onvopay.com/v1/onvopay.js';
    script.async = true;
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  // Mount card widget when step = 'pay' and paymentToken is ready
  useEffect(() => {
    if (step !== 'pay' || !paymentToken || !cardMountRef.current) return;
    if (!window.OnvoPay) {
      setError('OnvoPay no está disponible. Recarga la página.');
      return;
    }
    window.OnvoPay.init({ publicKey: ONVOPAY_KEY, locale: 'es' });

    widgetRef.current = window.OnvoPay.mount('#onvopay-card-element', {
      amount: finalAmount,
      currency: 'USD',
      paymentToken,
      onSuccess: ({ paymentIntentId: pid }) => {
        setPaymentIntentId(pid);
        setStep('success');
      },
      onError: ({ message }) => {
        setError(message ?? 'Error al procesar el pago');
        setLoading(false);
      },
    });

    return () => { widgetRef.current?.unmount(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, paymentToken]);

  const handleProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (finalAmount < 100) { setError('El monto mínimo es $1.00'); return; }
    setLoading(true); setError('');
    try {
      const res = await createDonationIntent({
        monto: finalAmount,
        orgRescateId: ORG_ID,
        cubrimientoDeFee: coverFee,
      });
      setPaymentToken(res.paymentToken);
      setStep('pay');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-10 text-center animate-fade-up">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">¡Gracias por tu apoyo! 💙</h2>
        <p className="text-slate-500 text-sm mb-2">
          Tu donación llegará directamente a las organizaciones rescatistas.
        </p>
        {paymentIntentId && (
          <p className="text-xs text-slate-400 mb-6 font-mono">Ref: {paymentIntentId.slice(0, 16)}…</p>
        )}
        <a href="/" className="btn-primary px-8 py-3 text-sm inline-block">Volver al inicio</a>
      </div>
    );
  }

  if (step === 'pay') {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Información de pago</h2>
          <button
            onClick={() => { setStep('amount'); widgetRef.current?.unmount(); }}
            className="text-xs text-brand-600 hover:underline"
          >
            ← Cambiar monto
          </button>
        </div>

        <div className="bg-brand-50 rounded-2xl px-4 py-3 text-sm flex justify-between">
          <span className="text-slate-600">Total a donar</span>
          <span className="font-bold text-brand-600">${(finalAmount / 100).toFixed(2)}</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* OnvoPay mounts here */}
        <div id="onvopay-card-element" ref={cardMountRef} className="min-h-[180px]">
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando formulario de pago…
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Pago seguro procesado por OnvoPay
        </p>
      </div>
    );
  }

  // step === 'amount'
  return (
    <form onSubmit={handleProceed} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-5">
      {/* Preset amounts */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
          Monto de donación
        </label>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {PRESET_AMOUNTS.map((a) => {
            const selected = amount === a && !customAmount;
            return (
              <button
                key={a}
                type="button"
                onClick={() => { setAmount(a); setCustomAmount(''); }}
                className={`py-3 rounded-2xl text-sm font-bold border-2 transition-all ${
                  selected
                    ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                    : 'border-slate-100 bg-slate-50 text-slate-700 hover:border-brand-300'
                }`}
              >
                ${(a / 100).toFixed(0)}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">$</span>
          <input
            type="number"
            placeholder="Otro monto"
            value={customAmount}
            onChange={(e) => { setCustomAmount(e.target.value); setAmount(0); }}
            min="1"
            step="0.01"
            className="input-field pl-8"
          />
        </div>
      </div>

      {/* Cover fee toggle */}
      <label className="flex items-start gap-3 cursor-pointer">
        <div className="relative mt-0.5">
          <input
            type="checkbox"
            checked={coverFee}
            onChange={(e) => setCoverFee(e.target.checked)}
            className="sr-only"
          />
          <div className={`w-10 h-6 rounded-full transition-colors ${coverFee ? 'bg-brand-500' : 'bg-slate-200'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow-sm absolute top-1 transition-transform ${coverFee ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">Cubrir comisión de procesamiento</p>
          <p className="text-xs text-slate-500 mt-0.5">Para que el 100% de tu donación llegue a su destino</p>
        </div>
      </label>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Summary */}
      <div className="bg-brand-50 rounded-2xl p-4 text-sm">
        <div className="flex justify-between font-bold text-slate-800">
          <span>Total a donar</span>
          <span className="text-brand-600">${((finalAmount || amount) / 100).toFixed(2)}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || (finalAmount || amount) < 100}
        className="w-full btn-primary py-4 text-sm flex items-center justify-center gap-2"
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
          `Continuar con $${((finalAmount || amount) / 100).toFixed(2)} 💙`
        )}
      </button>

      <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Pago seguro procesado por OnvoPay
      </p>
    </form>
  );
}
