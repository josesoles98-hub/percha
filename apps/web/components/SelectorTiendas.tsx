'use client';

import { useState, useTransition } from 'react';

import { elegirTienda } from '@/app/(app)/tiendas/actions';

export interface TiendaDelSelector {
  id: string;
  nombre: string;
  logoUrl: string | null;
  /** Logo de letras claras: va sobre fondo negro. */
  logoOscuro: boolean;
}

/**
 * Barra de arriba con el logo de cada tienda: un toque y la app entera pasa
 * a esa tienda. Solo aparece cuando la cuenta tiene más de una.
 *
 * El cambio se marca al instante (antes de que responda el servidor) para
 * que se sienta rápido; mientras carga, el logo elegido late suave.
 */
export function SelectorTiendas({
  tiendas,
  activaId,
}: {
  tiendas: TiendaDelSelector[];
  activaId: string;
}) {
  const [elegida, setElegida] = useState(activaId);
  const [cambiando, startTransition] = useTransition();

  function cambiar(id: string) {
    if (id === elegida && !cambiando) return;
    setElegida(id);
    const datos = new FormData();
    datos.set('storeId', id);
    startTransition(() => elegirTienda(datos));
  }

  return (
    <nav
      aria-label="Tiendas"
      className="pt-safe border-b border-line bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-2">
        {tiendas.map((t) => {
          const activa = t.id === elegida;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => cambiar(t.id)}
              aria-current={activa ? 'true' : undefined}
              aria-label={activa ? `${t.nombre} (en uso)` : `Cambiar a ${t.nombre}`}
              className={`flex items-center gap-2 rounded-full p-1 transition-all duration-200 ${
                activa
                  ? 'bg-accent/10 pr-4 ring-2 ring-accent'
                  : 'opacity-55 grayscale hover:opacity-90 hover:grayscale-0'
              } ${activa && cambiando ? 'animate-pulse' : ''}`}
            >
              <Logo tienda={t} />
              {activa && (
                <span className="max-w-40 truncate text-label font-medium">{t.nombre}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Logo({ tienda }: { tienda: TiendaDelSelector }) {
  const fondo = tienda.logoOscuro ? 'bg-black' : 'bg-white';

  if (!tienda.logoUrl) {
    // Sin logo: iniciales en un círculo, para que igual se distingan.
    const iniciales = tienda.nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('');
    return (
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-bg text-caption font-bold"
      >
        {iniciales}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line ${fondo}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tienda.logoUrl} alt="" className="size-full object-contain p-0.5" />
    </span>
  );
}
