'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { scanQR } from '@/lib/api';
import { fetchAuthSession } from 'aws-amplify/auth';

// ─── QR Camera Scanner Modal ──────────────────────────────────────────────────
function QrScannerModal({ onScan, onClose }: { onScan: (token: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<import('@zxing/browser').BrowserQRCodeReader | null>(null);
  const [camError, setCamError] = useState('');

  const stopReader = useCallback(() => {
    try {
      // BrowserQRCodeReader exposes controls via the returned object from decodeFromVideoDevice
      const controls = (readerRef as React.MutableRefObject<{ stop?: () => void } | null>).current;
      controls?.stop?.();
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 300,
        });

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, error) => {
            if (result && !cancelled) {
              cancelled = true;
              controls?.stop();
              onScan(result.getText());
            }
            void error; // non-fatal decode misses are expected
          },
        );
        // Store controls for cleanup
        (readerRef as React.MutableRefObject<typeof controls | null>).current = controls;
      } catch (err: unknown) {
        if (!cancelled) setCamError((err as Error).message ?? 'No se pudo acceder a la cámara.');
      }
    })();

    return () => {
      cancelled = true;
      stopReader();
    };
  }, [onScan, stopReader]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escáner QR"
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <span className="text-white font-semibold text-base">Apuntá al código QR</span>
        <button
          onClick={() => { stopReader(); onClose(); }}
          aria-label="Cerrar cámara"
          className="text-white p-2 rounded-xl hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Video */}
      <div className="flex-1 relative flex items-center justify-center">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
          autoPlay
        />
        {/* Viewfinder overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 relative">
            {/* corners */}
            {(['tl','tr','bl','br'] as const).map((c) => (
              <div key={c} className={`absolute w-8 h-8 border-brand-400 border-4
                ${c === 'tl' ? 'top-0 left-0 border-r-0 border-b-0 rounded-tl-lg' : ''}
                ${c === 'tr' ? 'top-0 right-0 border-l-0 border-b-0 rounded-tr-lg' : ''}
                ${c === 'bl' ? 'bottom-0 left-0 border-r-0 border-t-0 rounded-bl-lg' : ''}
                ${c === 'br' ? 'bottom-0 right-0 border-l-0 border-t-0 rounded-br-lg' : ''}
              `} />
            ))}
            {/* scan line */}
            <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-brand-400 opacity-80 animate-pulse" />
          </div>
        </div>
      </div>

      {camError && (
        <div className="px-4 py-3 bg-red-900 text-red-100 text-sm text-center">
          ⚠️ {camError}
        </div>
      )}

      <div className="px-4 py-4 bg-black/80 text-center text-gray-400 text-sm">
        Mantené el QR dentro del recuadro
      </div>
    </div>
  );
}

interface PetCheckin {
  petId: string;
  nombre: string;
  estadoCirugia: string;
  alertasVet?: string[];
  especie?: string;
  sexo?: string;
  pesoKg?: number;
  edadAnios?: number;
  edadMeses?: number;
  vacunasAlDia?: boolean;
  tratamientosActivos?: string;
  condicionSalud?: string;
  criptorquidismo?: boolean;
  estadoReproductivo?: string;
}

interface CheckinResult {
  regId: string;
  campaignId: string;
  checkedInAt?: string;
  pets: PetCheckin[];
}

