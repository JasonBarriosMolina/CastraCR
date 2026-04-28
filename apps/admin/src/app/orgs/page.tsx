'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { createOrg, updateOrg, listOrgs } from '@/lib/api';
import type { OrgRescatista, OrgRescatistaInput } from '@/lib/api';

const API_READY = !!process.env['NEXT_PUBLIC_API_URL'];

export default function OrgsPage() {
  return (
    <AuthGuard allowedRoles={['SuperAdmin']}>
      <OrgsContent />
    </AuthGuard>
  );
}

const emptyInput = (): OrgRescatistaInput => ({
  nombre: '', email: '', telefono: '', descripcion: '',
  sinpeMovil: '', iban: '', nombreBanco: '',
});

function OrgsContent() {
  const [orgs, setOrgs] = useState<OrgRescatista[]>([]);
  const [loading, setLoading] = useState(API_READY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');

  // Create form
  const [form, setForm] = useState<OrgRescatistaInput>(emptyInput());

  // Edit
  const [editingOrg, setEditingOrg] = useState<OrgRescatista | null>(null);
  const [editForm, setEditForm] = useState<OrgRescatistaInput>(emptyInput());

  useEffect(() => {
    if (!API_READY) return;
    listOrgs()
      .then(setOrgs)
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const refreshOrgs = async () => {
    const updated = await listOrgs();
    setOrgs(updated);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      await createOrg({
        nombre: form.nombre,
        email: form.email,
        telefono: form.telefono || undefined,
        descripcion: form.descripcion || undefined,
        sinpeMovil: form.sinpeMovil || undefined,
        iban: form.iban || undefined,
        nombreBanco: form.nombreBanco || undefined,
      });
      setSuccess(`✅ Organización "${form.nombre}" creada exitosamente.`);
      setForm(emptyInput());
      await refreshOrgs();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (org: OrgRescatista) => {
    setEditingOrg(org);
    setEditForm({
      nombre: org.nombre,
      email: org.email,
      telefono: org.telefono ?? '',
      descripcion: org.descripcion ?? '',
      sinpeMovil: org.sinpeMovil ?? '',
      iban: org.iban ?? '',
      nombreBanco: org.nombreBanco ?? '',
    });
    setError(''); setSuccess('');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await updateOrg(editingOrg.orgId, {
        nombre: editForm.nombre,
        email: editForm.email,
        telefono: editForm.telefono || undefined,
        descripcion: editForm.descripcion || undefined,
        sinpeMovil: editForm.sinpeMovil || undefined,
        iban: editForm.iban || undefined,
        nombreBanco: editForm.nombreBanco || undefined,
      });
      setSuccess(`✅ "${editForm.nombre}" actualizada.`);
      setEditingOrg(null);
      await refreshOrgs();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = orgs.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.nombre.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      (o.telefono ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Organizaciones rescatistas</h1>
        <p className="text-gray-600 mt-1">
          Registra las organizaciones que recibirán fondos mensuales y configura sus datos bancarios.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-100 text-green-700 px-4 py-3 rounded-xl text-sm">
          {success}
        </div>
      )}

      {/* Edit modal */}
      {editingOrg && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Editar organización</h2>
                <button
                  onClick={() => setEditingOrg(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">ID: <code className="text-xs bg-gray-100 px-1 rounded">{editingOrg.orgId}</code></p>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nombre *">
                  <input type="text" value={editForm.nombre} onChange={(e) => setEditForm(f => ({ ...f, nombre: e.target.value }))} required className={cls} />
                </Field>
                <Field label="Correo *">
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} required className={cls} />
                </Field>
                <Field label="Teléfono">
                  <input type="tel" value={editForm.telefono} onChange={(e) => setEditForm(f => ({ ...f, telefono: e.target.value }))} placeholder="+506 8888-8888" className={cls} />
                </Field>
                <Field label="Descripción">
                  <input type="text" value={editForm.descripcion} onChange={(e) => setEditForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Breve descripción" className={cls} />
                </Field>
              </div>

              {/* Banking section */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">💳 Datos bancarios para transferencias SINPE</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="SINPE Móvil">
                    <input type="tel" value={editForm.sinpeMovil} onChange={(e) => setEditForm(f => ({ ...f, sinpeMovil: e.target.value }))} placeholder="Ej: 88887777" className={cls} />
                  </Field>
                  <Field label="Banco">
                    <input type="text" value={editForm.nombreBanco} onChange={(e) => setEditForm(f => ({ ...f, nombreBanco: e.target.value }))} placeholder="Ej: BCR, Banco Nacional" className={cls} />
                  </Field>
                  <Field label="IBAN" className="sm:col-span-2">
                    <input type="text" value={editForm.iban} onChange={(e) => setEditForm(f => ({ ...f, iban: e.target.value }))} placeholder="CR00 0000 0000 0000 0000 00" className={cls} />
                  </Field>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving || !editForm.nombre || !editForm.email}
                  className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 text-sm transition-colors"
                >
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingOrg(null)}
                  className="px-5 py-2.5 rounded-xl border text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create form */}
      <section className="bg-white border rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Agregar organización</h2>
          <p className="text-sm text-gray-500 mt-1">
            Al crear una campaña podrás seleccionar esta org para recibir los fondos mensuales.
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nombre de la organización *">
              <input type="text" value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} required placeholder="Ej: Refugio Patitas Felices" className={cls} />
            </Field>
            <Field label="Correo electrónico *">
              <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="org@ejemplo.com" className={cls} />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.telefono} onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="+506 8888-8888" className={cls} />
            </Field>
            <Field label="Descripción">
              <input type="text" value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Breve descripción" className={cls} />
            </Field>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">💳 Datos bancarios (opcional, se pueden agregar después)</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="SINPE Móvil">
                <input type="tel" value={form.sinpeMovil} onChange={(e) => setForm(f => ({ ...f, sinpeMovil: e.target.value }))} placeholder="Ej: 88887777" className={cls} />
              </Field>
              <Field label="Banco">
                <input type="text" value={form.nombreBanco} onChange={(e) => setForm(f => ({ ...f, nombreBanco: e.target.value }))} placeholder="Ej: BCR, Banco Nacional" className={cls} />
              </Field>
              <Field label="IBAN" className="sm:col-span-2">
                <input type="text" value={form.iban} onChange={(e) => setForm(f => ({ ...f, iban: e.target.value }))} placeholder="CR00 0000 0000 0000 0000 00" className={cls} />
              </Field>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !form.nombre || !form.email}
            className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 text-sm"
          >
            {saving ? 'Creando…' : '+ Agregar organización'}
          </button>
        </form>
      </section>

      {/* List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-gray-900">
            Organizaciones registradas
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-500">({orgs.length})</span>
            )}
          </h2>
          {orgs.length > 0 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-48"
            />
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : !API_READY ? (
          <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-2xl">
            <p className="text-4xl mb-3">🏠</p>
            <p className="text-sm">Configura NEXT_PUBLIC_API_URL para ver la lista.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 border-2 border-dashed rounded-2xl">
            <p className="text-4xl mb-3">🏠</p>
            <p>{search ? 'Sin resultados para tu búsqueda.' : 'No hay organizaciones registradas aún.'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((org) => (
              <div key={org.orgId} className="bg-white border rounded-2xl px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{org.nombre}</p>
                    <p className="text-sm text-gray-500">{org.email}</p>
                    {org.telefono && <p className="text-sm text-gray-400">{org.telefono}</p>}
                    {org.descripcion && <p className="text-xs text-gray-400 mt-1">{org.descripcion}</p>}
                    {/* Banking info */}
                    {(org.sinpeMovil || org.iban) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {org.sinpeMovil && (
                          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
                            📱 SINPE: {org.sinpeMovil}
                          </span>
                        )}
                        {org.iban && (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                            🏦 {org.nombreBanco ? `${org.nombreBanco} ···${org.iban.slice(-4)}` : `IBAN ···${org.iban.slice(-4)}`}
                          </span>
                        )}
                        {!org.sinpeMovil && !org.iban && (
                          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                            ⚠️ Sin datos bancarios
                          </span>
                        )}
                      </div>
                    )}
                    {!org.sinpeMovil && !org.iban && (
                      <span className="inline-block text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full mt-1">
                        ⚠️ Sin datos bancarios
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <p className="text-xs text-gray-400">
                      {new Date(org.createdAt).toLocaleDateString('es-CR')}
                    </p>
                    <button
                      onClick={() => openEdit(org)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium px-3 py-1 rounded-lg border border-brand-200 hover:bg-brand-50 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => { void navigator.clipboard.writeText(org.orgId); }}
                      className="text-xs text-gray-400 hover:underline"
                      title={org.orgId}
                    >
                      Copiar ID
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const cls = 'w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
