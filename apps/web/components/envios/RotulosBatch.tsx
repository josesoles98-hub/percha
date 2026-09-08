'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { marcarRotuloImpreso, type EnvioPendiente } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

import { RotuloCard } from './RotuloCard';

/**
 * Todos los rótulos pendientes, uno detrás de otro, para imprimir de
 * corrido en vez de entrar pedido por pedido.
 *
 * Dos modos de impresión, porque la tienda a veces se queda sin stickers:
 *  · Stickers 10x10 (el normal): @page fija ese tamaño exacto y
 *    `print:break-after-page` saca cada rótulo en su propio sticker.
 *  · Hoja A4: dos columnas por hoja, para recortar con tijera — sin
 *    tamaño de página fijo, se deja el que tenga cargado la impresora
 *    (A4 o Carta).
 *
 * Al imprimir se marcan los envíos como "ya impreso": si después se
 * registra alguien nuevo, se distingue de un vistazo (atenuado) sin tener
 * que recordar cuáles ya salieron.
 */
export function RotulosBatch({ envios: enviosIniciales }: { envios: EnvioPendiente[] }) {
  const router = useRouter();
  const [envios, setEnvios] = useState(enviosIniciales);
  const [modoA4, setModoA4] = useState(false);

  const sinImprimir = envios.filter((e) => !e.labelPrintedAt);

  async function imprimir() {
    window.print();

    if (sinImprimir.length === 0) return;
    const ids = sinImprimir.map((e) => e.shipmentId);

    const supabase = createClient();
    await marcarRotuloImpreso(supabase, ids);

    const ahora = new Date().toISOString();
    setEnvios((previos) =>
      previos.map((e) => (ids.includes(e.shipmentId) ? { ...e, labelPrintedAt: ahora } : e)),
    );
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-safe print:max-w-none">
      {/* Sin tamaño fijo en modo A4: se deja el que tenga cargado la impresora. */}
      {!modoA4 && <style>{'@page { size: 100mm 100mm; margin: 3mm; }'}</style>}
      {modoA4 && <style>{'@page { margin: 10mm; }'}</style>}

      <header className="flex items-center justify-between py-3 print:hidden">
        <button type="button" onClick={() => router.back()} className="tap text-label text-muted">
          ‹ Atrás
        </button>
        <button
          type="button"
          onClick={() => void imprimir()}
          disabled={envios.length === 0}
          className="tap rounded-[--radius-control] bg-accent px-4 py-2.5 font-medium text-accent-ink disabled:opacity-40"
        >
          🖨️ Imprimir{' '}
          {sinImprimir.length > 0 && sinImprimir.length !== envios.length
            ? `los nuevos (${sinImprimir.length})`
            : `todos (${envios.length})`}
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
          Stickers 10x10
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
      {modoA4 && (
        <p className="-mt-2 mb-3 text-caption text-muted print:hidden">
          Salen 2 por hoja — imprime y recorta cada uno por su borde.
        </p>
      )}

      {envios.length === 0 ? (
        <p className="py-12 text-center text-label text-muted print:hidden">
          No hay envíos pendientes de registrar.
        </p>
      ) : (
        <div className={modoA4 ? 'grid grid-cols-2 gap-3 print:grid-cols-2 print:gap-6' : ''}>
          {envios.map((envio) => (
            <div
              key={envio.id}
              className={
                modoA4 ? 'relative' : 'relative mb-4 print:mb-0 print:break-after-page'
              }
            >
              {envio.labelPrintedAt && (
                <span className="absolute -top-2 left-3 z-10 rounded-full bg-status-available px-2 py-0.5 text-caption font-medium text-white print:hidden">
                  ✓ Impreso
                </span>
              )}
              <div className={envio.labelPrintedAt ? 'opacity-40 print:opacity-100' : ''}>
                <RotuloCard
                  datos={{
                    destinyAgencyName: envio.destinyAgency,
                    customerName: envio.customerName,
                    docType: envio.docType,
                    docNumber: envio.docNumber,
                    phone: envio.phone,
                    orderCode: envio.orderCode,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
