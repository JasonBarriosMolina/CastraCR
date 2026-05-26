'use client';

import { useState, useEffect, useRef } from 'react';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? '';
const ONVOPAY_KEY = process.env['NEXT_PUBLIC_ONVOPAY_PUBLIC_KEY'] ?? '';

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

interface PayData {
  paymentToken: string;
  paymentIntentId: string;
  montoCRC: number;
  campTitulo: string;
  mascotas: { nombre: string; especie: string }[];
}

type PageState = 'loading' | 'ready' | 'paying' | 'success' | 'already_paid' | 'expired' | 'free' | 'error';

export default function PagarCitaPage({
  params,
}: {
  params: { appointmentId: string };
}) {
  const { appointmentId } = params;
  const [pageState, setPageState] = useState<PageState>('loading');
  const [payData, setPayData] = useState<PayData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<{ unmount: () => void } | null>(null);

  // Cargar OnvoPay JS SDK
  useEffect(() => {
    if (typeof window === 'undefined' || window.OnvoPay) return;
    const script = document.createElement('script');
    script.src = 'https://js.onvopay.com/v1/onvopay.js';
    script.async = true;
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch { /* ignore */ } };
  }, []);

  // Crear payment intent al montar
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${API}/appointments/${appointmentId}/pay-intent`, {
          method: 'POST',
        });
        const data = await res.json() as { error?: string; code?: string } & Partial<PayData>;

        if (!res.ok) {
          if (data.code === 'ALREADY_PAID') { setPageState('already_paid'); return; }
          if (data.code === 'EXPIRED')      { setPageState('expired');      return; }
          if (data.code === 'FREE_CAMPAIGN'){ setPageState('free');         return; }
          setErrorMsg(data.error ?? 'Error al cargar el pago');
          setPageState('error');
          return;
        }

        setPayData(data as PayData);
        setPageState('ready');
      } catch {
        setErrorMsg('No se pudo conectar. Verificá tu conexión.');
        setPageState('error');
      }
    };
    void init();
  }, [appointmentId]);

  // Montar widget cuando ready
  useEffect(() => {
    if (pageState !== 'ready' || !payData || !cardRef.current) return;

    const mount = () => {
      if (!window.OnvoPay) { setTimeout(mount, 300); return; }
      window.OnvoPay.init({ publicKey: ONVOPAY_KEY, locale: 'es' });
      widgetRef.current = window.OnvoPay.mount('#onvopay-cita-widget', {
        amount: payData.montoCRC,
        currency: 'CRC',
        paymentToken: payData.paymentToken,
        onSuccess: () => setPageState('success'),
        onError: ({ message }) => setErrorMsg(message ?? 'Error al procesar el pago'),
      });
    };
    mount();

    return () => { widgetRef.current?.unmount(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageState]);

  const formatCRC = (n: number) =>
    `₡${n.toLocaleString('es-CR')}`;

  // ── Estados de pantalla ───────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Cargando tu cita…</p>
        </div>
      </PageShell>
    );
  }

  if (pageState === 'already_paid') {
    return (
      <PageShell>
        <StatusCard
          icon="✅"
          iconBg="bg-green-100"
          title="¡Tu cita ya está confirmada!"
          subtitle="No es necesario volver a pagar. Te esperamos el día de la campaña."
          color="text-green-700"
        />
      </PageShell>
    );
  }

  if (pageState === 'expired') {
    return (
      <PageShell>
        <StatusCard
          icon="⏰"
          iconBg="bg-amber-100"
          title="Este link de pago venció"
          subtitle="El tiempo para pagar expiró. Contactá a la organización para reagendar tu cita."
          color="text-amber-700"
        />
      </PageShell>
    );
  }

  if (pageState === 'free') {
    return (
      <PageShell>
        <StatusCard
          icon="🎉"
          iconBg="bg-brand-50"
          title="Esta campaña es gratuita"
          subtitle="Tu cita ya está confirmada sin costo. ¡Te esperamos!"
          color="text-brand-600"
        />
      </PageShell>
    );
  }

  if (pageState === 'error') {
    return (
      <PageShell>
        <StatusCard
          icon="❌"
          iconBg="bg-red-100"
          title="Algo salió mal"
          subtitle={errorMsg}
          color="text-red-700"
        />
      </PageShell>
    );
  }

  if (pageState === 'success') {
    return (
      <PageShell>
        <div className="text-center py-6 space-y-4 animate-fade-up">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">¡Pago exitoso! 🐾</h1>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">
            Tu cita está confirmada. Recibirás el código QR por WhatsApp. Mostralo el día de la campaña.
          </p>
          <div className="bg-brand-50 rounded-2xl p-4 text-sm text-brand-700 font-medium">
            {payData && formatCRC(payData.montoCRC)} pagados · Pago seguro OnvoPay
          </div>
          <a href="/" className="btn-primary inline-block px-8 py-3 text-sm">
            Volver al inicio
          </a>
        </div>
      </PageShell>
    );
  }

  // pageState === 'ready' | 'paying'
  return (
    <PageShell>
      {payData && (
        <div className="space-y-5">

          {/* Resumen de la cita */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
            <h2 className="font-bold text-slate-800 text-base">{payData.campTitulo}</h2>
            <div className="space-y-2">
              {payData.mascotas.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <span>{m.especie === 'dog' ? '🐕' : m.especie === 'cat' ? '🐈' : '🐾'}</span>
                  <span className="font-medium">{m.nombre}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 flex justify-between items-center">
              <span className="text-slate-500 text-sm">Total a pagar</span>
              <span className="text-xl font-extrabold text-brand-600">{formatCRC(payData.montoCRC)}</span>
            </div>
          </div>

          {/* Aviso seguridad */}
          <div className="flex items-start gap-2 text-xs text-slate-500 px-1">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Pago 100% seguro procesado por OnvoPay. CastraCR no almacena datos de tu tarjeta.</span>
          </div>

          {/* Widget de pago OnvoPay */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-slate-700 mb-4">Información de pago</p>
            {errorMsg && (
              <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm mb-4">
                ⚠️ {errorMsg}
              </div>
            )}
            <div id="onvopay-cita-widget" ref={cardRef} className="min-h-[200px]">
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Cargando formulario de pago…
              </div>
            </div>
          </div>

        </div>
      )}
    </PageShell>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-600 to-cyan-500 px-4 pt-8 pb-6">
        <div className="max-w-lg mx-auto">
          <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-1">CastraCR</p>
          <h1 className="text-xl font-extrabold text-white">Pago de tu cita de esterilización</h1>
        </div>
      </div>
      <div className="px-4 py-6 max-w-lg mx-auto">{children}</div>
    </div>
  );
}

function StatusCard({
  icon, iconBg, title, subtitle, color,
}: {
  icon: string; iconBg: string; title: string; subtitle: string; color: string;
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center space-y-4">
      <div className={`w-20 h-20 ${iconBg} rounded-full flex items-center justify-center mx-auto text-4xl`}>
        {icon}
      </div>
      <h2 className={`text-xl font-bold ${color}`}>{title}</h2>
      <p className="text-slate-500 text-sm max-w-xs mx-auto">{subtitle}</p>
      <a href="/" className="btn-outline inline-block px-6 py-2 text-sm">Volver al inicio</a>
    </div>
  );
}
