'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExpedienteRecepcion {
  pesoKg?: number;
  relajanteAplicado?: boolean;
  consentimientoFirmado?: boolean;
  consentimientoTimestamp?: string;
  llegadaHora?: string;
  numeroTurno?: number;
}

interface ExpedientePreOp {
  evaluadoPorVetId?: string;
  evaluadoHora?: string;
  aptoCirugia?: boolean;
  observacionesPreOp?: string;
  alertasActivas?: string[];
  criptorquidismo?: boolean;
  estadoReproductivo?: string;
  pesoConfirmado?: number;
}

interface ExpedienteIntraOp {
  cirugiaInicio?: string;
  cirugiaFin?: string;
  duracionMinutos?: number;
  tipoProcedimiento?: string;
  complicaciones?: string;
  estadoFinal?: 'exitosa' | 'complicacion' | 'suspendida';
  notasVet?: string;
}

interface ProcedimientosAdicionales {
  corteunas?: boolean;
  limpieza_oidos?: boolean;
  cono?: boolean;
  vestido?: boolean;
}

interface AntibioticoPrescripcion {
  nombre?: string;
  dosis?: string;
  dias?: number;
}

interface ExpedienteEgreso {
  egresoHora?: string;
  procedimientosAdicionales?: ProcedimientosAdicionales;
  antibiotico?: AntibioticoPrescripcion;
  condicionEgreso?: 'buena' | 'regular' | 'requiere_observacion';
  entregadoA?: string;
  firmaEntregaTimestamp?: string;
  indicacionesEntregadas?: boolean;
}

interface SeguimientoEntry {
  dia: 1 | 3 | 7 | 15;
  fechaRespuesta: string;
  respuestaRaw: string;
  nivelIA: 'normal' | 'observacion' | 'urgente';
  descripcionIA: string;
  signosPreocupantes: string[];
  accionTomada?: string;
  notaOrg?: string;
}

interface Expediente {
  regId: string;
  petId?: string;
  campaignId?: string;
  recepcion?: ExpedienteRecepcion;
  preOp?: ExpedientePreOp;
  intraOp?: ExpedienteIntraOp;
  egreso?: ExpedienteEgreso;
  seguimiento?: SeguimientoEntry[];
  creadoEn?: string;
  actualizadoEn?: string;
}

// ── API helper ─────────────────────────────────────────────────────────────────

const API = process.env['NEXT_PUBLIC_API_URL'] ?? '';

function getToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as Record<string, unknown>)['__authToken__'] as string | undefined;
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, icon, done }: { title: string; icon: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-2xl" aria-hidden="true">{icon}</span>
      <h2 className="text-lg font-bold text-gray-900 flex-1">{title}</h2>
      {done && (
        <span className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
          ✓ Completo
        </span>
      )}
    </div>
  );
}

function FieldRow({ label, value, highlight }: { label: string; value?: string | number | boolean | null; highlight?: 'amber' | 'red' | 'green' }) {
  const colorMap = {
    amber: 'text-amber-700 font-semibold',
    red: 'text-red-600 font-semibold',
    green: 'text-green-700 font-semibold',
  };
  const display =
    value === true ? '✓ Sí' :
    value === false ? '✗ No' :
    value == null || value === '' ? '—' :
    String(value);

  return (
    <div>
      <span className="text-gray-500 block text-xs uppercase font-semibold mb-0.5">{label}</span>
      <span className={`text-base ${highlight ? colorMap[highlight] : 'text-gray-900 font-semibold'}`}>
        {display}
      </span>
    </div>
  );
}

// ── FASE RECEPCIÓN ─────────────────────────────────────────────────────────────

