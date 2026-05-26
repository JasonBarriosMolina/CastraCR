'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getCampaign, updateCampaign, publishCampaign, listApprovedVets } from '@/lib/api';
import type { ApprovedVet } from '@/lib/api';
import type { Campaign, CampaignVenue, CampaignSlot, CampaignVet, TipoAnimal, Especie } from '@castrar-cr/types';
import { VenueMapPicker } from '@/components/VenueMapPicker';

// ── helpers ──────────────────────────────────────────────────────────────────

function slotLabel(s: CampaignSlot): string {
  const inicio = s.horaInicio ?? (s as unknown as Record<string, string>)['hora'] ?? '—';
  return s.horaFin ? `${inicio} – ${s.horaFin}` : inicio;
}

const especieEmoji: Record<Especie, string> = { perro: '🐕', gato: '🐈', otro: '🐾' };

const estadoBadge: Record<string, string> = {
  borrador:   'bg-yellow-100 text-yellow-700',
  activa:     'bg-green-100 text-green-700',
  finalizada: 'bg-gray-100 text-gray-600',
  cancelada:  'bg-red-100 text-red-600',
};

// ── component ─────────────────────────────────────────────────────────────────

export default function AdminCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [publishing, setPublishing] = useState(false);

  // ── add venue form ────────────────────────────────────────────────────────
  const [venueName, setVenueName]           = useState('');
  const [venueDireccion, setVenueDireccion] = useState('');
  const [venueLat, setVenueLat]             = useState('');
  const [venueLng, setVenueLng]             = useState('');
  const [venueCupos, setVenueCupos]         = useState('');
  const [savingVenue, setSavingVenue]       = useState(false);

  // ── edit venue ────────────────────────────────────────────────────────────
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [evName, setEvName]       = useState('');
  const [evDir, setEvDir]         = useState('');
  const [evLat, setEvLat]         = useState('');
  const [evLng, setEvLng]         = useState('');
  const [evCupos, setEvCupos]     = useState('');
  const [savingEdit, setSavingEdit]   = useState(false);
  const [removingVenueId, setRemovingVenueId] = useState<string | null>(null);

  // ── add slot form ─────────────────────────────────────────────────────────
  const [slotHoraInicio, setSlotHoraInicio] = useState('');
  const [slotHoraFin, setSlotHoraFin]       = useState('');
  const [slotVenueId, setSlotVenueId]       = useState('');
  const [slotCupos, setSlotCupos]           = useState('');
  const [savingSlot, setSavingSlot]         = useState(false);

  // ── edit slot ─────────────────────────────────────────────────────────────
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [esInicio, setEsInicio] = useState('');
  const [esFin, setEsFin]       = useState('');
  const [esVenue, setEsVenue]   = useState('');
  const [esCupos, setEsCupos]   = useState('');
  const [savingSlotEdit, setSavingSlotEdit]   = useState(false);
  const [removingSlotId, setRemovingSlotId]   = useState<string | null>(null);

  // ── add animal type ───────────────────────────────────────────────────────
  const [tipoEspecie, setTipoEspecie]         = useState<Especie>('perro');
  const [tipoDescripcion, setTipoDescripcion] = useState('');
  const [tipoCantidad, setTipoCantidad]       = useState('');
  const [tipoPesoMin, setTipoPesoMin]         = useState('');
  const [tipoPesoMax, setTipoPesoMax]         = useState('');
  const [tipoEdadMin, setTipoEdadMin]         = useState('');
  const [tipoEdadMax, setTipoEdadMax]         = useState('');
  const [tipoPrecioCRC, setTipoPrecioCRC]     = useState('');
  const [savingTipo, setSavingTipo]           = useState(false);
  const [removingTipoId, setRemovingTipoId]   = useState<string | null>(null);

  // ── vets ─────────────────────────────────────────────────────────────────
  const [approvedVets, setApprovedVets]       = useState<ApprovedVet[]>([]);
  const [vetSearch, setVetSearch]             = useState('');
  const [showVetSearch, setShowVetSearch]     = useState(false);
  const [loadingVets, setLoadingVets]         = useState(false);
  const [removingVetId, setRemovingVetId]     = useState<string | null>(null);
  const vetSearchRef = useRef<HTMLDivElement>(null);

  // Cierra dropdown si se hace click fuera
  useEffect(() => {
    if (!showVetSearch) return;
    const handler = (e: MouseEvent) => {
      if (vetSearchRef.current && !vetSearchRef.current.contains(e.target as Node)) {
        setShowVetSearch(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVetSearch]);

  useEffect(() => {
    getCampaign(id)
      .then(setCampaign)
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const refresh = async () => { setCampaign(await getCampaign(id)); };

  // Pide confirmación si la campaña está activa (para evitar desinformación)
  const confirmIfActive = (action: string): boolean => {
    if (!campaign || campaign.estado !== 'activa') return true;
    return confirm(
      `⚠️ Esta campaña está ACTIVA y visible para los dueños de mascotas.\n\n` +
      `¿Seguro que querés ${action}?\n\n` +
      `Los usuarios que ya vieron la información original podrían recibir datos diferentes.`,
    );
  };

// ── Add venue ──────────────────────────────────────────────────────────────
  const handleAddVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmIfActive('agregar una sede')) return;
    const lat = parseFloat(venueLat);
    const lng = parseFloat(venueLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Coordenadas inválidas. Usá el botón "📍 Autocompletar" o el mapa para obtener coordenadas reales.');
      return;
    }
    setSavingVenue(true); setError(''); setSuccess('');
    try {
      await updateCampaign(id, { addVenue: { nombre: venueName, direccion: venueDireccion, coordenadas: { lat, lng }, cuposTotal: parseInt(venueCupos) } });
      await refresh(); setSuccess('✅ Sede agregada');
      setVenueName(''); setVenueDireccion(''); setVenueLat(''); setVenueLng(''); setVenueCupos('');
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSavingVenue(false); }
  };

  // ── Start editing venue ────────────────────────────────────────────────────
  const startEditVenue = (v: CampaignVenue) => {
    setEditingVenueId(v.venueId);
    setEvName(v.nombre); setEvDir(v.direccion);
    setEvLat(v.coordenadas.lat.toFixed(6)); setEvLng(v.coordenadas.lng.toFixed(6));
    setEvCupos(String(v.cuposTotal));
  };

  // ── Save venue edit ────────────────────────────────────────────────────────
  const handleEditVenue = async (e: React.FormEvent, venueId: string) => {
    e.preventDefault();
    if (!confirmIfActive('editar esta sede')) return;
    const lat = parseFloat(evLat);
    const lng = parseFloat(evLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Coordenadas inválidas. Usá el botón "📍 Autocompletar" o el mapa para obtener coordenadas reales.');
      return;
    }
    setSavingEdit(true); setError(''); setSuccess('');
    try {
      await updateCampaign(id, { editVenue: { venueId, nombre: evName, direccion: evDir, coordenadas: { lat, lng }, cuposTotal: parseInt(evCupos) } });
      await refresh(); setSuccess('✅ Sede actualizada'); setEditingVenueId(null);
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSavingEdit(false); }
  };

  // ── Remove venue ───────────────────────────────────────────────────────────
  const handleRemoveVenue = async (venueId: string, nombre: string) => {
    if (!confirmIfActive(`eliminar la sede "${nombre}"`)) return;
    if (!confirm(`¿Eliminar la sede "${nombre}"? Esta acción no se puede deshacer.`)) return;
    setRemovingVenueId(venueId); setError(''); setSuccess('');
    try {
      await updateCampaign(id, { removeVenue: { venueId } });
      await refresh(); setSuccess('✅ Sede eliminada');
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setRemovingVenueId(null); }
  };

  // ── Add slot ───────────────────────────────────────────────────────────────
  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmIfActive('agregar un turno')) return;
    setSavingSlot(true); setError(''); setSuccess('');
    try {
      await updateCampaign(id, { addSlot: { horaInicio: slotHoraInicio, horaFin: slotHoraFin || undefined, venueId: slotVenueId, cuposTotal: parseInt(slotCupos) } });
      await refresh(); setSuccess('✅ Turno agregado');
      setSlotHoraInicio(''); setSlotHoraFin(''); setSlotVenueId(''); setSlotCupos('');
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSavingSlot(false); }
  };

  // ── Start editing slot ─────────────────────────────────────────────────────
  const startEditSlot = (s: CampaignSlot) => {
    setEditingSlotId(s.slotId);
    setEsInicio(s.horaInicio ?? (s as unknown as Record<string, string>)['hora'] ?? '');
    setEsFin(s.horaFin ?? '');
    setEsVenue(s.venueId);
    setEsCupos(String(s.cuposTotal));
  };

  // ── Save slot edit ─────────────────────────────────────────────────────────
  const handleEditSlot = async (e: React.FormEvent, slotId: string) => {
    e.preventDefault();
    if (!confirmIfActive('editar este turno')) return;
    setSavingSlotEdit(true); setError(''); setSuccess('');
    try {
      await updateCampaign(id, { editSlot: { slotId, horaInicio: esInicio, horaFin: esFin || null, venueId: esVenue, cuposTotal: parseInt(esCupos) } });
      await refresh(); setSuccess('✅ Turno actualizado'); setEditingSlotId(null);
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSavingSlotEdit(false); }
  };

  // ── Remove slot ────────────────────────────────────────────────────────────
  const handleRemoveSlot = async (slotId: string, label: string) => {
    if (!confirmIfActive(`eliminar el turno "${label}"`)) return;
    if (!confirm(`¿Eliminar el turno "${label}"?`)) return;
    setRemovingSlotId(slotId); setError(''); setSuccess('');
    try {
      await updateCampaign(id, { removeSlot: { slotId } });
      await refresh(); setSuccess('✅ Turno eliminado');
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setRemovingSlotId(null); }
  };

  // ── Add animal type ────────────────────────────────────────────────────────
  const handleAddTipo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoCantidad || parseInt(tipoCantidad) < 1) { setError('La cantidad debe ser mayor a 0.'); return; }
    if (!confirmIfActive('agregar un tipo de animal')) return;
    setSavingTipo(true); setError(''); setSuccess('');
    try {
      await updateCampaign(id, { addAnimalType: { especie: tipoEspecie, descripcion: tipoDescripcion || undefined, cantidad: parseInt(tipoCantidad), pesoMin: tipoPesoMin ? parseFloat(tipoPesoMin) : undefined, pesoMax: tipoPesoMax ? parseFloat(tipoPesoMax) : undefined, edadMin: tipoEdadMin ? parseInt(tipoEdadMin) : undefined, edadMax: tipoEdadMax ? parseInt(tipoEdadMax) : undefined, precioCRC: tipoPrecioCRC ? parseInt(tipoPrecioCRC) : 0 } });
      await refresh(); setSuccess('✅ Tipo de animal agregado');
      setTipoEspecie('perro'); setTipoDescripcion(''); setTipoCantidad('');
      setTipoPesoMin(''); setTipoPesoMax(''); setTipoEdadMin(''); setTipoEdadMax('');
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSavingTipo(false); }
  };

  // ── Remove animal type ─────────────────────────────────────────────────────
  const handleRemoveTipo = async (tipoId: string, label: string) => {
    if (!confirmIfActive(`eliminar "${label}"`)) return;
    if (!confirm(`¿Eliminar el tipo "${label}"?`)) return;
    setRemovingTipoId(tipoId); setError(''); setSuccess('');
    try {
      await updateCampaign(id, { removeAnimalType: { tipoId } });
      await refresh(); setSuccess('✅ Tipo eliminado');
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setRemovingTipoId(null); }
  };

  // ── Open vet search ────────────────────────────────────────────────────────
  const openVetSearch = async () => {
    setShowVetSearch(true);
    if (approvedVets.length === 0) {
      setLoadingVets(true);
      try { setApprovedVets(await listApprovedVets()); }
      catch { /* silencioso */ }
      finally { setLoadingVets(false); }
    }
  };

  // ── Add vet from approved list ─────────────────────────────────────────────
  const handleAddVet = async (vet: ApprovedVet) => {
    if (!confirmIfActive('agregar este veterinario')) return;
    // Evitar duplicado
    if (campaign?.vets?.some((v) => v.vetId === vet.vetId)) {
      setError(`${vet.nombre} ya está asignado a esta campaña.`);
      return;
    }
    setError(''); setSuccess('');
    try {
      await updateCampaign(id, { addVet: { nombre: vet.nombre, colegiatura: vet.colegiatura, visiblePublico: true } });
      await refresh();
      setSuccess(`✅ ${vet.nombre} agregado`);
      setShowVetSearch(false);
      setVetSearch('');
    } catch (err: unknown) { setError((err as Error).message); }
  };

  // ── Remove vet ─────────────────────────────────────────────────────────────
  const handleRemoveVet = async (vetId: string, nombre: string) => {
    if (!confirmIfActive(`remover a ${nombre}`)) return;
    if (!confirm(`¿Remover a "${nombre}" de la campaña?`)) return;
    setRemovingVetId(vetId); setError(''); setSuccess('');
    try {
      await updateCampaign(id, { removeVet: { vetId } });
      await refresh(); setSuccess(`✅ ${nombre} removido`);
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setRemovingVetId(null); }
  };

  // ── Publish ────────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!confirm('¿Publicar esta campaña? Quedará visible para los dueños de mascotas.')) return;
    setPublishing(true); setError('');
    try { await publishCampaign(id); await refresh(); setSuccess('🚀 Campaña publicada'); }
    catch (err: unknown) { setError((err as Error).message); }
    finally { setPublishing(false); }
  };

  if (loading) return <div className="py-12 text-center text-gray-500">Cargando campaña…</div>;
  if (!campaign) return <div className="py-12 text-center text-red-500">Campaña no encontrada</div>;

  const canEdit = campaign.estado !== 'finalizada' && campaign.estado !== 'cancelada';

  return (
    <div className="space-y-8 max-w-3xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-gray-900">{campaign.titulo}</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${estadoBadge[campaign.estado] ?? 'bg-gray-100 text-gray-600'}`}>
              {campaign.estado}
            </span>
          </div>
          <p className="text-gray-600">{campaign.descripcion}</p>
        </div>
        {campaign.estado === 'borrador' && (
          <button onClick={handlePublish} disabled={publishing} className="shrink-0 bg-green-600 text-white px-5 py-2 rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
            {publishing ? 'Publicando…' : '🚀 Publicar'}
          </button>
        )}
      </div>

      {campaign.estado === 'activa' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex gap-2">
          <span>⚠️</span>
          <span>Campaña activa — cualquier cambio pedirá confirmación para evitar desinformación a usuarios registrados.</span>
        </div>
      )}
      {!canEdit && (
        <div className="bg-gray-50 border text-gray-600 px-4 py-3 rounded-xl text-sm">
          Esta campaña está <strong>{campaign.estado}</strong> y ya no se puede modificar.
        </div>
      )}

      {error   && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm">{success}</div>}

      {/* ── Tipos de animales ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Tipos de animales ({campaign.tiposAnimales?.length ?? 0})</h2>

        {(campaign.tiposAnimales?.length ?? 0) > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {(campaign.tiposAnimales ?? []).map((t: TipoAnimal) => (
              <div key={t.tipoId} className="bg-white border rounded-xl p-4 flex gap-3 items-start">
                <span className="text-2xl leading-none mt-0.5">{especieEmoji[t.especie]}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 capitalize">{t.especie}</p>
                  {t.descripcion && <p className="text-sm text-gray-600">{t.descripcion}</p>}
                  <p className="text-sm font-medium text-brand-700 mt-0.5">{t.cantidad} cupos</p>
                  <p className="text-xs font-semibold mt-0.5">
                    {(t.precioCRC ?? 0) > 0
                      ? <span className="text-emerald-700">₡{t.precioCRC!.toLocaleString('es-CR')} / mascota</span>
                      : <span className="text-gray-400">Gratuita</span>}
                  </p>
                  <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                    {(t.pesoMin != null || t.pesoMax != null) && (
                      <span>Peso: {t.pesoMin != null ? `≥${t.pesoMin}kg` : ''}{t.pesoMin != null && t.pesoMax != null ? '–' : ''}{t.pesoMax != null ? `≤${t.pesoMax}kg` : ''}</span>
                    )}
                    {(t.edadMin != null || t.edadMax != null) && (
                      <span>Edad: {t.edadMin != null ? `≥${t.edadMin}m` : ''}{t.edadMin != null && t.edadMax != null ? '–' : ''}{t.edadMax != null ? `≤${t.edadMax}m` : ''}</span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={() => void handleRemoveTipo(t.tipoId, `${t.especie}${t.descripcion ? ` – ${t.descripcion}` : ''}`)}
                    disabled={removingTipoId === t.tipoId}
                    className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 text-lg leading-none shrink-0"
                    title="Eliminar"
                  >
                    {removingTipoId === t.tipoId ? '…' : '×'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <form onSubmit={handleAddTipo} className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="font-medium text-gray-700 text-sm">Agregar tipo de animal</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className={lbl}>Especie *</label>
                <select value={tipoEspecie} onChange={(e) => setTipoEspecie(e.target.value as Especie)} className={inp}>
                  <option value="perro">🐕 Perro</option>
                  <option value="gato">🐈 Gato</option>
                  <option value="otro">🐾 Otro</option>
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className={lbl}>Descripción / segmento (opcional)</label>
                <input type="text" placeholder='Ej: "mayor a 10 kg", "cachorro"' value={tipoDescripcion} onChange={(e) => setTipoDescripcion(e.target.value)} className={inp} />
              </div>
              <div className="space-y-1">
                <label className={lbl}>Cupos *</label>
                <input type="number" min="1" value={tipoCantidad} onChange={(e) => setTipoCantidad(e.target.value)} required className={inp} placeholder="Ej: 20" />
              </div>
              <div className="space-y-1">
                <label className={lbl}>Peso mín. kg</label>
                <input type="number" min="0" step="0.1" value={tipoPesoMin} onChange={(e) => setTipoPesoMin(e.target.value)} className={inp} placeholder="Ej: 5" />
              </div>
              <div className="space-y-1">
                <label className={lbl}>Peso máx. kg</label>
                <input type="number" min="0" step="0.1" value={tipoPesoMax} onChange={(e) => setTipoPesoMax(e.target.value)} className={inp} placeholder="Ej: 20" />
              </div>
              <div className="space-y-1">
                <label className={lbl}>Edad mín. meses</label>
                <input type="number" min="0" value={tipoEdadMin} onChange={(e) => setTipoEdadMin(e.target.value)} className={inp} placeholder="Ej: 6" />
              </div>
              <div className="space-y-1">
                <label className={lbl}>Edad máx. meses</label>
                <input type="number" min="0" value={tipoEdadMax} onChange={(e) => setTipoEdadMax(e.target.value)} className={inp} placeholder="Ej: 84" />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <label className={lbl}>Precio por mascota en CRC (0 = gratuita)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">₡</span>
                  <input type="number" min="0" step="100" value={tipoPrecioCRC} onChange={(e) => setTipoPrecioCRC(e.target.value)} className={`${inp} pl-8`} placeholder="Ej: 5000 · Dejá en 0 si es gratis" />
                </div>
              </div>
            </div>
            <button type="submit" disabled={savingTipo} className={btnPrimary}>{savingTipo ? 'Agregando…' : '+ Agregar tipo'}</button>
          </form>
        )}
      </section>

      {/* ── Sedes ──────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Sedes ({campaign.venues?.length ?? 0})</h2>

        <div className="grid gap-3">
          {(campaign.venues ?? []).map((v: CampaignVenue) => (
            <div key={v.venueId} className="bg-white border rounded-xl overflow-hidden">
              {editingVenueId === v.venueId ? (
                // ── Inline edit form ────────────────────────────────────────
                <form onSubmit={(e) => void handleEditVenue(e, v.venueId)} className="p-4 space-y-3 bg-blue-50">
                  <p className="text-xs font-semibold text-blue-700">Editando sede</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={lbl}>Nombre *</label>
                      <input value={evName} onChange={(e) => setEvName(e.target.value)} required className={inp} />
                    </div>
                    <div className="space-y-1">
                      <label className={lbl}>Cupos totales *</label>
                      <input type="number" min="1" value={evCupos} onChange={(e) => setEvCupos(e.target.value)} required className={inp} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className={lbl}>Ubicación en el mapa *</label>
                      <VenueMapPicker
                        lat={evLat ? parseFloat(evLat) : null}
                        lng={evLng ? parseFloat(evLng) : null}
                        onChange={(lat, lng) => { setEvLat(lat.toFixed(6)); setEvLng(lng.toFixed(6)); }}
                        onPlaceSelect={(name) => { if (!evDir.trim()) setEvDir(name.split(',').slice(0, 3).join(',').trim()); }}
                      />
                      {!evLat && <p className="text-xs text-amber-600">⚠️ Buscá el lugar o hacé click en el mapa para fijar la ubicación.</p>}
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className={lbl}>Dirección / señas para los asistentes</label>
                      <textarea value={evDir} onChange={(e) => setEvDir(e.target.value)} rows={2} placeholder={'Ej: Frente al supermercado La Colonia, edificio azul\n200 m norte del parque central'} className={`${inp} resize-y`} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingEdit} className={btnPrimary}>{savingEdit ? 'Guardando…' : '💾 Guardar cambios'}</button>
                    <button type="button" onClick={() => setEditingVenueId(null)} className={btnGhost}>Cancelar</button>
                  </div>
                </form>
              ) : (
                // ── Display ─────────────────────────────────────────────────
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{v.nombre}</p>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{v.direccion}</p>
                      <p className="text-xs text-gray-400 mt-2">📍 {v.coordenadas.lat.toFixed(5)}, {v.coordenadas.lng.toFixed(5)} · {v.cuposDisponibles}/{v.cuposTotal} cupos</p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEditVenue(v)} className={iconBtn} title="Editar">✏️</button>
                        <button onClick={() => void handleRemoveVenue(v.venueId, v.nombre)} disabled={removingVenueId === v.venueId} className={`${iconBtn} hover:text-red-600`} title="Eliminar">
                          {removingVenueId === v.venueId ? '…' : '🗑'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <form onSubmit={handleAddVenue} className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="font-medium text-gray-700 text-sm">Agregar sede</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={lbl}>Nombre *</label>
                <input value={venueName} onChange={(e) => setVenueName(e.target.value)} required className={inp} placeholder="Ej: Clínica Veterinaria Central" />
              </div>
              <div className="space-y-1">
                <label className={lbl}>Cupos totales *</label>
                <input type="number" min="1" value={venueCupos} onChange={(e) => setVenueCupos(e.target.value)} required className={inp} placeholder="Ej: 50" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className={lbl}>Ubicación en el mapa *</label>
                <VenueMapPicker
                  lat={venueLat ? parseFloat(venueLat) : null}
                  lng={venueLng ? parseFloat(venueLng) : null}
                  onChange={(lat, lng) => { setVenueLat(lat.toFixed(6)); setVenueLng(lng.toFixed(6)); }}
                  onPlaceSelect={(name) => { if (!venueDireccion.trim()) setVenueDireccion(name.split(',').slice(0, 3).join(',').trim()); }}
                />
                {!venueLat && <p className="text-xs text-amber-600">⚠️ Buscá el lugar o hacé click en el mapa para fijar la ubicación.</p>}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className={lbl}>Dirección / señas para los asistentes</label>
                <textarea value={venueDireccion} onChange={(e) => setVenueDireccion(e.target.value)} rows={2} placeholder={'Ej: 200 m norte del parque central, edificio azul'} className={`${inp} resize-y`} />
              </div>
            </div>
            <button type="submit" disabled={savingVenue} className={btnPrimary}>{savingVenue ? 'Agregando…' : '+ Agregar sede'}</button>
          </form>
        )}
      </section>

      {/* ── Turnos ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Turnos ({campaign.slots?.length ?? 0})</h2>

        <div className="grid gap-3">
          {(campaign.slots ?? []).map((s: CampaignSlot) => (
            <div key={s.slotId} className="bg-white border rounded-xl overflow-hidden">
              {editingSlotId === s.slotId ? (
                // ── Inline edit form ────────────────────────────────────────
                <form onSubmit={(e) => void handleEditSlot(e, s.slotId)} className="p-4 space-y-3 bg-blue-50">
                  <p className="text-xs font-semibold text-blue-700">Editando turno</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={lbl}>Hora de inicio *</label>
                      <input type="time" value={esInicio} onChange={(e) => setEsInicio(e.target.value)} required className={inp} />
                    </div>
                    <div className="space-y-1">
                      <label className={lbl}>Hora de fin (opcional)</label>
                      <input type="time" value={esFin} onChange={(e) => setEsFin(e.target.value)} className={inp} />
                    </div>
                    <div className="space-y-1">
                      <label className={lbl}>Sede *</label>
                      <select value={esVenue} onChange={(e) => setEsVenue(e.target.value)} required className={inp}>
                        {campaign.venues.map((v) => <option key={v.venueId} value={v.venueId}>{v.nombre}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={lbl}>Cupos *</label>
                      <input type="number" min="1" value={esCupos} onChange={(e) => setEsCupos(e.target.value)} required className={inp} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingSlotEdit} className={btnPrimary}>{savingSlotEdit ? 'Guardando…' : '💾 Guardar cambios'}</button>
                    <button type="button" onClick={() => setEditingSlotId(null)} className={btnGhost}>Cancelar</button>
                  </div>
                </form>
              ) : (
                // ── Display ─────────────────────────────────────────────────
                <div className="p-4 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-900">{slotLabel(s)}</p>
                    <p className="text-sm text-gray-500">{s.cuposDisponibles}/{s.cuposTotal} cupos</p>
                    <p className="text-xs text-gray-400 truncate">
                      {campaign.venues?.find((v) => v.venueId === s.venueId)?.nombre ?? s.venueId.slice(0, 8)}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => startEditSlot(s)} className={iconBtn} title="Editar">✏️</button>
                      <button onClick={() => void handleRemoveSlot(s.slotId, slotLabel(s))} disabled={removingSlotId === s.slotId} className={`${iconBtn} hover:text-red-600`} title="Eliminar">
                        {removingSlotId === s.slotId ? '…' : '🗑'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {canEdit && campaign.venues?.length > 0 && (
          <form onSubmit={handleAddSlot} className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="font-medium text-gray-700 text-sm">Agregar turno</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={lbl}>Hora de inicio *</label>
                <input type="time" value={slotHoraInicio} onChange={(e) => setSlotHoraInicio(e.target.value)} required className={inp} />
              </div>
              <div className="space-y-1">
                <label className={lbl}>Hora de fin (opcional)</label>
                <input type="time" value={slotHoraFin} onChange={(e) => setSlotHoraFin(e.target.value)} className={inp} />
              </div>
              <div className="space-y-1">
                <label className={lbl}>Sede *</label>
                <select value={slotVenueId} onChange={(e) => setSlotVenueId(e.target.value)} required className={inp}>
                  <option value="">Seleccionar sede…</option>
                  {campaign.venues.map((v) => <option key={v.venueId} value={v.venueId}>{v.nombre}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={lbl}>Cupos *</label>
                <input type="number" min="1" value={slotCupos} onChange={(e) => setSlotCupos(e.target.value)} required className={inp} placeholder="Ej: 10" />
              </div>
            </div>
            <button type="submit" disabled={savingSlot} className={btnPrimary}>{savingSlot ? 'Agregando…' : '+ Agregar turno'}</button>
          </form>
        )}
      </section>

      {/* ── Veterinarios ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Veterinarios ({campaign.vets?.length ?? 0})</h2>

        {/* Lista de vets asignados */}
        {(campaign.vets?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {(campaign.vets ?? []).map((v: CampaignVet) => (
              <div key={v.vetId} className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">🩺 {v.nombre}</p>
                  <p className="text-xs text-gray-400">{v.colegiatura}</p>
                </div>
                {canEdit && (
                  <button
                    onClick={() => void handleRemoveVet(v.vetId, v.nombre)}
                    disabled={removingVetId === v.vetId}
                    className="ml-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 text-lg leading-none"
                    title="Remover"
                  >
                    {removingVetId === v.vetId ? '…' : '×'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Agregar vet desde lista de aprobados */}
        {canEdit && (
          <div className="relative" ref={vetSearchRef}>
            <button
              type="button"
              onClick={() => void openVetSearch()}
              className={btnPrimary}
            >
              + Agregar veterinario aprobado
            </button>

            {showVetSearch && (
              <div className="absolute z-10 mt-2 w-full max-w-sm bg-white border rounded-xl shadow-lg overflow-hidden">
                <div className="p-3 border-b">
                  <input
                    type="text"
                    placeholder="Buscar por nombre o colegiatura…"
                    value={vetSearch}
                    onChange={(e) => setVetSearch(e.target.value)}
                    className={inp}
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {loadingVets ? (
                    <p className="text-sm text-gray-400 px-4 py-3">Cargando veterinarios…</p>
                  ) : approvedVets.filter((v) =>
                    `${v.nombre} ${v.colegiatura}`.toLowerCase().includes(vetSearch.toLowerCase())
                  ).length === 0 ? (
                    <p className="text-sm text-gray-400 px-4 py-3">
                      {vetSearch ? 'Sin resultados' : 'No hay veterinarios aprobados aún'}
                    </p>
                  ) : (
                    approvedVets
                      .filter((v) => `${v.nombre} ${v.colegiatura}`.toLowerCase().includes(vetSearch.toLowerCase()))
                      .map((v) => {
                        const yaAsignado = campaign.vets?.some((cv) => cv.vetId === v.vetId);
                        return (
                          <button
                            key={v.vetId}
                            type="button"
                            onClick={() => { if (!yaAsignado) void handleAddVet(v); }}
                            disabled={yaAsignado}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b last:border-b-0 disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            <p className="text-sm font-medium text-gray-900">{v.nombre}</p>
                            <p className="text-xs text-gray-400">{v.colegiatura}{v.especialidad ? ` · ${v.especialidad}` : ''}{yaAsignado ? ' · ya asignado' : ''}</p>
                          </button>
                        );
                      })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!canEdit && (campaign.vets?.length ?? 0) === 0 && (
          <p className="text-sm text-gray-400">No hay veterinarios asignados.</p>
        )}
      </section>

      {/* ── Costos IA ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">💰 Costos IA & Mensajería</h2>
        <CostWidget campaignId={id} />
      </section>

      {/* ── Reembolsos ──────────────────────────────────────────────────── */}
      {(campaign.estado === 'cancelada' || campaign.estado === 'finalizada') && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">🔄 Reembolsos</h2>
          <RefundPanel campaignId={id} />
        </section>
      )}
    </div>
  );
}

// ── Cost Widget ───────────────────────────────────────────────────────────────

interface CostSummary {
  haikuCalls: number;
  haikuInputTokens: number;
  haikuOutputTokens: number;
  twilioMessages: number;
  totalUsd: number;
  actualizadoEn: string;
}

function CostWidget({ campaignId }: { campaignId: string }) {
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const API = process.env['NEXT_PUBLIC_API_URL'] ?? '';
    const token = typeof window !== 'undefined'
      ? (window as unknown as Record<string, unknown>)['__authToken__'] as string | undefined
      : undefined;

    fetch(`${API}/campaigns/${campaignId}/costs`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then((d: { costs: CostSummary }) => setCosts(d.costs))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) {
    return (
      <div className="bg-white border rounded-2xl p-5 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
        <div className="h-8 bg-gray-100 rounded w-1/4" />
      </div>
    );
  }

  if (!costs) {
    return (
      <div className="bg-white border rounded-2xl p-5">
        <p className="text-sm text-gray-400">Sin datos de costo disponibles.</p>
      </div>
    );
  }

  const haikuUsd = ((costs.haikuInputTokens / 1_000_000) * 0.80 + (costs.haikuOutputTokens / 1_000_000) * 4.00);
  const twilioUsd = costs.twilioMessages * 0.005;

  return (
    <div className="bg-white border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-bold text-gray-900">
          ${costs.totalUsd.toFixed(4)} <span className="text-base font-normal text-gray-500">USD total</span>
        </p>
        <span className="text-xs text-gray-400">
          Actualizado {costs.actualizadoEn ? new Date(costs.actualizadoEn).toLocaleTimeString('es-CR') : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-purple-600 uppercase mb-1">Claude Haiku</p>
          <p className="text-xl font-bold text-purple-800">{costs.haikuCalls} llamadas</p>
          <p className="text-xs text-purple-600 mt-1">
            {(costs.haikuInputTokens / 1000).toFixed(1)}k in · {(costs.haikuOutputTokens / 1000).toFixed(1)}k out tokens
          </p>
          <p className="text-sm font-semibold text-purple-700 mt-2">${haikuUsd.toFixed(4)}</p>
        </div>

        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-green-600 uppercase mb-1">WhatsApp (Twilio)</p>
          <p className="text-xl font-bold text-green-800">{costs.twilioMessages} mensajes</p>
          <p className="text-xs text-green-600 mt-1">~$0.005 por mensaje</p>
          <p className="text-sm font-semibold text-green-700 mt-2">${twilioUsd.toFixed(4)}</p>
        </div>
      </div>

      {costs.totalUsd < 0.20 && (
        <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
          <span aria-hidden="true">✅</span>
          Dentro del presupuesto estimado (&lt;$0.20 / campaña)
        </div>
      )}
      {costs.totalUsd >= 0.20 && (
        <div role="alert" className="flex items-center gap-2 text-amber-700 text-sm font-medium">
          <span aria-hidden="true">⚠️</span>
          Costo supera el estimado de $0.20 / campaña
        </div>
      )}
    </div>
  );
}

// ── Refund Panel ─────────────────────────────────────────────────────────────

interface RefundAppointment {
  regId: string;
  ownerPhone?: string;
  montoCRC: number;
  pets: { nombre: string }[];
  estado: string;
  reembolso?: { estado: string; notaAdmin?: string; procesadoEn?: string };
}

function RefundPanel({ campaignId }: { campaignId: string }) {
  const [appointments, setAppointments] = useState<RefundAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [nota, setNota] = useState<Record<string, string>>({});

  const API = process.env['NEXT_PUBLIC_API_URL'] ?? '';

  const getToken = () =>
    typeof window !== 'undefined'
      ? (window as unknown as Record<string, unknown>)['__authToken__'] as string | undefined
      : undefined;

  useEffect(() => {
    const token = getToken();
    fetch(`${API}/admin/campaigns/${campaignId}/paid-appointments`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d: { appointments?: RefundAppointment[] }) => setAppointments(d.appointments ?? []))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, [campaignId, API]);

  const handleRefundAction = async (regId: string, accion: 'marcar_pendiente' | 'marcar_procesado') => {
    setProcessing(regId);
    const token = getToken();
    try {
      await fetch(`${API}/admin/appointments/${regId}/refund-note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accion, nota: nota[regId] ?? '' }),
      });
      // Refrescar lista
      const r = await fetch(`${API}/admin/campaigns/${campaignId}/paid-appointments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await r.json() as { appointments?: RefundAppointment[] };
      setAppointments(d.appointments ?? []);
    } catch { /* ignore */ }
    finally { setProcessing(null); }
  };

  if (loading) {
    return <div className="bg-white border rounded-2xl p-5 text-sm text-gray-400">Cargando citas pagadas…</div>;
  }

  const pendientes = appointments.filter((a) => a.montoCRC > 0 && a.reembolso?.estado !== 'procesado');
  const procesadas = appointments.filter((a) => a.reembolso?.estado === 'procesado');

  if (appointments.length === 0) {
    return (
      <div className="bg-white border rounded-2xl p-5 text-sm text-gray-400">
        No hay citas con pagos en esta campaña.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Instrucción */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
        <p className="font-bold mb-1">⚠️ Proceso de reembolso manual</p>
        <ol className="list-decimal list-inside space-y-1 text-amber-700 text-xs">
          <li>Ingresá al <a href="https://dashboard.onvopay.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Dashboard de OnvoPay</a></li>
          <li>Buscá el Payment Intent ID de cada cita y procesá el reembolso</li>
          <li>Volvé acá y marcá cada cita como "Reembolso procesado"</li>
        </ol>
      </div>

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Pendientes de reembolso ({pendientes.length})</p>
          {pendientes.map((a) => (
            <div key={a.regId} className="bg-white border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">
                    {a.pets.map((p) => p.nombre).join(', ')}
                  </p>
                  <p className="text-xs text-gray-400 font-mono">{a.regId.slice(0, 16)}…</p>
                  {a.ownerPhone && <p className="text-xs text-gray-500">📱 {a.ownerPhone}</p>}
                </div>
                <span className="font-bold text-emerald-700 text-base">
                  ₡{a.montoCRC.toLocaleString('es-CR')}
                </span>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500">Nota (opcional)</label>
                <input
                  type="text"
                  value={nota[a.regId] ?? ''}
                  onChange={(e) => setNota((prev) => ({ ...prev, [a.regId]: e.target.value }))}
                  placeholder="Ej: Reembolsado via OnvoPay txn #abc123"
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex gap-2">
                {a.estado !== 'reembolso_pendiente' && (
                  <button
                    onClick={() => void handleRefundAction(a.regId, 'marcar_pendiente')}
                    disabled={processing === a.regId}
                    className="text-xs border px-3 py-2 rounded-xl text-amber-700 border-amber-300 hover:bg-amber-50 disabled:opacity-50"
                  >
                    Marcar pendiente
                  </button>
                )}
                <button
                  onClick={() => void handleRefundAction(a.regId, 'marcar_procesado')}
                  disabled={processing === a.regId}
                  className="text-xs bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-700 disabled:opacity-50"
                >
                  {processing === a.regId ? 'Guardando…' : '✓ Marcar como reembolsado'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Procesados */}
      {procesadas.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-500">Reembolsos completados ({procesadas.length})</p>
          {procesadas.map((a) => (
            <div key={a.regId} className="bg-gray-50 border rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700">{a.pets.map((p) => p.nombre).join(', ')}</p>
                <p className="text-xs text-gray-400">
                  {a.reembolso?.procesadoEn
                    ? new Date(a.reembolso.procesadoEn).toLocaleDateString('es-CR')
                    : '—'}
                  {a.reembolso?.notaAdmin ? ` · ${a.reembolso.notaAdmin}` : ''}
                </p>
              </div>
              <span className="text-green-600 text-sm font-semibold">✓ ₡{a.montoCRC.toLocaleString('es-CR')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inp       = 'w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white';
const lbl       = 'block text-xs font-medium text-gray-600';
const btnPrimary = 'text-sm bg-brand-600 text-white px-4 py-2 rounded-xl disabled:opacity-50 hover:bg-brand-700 transition-colors';
const btnGhost  = 'text-sm border px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors';
const iconBtn   = 'p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors text-base';
