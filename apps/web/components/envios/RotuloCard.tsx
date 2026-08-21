import { formatShortDate } from '@percha/core';

export interface DatosRotulo {
  storeName: string;
  originAgencyName: string | null;
  destinyAgencyName: string | null;
  customerName: string;
  docType?: string;
  docNumber?: string | null;
  phone?: string | null;
  orderCode: string;
  packagesCount: number;
  trackingCode?: string | null;
  createdAt?: string;
}

/**
 * La tarjeta del rótulo en sí, separada de la página que la envuelve para
 * poder reusarla tanto de a uno (RotuloPedido) como en la tira de varios
 * (RotulosBatch) sin duplicar el marcado.
 */
export function RotuloCard({ datos }: { datos: DatosRotulo }) {
  return (
    <div className="rounded-[--radius-card] border-2 border-ink p-5 print:rounded-none print:border-black">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption uppercase tracking-wide text-muted">Remitente</p>
          <p className="font-semibold">{datos.storeName}</p>
          {datos.originAgencyName && (
            <p className="text-label text-muted">Shalom {datos.originAgencyName}</p>
          )}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-tienda.jpg"
          alt={datos.storeName}
          className="h-10 w-auto shrink-0 rounded-sm print:h-9"
        />
      </div>

      <div className="my-4 border-t border-dashed border-line" />

      <p className="text-caption uppercase tracking-wide text-muted">Destino</p>
      <p className="text-[1.75rem] font-bold leading-tight">{datos.destinyAgencyName ?? '—'}</p>

      <div className="my-4 border-t border-dashed border-line" />

      <p className="text-caption uppercase tracking-wide text-muted">Para</p>
      <p className="text-title font-semibold">{datos.customerName}</p>
      {datos.docNumber && (
        <p className="text-label">
          {datos.docType}: {datos.docNumber}
        </p>
      )}
      {datos.phone && <p className="text-label">Cel: {datos.phone}</p>}

      <div className="my-4 border-t border-dashed border-line" />

      <div className="flex items-baseline justify-between text-label">
        <span>
          Pedido: <strong className="tabular-nums">{datos.orderCode}</strong>
        </span>
        <span>
          {datos.packagesCount} {datos.packagesCount === 1 ? 'bulto' : 'bultos'}
        </span>
      </div>
      {datos.trackingCode && <p className="mt-1 text-label">Código Shalom: {datos.trackingCode}</p>}
      {datos.createdAt && (
        <p className="mt-1 text-caption text-muted">{formatShortDate(datos.createdAt)}</p>
      )}
    </div>
  );
}
