export interface DatosRotulo {
  destinyAgencyName: string | null;
  customerName: string;
  docType?: string;
  docNumber?: string | null;
  phone?: string | null;
  orderCode: string;
  packagesCount: number;
}

/**
 * La tarjeta del rótulo en sí, separada de la página que la envuelve para
 * poder reusarla tanto de a uno (RotuloPedido) como en la tira de varios
 * (RotulosBatch) sin duplicar el marcado.
 *
 * A propósito solo trae los datos del destinatario: el remitente ya lo
 * sabe Shalom por la cuenta, y cada dato de más era una hoja entera de
 * papel desperdiciada al imprimir varios de corrido.
 */
export function RotuloCard({ datos }: { datos: DatosRotulo }) {
  return (
    <div className="rounded-[--radius-card] border-2 border-ink p-3 print:rounded-none print:border-black">
      <p className="text-caption uppercase tracking-wide text-muted">Destino</p>
      <p className="text-title font-bold leading-tight">{datos.destinyAgencyName ?? '—'}</p>

      <div className="my-2 border-t border-dashed border-line" />

      <p className="text-caption uppercase tracking-wide text-muted">Para</p>
      <p className="font-semibold leading-tight">{datos.customerName}</p>
      {datos.docNumber && (
        <p className="text-label">
          {datos.docType}: {datos.docNumber}
        </p>
      )}
      {datos.phone && <p className="text-label">Cel: {datos.phone}</p>}

      <div className="mt-2 flex items-baseline justify-between text-label">
        <span>
          Pedido: <strong className="tabular-nums">{datos.orderCode}</strong>
        </span>
        <span>
          {datos.packagesCount} {datos.packagesCount === 1 ? 'bulto' : 'bultos'}
        </span>
      </div>
    </div>
  );
}
