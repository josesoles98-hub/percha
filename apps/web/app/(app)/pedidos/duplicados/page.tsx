import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PedidosDuplicadosLista } from '@/components/envios/PedidosDuplicadosLista';
import { getMembresia } from '@/lib/data/inventory';
import { listarPedidosDuplicados } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Clientes que se autorregistraron más de una vez y ninguno de esos
 * registros se tocó todavía — para revisar cuál es el bueno y borrar el
 * resto, en vez de tenerlos sueltos confundiendo la lista de Pedidos.
 */
export default async function PedidosDuplicadosPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const grupos = await listarPedidosDuplicados(supabase, membresia.storeId);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/pedidos" className="tap text-label text-muted">
          ‹ Pedidos
        </Link>
        <h1 className="text-title">Registros duplicados</h1>
      </header>

      {grupos.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-24 text-center">
          <div className="text-5xl" aria-hidden>
            ✨
          </div>
          <h2 className="text-title">Nada que limpiar</h2>
          <p className="max-w-xs text-muted">Ningún cliente tiene más de un registro sin tocar.</p>
        </section>
      ) : (
        <>
          <p className="mb-3 text-label text-muted">
            {grupos.length} {grupos.length === 1 ? 'cliente' : 'clientes'} se registraron más de una
            vez. Revisa cuál tiene los datos correctos y borra los demás.
          </p>
          <PedidosDuplicadosLista grupos={grupos} />
        </>
      )}
    </main>
  );
}
