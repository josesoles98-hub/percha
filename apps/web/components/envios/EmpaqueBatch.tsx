'use client';

import { useRouter } from 'next/navigation';

import type { PedidoEmpaque } from '@/lib/data/orders';

/**
 * Lista de empaque: cada pedido pendiente con la foto y el nombre de sus
 * prendas, en grande, para reconocerlas de un vistazo al armar el
 * paquete — sin tener que abrir cada prenda en la app para verla.
 */
export function EmpaqueBatch({ pedidos, storeName }: { pedidos: PedidoEmpaque[]; storeName: string }) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-safe">
      <header className="flex items-center justify-between py-3 print:hidden">
        <button type="button" onClick={() => router.back()} className="tap text-label text-muted">
          ‹ Atrás
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={pedidos.length === 0}
          className="tap rounded-[--radius-control] bg-accent px-4 py-2.5 font-medium text-accent-ink disabled:opacity-40"
        >
          🖨️ Imprimir ({pedidos.length})
        </button>
      </header>

      <h1 className="hidden text-title print:block">{storeName} · Lista de empaque</h1>

      {pedidos.length === 0 ? (
        <p className="py-12 text-center text-label text-muted print:hidden">
          No hay pedidos pendientes de envío.
        </p>
      ) : (
        <ul className="space-y-4 print:mt-4 print:space-y-3">
          {pedidos.map((pedido) => (
            <li
              key={pedido.orderId}
              className="break-inside-avoid rounded-[--radius-card] border-2 border-ink p-4 print:rounded-none print:border-black"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{pedido.orderCode}</p>
                <p className="text-label text-muted">{pedido.customerName || 'Sin nombre'}</p>
              </div>

              <ul className="mt-3 divide-y divide-line">
                {pedido.prendas.map((prenda, indice) => (
                  <li key={indice} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    {prenda.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={prenda.photoUrl}
                        alt=""
                        className="h-20 w-16 shrink-0 rounded-[--radius-control] object-cover print:h-24 print:w-20"
                      />
                    ) : (
                      <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-[--radius-control] bg-surface text-caption text-muted print:h-24 print:w-20">
                        Sin foto
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{prenda.name ?? prenda.code}</p>
                      <p className="text-label text-muted">
                        {prenda.code}
                        {prenda.sizeLabel ? ` · Talla ${prenda.sizeLabel}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
