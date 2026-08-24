import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ExportarPedidosCsv } from '@/components/envios/ExportarPedidosCsv';
import { PedidosLista } from '@/components/envios/PedidosLista';
import { getMembresia } from '@/lib/data/inventory';
import { listarPedidos } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

// Los tres juntos, sin dejar ninguno por defecto: esta pantalla cambia
// según quién esté vendiendo en ese momento, así que ninguna capa de
// caché (ni la de Next, ni la de Vercel/CDN de por medio) debe guardar
// una respuesta vieja — sobre todo con /pedidos y /pedidos?historial=1
// siendo la "misma" ruta con distinta query.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const ACTIVOS = new Set(['draft', 'confirmed', 'packed']);

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ historial?: string }>;
}) {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { historial } = await searchParams;
  const todos = await listarPedidos(supabase, membresia.storeId);
  // Por defecto solo los activos: una vez enviado, ya cumplió su función
  // acá y solo estorba para ver qué falta registrar.
  const pedidos = historial ? todos : todos.filter((p) => ACTIVOS.has(p.status));
  const simbolo = membresia.store.currencySymbol;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-title">Pedidos</h1>
        <div className="flex items-center gap-4">
          {todos.length > 0 && (
            <ExportarPedidosCsv storeId={membresia.storeId} store={membresia.store} />
          )}
          <Link href="/envios" className="tap text-label underline underline-offset-4">
            Envíos
          </Link>
        </div>
      </header>

      <p className="-mt-2 mb-3 text-caption text-muted">
        {historial ? (
          <Link href="/pedidos" className="underline underline-offset-4">
            Ver solo activos
          </Link>
        ) : (
          <Link href="/pedidos?historial=1" className="underline underline-offset-4">
            Ver historial completo
          </Link>
        )}
      </p>

      {pedidos.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-24 text-center">
          <div className="text-5xl" aria-hidden>
            🧾
          </div>
          <h2 className="text-title">{historial ? 'Todavía no hay pedidos' : 'Nada activo por ahora'}</h2>
          <p className="max-w-xs text-muted">
            {historial
              ? 'Abre una prenda y toca «Convertir en pedido» para registrar la venta y su envío.'
              : 'Los pedidos nuevos aparecen aquí en cuanto se registran.'}
          </p>
        </section>
      ) : (
        <PedidosLista pedidos={pedidos} simbolo={simbolo} />
      )}
    </main>
  );
}
