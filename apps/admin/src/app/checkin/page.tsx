'use client';

import { useState } from 'react';
import Link from 'next/link';
import { scanQR } from '@/lib/api';

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

  const totalAlertas = result?.pets.flatMap((p) => p.alertasVet ?? []) ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Check-in QR</h1>
        <p className="text-gray-600 mt-1">Escaneá el código QR del registro para confirmar asistencia</p>
      </div>

      {/* ── FORM SCAN ── */}
      <form onSubmit={handleScan} className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="space-y-2">
          <label htmlFor="qrToken" className="block text-sm font-semibold text-gray-700">
            Código QR
          </label>
          <input
            id="qrToken"
            type="text"
            value={qrToken}
            onChange={(e) => setQrToken(e.target.value)}
            placeholder="Escanea o ingresá el token QR"
            required
            autoFocus
            aria-label="Token QR del registro"
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={scanning || !qrToken.trim()}
          aria-busy={scanning}
          className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-700 transition-colors disabled:opacity-50 min-h-[48px]"
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
      const token = typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>)['__authToken__'] as string | undefined
        : undefined;

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
