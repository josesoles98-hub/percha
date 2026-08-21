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
 * El sticker físico es de 10x10cm: @page fija ese tamaño de hoja, y
 * `print:break-after-page` hace que cada rótulo salga en su propio
 * sticker — antes salía cada uno en una hoja A4 entera, con el sticker
 * chiquito perdido en medio de toda esa hoja en blanco.
 *
 * Al imprimir se marcan los envíos como "ya impreso": si después se
 * registra alguien nuevo, se distingue de un vistazo (atenuado) sin tener
 * que recordar cuáles ya salieron.
 */
export function RotulosBatch({ envios: enviosIniciales }: { envios: EnvioPendiente[] }) {
  const router = useRouter();
  const [envios, setEnvios] = useState(enviosIniciales);

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
    <div className="mx-auto max-w-md px-4 pb-10 pt-safe">
      <style>{'@page { size: 100mm 100mm; margin: 5mm; }'}</style>

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

      {envios.length === 0 ? (
        <p className="py-12 text-center text-label text-muted print:hidden">
          No hay envíos pendientes de registrar.
        </p>
      ) : (
        envios.map((envio) => (
          <div key={envio.id} className="relative mb-4 print:mb-0 print:break-after-page">
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
                  packagesCount: envio.packagesCount,
                }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
