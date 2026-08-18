import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatMoney, type DashboardStats } from '@percha/core';

import { getMembresia } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Panel: entender el negocio en 5 segundos.
 *
 * Números grandes, sin gráficos que interpretar. La única visualización es
 * un minigráfico de barras de los últimos 7 días, hecho con divs.
 */
export default async function PanelPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { storeId, store, role } = membresia;
  const simbolo = store.currencySymbol;

  const hace7dias = new Date();
  hace7dias.setDate(hace7dias.getDate() - 6);
  hace7dias.setHours(0, 0, 0, 0);

  const [statsRes, recientesRes, vendidasRes] = await Promise.all([
    supabase.rpc('dashboard_stats', { p_store_id: storeId }),
    supabase
      .from('items')
      .select('created_at')
      .eq('store_id', storeId)
      .is('deleted_at', null)
      .gte('created_at', hace7dias.toISOString()),
    // Suma de todo lo vendido: dashboard_stats solo trae lo del mes en
    // curso, y acá se necesita el total histórico. No hay una función RPC
    // para esto todavía, así que se suma en el servidor: el volumen de
    // prendas vendidas de esta tienda no justifica una función nueva.
    supabase
      .from('items_view')
      .select('sold_price_cents')
      .eq('store_id', storeId)
      .eq('effective_status', 'sold'),
  ]);

  const crudo = (statsRes.data ?? {}) as Record<string, number>;
  const soldValueTotal = (vendidasRes.data ?? []).reduce(
    (acumulado, fila) => acumulado + (fila.sold_price_cents ?? 0),
    0,
  );
  const stats: DashboardStats = {
    total: crudo.total ?? 0,
    available: crudo.available ?? 0,
    reserved: crudo.reserved ?? 0,
    sold: crudo.sold ?? 0,
    hidden: crudo.hidden ?? 0,
    inventoryValue: crudo.inventory_value ?? 0,
    soldValueMonth: crudo.sold_value_month ?? 0,
    soldValueTotal,
    expiringToday: crudo.expiring_today ?? 0,
    expired: crudo.expired ?? 0,
    addedThisWeek: crudo.added_this_week ?? 0,
  };

  // ── Prendas por día, últimos 7 días ─────────────────────────────────
  const porDia = new Array<number>(7).fill(0);
  for (const fila of recientesRes.data ?? []) {
    const dias = Math.floor(
      (new Date(fila.created_at).getTime() - hace7dias.getTime()) / 86_400_000,
    );
    if (dias >= 0 && dias < 7 && porDia[dias] !== undefined) porDia[dias] += 1;
  }
  const maximo = Math.max(...porDia, 1);
  const etiquetas = porDia.map((_, i) => {
    const fecha = new Date(hace7dias);
    fecha.setDate(fecha.getDate() + i);
    return fecha.toLocaleDateString('es-PE', { weekday: 'narrow' });
  });

  const hayAtencion = stats.expired > 0 || stats.expiringToday > 0;
  const puedeVerTotales = role === 'owner' || store.sellersSeeTotals;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="py-4">
        <h1 className="text-title">Panel</h1>
      </header>

      {/* ── Valor del inventario ──────────────────────────────────────── */}
      {puedeVerTotales && (
        <section className="rounded-[--radius-card] border border-line bg-surface p-5">
          <p className="text-caption font-medium uppercase tracking-wide text-muted">
            Valor del inventario
          </p>
          <p className="mt-1 text-[2.5rem] font-bold leading-tight tabular-nums">
            {formatMoney(stats.inventoryValue, { symbol: simbolo })}
          </p>
          <p className="text-label text-muted">
            {stats.available + stats.reserved}{' '}
            {stats.available + stats.reserved === 1 ? 'prenda' : 'prendas'} en stock
          </p>
          {stats.soldValueMonth > 0 && (
            <p className="mt-1 text-label text-muted">
              Vendido este mes: {formatMoney(stats.soldValueMonth, { symbol: simbolo })}
            </p>
          )}
        </section>
      )}

      {/* ── Contadores ────────────────────────────────────────────────── */}
      <section className="mt-3 grid grid-cols-2 gap-3">
        <Tarjeta valor={stats.total} etiqueta="Total" />
        <Tarjeta valor={stats.available} etiqueta="🟢 Disponibles" />
        <Tarjeta valor={stats.reserved} etiqueta="🟡 Reservadas" />
        <Tarjeta
          valor={stats.sold}
          etiqueta="🔴 Vendidas"
          subvalor={
            puedeVerTotales && stats.soldValueTotal > 0
              ? formatMoney(stats.soldValueTotal, { symbol: simbolo })
              : undefined
          }
        />
      </section>

      {/* ── Requiere atención ─────────────────────────────────────────── */}
      {hayAtencion && (
        <Link
          href="/alertas"
          className="mt-3 block rounded-[--radius-card] border border-status-reserved/40 bg-status-reserved/10 p-4"
        >
          <p className="font-semibold">⚠️ Requiere atención ›</p>
          <ul className="mt-1 space-y-0.5 text-label">
            {stats.expired > 0 && (
              <li>
                🔴 {stats.expired} {stats.expired === 1 ? 'reserva vencida' : 'reservas vencidas'}
              </li>
            )}
            {stats.expiringToday > 0 && (
              <li>
                🟠 {stats.expiringToday} {stats.expiringToday === 1 ? 'vence' : 'vencen'} hoy
              </li>
            )}
          </ul>
        </Link>
      )}

      {/* ── Actividad semanal ─────────────────────────────────────────── */}
      <section className="mt-6 pb-8">
        <p className="text-caption font-medium uppercase tracking-wide text-muted">Esta semana</p>
        <p className="mt-1 text-label">
          {stats.addedThisWeek} {stats.addedThisWeek === 1 ? 'prenda agregada' : 'prendas agregadas'}
        </p>

        <div className="mt-3 flex h-20 items-end gap-2" role="img"
          aria-label={`Prendas por día: ${porDia.join(', ')}`}>
          {porDia.map((cantidad, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-sm ${cantidad > 0 ? 'bg-accent' : 'bg-line'}`}
                style={{ height: `${Math.max(6, (cantidad / maximo) * 64)}px` }}
              />
              <span className="text-caption uppercase text-muted">{etiquetas[i]}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Tarjeta({
  valor,
  etiqueta,
  subvalor,
}: {
  valor: number;
  etiqueta: string;
  subvalor?: string;
}) {
  return (
    <div className="rounded-[--radius-card] border border-line bg-surface p-4">
      <p className="text-[1.75rem] font-bold leading-tight tabular-nums">{valor}</p>
      <p className="text-label text-muted">{etiqueta}</p>
      {subvalor && <p className="mt-0.5 text-label font-medium tabular-nums">{subvalor}</p>}
    </div>
  );
}
