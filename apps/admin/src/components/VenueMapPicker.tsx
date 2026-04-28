'use client';

import { useEffect, useRef, useState } from 'react';

// Leaflet is loaded dynamically to avoid SSR issues in Next.js
// Types only (no import of the actual lib at module level)
import type * as L from 'leaflet';

interface VenueMapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

// Costa Rica center
const CR_CENTER: [number, number] = [9.7489, -83.7534];
const ZOOM_CR   = 8;
const ZOOM_PIN  = 16;

export function VenueMapPicker({ lat, lng, onChange }: VenueMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [open, setOpen] = useState(false);

  // Initialize map once the panel opens
  useEffect(() => {
    if (!open || !containerRef.current || mapRef.current) return;

    void (async () => {
      const L = (await import('leaflet')).default;
      // Leaflet CSS — injected once
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id   = 'leaflet-css';
        link.rel  = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Fix broken default icon URLs in webpack/Next.js bundling
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const center: [number, number] = lat != null && lng != null ? [lat, lng] : CR_CENTER;
      const zoom = lat != null ? ZOOM_PIN : ZOOM_CR;

      const map = L.map(containerRef.current!, { center, zoom });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Place initial marker if coords exist
      if (lat != null && lng != null) {
        const m = L.marker([lat, lng], { draggable: true }).addTo(map);
        m.on('dragend', () => { const p = m.getLatLng(); onChange(p.lat, p.lng); });
        markerRef.current = m;
      }

      // Click on map → move/create marker
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat: clat, lng: clng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clat, clng]);
        } else {
          const m = L.marker([clat, clng], { draggable: true }).addTo(map);
          m.on('dragend', () => { const p = m.getLatLng(); onChange(p.lat, p.lng); });
          markerRef.current = m;
        }
        onChange(clat, clng);
      });

      mapRef.current = map;
    })();

    return () => {
      mapRef.current?.remove();
      mapRef.current  = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sync external lat/lng changes (e.g. after Nominatim geocoding) → fly map + move pin
  useEffect(() => {
    if (!mapRef.current || lat == null || lng == null) return;
    void (async () => {
      const L = (await import('leaflet')).default;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const m = L.marker([lat, lng], { draggable: true }).addTo(mapRef.current!);
        m.on('dragend', () => { const p = m.getLatLng(); onChange(p.lat, p.lng); });
        markerRef.current = m;
      }
      mapRef.current!.flyTo([lat, lng], Math.max(mapRef.current!.getZoom(), ZOOM_PIN));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-brand-600 hover:underline flex items-center gap-1"
      >
        🗺 {open ? 'Ocultar mapa' : 'Abrir mapa para puntear la sede'}
      </button>

      {open && (
        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          <div
            ref={containerRef}
            style={{ height: 300 }}
            className="w-full"
          />
          {lat != null && lng != null ? (
            <p className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border-t">
              📍 {lat.toFixed(6)}, {lng.toFixed(6)} — arrastrar el pin o hacer click en el mapa para mover.
            </p>
          ) : (
            <p className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border-t">
              Click en el mapa para fijar la ubicación de la sede.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
