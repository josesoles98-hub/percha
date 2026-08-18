import { redirect } from 'next/navigation';
import { formatMoney } from '@percha/core';

import { InventoryGrid } from '@/components/InventoryGrid';
import { SearchAndFilters } from '@/components/SearchAndFilters';
import { firmarFotos, getCatalogos, getMembresia, listarPrendas } from '@/lib/data/inventory';
import { claveFiltros, contarFiltrosActivos, filtrosDesdeParams, type ParamsPlanos } from '@/lib/filtros-url';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Inventario · pantalla de inicio.
 *
 * La primera página se resuelve en el servidor para que la cuadrícula
 * aparezca ya pintada; a partir de ahí la paginación la lleva el cliente.
 * Los filtros viven en la URL, así que esta pantalla es la misma vista
 * tanto si entras de cero como si vuelves atrás desde una ficha.
 */
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<ParamsPlanos>;
}) {
  const supabase = await createClient();

  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { storeId, store, role } = membresia;
  const filtros = filtrosDesdeParams(await searchParams);

  // dashboard_stats no depende de los catálogos: se dispara ya mismo para
  // que su viaje de red ocurra en paralelo, en vez de esperar a que
  // termine getCatalogos primero.
  const statsPromise = supabase.rpc('dashboard_stats', { p_store_id: storeId });

  const catalogos = await getCatalogos(supabase, storeId);
  const tallas = catalogos.sizes.map((s) => s.label);

  const [primeraPagina, stats] = await Promise.all([
    listarPrendas(supabase, { storeId, limit: 30, filtros, tallas }),
    statsPromise,
  ]);

  const rutas = primeraPagina.items
    .map((item) => item.photos.find((f) => f.position === 1)?.path)
    .filter((p): p is string => Boolean(p));

  const firmadas = await firmarFotos(supabase, rutas);

  const resumen = (stats.data ?? {}) as { total?: number; inventory_value?: number };
  const puedeVerTotales = role === 'owner' || store.sellersSeeTotals;
  const buscando = Boolean(filtros.q) || contarFiltrosActivos(filtros) > 0;

  return (
    <main className="mx-auto max-w-3xl px-4">
      <SearchAndFilters
        filtros={filtros}
        catalogos={catalogos}
        simbolo={store.currencySymbol}
      />

      <p className="py-3 text-caption text-muted">
        {buscando ? (
          <>
            {primeraPagina.items.length}
            {primeraPagina.nextCursor || primeraPagina.nextOffset ? '+' : ''}{' '}
            {primeraPagina.items.length === 1 ? 'resultado' : 'resultados'}
          </>
        ) : (
          <>
            {resumen.total ?? 0} {resumen.total === 1 ? 'prenda' : 'prendas'}
            {puedeVerTotales && resumen.inventory_value !== undefined && (
              <> · {formatMoney(resumen.inventory_value, { symbol: store.currencySymbol })}</>
            )}
          </>
        )}
      </p>

      {/*
        La `key` remonta la cuadrícula cuando cambian los filtros: sin ella
        conservaría el estado de la búsqueda anterior y mezclaría resultados
        al paginar.
      */}
      <InventoryGrid
        key={claveFiltros(filtros)}
        storeId={storeId}
        simbolo={store.currencySymbol}
        itemsIniciales={primeraPagina.items}
        cursorInicial={primeraPagina.nextCursor}
        offsetInicial={primeraPagina.nextOffset}
        urlsIniciales={Object.fromEntries(firmadas)}
        filtros={filtros}
        tallas={tallas}
        hayFiltros={buscando}
      />
    </main>
  );
}
