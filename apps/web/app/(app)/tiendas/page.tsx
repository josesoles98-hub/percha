import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getMembresia, listarMembresias } from '@/lib/data/tienda-activa';
import { createClient } from '@/lib/supabase/server';

import { elegirTienda } from './actions';

export const dynamic = 'force-dynamic';

/**
 * «Mis tiendas»: cambiar de tienda o crear otra.
 *
 * Cada tienda es independiente (inventario, pedidos, clientes, envíos,
 * reservas, mensaje y logo); al cambiar, toda la app pasa a la elegida.
 */
export default async function TiendasPage() {
  const supabase = await createClient();
  const [activa, membresias] = await Promise.all([
    getMembresia(supabase),
    listarMembresias(supabase),
  ]);
  if (!activa) redirect('/bienvenida');

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="py-4">
        <h1 className="text-title">Mis tiendas</h1>
        <p className="mt-1 text-caption text-muted">
          Cada tienda tiene su inventario, pedidos y ajustes de envío por separado.
        </p>
      </header>

      <div className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
        {membresias.map((m) => {
          const esActiva = m.storeId === activa.storeId;
          return (
            <form key={m.storeId} action={elegirTienda}>
              <input type="hidden" name="storeId" value={m.storeId} />
              <button
                type="submit"
                disabled={esActiva}
                aria-current={esActiva ? 'true' : undefined}
                className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span aria-hidden>🏪</span>
                <span className="flex-1">
                  <span className="block">{m.store.name}</span>
                  <span className="block text-caption text-muted">
                    {m.role === 'owner' ? 'Dueño' : 'Vendedor'}
                  </span>
                </span>
                {esActiva ? (
                  <span className="text-label font-medium text-accent">En uso ✓</span>
                ) : (
                  <span className="text-label text-muted">Cambiar ›</span>
                )}
              </button>
            </form>
          );
        })}
      </div>

      <Link
        href="/bienvenida?otra=1"
        className="tap mt-4 flex items-center justify-center gap-2 rounded-[--radius-control] border border-line px-4 py-3 font-medium"
      >
        ＋ Crear otra tienda
      </Link>
    </main>
  );
}
