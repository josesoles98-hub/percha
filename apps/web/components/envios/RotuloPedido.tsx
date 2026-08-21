'use client';

import { useRouter } from 'next/navigation';
import { formatShortDate, type StoreSettings } from '@percha/core';

import type { Pedido } from '@/lib/data/orders';

/**
 * Rótulo para pegar en el paquete: remitente, destino y datos del cliente,
 * en letra grande para que se lea bien pegado en la caja.
 *
 * `print:hidden` esconde los botones al imprimir — la página los necesita
 * para navegar, pero en el papel solo debe salir el rótulo. El resto del
 * layout ya sale sin la barra de navegación porque la ruta vive fuera de
 * (app), igual que /nueva.
 */
export function RotuloPedido({ pedido, store }: { pedido: Pedido; store: StoreSettings }) {
  const router = useRouter();
  const envio = pedido.envio;

  // La página que renderiza esto ya comprueba que exista antes de llegar
  // aquí; este chequeo es solo para que TypeScript no se queje del null.
  if (!envio) return null;

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-safe">
      <header className="flex items-center justify-between py-3 print:hidden">
        <button type="button" onClick={() => router.back()} className="tap text-label text-muted">
          ‹ Atrás
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="tap rounded-[--radius-control] bg-accent px-4 py-2.5 font-medium text-accent-ink"
        >
          🖨️ Imprimir
        </button>
      </header>

      <div className="rounded-[--radius-card] border-2 border-ink p-5 print:rounded-none print:border-black">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-caption uppercase tracking-wide text-muted">Remitente</p>
            <p className="font-semibold">{store.name}</p>
            {envio.originAgencyName && (
              <p className="text-label text-muted">Shalom {envio.originAgencyName}</p>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-tienda.jpg"
            alt={store.name}
            className="h-10 w-auto shrink-0 rounded-sm print:h-9"
          />
        </div>

        <div className="my-4 border-t border-dashed border-line" />

        <p className="text-caption uppercase tracking-wide text-muted">Destino</p>
        <p className="text-[1.75rem] font-bold leading-tight">{envio.destinyAgencyName ?? '—'}</p>

        <div className="my-4 border-t border-dashed border-line" />

        <p className="text-caption uppercase tracking-wide text-muted">Para</p>
        <p className="text-title font-semibold">{pedido.customerName}</p>
        {pedido.customer?.docNumber && (
          <p className="text-label">
            {pedido.customer.docType}: {pedido.customer.docNumber}
          </p>
        )}
        {pedido.customer?.phone && <p className="text-label">Cel: {pedido.customer.phone}</p>}

        <div className="my-4 border-t border-dashed border-line" />

        <div className="flex items-baseline justify-between text-label">
          <span>
            Pedido: <strong className="tabular-nums">{pedido.code}</strong>
          </span>
          <span>
            {envio.packagesCount} {envio.packagesCount === 1 ? 'bulto' : 'bultos'}
          </span>
        </div>
        {envio.trackingCode && (
          <p className="mt-1 text-label">Código Shalom: {envio.trackingCode}</p>
        )}
        <p className="mt-1 text-caption text-muted">{formatShortDate(pedido.createdAt)}</p>
      </div>

      <p className="mt-3 text-center text-caption text-muted print:hidden">
        Imprime y pega este rótulo en el paquete antes de llevarlo a la agencia.
      </p>
    </div>
  );
}
