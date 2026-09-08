import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ExportarPedidosCsv } from '@/components/envios/ExportarPedidosCsv';
import { PedidosLista } from '@/components/envios/PedidosLista';
import { getMembresia } from '@/lib/data/inventory';
import { listarPedidos, listarPedidosDuplicados, type EstadoPedido } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

// Los tres juntos, sin dejar ninguno por defecto: esta pantalla cambia
// según quién esté vendiendo en ese momento, así que ninguna capa de
// caché (ni la de Next, ni la de Vercel/CDN de por medio) debe guardar
// una respuesta vieja — sobre todo con /pedidos y /pedidos?historial=1
// siendo la "misma" ruta con distinta query.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const ACTIVOS: EstadoPedido[] = ['draft', 'confirmed', 'packed'];

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ historial?: string }>;
}) {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { historial } = await searchParams;
  // El filtro va en la consulta, no después: pedir SOLO los activos (el
  // caso de todos los días) en vez de traer el historial completo para
  // descartar la mayoría, es lo que hace que esta pantalla —la que más se
  // abre— cargue rápido incluso con cientos de pedidos ya enviados.
  const [pedidos, duplicados] = await Promise.all([
    listarPedidos(supabase, membresia.storeId, historial ? 'all' : ACTIVOS),
    listarPedidosDuplicados(supabase, membresia.storeId),
  ]);
  const simbolo = membresia.store.currencySymbol;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-title">Pedidos</h1>
        <div className="flex items-center gap-4">
          <ExportarPedidosCsv storeId={membresia.storeId} store={membresia.store} />
          <Link href="/envios" className="tap text-label underline underline-offset-4">
            Envíos
          </Link>
        </div>
      </header>

      {duplicados.length > 0 && (
        <Link
          href="/pedidos/duplicados"
          className="tap mb-3 block rounded-[--radius-card] border border-status-reserved/40 bg-status-reserved/10 p-3 text-label"
        >
          ⚠️ {duplicados.length} {duplicados.length === 1 ? 'cliente' : 'clientes'} con registros
          duplicados — revisar ›
        </Link>
      )}

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
