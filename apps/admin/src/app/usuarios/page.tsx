'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { createOrganizador, listOrganizadores } from '@/lib/api';

interface OrgUser {
  userId: string;
  email: string;
  nombre: string;
  confirmado: boolean;
  createdAt: string;
}

const API_READY = !!process.env['NEXT_PUBLIC_API_URL'];

export default function UsuariosPage() {
  return (
    <AuthGuard allowedRoles={['SuperAdmin']}>
      <UsuariosContent />
    </AuthGuard>
  );
}

function UsuariosContent() {
  const [usuarios, setUsuarios] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(API_READY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!API_READY) return;
    listOrganizadores()
      .then(setUsuarios)
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!API_READY) {
      setError('API no configurada. Agrega NEXT_PUBLIC_API_URL en .env.local');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await createOrganizador(nombre, email);
      setSuccess(
        `✅ Cuenta creada para ${email}. Recibirán un correo con sus credenciales temporales.`,
      );
      setNombre('');
      setEmail('');
      // Reload list
      const updated = await listOrganizadores();
      setUsuarios(updated);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Usuarios</h1>
        <p className="text-gray-600 mt-1">
          Gestiona las cuentas de organizaciones que pueden crear campañas
        </p>
      </div>

      {/* Create form */}
      <section className="bg-white border rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Agregar organización</h2>
          <p className="text-sm text-gray-500 mt-1">
            Se creará una cuenta con contraseña temporal y se enviará un correo de bienvenida.
          </p>
        </div>

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

        <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Nombre de la organización *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              placeholder="Ej: Refugio Patitas Felices"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Correo electrónico *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="org@ejemplo.com"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving || !nombre || !email}
              className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 text-sm"
            >
              {saving ? 'Creando cuenta…' : '+ Agregar organización'}
            </button>
          </div>
        </form>

        {!API_READY && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            ⚠️ API no configurada. Las cuentas se podrán crear cuando el backend esté desplegado.
          </p>
        )}
      </section>

      {/* Users list */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          Organizaciones registradas
          {!loading && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({usuarios.length})
            </span>
          )}
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : !API_READY ? (
          <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-2xl">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-sm">La lista estará disponible cuando el backend esté configurado</p>
          </div>
        ) : usuarios.length === 0 ? (
          <div className="text-center py-12 text-gray-500 border-2 border-dashed rounded-2xl">
            <p className="text-4xl mb-3">👥</p>
            <p>No hay organizaciones registradas aún.</p>
            <p className="text-sm mt-1 text-gray-400">
              Agrega la primera organización usando el formulario de arriba.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {usuarios.map((u) => (
              <div
                key={u.userId}
                className="bg-white border rounded-2xl px-5 py-4 flex items-center justify-between"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-gray-900">{u.nombre}</p>
                  <p className="text-sm text-gray-500">{u.email}</p>
                  <p className="text-xs text-gray-400">
                    Agregado el {new Date(u.createdAt).toLocaleDateString('es-CR')}
                  </p>
                </div>
                <span
                  className={`text-xs px-3 py-1 rounded-full font-medium ${
                    u.confirmado
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {u.confirmado ? '✓ Activo' : '⏳ Pendiente'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