function FaseRecepcion({ regId, data, onSaved }: { regId: string; data?: ExpedienteRecepcion; onSaved: () => void }) {
  const done = !!data?.consentimientoFirmado;
  const [peso, setPeso] = useState(String(data?.pesoKg ?? ''));
  const [turno, setTurno] = useState(String(data?.numeroTurno ?? ''));
  const [relajante, setRelajante] = useState(data?.relajanteAplicado ?? false);
  const [consentimiento, setConsentimiento] = useState(data?.consentimientoFirmado ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(done);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/registrations/${regId}/expediente`, {
        method: 'PATCH',
        body: JSON.stringify({
          fase: 'recepcion',
          datos: {
            pesoKg: parseFloat(peso),
            numeroTurno: parseInt(turno),
            relajanteAplicado: relajante,
            consentimientoFirmado: consentimiento,
            consentimientoTimestamp: new Date().toISOString(),
            llegadaHora: new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
          },
        }),
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (saved && data) {
    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <FieldRow label="Peso recepción" value={data.pesoKg ? `${data.pesoKg} kg` : undefined} />
        <FieldRow label="Turno" value={data.numeroTurno} />
        <FieldRow label="Hora llegada" value={data.llegadaHora} />
        <FieldRow label="Relajante" value={data.relajanteAplicado} />
        <FieldRow label="Consentimiento" value={data.consentimientoFirmado} highlight="green" />
        {data.consentimientoTimestamp && (
          <FieldRow label="Timestamp" value={new Date(data.consentimientoTimestamp).toLocaleString('es-CR')} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="rec-peso" className="block text-sm font-semibold text-gray-700">
            Peso real (kg)
          </label>
          <input
            id="rec-peso"
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
        <div className="space-y-1">
          <label htmlFor="rec-turno" className="block text-sm font-semibold text-gray-700">
            Número de turno
          </label>
          <input
            id="rec-turno"
            type="number"
            min="1"
            value={turno}
            onChange={(e) => setTurno(e.target.value)}
            placeholder="Ej: 12"
            aria-required="true"
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer min-h-[48px]">
        <input
          type="checkbox"
          checked={relajante}
          onChange={(e) => setRelajante(e.target.checked)}
          className="w-5 h-5 rounded accent-brand-600"
          aria-label="Relajante aplicado (solo perros)"
        />
        <span className="text-sm font-medium text-gray-700">💉 Relajante aplicado (solo perros)</span>
      </label>

      <label className="flex items-center gap-3 cursor-pointer min-h-[48px]">
        <input
          type="checkbox"
          checked={consentimiento}
          onChange={(e) => setConsentimiento(e.target.checked)}
          className="w-5 h-5 rounded accent-brand-600"
          aria-label="Consentimiento informado firmado"
          aria-required="true"
        />
        <span className="text-sm font-medium text-gray-700">✍️ Consentimiento informado firmado</span>
      </label>

      <button
        onClick={handleSave}
        disabled={saving || !peso || !turno || !consentimiento}
        aria-busy={saving}
        className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-700 transition-colors disabled:opacity-50 min-h-[48px]"
      >
        {saving ? '⏳ Guardando…' : '💾 Guardar recepción'}
      </button>
    </div>
  );
}

// ── FASE PRE-OP ────────────────────────────────────────────────────────────────

function FasePreOp({ regId, data, onSaved }: { regId: string; data?: ExpedientePreOp; onSaved: () => void }) {
  const done = data?.aptoCirugia !== undefined;
  const [apto, setApto] = useState<boolean>(data?.aptoCirugia ?? true);
  const [peso, setPeso] = useState(String(data?.pesoConfirmado ?? ''));
  const [obs, setObs] = useState(data?.observacionesPreOp ?? '');
  const [hora, setHora] = useState(data?.evaluadoHora ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(done);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/registrations/${regId}/expediente`, {
        method: 'PATCH',
        body: JSON.stringify({
          fase: 'preOp',
          datos: {
            aptoCirugia: apto,
            pesoConfirmado: parseFloat(peso) || undefined,
            observacionesPreOp: obs || undefined,
            evaluadoHora: hora || new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
          },
        }),
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (saved && data) {
    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <FieldRow label="Apto para cirugía" value={data.aptoCirugia} highlight={data.aptoCirugia ? 'green' : 'red'} />
        <FieldRow label="Peso confirmado" value={data.pesoConfirmado ? `${data.pesoConfirmado} kg` : undefined} />
        <FieldRow label="Hora evaluación" value={data.evaluadoHora} />
        {data.observacionesPreOp && (
          <div className="col-span-2">
            <FieldRow label="Observaciones" value={data.observacionesPreOp} />
          </div>
        )}
        {data.alertasActivas && data.alertasActivas.length > 0 && (
          <div className="col-span-2">
            <span className="text-gray-500 block text-xs uppercase font-semibold mb-1">Alertas activas</span>
            <ul className="space-y-1">
              {data.alertasActivas.map((a, i) => (
                <li key={i} className="text-amber-700 text-sm font-medium">⚠️ {a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-gray-700 mb-2">¿Apto para cirugía?</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer min-h-[48px] flex-1 border rounded-xl px-4 py-2 has-[:checked]:border-green-500 has-[:checked]:bg-green-50">
            <input
              type="radio"
              name="apto"
              checked={apto === true}
              onChange={() => setApto(true)}
              className="w-5 h-5 accent-green-600"
            />
            <span className="font-semibold text-green-700">✓ Sí, apto</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer min-h-[48px] flex-1 border rounded-xl px-4 py-2 has-[:checked]:border-red-500 has-[:checked]:bg-red-50">
            <input
              type="radio"
              name="apto"
              checked={apto === false}
              onChange={() => setApto(false)}
              className="w-5 h-5 accent-red-600"
            />
            <span className="font-semibold text-red-600">✗ No apto</span>
          </label>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="preop-peso" className="block text-sm font-semibold text-gray-700">
            Peso confirmado (kg)
          </label>
          <input
            id="preop-peso"
            type="number"
            step="0.1"
            min="0"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            placeholder="Peso para anestesia"
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="preop-hora" className="block text-sm font-semibold text-gray-700">
            Hora de evaluación
          </label>
          <input
            id="preop-hora"
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="preop-obs" className="block text-sm font-semibold text-gray-700">
          Observaciones pre-op (opcional)
        </label>
        <textarea
          id="preop-obs"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={3}
          placeholder="Notas clínicas antes de la cirugía…"
          className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        aria-busy={saving}
        className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-700 transition-colors disabled:opacity-50 min-h-[48px]"
      >
        {saving ? '⏳ Guardando…' : '💾 Guardar evaluación pre-op'}
      </button>
    </div>
  );
}

// ── FASE INTRA-OP ──────────────────────────────────────────────────────────────

const TIPOS_PROC = [
  { value: 'castracion_estandar', label: 'Castración estándar' },
  { value: 'ovariohisterectomia', label: 'Ovariohisterectomía' },
  { value: 'criptorquidismo', label: 'Criptorquidismo' },
  { value: 'otro', label: 'Otro' },
];

function FaseIntraOp({ regId, data, onSaved }: { regId: string; data?: ExpedienteIntraOp; onSaved: () => void }) {
  const done = !!data?.cirugiaFin;
  const [inicio, setInicio] = useState(data?.cirugiaInicio ?? '');
  const [fin, setFin] = useState(data?.cirugiaFin ?? '');
  const [tipo, setTipo] = useState(data?.tipoProcedimiento ?? 'castracion_estandar');
  const [estado, setEstado] = useState<'exitosa' | 'complicacion' | 'suspendida'>(data?.estadoFinal ?? 'exitosa');
  const [complicaciones, setComplicaciones] = useState(data?.complicaciones ?? '');
  const [notas, setNotas] = useState(data?.notasVet ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(done);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/registrations/${regId}/expediente`, {
        method: 'PATCH',
        body: JSON.stringify({
          fase: 'intraOp',
          datos: { cirugiaInicio: inicio, cirugiaFin: fin, tipoProcedimiento: tipo, estadoFinal: estado, complicaciones: complicaciones || undefined, notasVet: notas || undefined },
        }),
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (saved && data) {
    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <FieldRow label="Inicio cirugía" value={data.cirugiaInicio} />
        <FieldRow label="Fin cirugía" value={data.cirugiaFin} />
        <FieldRow label="Duración" value={data.duracionMinutos ? `${data.duracionMinutos} min` : undefined} />
        <FieldRow label="Procedimiento" value={TIPOS_PROC.find(t => t.value === data.tipoProcedimiento)?.label ?? data.tipoProcedimiento} />
        <FieldRow
          label="Estado final"
          value={data.estadoFinal === 'exitosa' ? '✓ Exitosa' : data.estadoFinal === 'complicacion' ? '⚠️ Complicación' : '🛑 Suspendida'}
          highlight={data.estadoFinal === 'exitosa' ? 'green' : data.estadoFinal === 'complicacion' ? 'amber' : 'red'}
        />
        {data.complicaciones && <div className="col-span-2"><FieldRow label="Complicaciones" value={data.complicaciones} /></div>}
        {data.notasVet && <div className="col-span-2"><FieldRow label="Notas del vet" value={data.notasVet} /></div>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="intra-inicio" className="block text-sm font-semibold text-gray-700">Inicio</label>
          <input id="intra-inicio" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)}
            aria-required="true"
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="space-y-1">
          <label htmlFor="intra-fin" className="block text-sm font-semibold text-gray-700">Fin</label>
          <input id="intra-fin" type="time" value={fin} onChange={(e) => setFin(e.target.value)}
            aria-required="true"
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="intra-tipo" className="block text-sm font-semibold text-gray-700">Tipo de procedimiento</label>
        <select id="intra-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
          {TIPOS_PROC.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-gray-700 mb-2">Estado final</legend>
        <div className="flex gap-3">
          {[
            { value: 'exitosa', label: '✓ Exitosa', color: 'green' },
            { value: 'complicacion', label: '⚠️ Complicación', color: 'amber' },
            { value: 'suspendida', label: '🛑 Suspendida', color: 'red' },
          ].map(opt => (
            <label key={opt.value} className="flex-1 flex items-center justify-center gap-2 cursor-pointer min-h-[48px] border rounded-xl px-3 py-2 text-sm font-semibold has-[:checked]:border-current has-[:checked]:bg-gray-50">
              <input type="radio" name="estadoFinal" value={opt.value} checked={estado === opt.value}
                onChange={() => setEstado(opt.value as typeof estado)} className="sr-only" />
              <span className={`text-${opt.color}-700`}>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {estado !== 'exitosa' && (
        <div className="space-y-1">
          <label htmlFor="intra-comp" className="block text-sm font-semibold text-gray-700">Descripción de complicaciones</label>
          <textarea id="intra-comp" value={complicaciones} onChange={(e) => setComplicaciones(e.target.value)}
            rows={2} placeholder="Detallá qué ocurrió…"
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="intra-notas" className="block text-sm font-semibold text-gray-700">Notas clínicas (opcional)</label>
        <textarea id="intra-notas" value={notas} onChange={(e) => setNotas(e.target.value)}
          rows={2} placeholder="Hallazgos, observaciones del procedimiento…"
          className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
      </div>

      <button onClick={handleSave} disabled={saving || !inicio || !fin} aria-busy={saving}
        className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-700 transition-colors disabled:opacity-50 min-h-[48px]">
        {saving ? '⏳ Guardando…' : '💾 Cerrar cirugía'}
      </button>
    </div>
  );
}

// ── FASE EGRESO ────────────────────────────────────────────────────────────────

const ANTIBIOTICOS = ['Amoxicilina', 'Enrofloxacina', 'Metronidazol', 'Cefalexina', 'Otro'];

function FaseEgreso({ regId, data, onSaved }: { regId: string; data?: ExpedienteEgreso; onSaved: () => void }) {
  const done = !!data?.firmaEntregaTimestamp;
  const [hora, setHora] = useState(data?.egresoHora ?? '');
  const [entregado, setEntregado] = useState(data?.entregadoA ?? '');
  const [condicion, setCondicion] = useState<'buena' | 'regular' | 'requiere_observacion'>(data?.condicionEgreso ?? 'buena');
  const [indicaciones, setIndicaciones] = useState(data?.indicacionesEntregadas ?? false);
  const [procs, setProcs] = useState<ProcedimientosAdicionales>(data?.procedimientosAdicionales ?? {});
  const [abx, setAbx] = useState<AntibioticoPrescripcion>(data?.antibiotico ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(done);

  const toggleProc = (key: keyof ProcedimientosAdicionales) =>
    setProcs(p => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/registrations/${regId}/expediente`, {
        method: 'PATCH',
        body: JSON.stringify({
          fase: 'egreso',
          datos: {
            egresoHora: hora || new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
            entregadoA: entregado,
            condicionEgreso: condicion,
            indicacionesEntregadas: indicaciones,
            procedimientosAdicionales: procs,
            antibiotico: abx.nombre ? abx : undefined,
            firmaEntregaTimestamp: new Date().toISOString(),
          },
        }),
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (saved && data) {
    const condLabels = { buena: '✓ Buena', regular: '⚠️ Regular', requiere_observacion: '🔍 Requiere obs.' };
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <FieldRow label="Hora egreso" value={data.egresoHora} />
          <FieldRow label="Entregado a" value={data.entregadoA} />
          <FieldRow label="Condición" value={condLabels[data.condicionEgreso ?? 'buena']} highlight={data.condicionEgreso === 'buena' ? 'green' : data.condicionEgreso === 'regular' ? 'amber' : 'red'} />
          <FieldRow label="Indicaciones" value={data.indicacionesEntregadas} />
          {data.firmaEntregaTimestamp && (
            <FieldRow label="Firma entrega" value={new Date(data.firmaEntregaTimestamp).toLocaleTimeString('es-CR')} />
          )}
        </div>
        {data.procedimientosAdicionales && (
          <div>
            <span className="text-gray-500 block text-xs uppercase font-semibold mb-1">Procedimientos adicionales</span>
            <div className="flex flex-wrap gap-2">
              {data.procedimientosAdicionales.corteunas && <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded-full">✂️ Uñas</span>}
              {data.procedimientosAdicionales.limpieza_oidos && <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded-full">👂 Oídos</span>}
              {data.procedimientosAdicionales.cono && <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded-full">🔵 Cono</span>}
              {data.procedimientosAdicionales.vestido && <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded-full">👕 Vestido</span>}
            </div>
          </div>
        )}
        {data.antibiotico?.nombre && (
          <div>
            <span className="text-gray-500 block text-xs uppercase font-semibold mb-1">Antibiótico</span>
            <span className="text-gray-900 text-sm font-medium">
              {data.antibiotico.nombre} — {data.antibiotico.dosis} por {data.antibiotico.dias} días
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="egr-hora" className="block text-sm font-semibold text-gray-700">Hora egreso</label>
          <input id="egr-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="space-y-1">
          <label htmlFor="egr-entregado" className="block text-sm font-semibold text-gray-700">Entregado a</label>
          <input id="egr-entregado" type="text" value={entregado} onChange={(e) => setEntregado(e.target.value)}
            placeholder="Nombre del responsable" aria-required="true"
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-gray-700 mb-2">Condición de egreso</legend>
        <div className="flex gap-3">
          {[
            { value: 'buena', label: '✓ Buena' },
            { value: 'regular', label: '⚠️ Regular' },
            { value: 'requiere_observacion', label: '🔍 Requiere obs.' },
          ].map(opt => (
            <label key={opt.value} className="flex-1 flex items-center justify-center gap-1 cursor-pointer min-h-[48px] border rounded-xl px-2 py-2 text-sm font-semibold has-[:checked]:bg-gray-50">
              <input type="radio" name="condicion" value={opt.value} checked={condicion === opt.value}
                onChange={() => setCondicion(opt.value as typeof condicion)} className="sr-only" />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Procedimientos adicionales</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'corteunas' as const, label: '✂️ Corte de uñas' },
            { key: 'limpieza_oidos' as const, label: '👂 Limpieza oídos' },
            { key: 'cono' as const, label: '🔵 Cono protector' },
            { key: 'vestido' as const, label: '👕 Vestido' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer min-h-[48px] border rounded-xl px-3 py-2 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="checkbox" checked={!!procs[key]} onChange={() => toggleProc(key)}
                className="w-5 h-5 rounded accent-brand-600" aria-label={label} />
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Antibiótico (opcional)</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="abx-nombre" className="block text-xs font-semibold text-gray-600">Nombre</label>
            <select id="abx-nombre" value={abx.nombre ?? ''} onChange={(e) => setAbx(a => ({ ...a, nombre: e.target.value || undefined }))}
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">— Ninguno</option>
              {ANTIBIOTICOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {abx.nombre && <>
            <div className="space-y-1">
              <label htmlFor="abx-dosis" className="block text-xs font-semibold text-gray-600">Dosis</label>
              <input id="abx-dosis" type="text" value={abx.dosis ?? ''} onChange={(e) => setAbx(a => ({ ...a, dosis: e.target.value }))}
                placeholder="250mg c/12h"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="space-y-1">
              <label htmlFor="abx-dias" className="block text-xs font-semibold text-gray-600">Días</label>
              <input id="abx-dias" type="number" min="1" value={abx.dias ?? ''} onChange={(e) => setAbx(a => ({ ...a, dias: parseInt(e.target.value) || undefined }))}
                placeholder="7"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </>}
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer min-h-[48px]">
        <input type="checkbox" checked={indicaciones} onChange={(e) => setIndicaciones(e.target.checked)}
          className="w-5 h-5 rounded accent-brand-600" aria-label="Indicaciones post-op entregadas al dueño" />
        <span className="text-sm font-medium text-gray-700">📋 Indicaciones post-op entregadas al dueño</span>
      </label>

      <button onClick={handleSave} disabled={saving || !entregado} aria-busy={saving}
        className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[48px]">
        {saving ? '⏳ Guardando…' : '🤝 Firmar entrega'}
      </button>
    </div>
  );
}

// ── SEGUIMIENTO POST-OP ────────────────────────────────────────────────────────

function SeguimientoList({ entries }: { entries: SeguimientoEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-gray-500 text-sm italic">Sin respuestas post-op aún. Los mensajes se enviarán a días 1, 3, 7 y 15.</p>;
  }

  const nivelColor = {
    normal: 'bg-green-50 border-green-200 text-green-800',
    observacion: 'bg-amber-50 border-amber-300 text-amber-800',
    urgente: 'bg-red-50 border-red-300 text-red-800',
  };
  const nivelIcon = { normal: '✅', observacion: '⚠️', urgente: '🚨' };

  return (
    <div className="space-y-3">
      {entries.map((e, i) => (
        <div key={i} className={`border rounded-xl p-4 ${nivelColor[e.nivelIA]}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-base">
              {nivelIcon[e.nivelIA]} Día {e.dia}
            </span>
            <span className="text-xs opacity-75">
              {new Date(e.fechaRespuesta).toLocaleDateString('es-CR')}
            </span>
          </div>
          <p className="text-sm font-medium mb-1">{e.descripcionIA}</p>
          {e.signosPreocupantes.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {e.signosPreocupantes.map((s, j) => (
                <li key={j} className="text-xs">• {s}</li>
              ))}
            </ul>
          )}
          {e.respuestaRaw && (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer opacity-60">Ver respuesta original</summary>
              <p className="text-xs mt-1 opacity-80 italic">"{e.respuestaRaw}"</p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

// ── PAGE ───────────────────────────────────────────────────────────────────────

export default function ExpedientePage() {
  const params = useParams();
  const router = useRouter();
  const regId = params['regId'] as string;

  const [expediente, setExpediente] = useState<Expediente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadExpediente = useCallback(async () => {
    try {
      const data = await apiFetch(`/registrations/${regId}/expediente`);
      setExpediente(data.expediente as Expediente);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [regId]);

  useEffect(() => {
    void loadExpediente();
  }, [loadExpediente]);

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white border rounded-2xl p-6 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="h-4 bg-gray-100 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl">
        <div role="alert" className="bg-red-50 border border-red-200 text-red-800 px-5 py-4 rounded-2xl">
          <p className="font-semibold">❌ {error}</p>
          <button onClick={() => router.back()} className="mt-3 text-sm underline">← Volver</button>
        </div>
      </div>
    );
  }

  if (!expediente) return null;

  const fases = [
    { key: 'recepcion', icon: '📋', title: 'Recepción', done: !!expediente.recepcion?.consentimientoFirmado },
    { key: 'preOp', icon: '🩺', title: 'Pre-operatorio', done: expediente.preOp?.aptoCirugia !== undefined },
    { key: 'intraOp', icon: '🔪', title: 'Cirugía', done: !!expediente.intraOp?.cirugiaFin },
    { key: 'egreso', icon: '🤝', title: 'Egreso', done: !!expediente.egreso?.firmaEntregaTimestamp },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="text-brand-600 text-sm font-semibold mb-3 flex items-center gap-1 hover:underline"
          aria-label="Volver al check-in"
        >
          ← Volver
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Expediente Clínico</h1>
        <p className="text-gray-500 text-sm mt-1">
          Registro #{regId.slice(0, 8)}
          {expediente.actualizadoEn && (
            <> · Actualizado {new Date(expediente.actualizadoEn).toLocaleTimeString('es-CR')}</>
          )}
        </p>
      </div>

      {/* Progress tracker */}
      <div className="bg-white border rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between">
          {fases.map((fase, i) => (
            <div key={fase.key} className="flex items-center gap-1">
              <div className={`flex flex-col items-center gap-1`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg
                  ${fase.done ? 'bg-green-100' : 'bg-gray-100'}`}
                  aria-label={`${fase.title}: ${fase.done ? 'completo' : 'pendiente'}`}
                >
                  {fase.done ? '✅' : fase.icon}
                </div>
                <span className="text-xs text-gray-500 font-medium hidden sm:block">{fase.title}</span>
              </div>
              {i < fases.length - 1 && (
                <div className={`h-0.5 w-8 mx-1 rounded ${fase.done ? 'bg-green-400' : 'bg-gray-200'}`} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Fase 1 — Recepción */}
      <div className="bg-white border rounded-2xl p-6">
        <SectionHeader icon="📋" title="1. Recepción" done={fases[0]!.done} />
        <FaseRecepcion regId={regId} data={expediente.recepcion} onSaved={loadExpediente} />
      </div>

      {/* Fase 2 — Pre-Op */}
      <div className="bg-white border rounded-2xl p-6">
        <SectionHeader icon="🩺" title="2. Evaluación Pre-Operatoria" done={fases[1]!.done} />
        <FasePreOp regId={regId} data={expediente.preOp} onSaved={loadExpediente} />
      </div>

      {/* Fase 3 — Intra-Op */}
      <div className="bg-white border rounded-2xl p-6">
        <SectionHeader icon="🔪" title="3. Cirugía" done={fases[2]!.done} />
        <FaseIntraOp regId={regId} data={expediente.intraOp} onSaved={loadExpediente} />
      </div>

      {/* Fase 4 — Egreso */}
      <div className="bg-white border rounded-2xl p-6">
        <SectionHeader icon="🤝" title="4. Egreso" done={fases[3]!.done} />
        <FaseEgreso regId={regId} data={expediente.egreso} onSaved={loadExpediente} />
      </div>

      {/* Seguimiento post-op */}
      <div className="bg-white border rounded-2xl p-6">
        <SectionHeader icon="📱" title="Seguimiento Post-Operatorio" />
        <SeguimientoList entries={expediente.seguimiento ?? []} />
      </div>
    </div>
  );
}
