'use client';

import { useRouter } from 'next/navigation';

import type { EnvioPendiente } from '@/lib/data/orders';

import { RotuloCard } from './RotuloCard';

/**
 * Todos los rótulos pendientes, uno detrás de otro, para imprimir de
 * corrido en vez de entrar pedido por pedido. `print:break-after-page`
 * hace que cada uno salga en su propia hoja.
 */
export function RotulosBatch({
  envios,
  storeName,
}: {
  envios: EnvioPendiente[];
  storeName: string;
}) {
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
          disabled={envios.length === 0}
          className="tap rounded-[--radius-control] bg-accent px-4 py-2.5 font-medium text-accent-ink disabled:opacity-40"
        >
          🖨️ Imprimir todos ({envios.length})
        </button>
      </header>

      {envios.length === 0 ? (
        <p className="py-12 text-center text-label text-muted print:hidden">
          No hay envíos pendientes de registrar.
        </p>
      ) : (
        envios.map((envio) => (
          <div key={envio.id} className="mb-4 print:mb-0 print:break-after-page">
            <RotuloCard
              datos={{
                storeName,
                originAgencyName: envio.originAgency,
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
        ))
      )}
    </div>
  );
}
