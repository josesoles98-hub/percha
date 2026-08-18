import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatMoney, formatShortDate } from '@percha/core';

import { getMembresia } from '@/lib/data/inventory';
import { listarPedidos, type EstadoPedido } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  draft: '📝 Borrador',
  confirmed: '✅ Confirmado',
  packed: '📦 Empacado',
  shipped: '🚚 Enviado',
  delivered: '🏠 Entregado',
  cancelled: '✖️ Cancelado',
};

export default async function PedidosPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const pedidos = await listarPedidos(supabase, membresia.storeId);
  const simbolo = membresia.store.currencySymbol;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-title">Pedidos</h1>
        <Link href="/envios" className="tap text-label underline underline-offset-4">
          Envíos
        </Link>
      </header>

      {pedidos.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-24 text-center">
          <div className="text-5xl" aria-hidden>
            🧾
          </div>
          <h2 className="text-title">Todavía no hay pedidos</h2>
          <p className="max-w-xs text-muted">
            Abre una prenda y toca «Convertir en pedido» para registrar la venta y su envío.
          </p>
        </section>
      ) : (
        <ul className="space-y-2 pb-8">
          {pedidos.map((pedido) => (
            <li key={pedido.id}>
              <Link
                href={`/pedidos/${pedido.code}`}
                className="block rounded-[--radius-card] border border-line bg-surface p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{pedido.code}</p>
                  <p className="font-semibold tabular-nums">
                    {formatMoney(pedido.totalCents, { symbol: simbolo })}
                  </p>
                </div>
                <p className="mt-0.5 truncate text-label text-muted">{pedido.customerName}</p>
                <p className="mt-0.5 text-caption text-muted">
                  {ETIQUETA_ESTADO[pedido.status]} · {pedido.prendas}{' '}
                  {pedido.prendas === 1 ? 'prenda' : 'prendas'}
                  {pedido.destinyAgencyName ? ` · → ${pedido.destinyAgencyName}` : ''} ·{' '}
                  {formatShortDate(pedido.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
