'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Item } from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import { firmarFotos, listarPrendas, type Filtros } from '@/lib/data/inventory';
import { enviarVariasAPapelera } from '@/lib/data/mutations';
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
  const router = useRouter();
  const { mostrar } = useToast();

  const [items, setItems] = useState<Item[]>(itemsIniciales);
  const [cursor, setCursor] = useState<string | null>(cursorInicial);
  const [offset, setOffset] = useState<number | null>(offsetInicial);
  const [urls, setUrls] = useState<Record<string, string>>(urlsIniciales);
  const [cargando, setCargando] = useState(false);
  const centinela = useRef<HTMLDivElement>(null);

  // Para cuando una carga masiva sale mal y hay que borrar varias de un
  // tirón, en vez de abrir la ficha de cada una para eliminarla.
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [borrando, setBorrando] = useState(false);

  function salirDeSeleccion() {
    setModoSeleccion(false);
    setSeleccionados(new Set());
  }

  function alternarSeleccion(id: string) {
    setSeleccionados((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  async function borrarSeleccionadas() {
    const ids = [...seleccionados];
    if (ids.length === 0) return;
    if (!confirm(`¿Enviar ${ids.length} ${ids.length === 1 ? 'prenda' : 'prendas'} a la papelera?`)) {
      return;
    }

    setBorrando(true);
    const supabase = createClient();
    const { error } = await enviarVariasAPapelera(supabase, ids);
    setBorrando(false);

    if (error) {
      mostrar('No se pudo borrar');
      return;
    }

    setItems((previos) => previos.filter((it) => !seleccionados.has(it.id)));
    vibrar();
    mostrar(`${ids.length} ${ids.length === 1 ? 'prenda enviada' : 'prendas enviadas'} a la papelera`);
    salirDeSeleccion();
    router.refresh();
  }

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
      <div className="mb-3 flex items-center gap-3">
        {modoSeleccion ? (
          <>
            <p className="text-caption text-muted">
              {seleccionados.size} {seleccionados.size === 1 ? 'elegida' : 'elegidas'}
            </p>
            <button
              type="button"
              onClick={() =>
                setSeleccionados((previos) =>
                  previos.size === items.length ? new Set() : new Set(items.map((it) => it.id)),
                )
              }
              className="tap text-caption text-accent underline underline-offset-4"
            >
              {seleccionados.size === items.length ? 'Ninguna' : 'Todas'}
            </button>
            <button
              type="button"
              onClick={salirDeSeleccion}
              className="tap text-caption text-muted underline underline-offset-4"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setModoSeleccion(true)}
            className="tap text-caption text-accent underline underline-offset-4"
          >
            Seleccionar varias
          </button>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-3 pb-24 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard
              item={item}
              simbolo={simbolo}
              fotoUrl={urls[item.photos.find((f) => f.position === 1)?.path ?? ''] ?? null}
              modoSeleccion={modoSeleccion}
              seleccionado={seleccionados.has(item.id)}
              onToggleSeleccion={() => alternarSeleccion(item.id)}
            />
          </li>
        ))}
      </ul>

      <div ref={centinela} className="h-10" />
      {cargando && <p className="py-4 text-center text-caption text-muted">Cargando…</p>}

      {modoSeleccion && (
        // z-50: por encima de la barra de navegación inferior (z-40).
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 px-3 py-3 pb-safe backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2">
            <button
              type="button"
              onClick={() => void borrarSeleccionadas()}
              disabled={borrando || seleccionados.size === 0}
              className="tap w-full rounded-[--radius-control] bg-status-sold px-4 py-3 font-medium text-white disabled:opacity-40"
            >
              {borrando
                ? 'Borrando…'
                : `🗑 Borrar ${seleccionados.size} ${seleccionados.size === 1 ? 'prenda' : 'prendas'}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
