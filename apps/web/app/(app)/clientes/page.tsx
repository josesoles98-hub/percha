import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatMoney } from '@percha/core';

import { getMembresia } from '@/lib/data/inventory';
import { buscarClientes } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { q = '' } = await searchParams;
  const clientes = await buscarClientes(supabase, membresia.storeId, q, 100);
  const simbolo = membresia.store.currencySymbol;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/mas" className="tap text-label text-muted">
          ‹ Más
        </Link>
        <h1 className="text-title">Clientes</h1>
      </header>

      <form action="/clientes" className="pb-3">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, documento o teléfono"
          aria-label="Buscar clientes"
          className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
        />
      </form>

      {clientes.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-24 text-center">
          <div className="text-5xl" aria-hidden>
            👥
          </div>
          <h2 className="text-title">{q ? 'Sin resultados' : 'Todavía no hay clientes'}</h2>
          <p className="max-w-xs text-muted">
            {q
              ? 'Prueba con otro nombre o documento.'
              : 'Los clientes se guardan solos al crear el primer pedido.'}
          </p>
        </section>
      ) : (
        <ul className="space-y-2 pb-8">
          {clientes.map((cliente) => (
            <li
              key={cliente.id}
              className="rounded-[--radius-card] border border-line bg-surface p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate font-medium">{cliente.fullName}</p>
                {cliente.totalSpentCents > 0 && (
                  <p className="shrink-0 text-label tabular-nums text-muted">
                    {formatMoney(cliente.totalSpentCents, { symbol: simbolo })}
                  </p>
                )}
              </div>
              <p className="mt-0.5 text-label text-muted">
                {cliente.docNumber ? `${cliente.docType} ${cliente.docNumber}` : 'Sin documento'}
                {cliente.phone ? ` · ${cliente.phone}` : ''}
              </p>
              <p className="text-caption text-muted">
                {cliente.ordersCount} {cliente.ordersCount === 1 ? 'pedido' : 'pedidos'}
                {cliente.defaultAgencyName ? ` · recoge en ${cliente.defaultAgencyName}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
