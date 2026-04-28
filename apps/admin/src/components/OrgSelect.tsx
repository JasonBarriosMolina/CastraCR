'use client';

import { useState, useEffect, useRef } from 'react';
import { listOrgs } from '@/lib/api';
import type { OrgRescatista } from '@/lib/api';

interface OrgSelectProps {
  value: string;          // orgId seleccionado
  onChange: (orgId: string, org: OrgRescatista | null) => void;
  required?: boolean;
}

export function OrgSelect({ value, onChange, required }: OrgSelectProps) {
  const [orgs, setOrgs] = useState<OrgRescatista[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OrgRescatista | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listOrgs()
      .then(setOrgs)
      .catch(() => {/* silencioso */})
      .finally(() => setLoading(false));
  }, []);

  // Si cambia el value desde fuera, sincronizar el selected
  useEffect(() => {
    if (!value) { setSelected(null); return; }
    const found = orgs.find((o) => o.orgId === value);
    if (found) setSelected(found);
  }, [value, orgs]);

  // Cerrar al click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = orgs.filter((o) => {
    const q = query.toLowerCase();
    return (
      o.nombre.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q)
    );
  });

  function select(org: OrgRescatista) {
    setSelected(org);
    onChange(org.orgId, org);
    setOpen(false);
    setQuery('');
  }

  function clear() {
    setSelected(null);
    onChange('', null);
  }

  return (
    <div ref={ref} className="relative">
      {/* Hidden input para validación HTML */}
      <input type="hidden" value={value} required={required} />

      {selected ? (
        /* Estado: org seleccionada */
        <div className="flex items-center justify-between border rounded-xl px-4 py-2.5 bg-white text-sm">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">{selected.nombre}</p>
            <p className="text-xs text-gray-500 truncate">{selected.email}</p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="ml-2 text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none"
            aria-label="Quitar selección"
          >
            ×
          </button>
        </div>
      ) : (
        /* Estado: input de búsqueda */
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Cargando organizaciones…' : 'Buscar organización…'}
          disabled={loading}
          className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50"
        />
      )}

      {/* Dropdown */}
      {open && !selected && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              {orgs.length === 0
                ? 'No hay organizaciones registradas. Créalas en la sección Org Rescatistas.'
                : 'Sin resultados para tu búsqueda.'}
            </div>
          ) : (
            filtered.map((org) => (
              <button
                key={org.orgId}
                type="button"
                onClick={() => select(org)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">{org.nombre}</p>
                <p className="text-xs text-gray-500">{org.email}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
