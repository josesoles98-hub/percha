import { redirect } from 'next/navigation';
import { esDelMismoMes, formatMoney, summarizeProfitDays } from '@percha/core';

import { DescargarGanancias } from '@/components/DescargarGanancias';
import { GastosPanel } from '@/components/GastosPanel';
import { agruparPorDia, listarGastos, listarPrendasVendidas } from '@/lib/data/finanzas';
import { getMembresia } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DIAS_HISTORIAL = 31;

/**
 * Panel de ganancias: cuánto entra, cuánto cuesta lo vendido y cuánto se
 * gasta en publicidad — el número que de verdad importa es la ganancia
 * NETA (ingreso − costo − gastos), no solo lo vendido.
 *
 * Es información de la dueña, no del vendedor (igual que los gastos en la
 * base de datos — ver RLS de `expenses`): si un vendedor entra acá no ve
 * nada, para no exponerle el margen del negocio.
 */
export default async function GananciasPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { storeId, store, role } = membresia;
  const simbolo = store.currencySymbol;

  if (role !== 'owner') {
    return (
      <main className="mx-auto flex min-h-[60dvh] max-w-3xl flex-col items-center justify-center px-4 text-center">
        <p className="text-title">🔒</p>
        <p className="mt-2 text-label text-muted">Esta sección es solo para la dueña de la tienda.</p>
      </main>
    );
  }

  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_HISTORIAL);

  const [prendas, gastos] = await Promise.all([
    listarPrendasVendidas(supabase, storeId, desde),
    listarGastos(supabase, storeId, desde),
  ]);

  const dias = agruparPorDia(prendas, gastos, DIAS_HISTORIAL, store.timezone);
  const hoy = summarizeProfitDays(dias.slice(-1));
  const esteMes = summarizeProfitDays(dias.filter((d) => esDelMismoMes(d.day)));
  const sinCosto = prendas.filter((p) => p.costCents === null).length;

  const dinero = (cents: number) => formatMoney(cents, { symbol: simbolo });

  return (
    <main className="mx-auto max-w-3xl px-4 pb-8 pt-safe">
      <header className="py-4">
        <h1 className="text-title">Ganancias</h1>
      </header>

      {/* ── Hoy: lo único que hace falta ver de un vistazo ────────────── */}
      <section>
        <TarjetaResumen titulo="Hoy" resumen={hoy} dinero={dinero} />
      </section>

      {sinCosto > 0 && (
        <p className="mt-3 text-caption text-muted">
          ⚠️ {sinCosto} {sinCosto === 1 ? 'prenda vendida no tiene' : 'prendas vendidas no tienen'} costo
          registrado — su ganancia no está contada arriba. Ponle costo a tus prendas nuevas al darlas de
          alta para que el número sea exacto.
        </p>
      )}

      {/* ── Gastos: agregar el de hoy, sin buscar nada más ────────────── */}
      <section className="mt-6">
        <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
          Gastos (ads y otros)
        </h2>
        <GastosPanel storeId={storeId} simbolo={simbolo} gastosIniciales={gastos.slice(0, 15)} />
      </section>

      <DescargarGanancias storeId={storeId} store={store} />

      {/* ── El resto, oculto por defecto: no todos los días hace falta ── */}
      <details className="mt-6 pb-4">
        <summary className="tap cursor-pointer text-label font-medium text-accent">
          Ver más detalle (este mes, historial, prendas vendidas)
        </summary>

        <div className="mt-4">
          <TarjetaResumen titulo="Este mes" resumen={esteMes} dinero={dinero} />
        </div>

        {/* ── Últimos 31 días, día por día ───────────────────────────── */}
        <section className="mt-4">
          <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
            Últimos {DIAS_HISTORIAL} días
          </h2>
          <div className="overflow-hidden rounded-[--radius-card] border border-line bg-surface">
            <table className="w-full text-label">
              <thead>
                <tr className="border-b border-line text-caption text-muted">
                  <th className="px-3 py-2 text-left font-medium">Día</th>
                  <th className="px-3 py-2 text-right font-medium">Ingreso</th>
                  <th className="px-3 py-2 text-right font-medium">Gastos</th>
                  <th className="px-3 py-2 text-right font-medium">Ganancia neta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...dias].reverse().map((dia) => {
                  const neto = dia.revenueCents - dia.costCents - dia.expensesCents;
                  if (dia.revenueCents === 0 && dia.expensesCents === 0) return null;
                  return (
                    <tr key={dia.day}>
                      <td className="px-3 py-2">
                        {new Date(`${dia.day}T12:00:00`).toLocaleDateString('es-PE', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{dinero(dia.revenueCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {dia.expensesCents > 0 ? dinero(dia.expensesCents) : '—'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium tabular-nums ${
                          neto < 0 ? 'text-status-sold' : ''
                        }`}
                      >
                        {dinero(neto)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {dias.every((d) => d.revenueCents === 0 && d.expensesCents === 0) && (
              <p className="p-4 text-center text-label text-muted">
                Todavía no hay ventas ni gastos en estos {DIAS_HISTORIAL} días.
              </p>
            )}
          </div>
        </section>

        {/* ── Prendas vendidas, con su margen ───────────────────────── */}
        <section className="mt-4">
          <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
            Prendas vendidas
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
            {prendas.map((p) => (
              <li key={p.code} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name ?? p.code}</p>
                  <p className="text-caption text-muted">
                    {p.code} ·{' '}
                    {new Date(p.soldAt).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular-nums">{dinero(p.soldPriceCents)}</p>
                  <p className="text-caption tabular-nums text-muted">
                    {p.marginCents !== null ? `+${dinero(p.marginCents)}` : 'sin costo'}
                  </p>
                </div>
              </li>
            ))}
            {prendas.length === 0 && (
              <li className="p-4 text-center text-label text-muted">
                Todavía no hay prendas vendidas en estos {DIAS_HISTORIAL} días.
              </li>
            )}
          </ul>
        </section>
      </details>
    </main>
  );
}

function TarjetaResumen({
  titulo,
  resumen,
  dinero,
}: {
  titulo: string;
  resumen: ReturnType<typeof summarizeProfitDays>;
  dinero: (cents: number) => string;
}) {
  return (
    <div className="rounded-[--radius-card] border border-line bg-surface p-4">
      <p className="text-caption font-medium uppercase tracking-wide text-muted">{titulo}</p>
      <p
        className={`mt-1 text-[2rem] font-bold leading-tight tabular-nums ${
          resumen.netProfitCents < 0 ? 'text-status-sold' : ''
        }`}
      >
        {dinero(resumen.netProfitCents)}
      </p>
      <p className="text-label text-muted">
        ganancia neta · {resumen.itemsSold} {resumen.itemsSold === 1 ? 'prenda vendida' : 'prendas vendidas'}
      </p>
      <dl className="mt-3 space-y-1 text-label text-muted">
        <div className="flex justify-between">
          <dt>Ingresos</dt>
          <dd className="tabular-nums text-ink">{dinero(resumen.revenueCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Costo de prendas</dt>
          <dd className="tabular-nums text-ink">− {dinero(resumen.costCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Gastos (ads, etc.)</dt>
          <dd className="tabular-nums text-ink">− {dinero(resumen.expensesCents)}</dd>
        </div>
      </dl>
    </div>
  );
}
