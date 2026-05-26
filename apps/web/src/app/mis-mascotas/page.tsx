'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { listMyPets, createPet, getUploadUrl, updatePetPhoto } from '@/lib/api';
import type { PetProfile, PetSpecies, PetSex } from '@castrar-cr/types';

const ESPECIE_EMOJI: Record<PetSpecies, string> = { perro: '🐕', gato: '🐈', otro: '🐾' };
const CDN_URL = process.env['NEXT_PUBLIC_CDN_URL'] ?? '';
const API_READY = !!process.env['NEXT_PUBLIC_API_URL'];

export default function MisMascotasPage() {
  const router = useRouter();
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [loading, setLoading] = useState(API_READY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [nombre, setNombre] = useState('');
  const [especie, setEspecie] = useState<PetSpecies>('perro');
  const [sexo, setSexo] = useState<PetSex>('macho');
  const [raza, setRaza] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [edadAnios, setEdadAnios] = useState('');
  const [condicionSalud, setCondicionSalud] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!API_READY) return;
    listMyPets()
      .then(setPets)
      .catch((err: unknown) => {
        const e = err as Error & { code?: string };
        if (e.code === 'UNAUTHORIZED') {
          router.push('/auth/login?redirect=/mis-mascotas');
          return;
        }
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const resetForm = () => {
    setNombre(''); setRaza(''); setPesoKg(''); setEdadAnios(''); setCondicionSalud('');
    setEspecie('perro'); setSexo('macho');
    setPhotoFile(null); setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // 1. Crear mascota
      const { petId } = await createPet({
        nombre, especie, sexo,
        raza: raza || undefined,
        pesoKg: pesoKg ? parseFloat(pesoKg) : undefined,
        edadAnios: edadAnios ? parseInt(edadAnios) : undefined,
        condicionSalud: condicionSalud || undefined,
      });

      // 2. Subir foto si hay una seleccionada
      if (photoFile && API_READY) {
        try {
          const { uploadUrl, key } = await getUploadUrl(petId, photoFile.type);
          await fetch(uploadUrl, {
            method: 'PUT',
            body: photoFile,
            headers: { 'Content-Type': photoFile.type },
          });
          await updatePetPhoto(petId, key);
        } catch {
          // Foto falló, pero mascota ya se creó — no bloqueamos
          console.warn('No se pudo subir la foto, pero la mascota fue creada.');
        }
      }

      const updated = await listMyPets();
      setPets(updated);
      setShowForm(false);
      resetForm();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const petPhotoUrl = (pet: PetProfile): string | null => {
    const key = pet.fotosS3Keys?.[0];
    if (!key) return null;
    if (CDN_URL) return `${CDN_URL}/${key}`;
    return null;
  };

  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-500 px-4 pt-8 pb-10">
        <div className="max-w-2xl mx-auto flex items-end justify-between">
          <div>
            <p className="text-brand-100 text-xs font-semibold mb-1 uppercase tracking-widest">Mi cuenta</p>
            <h1 className="text-2xl font-extrabold text-white">Mis Mascotas</h1>
            <p className="text-brand-100 text-sm mt-0.5">Gestiona el perfil de tus mascotas</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 bg-white text-brand-600 font-bold text-sm px-4 py-2.5 rounded-2xl shadow-sm hover:shadow-md transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Agregar
          </button>
        </div>
      </div>

      <div className="px-4 -mt-7 max-w-2xl mx-auto space-y-4 pb-6">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">⚠️ {error}</div>
        )}

        {/* Add form */}
        {showForm && (
          <div className="bg-white rounded-3xl shadow-md border border-slate-100 overflow-hidden animate-fade-up">
            <div className="bg-gradient-to-r from-brand-500 to-cyan-500 px-5 py-4">
              <h2 className="font-bold text-white">Nueva mascota</h2>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">

              {/* Foto */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">Foto (opcional)</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200">
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">{ESPECIE_EMOJI[especie]}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="btn-outline text-xs py-2 px-4"
                    >
                      📷 {photoFile ? 'Cambiar foto' : 'Seleccionar foto'}
                    </button>
                    {photoFile && (
                      <p className="text-xs text-slate-500 mt-1 truncate max-w-[180px]">{photoFile.name}</p>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre *" className="col-span-2">
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                    className="input-field"
                    placeholder="Ej: Max"
                  />
                </Field>
                <Field label="Especie">
                  <select value={especie} onChange={(e) => setEspecie(e.target.value as PetSpecies)} className="input-field">
                    <option value="perro">🐕 Perro</option>
                    <option value="gato">🐈 Gato</option>
                    <option value="otro">🐾 Otro</option>
                  </select>
                </Field>
                <Field label="Sexo">
                  <select value={sexo} onChange={(e) => setSexo(e.target.value as PetSex)} className="input-field">
                    <option value="macho">Macho</option>
                    <option value="hembra">Hembra</option>
                  </select>
                </Field>
                <Field label="Raza">
                  <input type="text" value={raza} onChange={(e) => setRaza(e.target.value)} className="input-field" placeholder="Ej: Labrador" />
                </Field>
                <Field label="Peso (kg)">
                  <input type="number" step="0.1" min="0" value={pesoKg} onChange={(e) => setPesoKg(e.target.value)} className="input-field" placeholder="Ej: 5.2" />
                </Field>
                <Field label="Edad (años)" className="col-span-2">
                  <input type="number" min="0" value={edadAnios} onChange={(e) => setEdadAnios(e.target.value)} className="input-field" placeholder="Ej: 3" />
                </Field>
                <Field label="Condición de salud" className="col-span-2">
                  <textarea
                    value={condicionSalud}
                    onChange={(e) => setCondicionSalud(e.target.value)}
                    rows={2}
                    className="input-field resize-none"
                    placeholder="Alergias, enfermedades, medicamentos…"
                  />
                </Field>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving} className="btn-primary flex-1 py-3 text-sm">
                  {saving ? 'Guardando…' : 'Guardar mascota'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="btn-outline flex-1 py-3 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid sm:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => <div key={i} className="h-36 skeleton" />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && pets.length === 0 && !showForm && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-5xl">🐾</span>
            </div>
            <p className="font-semibold text-slate-700 text-lg">Sin mascotas registradas</p>
            <p className="text-slate-500 text-sm mt-1">Agrega a tu primera mascota para comenzar.</p>
            <button onClick={() => setShowForm(true)} className="mt-5 btn-primary px-6 py-3 text-sm inline-block">
              + Agregar mascota
            </button>
          </div>
        )}

        {/* Pet cards */}
        {!loading && pets.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4">
            {pets.map((pet) => {
              const foto = petPhotoUrl(pet);
              return (
                <div key={pet.petId} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 border border-slate-100">
                      {foto ? (
                        <img src={foto} alt={pet.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-brand-100 to-cyan-100 flex items-center justify-center text-3xl">
                          {ESPECIE_EMOJI[pet.especie]}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-base">{pet.nombre}</p>
                      <p className="text-xs text-slate-500 capitalize">{pet.especie} · {pet.sexo}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {pet.raza && <InfoRow label="Raza" value={pet.raza} />}
                    {pet.pesoKg && <InfoRow label="Peso" value={`${pet.pesoKg} kg`} />}
                    {pet.edadAnios !== undefined && (
                      <InfoRow label="Edad" value={`${pet.edadAnios} año${pet.edadAnios !== 1 ? 's' : ''}`} />
                    )}
                    {pet.condicionSalud && (
                      <div className="mt-2 bg-amber-50 rounded-xl px-3 py-2 text-xs text-amber-700">
                        {pet.condicionSalud}
                      </div>
                    )}
                  </div>

                  {/* Botón de pre-evaluación médica */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    {(pet as Record<string, unknown>)['screenedAt'] ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                          <span aria-hidden="true">✅</span> Pre-evaluación completa
                        </span>
                        <Link
                          href={`/mis-mascotas/${pet.petId}/screening`}
                          className="text-xs text-brand-600 font-semibold underline underline-offset-2 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded"
                          aria-label={`Actualizar pre-evaluación de ${pet.nombre}`}
                        >
                          Actualizar
                        </Link>
                      </div>
                    ) : (
                      <Link
                        href={`/mis-mascotas/${pet.petId}/screening`}
                        className="flex items-center justify-center gap-2 w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-brand-700 transition-colors min-h-[44px] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400"
                        aria-label={`Completar pre-evaluación médica de ${pet.nombre}`}
                      >
                        🩺 Completar pre-evaluación médica
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

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
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
