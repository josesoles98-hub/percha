'use client';

import { useRouter } from 'next/navigation';
import type { StoreSettings } from '@percha/core';

import type { Pedido } from '@/lib/data/orders';

import { RotuloCard } from './RotuloCard';

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

      <RotuloCard
        datos={{
          storeName: store.name,
          originAgencyName: envio.originAgencyName,
          destinyAgencyName: envio.destinyAgencyName,
          customerName: pedido.customerName,
          docType: pedido.customer?.docType,
          docNumber: pedido.customer?.docNumber,
          phone: pedido.customer?.phone,
          orderCode: pedido.code,
          packagesCount: envio.packagesCount,
          trackingCode: envio.trackingCode,
          createdAt: pedido.createdAt,
        }}
      />

      <p className="mt-3 text-center text-caption text-muted print:hidden">
        Imprime y pega este rótulo en el paquete antes de llevarlo a la agencia.
      </p>
    </div>
  );
}
