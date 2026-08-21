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
 * papel desperdiciada al imprimir varios de corrido. El logo queda solo
 * como marca de agua muy tenue detrás del texto — no ocupa una línea
 * propia. El archivo es fondo negro con letras blancas; invertido y con
 * poca opacidad, el fondo (ahora blanco) se funde con la tarjeta y solo
 * se insinúa el trazo del texto en gris clarito.
 */
export function RotuloCard({ datos }: { datos: DatosRotulo }) {
  return (
    <div className="relative overflow-hidden rounded-[--radius-card] border-2 border-ink p-3 print:rounded-none print:border-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-tienda.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 m-auto h-2/3 w-2/3 object-contain opacity-[0.07] invert print:opacity-[0.1]"
      />

      <div className="relative">
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
    </div>
  );
}
