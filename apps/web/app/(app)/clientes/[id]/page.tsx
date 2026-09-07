import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { formatMoney, formatDateTime } from '@percha/core';

import { getMembresia } from '@/lib/data/inventory';
import { getCliente, obtenerHistorialCliente } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ETIQUETA_PEDIDO: Record<string, string> = {
  draft: '📝 Borrador',
  confirmed: '✅ Confirmado',
  packed: '📦 Empacado',
  shipped: '🚚 Enviado',
  delivered: '🏠 Entregado',
  cancelled: '✖️ Cancelado',
};

/**
 * Historial de un cliente: todo lo que compró o reservó, junte o no un
 * pedido de envío formal — ver `obtenerHistorialCliente`.
 */
export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const cliente = await getCliente(supabase, id);
  if (!cliente) notFound();

  const { pedidos, prendas } = await obtenerHistorialCliente(supabase, membresia.storeId, id);
  const simbolo = membresia.store.currencySymbol;
  const dinero = (cents: number) => formatMoney(cents, { symbol: simbolo });

  const sinHistorial = pedidos.length === 0 && prendas.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/clientes" className="tap text-label text-muted">
          ‹ Clientes
        </Link>
      </header>

      <section className="rounded-[--radius-card] border border-line bg-surface p-4">
        <h1 className="text-title">{cliente.fullName}</h1>
        <p className="mt-1 text-label text-muted">
          {cliente.docNumber ? `${cliente.docType} ${cliente.docNumber}` : 'Sin documento'}
          {cliente.phone ? ` · ${cliente.phone}` : ''}
        </p>
        {cliente.totalSpentCents > 0 && (
          <p className="mt-1 text-label">
            {cliente.ordersCount} {cliente.ordersCount === 1 ? 'pedido' : 'pedidos'} ·{' '}
            {dinero(cliente.totalSpentCents)} en pedidos formales
          </p>
        )}
      </section>

      {sinHistorial && (
        <p className="mt-8 text-center text-label text-muted">
          Todavía no tiene pedidos, ventas ni reservas.
        </p>
      )}

      {pedidos.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">Pedidos</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
            {pedidos.map((pedido) => (
              <li key={pedido.code}>
                <Link href={`/pedidos/${pedido.code}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{pedido.code}</p>
                    <p className="text-caption text-muted">
                      {ETIQUETA_PEDIDO[pedido.status] ?? pedido.status} · {pedido.prendas}{' '}
                      {pedido.prendas === 1 ? 'prenda' : 'prendas'} · {formatDateTime(pedido.createdAt)}
                    </p>
                  </div>
                  <span className="tabular-nums">{dinero(pedido.totalCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prendas.length > 0 && (
        <section className="mt-6 pb-8">
          <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
            Ventas y reservas directas
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
            {prendas.map((prenda) => (
              <li key={prenda.code}>
                <Link href={`/prenda/${prenda.code}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{prenda.name ?? prenda.code}</p>
                    <p className="text-caption text-muted">
                      {prenda.status === 'sold' ? '🔴 Vendida' : '🟡 Reservada'} ·{' '}
                      {formatDateTime(prenda.fecha)}
                    </p>
                  </div>
                  <span className="tabular-nums">
                    {dinero(prenda.soldPriceCents ?? prenda.priceCents)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
