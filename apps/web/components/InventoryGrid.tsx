'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Item } from '@percha/core';

import { firmarFotos, listarPrendas, type Filtros } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/client';

import { ItemCard } from './ItemCard';

/**
 * Cuadrícula del inventario con carga incremental.
 *
 * La primera página llega ya resuelta del servidor; a partir de ahí pagina
 * el cliente. Cuando cambian los filtros, la página se remonta entera con
 * una `key` distinta: así nunca mezcla resultados de dos búsquedas.
 */
export function InventoryGrid({
  storeId,
  simbolo,
  itemsIniciales,
  cursorInicial,
  offsetInicial,
  urlsIniciales,
  filtros,
  tallas,
  hayFiltros,
}: {
  storeId: string;
  simbolo: string;
  itemsIniciales: Item[];
  cursorInicial: string | null;
  offsetInicial: number | null;
  urlsIniciales: Record<string, string>;
  filtros: Filtros;
  tallas: readonly string[];
  hayFiltros: boolean;
}) {
  const [items, setItems] = useState<Item[]>(itemsIniciales);
  const [cursor, setCursor] = useState<string | null>(cursorInicial);
  const [offset, setOffset] = useState<number | null>(offsetInicial);
  const [urls, setUrls] = useState<Record<string, string>>(urlsIniciales);
  const [cargando, setCargando] = useState(false);
  const centinela = useRef<HTMLDivElement>(null);

  const hayMas = cursor !== null || offset !== null;

  const cargarMas = useCallback(async () => {
    if (!hayMas || cargando) return;
    setCargando(true);

    try {
      const supabase = createClient();
      const pagina = await listarPrendas(supabase, {
        storeId,
        cursor,
        offset,
        limit: 30,
        filtros,
        tallas,
      });

      const rutas = pagina.items
        .map((item) => item.photos.find((f) => f.position === 1)?.path)
        .filter((p): p is string => Boolean(p));

      const firmadas = await firmarFotos(supabase, rutas);

      setItems((previos) => [...previos, ...pagina.items]);
      setUrls((previas) => ({ ...previas, ...Object.fromEntries(firmadas) }));
      setCursor(pagina.nextCursor);
      setOffset(pagina.nextOffset);
    } finally {
      setCargando(false);
    }
  }, [cargando, cursor, filtros, hayMas, offset, storeId, tallas]);

  // Carga automática al acercarse al final: sin botón "ver más" que tocar.
  useEffect(() => {
    const nodo = centinela.current;
    if (!nodo || !hayMas) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) void cargarMas();
      },
      { rootMargin: '400px' },
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, [cargarMas, hayMas]);

  if (items.length === 0) {
    return hayFiltros ? (
      <section className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="text-5xl" aria-hidden>
          🔍
        </div>
        <h2 className="text-title">Nada por aquí</h2>
        <p className="max-w-xs text-muted">
          Ninguna prenda coincide con lo que buscas. Prueba con menos filtros.
        </p>
        <Link
          href="/"
          className="tap mt-2 inline-flex items-center rounded-[--radius-control] border border-line bg-surface px-5 py-3 font-medium"
        >
          Limpiar filtros
        </Link>
      </section>
    ) : (
      <section className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="text-5xl" aria-hidden>
          👕
        </div>
        <h2 className="text-title">Todavía no hay prendas</h2>
        <p className="max-w-xs text-muted">Sube tu primera prenda con el botón +</p>
        <Link
          href="/nueva"
          className="tap mt-2 inline-flex items-center rounded-[--radius-control] bg-accent px-5 py-3 font-medium text-accent-ink"
        >
          Subir prenda
        </Link>
      </section>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard
              item={item}
              simbolo={simbolo}
              fotoUrl={urls[item.photos.find((f) => f.position === 1)?.path ?? ''] ?? null}
            />
          </li>
        ))}
      </ul>

      <div ref={centinela} className="h-10" />
      {cargando && <p className="py-4 text-center text-caption text-muted">Cargando…</p>}
    </>
  );
}
