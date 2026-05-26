'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type * as L from 'leaflet';

interface VenueMapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Fired when user picks a result from the search dropdown — provides the
   *  human-readable place name so the parent can pre-fill the dirección field. */
  onPlaceSelect?: (displayName: string) => void;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const CR_CENTER: [number, number] = [9.7489, -83.7534];
const ZOOM_CR  = 8;
const ZOOM_PIN = 16;

export function VenueMapPicker({ lat, lng, onChange, onPlaceSelect }: VenueMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);
  const markerRef    = useRef<L.Marker | null>(null);

  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapReady, setMapReady]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    void (async () => {
      const Leaflet = (await import('leaflet')).default;

      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id   = 'leaflet-css';
        link.rel  = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Fix broken default icon paths in Next.js bundling
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (Leaflet.Icon.Default.prototype as any)._getIconUrl;
      Leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const center: [number, number] = lat != null && lng != null ? [lat, lng] : CR_CENTER;
      const zoom = lat != null ? ZOOM_PIN : ZOOM_CR;

      const map = Leaflet.map(containerRef.current!, { center, zoom });
      Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (lat != null && lng != null) {
        const m = Leaflet.marker([lat, lng], { draggable: true }).addTo(map);
        m.on('dragend', () => { const p = m.getLatLng(); onChange(p.lat, p.lng); });
        markerRef.current = m;
      }

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat: clat, lng: clng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clat, clng]);
        } else {
          const m = Leaflet.marker([clat, clng], { draggable: true }).addTo(map);
          m.on('dragend', () => { const p = m.getLatLng(); onChange(p.lat, p.lng); });
          markerRef.current = m;
        }
        onChange(clat, clng);
      });

      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      mapRef.current?.remove();
      mapRef.current    = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync external lat/lng (e.g. parent resets form) ───────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || lat == null || lng == null) return;
    void (async () => {
      const Leaflet = (await import('leaflet')).default;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const m = Leaflet.marker([lat, lng], { draggable: true }).addTo(mapRef.current!);
        m.on('dragend', () => { const p = m.getLatLng(); onChange(p.lat, p.lng); });
        markerRef.current = m;
      }
      mapRef.current!.flyTo([lat, lng], Math.max(mapRef.current!.getZoom(), ZOOM_PIN));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, mapReady]);

  // ── Nominatim search (debounced 500 ms) ───────────────────────────────────
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Costa Rica')}&format=json&limit=5&countrycodes=cr&accept-language=es`;
        const res = await fetch(url, { headers: { 'User-Agent': 'CastraCR-Admin/1.0' } });
        const data = (await res.json()) as NominatimResult[];
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    search(e.target.value);
  }

  function pickResult(r: NominatimResult) {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    onChange(lat, lng);
    // Shorten display_name: keep first 2 parts separated by comma
    const short = r.display_name.split(',').slice(0, 2).join(',').trim();
    setQuery(short);
    setResults([]);
    onPlaceSelect?.(r.display_name);
  }

  return (
    <div className="space-y-2">
      {/* Search box */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand-400 transition-all">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder='Buscar lugar… ej: "Clínica veterinaria Turrialba"'
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
          />
          {searching && (
            <svg className="w-4 h-4 text-brand-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {/* Dropdown results */}
        {results.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {results.map((r) => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onClick={() => pickResult(r)}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-brand-50 transition-colors flex items-start gap-2 border-b last:border-0 border-gray-50"
                >
                  <span className="text-brand-400 mt-0.5 flex-shrink-0">📍</span>
                  <span className="text-gray-700 leading-snug">{r.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <div ref={containerRef} style={{ height: 300 }} className="w-full" />
        <p className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border-t">
          {lat != null && lng != null
            ? `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)} — podés arrastrar el pin o hacer click en el mapa para ajustar.`
            : 'Buscá un lugar arriba o hacé click en el mapa para fijar la ubicación.'}
        </p>
      </div>
    </div>
  );
}
