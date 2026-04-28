'use client';

import { useState } from 'react';
import { scanQR } from '@/lib/api';
import type { Registration } from '@castrar-cr/types';

export default function CheckinPage() {
  const [qrToken, setQrToken] = useState('');
  const [scanning, setScanning] = useState(false);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [error, setError] = useState('');

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanning(true);
    setError('');
    setRegistration(null);
    try {
      const result = await scanQR(qrToken.trim());
      setRegistration(result.registration);
      setQrToken('');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Check-in QR</h1>
        <p className="text-gray-600 mt-1">Ingresa el código QR del registro para confirmar asistencia</p>
      </div>

      <form onSubmit={handleScan} className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Código QR</label>
          <input
            type="text"
            value={qrToken}
            onChange={(e) => setQrToken(e.target.value)}
            placeholder="Escanea o ingresa el token QR"
            required
            autoFocus
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={scanning || !qrToken.trim()}
          className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {scanning ? 'Procesando…' : '✓ Confirmar Check-in'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-4 rounded-2xl">
          <p className="font-medium">❌ {error}</p>
        </div>
      )}

      {registration && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-bold text-green-800 text-lg">Check-in exitoso</p>
              <p className="text-sm text-green-700">Registro #{registration.regId.slice(0, 8)}</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Mascotas:</p>
            <div className="space-y-1">
              {registration.pets.map((pet) => (
                <div key={pet.petId} className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">✓</span>
                  <span className="font-medium">{pet.nombre}</span>
                  <span className="text-gray-500 capitalize">— {pet.estadoCirugia}</span>
                </div>
              ))}
            </div>
          </div>

          {registration.checkedInAt && (
            <p className="text-xs text-gray-500">
              Registrado a las {new Date(registration.checkedInAt).toLocaleTimeString('es-CR')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
