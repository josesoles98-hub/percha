import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ExportarPedidosCsv } from '@/components/envios/ExportarPedidosCsv';
import { PedidosLista } from '@/components/envios/PedidosLista';
import { getMembresia } from '@/lib/data/inventory';
import { listarPedidos } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
        <div className="flex items-center gap-4">
          {pedidos.length > 0 && (
            <ExportarPedidosCsv storeId={membresia.storeId} store={membresia.store} />
          )}
          <Link href="/envios" className="tap text-label underline underline-offset-4">
            Envíos
          </Link>
        </div>
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
        <PedidosLista pedidos={pedidos} simbolo={simbolo} />
      )}
    </main>
  );
}