export default function CheckinPage() {
  const [qrToken, setQrToken] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);

  // Detectar si hay cámara disponible
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        setHasCamera(devices.some((d) => d.kind === 'videoinput'));
      }).catch(() => {});
    }
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanning(true);
    setError('');
    setResult(null);
    try {
      const data = await scanQR(qrToken.trim());
      setResult(data.registration as CheckinResult);
      setQrToken('');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const handleCameraScan = async (token: string) => {
    setCameraOpen(false);
    setScanning(true);
    setError('');
    setResult(null);
    try {
      const data = await scanQR(token.trim());
      setResult(data.registration as CheckinResult);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const totalAlertas = result?.pets.flatMap((p) => p.alertasVet ?? []) ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      {cameraOpen && (
        <QrScannerModal onScan={handleCameraScan} onClose={() => setCameraOpen(false)} />
      )}

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Check-in QR</h1>
        <p className="text-gray-600 mt-1">Escaneá el código QR del registro para confirmar asistencia</p>
      </div>

      {/* ── SCAN CON CÁMARA ── */}
      {hasCamera && (
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={scanning}
          className="w-full flex items-center justify-center gap-3 bg-brand-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-brand-700 active:scale-95 transition-all disabled:opacity-50 min-h-[64px] shadow-sm"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Escanear QR con cámara
        </button>
      )}

      {/* ── FORM MANUAL ── */}
      <form onSubmit={handleScan} className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="space-y-2">
          <label htmlFor="qrToken" className="block text-sm font-semibold text-gray-700">
            {hasCamera ? 'O ingresá el token manualmente' : 'Código QR'}
          </label>
          <input
            id="qrToken"
            type="text"
            value={qrToken}
            onChange={(e) => setQrToken(e.target.value)}
            placeholder="Escanea o ingresá el token QR"
            required
            autoFocus={!hasCamera}
            aria-label="Token QR del registro"
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={scanning || !qrToken.trim()}
          aria-busy={scanning}
          className="w-full bg-gray-800 text-white py-3 rounded-xl font-semibold text-base hover:bg-gray-900 transition-colors disabled:opacity-50 min-h-[48px]"
        >
          {scanning ? '⏳ Procesando…' : '✅ Confirmar Check-in'}
        </button>
      </form>

      {/* ── ERROR ── */}
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-800 px-5 py-4 rounded-2xl">
          <p className="font-semibold text-base">❌ {error}</p>
        </div>
      )}

      {/* ── RESULTADO ── */}
      {result && (
        <div className="space-y-4">

          {/* Header de éxito */}
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">✅</span>
            <div>
              <p className="font-bold text-green-800 text-lg">Check-in exitoso</p>
              <p className="text-sm text-green-700">
                Registro #{result.regId.slice(0, 8)}
                {result.checkedInAt && (
                  <> · {new Date(result.checkedInAt).toLocaleTimeString('es-CR')}</>
                )}
              </p>
            </div>
          </div>

          {/* ── ALERTAS DEL VET (sticky, siempre visible) ── */}
          {totalAlertas.length > 0 && (
            <div
              role="alert"
              aria-label="Alertas del veterinario"
              className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-5 py-4"
            >
              <p className="font-bold text-amber-800 text-base mb-2">
                ⚠️ ALERTAS PARA EL VETERINARIO
              </p>
              <ul className="space-y-1">
                {totalAlertas.map((alerta, i) => (
                  <li key={i} className="flex items-start gap-2 text-amber-900 text-sm">
                    <span aria-hidden="true" className="mt-0.5 flex-shrink-0">•</span>
                    <span>{alerta}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── MASCOTAS ── */}
          {result.pets.map((pet) => (
            <div key={pet.petId} className="bg-white border rounded-2xl overflow-hidden">

              {/* Header de mascota */}
              <div className="bg-gray-50 border-b px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900 text-lg">{pet.nombre}</span>
                  <span className="ml-2 text-gray-500 text-sm capitalize">
                    {pet.especie} · {pet.sexo}
                  </span>
                </div>
                <span className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
                  ✓ Operado
                </span>
              </div>

              {/* Datos clínicos */}
              <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">

                <div>
                  <span className="text-gray-500 block text-xs uppercase font-semibold mb-0.5">Peso</span>
                  <span className="font-semibold text-gray-900 text-base">
                    {pet.pesoKg ? `${pet.pesoKg} kg` : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-gray-500 block text-xs uppercase font-semibold mb-0.5">Edad</span>
                  <span className="font-semibold text-gray-900 text-base">
                    {pet.edadAnios ? `${pet.edadAnios} años` : pet.edadMeses ? `${pet.edadMeses} meses` : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-gray-500 block text-xs uppercase font-semibold mb-0.5">Vacunas al día</span>
                  <span className={`font-semibold text-base ${pet.vacunasAlDia === true ? 'text-green-700' : pet.vacunasAlDia === false ? 'text-red-600' : 'text-gray-400'}`}>
                    {pet.vacunasAlDia === true ? '✓ Sí' : pet.vacunasAlDia === false ? '✗ No' : '—'}
                  </span>
                </div>

                {pet.estadoReproductivo && pet.estadoReproductivo !== 'normal' && (
                  <div className="col-span-2">
                    <span className="text-gray-500 block text-xs uppercase font-semibold mb-0.5">Estado reproductivo</span>
                    <span className="font-semibold text-amber-700 capitalize text-base">{pet.estadoReproductivo}</span>
                  </div>
                )}

                {pet.tratamientosActivos && (
                  <div className="col-span-2">
                    <span className="text-gray-500 block text-xs uppercase font-semibold mb-0.5">Tratamientos activos</span>
                    <span className="text-gray-900">{pet.tratamientosActivos}</span>
                  </div>
                )}

                {pet.condicionSalud && (
                  <div className="col-span-2">
                    <span className="text-gray-500 block text-xs uppercase font-semibold mb-0.5">Condición de salud (dueño)</span>
                    <span className="text-gray-700 italic">"{pet.condicionSalud}"</span>
                  </div>
                )}

              </div>

              {/* Alertas individuales de la mascota */}
              {pet.alertasVet && pet.alertasVet.length > 0 && (
                <div className="border-t bg-amber-50 px-5 py-3">
                  {pet.alertasVet.map((a, i) => (
                    <p key={i} className="text-amber-800 text-sm font-medium">⚠️ {a}</p>
                  ))}
                </div>
              )}

            </div>
          ))}

          {/* ── RECEPCIÓN RÁPIDA ── */}
          <div className="bg-white border rounded-2xl px-5 py-5">
            <p className="font-bold text-gray-800 text-base mb-4">📋 Recepción rápida</p>
            <RecepcionRapida regId={result.regId} />
          </div>

          {/* ── LINK EXPEDIENTE COMPLETO ── */}
          <Link
            href={`/checkin/${result.regId}`}
            className="flex items-center justify-center gap-2 w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-700 transition-colors min-h-[48px]"
            aria-label="Abrir expediente clínico completo"
          >
            📄 Abrir expediente clínico completo
          </Link>

        </div>
      )}
    </div>
  );
}

// ── COMPONENTE RECEPCIÓN RÁPIDA ──
function RecepcionRapida({ regId }: { regId: string }) {
  const [peso, setPeso] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [turno, setTurno] = useState('');
  const [relajante, setRelajante] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const handleGuardar = async () => {
    if (!peso || !consentimiento || !turno) return;
    setGuardando(true);
    try {
      const API = process.env['NEXT_PUBLIC_API_URL'] ?? '';
      const session = await fetchAuthSession().catch(() => null);
      const token = session?.tokens?.accessToken?.toString();

      await fetch(`${API}/registrations/${regId}/expediente`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fase: 'recepcion',
          datos: {
            pesoKg: parseFloat(peso),
            consentimientoFirmado: consentimiento,
            numeroTurno: parseInt(turno),
            relajanteAplicado: relajante,
            llegadaHora: new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
            consentimientoTimestamp: new Date().toISOString(),
          },
        }),
      });
      setGuardado(true);
    } catch (err) {
      console.error('Error guardando recepción:', err);
    } finally {
      setGuardando(false);
    }
  };

  if (guardado) {
    return (
      <div className="flex items-center gap-2 text-green-700 font-semibold">
        <span aria-hidden="true">✅</span> Datos de recepción guardados
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Peso */}
      <div className="space-y-1">
        <label htmlFor="peso" className="block text-sm font-semibold text-gray-700">
          Peso real medido hoy (kg)
        </label>
        <input
          id="peso"
          type="number"
          step="0.1"
          min="0"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          placeholder="Ej: 5.2"
          aria-required="true"
          className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Número de turno */}
      <div className="space-y-1">
        <label htmlFor="turno" className="block text-sm font-semibold text-gray-700">
          Número de turno
        </label>
        <input
          id="turno"
          type="number"
          min="1"
          value={turno}
          onChange={(e) => setTurno(e.target.value)}
          placeholder="Ej: 12"
          aria-required="true"
          className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Relajante (perros) */}
      <label className="flex items-center gap-3 cursor-pointer min-h-[48px]">
        <input
          type="checkbox"
          checked={relajante}
          onChange={(e) => setRelajante(e.target.checked)}
          className="w-5 h-5 rounded accent-brand-600"
          aria-label="Relajante aplicado (solo perros)"
        />
        <span className="text-sm font-medium text-gray-700">Relajante aplicado (solo perros)</span>
      </label>

      {/* Consentimiento */}
      <label className="flex items-center gap-3 cursor-pointer min-h-[48px]">
        <input
          type="checkbox"
          checked={consentimiento}
          onChange={(e) => setConsentimiento(e.target.checked)}
          className="w-5 h-5 rounded accent-brand-600"
          aria-required="true"
          aria-label="Consentimiento informado firmado"
        />
        <span className="text-sm font-medium text-gray-700">
          Consentimiento informado firmado ✍️
        </span>
      </label>

      <button
        onClick={handleGuardar}
        disabled={guardando || !peso || !consentimiento || !turno}
        aria-busy={guardando}
        className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[48px]"
      >
        {guardando ? '⏳ Guardando…' : '💾 Guardar recepción'}
      </button>
    </div>
  );
}
