'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCampaign, listMyPets, createRegistration } from '@/lib/api';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Campaign, PetProfile, CampaignSlot, CampaignVenue } from '@castrar-cr/types';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedVenue, setSelectedVenue] = useState<CampaignVenue | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CampaignSlot | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [step, setStep] = useState(1);

  useEffect(() => {
    Promise.all([
      getCampaign(id).then(setCampaign),
      getCurrentUser()
        .then(() => {
          setIsAuthenticated(true);
          return listMyPets().then(setPets);
        })
        .catch(() => setIsAuthenticated(false)),
    ])
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const venueSlots = campaign?.slots.filter((s) => s.venueId === selectedVenue?.venueId) ?? [];

  const togglePet = (petId: string) =>
    setSelectedPetIds((prev) =>
      prev.includes(petId) ? prev.filter((p) => p !== petId) : [...prev, petId],
    );

  const handleRegister = async () => {
    if (!selectedVenue || !selectedSlot || selectedPetIds.length === 0) {
      setError('Selecciona sede, turno y al menos una mascota');
      return;
    }
    setRegistering(true);
    setError('');
    try {
      const result = await createRegistration({
        campaignId: id,
        slotId: selectedSlot.slotId,
        venueId: selectedVenue.venueId,
        petIds: selectedPetIds,
      });
      setSuccess(
        result.estado === 'confirmada'
          ? 'Registro exitoso. Ya puedes ver tu QR en Mis Registros.'
          : 'Fuiste agregado a la lista de espera. Te notificaremos si se libera un cupo.',
      );
      setTimeout(() => router.push('/mis-registros'), 2500);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="h-40 bg-gradient-to-br from-brand-600 to-brand-500" />
        <div className="px-4 -mt-6 max-w-2xl mx-auto space-y-4 pt-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 skeleton" />)}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return <div className="px-4 py-16 text-center text-red-500">Campaña no encontrada</div>;
  }

  const STEP_LABELS = ['Sede', 'Turno', 'Mascotas', 'Confirmar'];

  return (
    <div>
      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-500 to-cyan-500 px-4 pt-8 pb-10 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10" />
        <div className="max-w-2xl mx-auto relative">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-white/70 hover:text-white text-sm mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver
          </button>
          <span className="inline-flex items-center gap-1.5 bg-green-400/30 text-green-100 text-xs font-bold px-3 py-1 rounded-full mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            Activa
          </span>
          <h1 className="text-2xl font-extrabold text-white leading-snug mb-2">{campaign.titulo}</h1>
          {campaign.descripcion && <p className="text-white/75 text-sm">{campaign.descripcion}</p>}
          <p className="text-white/60 text-xs mt-2">
            {new Date(campaign.fechaInicio).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' — '}
            {new Date(campaign.fechaFin).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="px-4 -mt-7 max-w-2xl mx-auto pb-6 space-y-4">
        {/* Progress bar */}
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center">
            {STEP_LABELS.map((label, i) => {
              const num = i + 1;
              const done = step > num;
              const active = step === num;
              return (
                <div key={label} className="flex items-center flex-1">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${done || active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {done ? '✓' : num}
                    </div>
                    <span className={`text-[10px] font-medium hidden sm:block ${active ? 'text-brand-600' : done ? 'text-slate-600' : 'text-slate-400'}`}>
                      {label}
                    </span>
                  </div>
                  {i < 3 && (
                    <div className={`flex-1 h-0.5 mx-2 transition-colors ${done ? 'bg-brand-400' : 'bg-slate-100'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">⚠️ {error}</div>}
        {success && <div className="bg-green-50 border border-green-100 text-green-700 px-4 py-3 rounded-2xl text-sm">🎉 {success}</div>}

        {/* Step 1 — Sede */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <h2 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">1</span>
            Elige la sede
          </h2>
          <div className="space-y-2">
            {campaign.venues.map((venue) => {
              const sel = selectedVenue?.venueId === venue.venueId;
              return (
                <button
                  key={venue.venueId}
                  onClick={() => { setSelectedVenue(venue); setSelectedSlot(null); setStep(2); }}
                  className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${sel ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-brand-200 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-semibold text-sm ${sel ? 'text-brand-700' : 'text-slate-800'}`}>{venue.nombre}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{venue.direccion}</p>
                      <p className="text-xs text-slate-400 mt-1">🎫 {venue.cuposDisponibles} cupos</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${sel ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                      {sel && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 — Turno */}
        {step >= 2 && selectedVenue && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 animate-fade-up">
            <h2 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">2</span>
              Elige el turno
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {venueSlots.map((slot) => {
                const sel = selectedSlot?.slotId === slot.slotId;
                const full = slot.cuposDisponibles === 0;
                return (
                  <button
                    key={slot.slotId}
                    onClick={() => { if (!full) { setSelectedSlot(slot); setStep(3); } }}
                    disabled={full}
                    className={`rounded-2xl p-3 text-center border-2 transition-all ${sel ? 'border-brand-500 bg-brand-500 text-white' : full ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed' : 'border-slate-100 hover:border-brand-300 hover:bg-brand-50'}`}
                  >
                    <p className="font-bold text-xs">{slot.horaInicio}</p>
                    <p className={`text-[10px] mt-0.5 ${sel ? 'text-brand-100' : 'text-slate-500'}`}>
                      {full ? 'Lleno' : `${slot.cuposDisponibles} cupos`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3 — Mascotas */}
        {step >= 3 && selectedSlot && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 animate-fade-up">
            <h2 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">3</span>
              Elige tus mascotas
            </h2>
            {!isAuthenticated ? (
              <div className="text-center py-4">
                <p className="text-slate-600 text-sm mb-3">Inicia sesión para continuar</p>
                <a href="/auth/login" className="btn-primary px-6 py-2.5 text-sm inline-block">Iniciar sesión</a>
              </div>
            ) : pets.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-slate-500 text-sm">No tienes mascotas registradas.</p>
                <a href="/mis-mascotas" className="text-brand-500 font-semibold text-sm mt-1 block">+ Agregar mascota →</a>
              </div>
            ) : (
              <div className="space-y-2">
                {pets.map((pet) => {
                  const sel = selectedPetIds.includes(pet.petId);
                  return (
                    <label
                      key={pet.petId}
                      className={`flex items-center gap-3 rounded-2xl p-4 border-2 cursor-pointer transition-all ${sel ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-brand-200'}`}
                    >
                      <input type="checkbox" className="sr-only" checked={sel} onChange={() => togglePet(pet.petId)} />
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${sel ? 'bg-brand-500 border-brand-500' : 'border-slate-300'}`}>
                        {sel && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="w-10 h-10 rounded-2xl bg-brand-100 flex items-center justify-center text-xl flex-shrink-0">
                        {pet.especie === 'perro' ? '🐕' : pet.especie === 'gato' ? '🐈' : '🐾'}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{pet.nombre}</p>
                        <p className="text-xs text-slate-500 capitalize">{pet.especie} · {pet.sexo}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            {selectedPetIds.length > 0 && (
              <button onClick={() => setStep(4)} className="mt-4 w-full btn-primary py-3 text-sm">
                Continuar ({selectedPetIds.length} mascota{selectedPetIds.length > 1 ? 's' : ''})
              </button>
            )}
          </div>
        )}

        {/* Step 4 — Confirmar */}
        {step >= 4 && selectedSlot && selectedVenue && selectedPetIds.length > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 animate-fade-up">
            <h2 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">4</span>
              Confirmar registro
            </h2>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5 mb-5 text-sm">
              {[
                ['Sede', selectedVenue.nombre],
                ['Turno', selectedSlot.horaInicio],
                ['Mascotas', pets.filter((p) => selectedPetIds.includes(p.petId)).map((p) => p.nombre).join(', ')],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-800 text-right">{value}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleRegister}
              disabled={registering}
              className="w-full btn-primary py-4 text-sm flex items-center justify-center gap-2"
            >
              {registering ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Registrando…
                </>
              ) : (
                'Confirmar registro'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
