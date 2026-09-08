'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDateTime } from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import { borrarPedido, type ClienteConDuplicados } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

/**
 * Un grupo por cliente, con sus pedidos duplicados uno debajo del otro —
 * para comparar fechas y notas y decidir cuál conservar, sin tener que
 * saltar entre pantallas.
 */
export function PedidosDuplicadosLista({ grupos: gruposIniciales }: { grupos: ClienteConDuplicados[] }) {
  const { mostrar } = useToast();
  const [grupos, setGrupos] = useState(gruposIniciales);

  async function borrar(customerId: string, pedidoId: string, code: string) {
    if (!confirm(`¿Borrar el pedido ${code}? Esto no se puede deshacer.`)) return;

    const previos = grupos;
    setGrupos((actuales) =>
      actuales
        .map((g) => (g.customerId === customerId ? { ...g, pedidos: g.pedidos.filter((p) => p.id !== pedidoId) } : g))
        // Con uno solo restante ya no es "duplicado": desaparece del listado.
        .filter((g) => g.pedidos.length > 1),
    );

    const { error } = await borrarPedido(createClient(), pedidoId);

    if (error) {
      mostrar('No se pudo borrar');
      setGrupos(previos);
      return;
    }

    vibrar();
    mostrar(`${code} borrado`);
  }

  return (
    <div className="space-y-4 pb-8">
      {grupos.map((grupo) => (
        <section
          key={grupo.customerId}
          className="overflow-hidden rounded-[--radius-card] border border-line bg-surface"
        >
          <header className="border-b border-line bg-bg px-4 py-2.5">
            <p className="font-medium">{grupo.customerName}</p>
            {grupo.docNumber && <p className="text-caption text-muted">{grupo.docNumber}</p>}
          </header>

          <ul className="divide-y divide-line">
            {grupo.pedidos.map((pedido) => (
              <li key={pedido.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/pedidos/${pedido.code}`} className="min-w-0 flex-1">
                  <p className="font-medium tabular-nums">{pedido.code}</p>
                  <p className="text-caption text-muted">{formatDateTime(pedido.createdAt)}</p>
                  {pedido.notes && <p className="mt-0.5 truncate text-label">{pedido.notes}</p>}
                </Link>
                <button
                  type="button"
                  onClick={() => void borrar(grupo.customerId, pedido.id, pedido.code)}
                  className="tap shrink-0 text-label text-status-sold"
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
