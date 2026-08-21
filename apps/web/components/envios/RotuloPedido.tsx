'use client';

import { useRouter } from 'next/navigation';
import type { StoreSettings } from '@percha/core';

import { marcarRotuloImpreso, type Pedido } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

import { RotuloCard } from './RotuloCard';

/**
 * Rótulo para pegar en el paquete: destino y datos del cliente, en letra
 * grande para que se lea bien pegado en la caja.
 *
 * El sticker físico que usa la tienda es de 10x10cm, así que la página
 * imprime a ese tamaño exacto (@page) — de lo contrario el navegador usa
 * el tamaño de hoja por defecto (A4/carta) y sale un sticker diminuto en
 * medio de una hoja enorme, o corta el rótulo si el driver ajusta al
 * tamaño real del sticker.
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

  const shipmentId = envio.id;

  function imprimir() {
    window.print();
    void marcarRotuloImpreso(createClient(), [shipmentId]);
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-safe">
      <style>{'@page { size: 100mm 100mm; margin: 5mm; }'}</style>

      <header className="flex items-center justify-between py-3 print:hidden">
        <button type="button" onClick={() => router.back()} className="tap text-label text-muted">
          ‹ Atrás
        </button>
        <button
          type="button"
          onClick={imprimir}
          className="tap rounded-[--radius-control] bg-accent px-4 py-2.5 font-medium text-accent-ink"
        >
          🖨️ Imprimir
        </button>
      </header>

      <RotuloCard
        datos={{
          destinyAgencyName: envio.destinyAgencyName,
          customerName: pedido.customerName,
          docType: pedido.customer?.docType,
          docNumber: pedido.customer?.docNumber,
          phone: pedido.customer?.phone,
          orderCode: pedido.code,
          packagesCount: envio.packagesCount,
        }}
      />

      <p className="mt-3 text-center text-caption text-muted print:hidden">
        Imprime y pega este rótulo en el paquete antes de llevarlo a la agencia. Sale a tamaño
        sticker (10x10cm) — {store.name} no aparece porque Shalom ya sabe quién es el remitente.
      </p>
    </div>
  );
}
