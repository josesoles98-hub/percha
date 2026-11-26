'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';

import { aSlug, guardarAjustesCatalogo, type AjustesCatalogo } from '@/lib/data/agente';
import { createClient } from '@/lib/supabase/client';

const OPCIONES = [
  { horas: 0, titulo: 'A · Todo a la vez', detalle: 'Las prendas nuevas salen en los grupos y en el catálogo el mismo día.' },
  { horas: 24, titulo: 'B · Los grupos primero', detalle: 'Las prendas nuevas pasan al catálogo al día siguiente.' },
];

export function CatalogoAjustes({ storeId, iniciales }: { storeId: string; iniciales: AjustesCatalogo }) {
  const router = useRouter();
  const [c, setC] = useState(iniciales);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const slug = aSlug(c.slug);
  // El dominio solo se conoce en el navegador (sin desajuste al hidratar).
  const origen = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  );
  const link = `${origen}/c/${slug}`;

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const r = await guardarAjustesCatalogo(createClient(), storeId, c);
    setGuardando(false);
    setAviso(r.ok ? { ok: true, texto: 'Guardado ✅' } : { ok: false, texto: r.error });
    if (r.ok) router.refresh();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: el link igual se ve en pantalla
    }
  }

  return (
    <section className="mt-10 space-y-4 border-t border-line pt-8">
      <div>
        <h2 className="text-title">Catálogo para clientes 🛍️</h2>
        <p className="text-caption text-muted">
          Una página con todas tus prendas disponibles. Se actualiza sola: lo que reservas o vendes deja de
          salir. El cliente toca “La quiero” y te escribe por WhatsApp con el código de la prenda.
        </p>
      </div>

      <label className="tap flex items-center justify-between gap-4 rounded-[--radius-card] border border-line bg-surface p-4">
        <span className="font-medium">Catálogo publicado</span>
        <input
          type="checkbox"
          checked={c.enabled}
          onChange={(e) => setC({ ...c, enabled: e.target.checked })}
          className="size-6 accent-[--color-accent]"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-caption text-muted">Nombre del link</span>
        <input
          value={c.slug}
          onChange={(e) => setC({ ...c, slug: e.target.value })}
          className="w-full rounded-[--radius-control] border border-line bg-surface px-3 py-2.5 text-label outline-none focus:border-accent"
        />
        <span className="mt-1 block break-all text-caption text-muted">{link}</span>
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        {OPCIONES.map((o) => (
          <button
            key={o.horas}
            type="button"
            onClick={() => setC({ ...c, delayHours: o.horas })}
            className={`tap rounded-[--radius-control] border p-3 text-left ${
              c.delayHours === o.horas ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
            }`}
          >
            <span className="block text-label font-medium">{o.titulo}</span>
            <span className="text-caption text-muted">{o.detalle}</span>
          </button>
        ))}
      </div>

      {aviso && (
        <p className={`text-label ${aviso.ok ? 'text-status-available' : 'text-status-sold'}`}>{aviso.texto}</p>
      )}

      <div className="flex gap-2">
        {c.enabled && iniciales.enabled && slug === aSlug(iniciales.slug) && (
          <>
            <a
              href={`/c/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="tap rounded-[--radius-control] border border-line bg-surface px-4 py-3.5 text-label"
            >
              Ver
            </a>
            <button
              type="button"
              onClick={() => void copiar()}
              className="tap rounded-[--radius-control] border border-line bg-surface px-4 py-3.5 text-label"
            >
              {copiado ? 'Copiado ✅' : 'Copiar link'}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando}
          className="tap flex-1 rounded-[--radius-control] bg-accent px-4 py-3.5 font-semibold text-accent-ink disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar catálogo'}
        </button>
      </div>
    </section>
  );
}
