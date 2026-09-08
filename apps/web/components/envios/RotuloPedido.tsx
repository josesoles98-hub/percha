'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
  const [modoA4, setModoA4] = useState(false);
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
      {/* Sin tamaño fijo en modo A4: se deja el que tenga cargado la impresora. */}
      {!modoA4 && <style>{'@page { size: 100mm 100mm; margin: 3mm; }'}</style>}
      {modoA4 && <style>{'@page { margin: 10mm; }'}</style>}

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

      <div className="mb-3 flex gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setModoA4(false)}
          aria-pressed={!modoA4}
          className={`tap flex-1 rounded-[--radius-control] border px-3 py-2 text-label font-medium transition-colors ${
            !modoA4 ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
          }`}
        >
          Sticker 10x10
        </button>
        <button
          type="button"
          onClick={() => setModoA4(true)}
          aria-pressed={modoA4}
          className={`tap flex-1 rounded-[--radius-control] border px-3 py-2 text-label font-medium transition-colors ${
            modoA4 ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
          }`}
        >
          Hoja A4 (sin stickers)
        </button>
      </div>

      <div className={modoA4 ? 'mx-auto max-w-64' : ''}>
        <RotuloCard
          datos={{
            destinyAgencyName: envio.destinyAgencyName,
            customerName: pedido.customerName,
            docType: pedido.customer?.docType,
            docNumber: pedido.customer?.docNumber,
            phone: pedido.customer?.phone,
            orderCode: pedido.code,
          }}
        />
      </div>

      <p className="mt-3 text-center text-caption text-muted print:hidden">
        {modoA4
          ? 'Imprime y recorta el rótulo por su borde antes de pegarlo en el paquete.'
          : `Imprime y pega este rótulo en el paquete antes de llevarlo a la agencia. Sale a tamaño sticker (10x10cm) — ${store.name} no aparece porque Shalom ya sabe quién es el remitente.`}
      </p>
    </div>
  );
}
