'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaign } from '@/lib/api';
import { OrgSelect } from '@/components/OrgSelect';

export default function NuevaCampanaPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [orgRescateId, setOrgRescateId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgRescateId) {
      setError('Selecciona una organización rescatista.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { campaignId } = await createCampaign({ titulo, descripcion, orgRescateId, fechaInicio, fechaFin });
      router.push(`/campanas/${campaignId}`);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Nueva campaña</h1>
        <p className="text-gray-600 mt-1">Crea una campaña de esterilización en borrador. Luego agrega sedes y turnos antes de publicarla.</p>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white border rounded-2xl p-6 space-y-4">
        <Field label="Título *">
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} required className={cls} />
        </Field>
        <Field label="Descripción">
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className={cls} />
        </Field>
        <Field label="Organización rescatista *">
          <OrgSelect
            value={orgRescateId}
            onChange={(id) => setOrgRescateId(id)}
            required
          />
          <p className="text-xs text-gray-400 mt-1">
            Recibirá el 50% de las donaciones.{' '}
            <a href="/orgs" className="text-brand-600 hover:underline" target="_blank" rel="noreferrer">
              Gestionar orgs →
            </a>
          </p>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fecha inicio *">
            <input type="datetime-local" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required className={cls} />
          </Field>
          <Field label="Fecha fin *">
            <input type="datetime-local" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} required className={cls} />
          </Field>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving || !orgRescateId} className="bg-brand-600 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Creando…' : 'Crear campaña'}
          </button>
          <button type="button" onClick={() => router.back()} className="border px-6 py-2 rounded-lg text-gray-600">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

const cls = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
