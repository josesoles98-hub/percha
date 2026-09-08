export interface DatosRotulo {
  destinyAgencyName: string | null;
  customerName: string;
  docType?: string;
  docNumber?: string | null;
  phone?: string | null;
  orderCode: string;
}

/** '8/09/26' — la fecha en que se imprime (se pega al paquete ese día), no la del pedido. */
function fechaCorta(fecha: Date): string {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yy = String(fecha.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

/**
 * La tarjeta del rótulo en sí, separada de la página que la envuelve para
 * poder reusarla tanto de a uno (RotuloPedido) como en la tira de varios
 * (RotulosBatch) sin duplicar el marcado.
 *
 * Plantilla calcada de la que la dueña ya usaba antes de Percha: logo
 * arriba (no como marca de agua — el archivo es fondo negro/letra blanca,
 * así que `invert` lo vuelve fondo blanco/letra negra, igual que en el
 * papel), y cada dato en su propia etiqueta chica + valor grande debajo,
 * en vez de "Etiqueta: valor" en una sola línea.
 *
 * A propósito solo trae los datos del destinatario: el remitente ya lo
 * sabe Shalom por la cuenta. Tampoco muestra la cantidad de paquetes —
 * ahora siempre es 1, así que decirlo no aporta nada.
 */
export function RotuloCard({ datos }: { datos: DatosRotulo }) {
  return (
    <div className="rounded-none border-2 border-ink p-3 print:border-black">
      {/*
        El archivo logo-tienda.jpg trae de fábrica ~32% de fondo negro en
        blanco arriba del texto (y casi nada abajo) — mostrado entero eso
        se traducía en un salto de espacio antes del logo. Se recorta con
        CSS, sin tocar el archivo: el contenedor usa el aspect-ratio de
        SOLO el texto (medido en el archivo real, 715×257 de los 715×380
        totales) y `object-bottom` alinea la imagen contra el borde de
        abajo, dejando fuera de vista justo esa franja vacía de arriba.
      */}
      <div className="relative mx-auto mb-2 aspect-[715/257] w-1/2 max-w-40 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-tienda.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover object-bottom invert"
        />
      </div>

      <Campo etiqueta="Destino" valor={datos.destinyAgencyName ?? '—'} grande />
      <Campo etiqueta="Destinatario" valor={datos.customerName} />
      {datos.docNumber && <Campo etiqueta={datos.docType ?? 'DNI'} valor={datos.docNumber} />}
      {datos.phone && <Campo etiqueta="WhatsApp" valor={datos.phone} />}

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <Campo etiqueta="Pedido" valor={datos.orderCode} />
        <p className="pb-0.5 text-label font-bold tabular-nums">{fechaCorta(new Date())}</p>
      </div>
    </div>
  );
}

function Campo({ etiqueta, valor, grande }: { etiqueta: string; valor: string; grande?: boolean }) {
  return (
    <div className="mt-1.5 first:mt-0">
      <p className="text-caption uppercase leading-tight tracking-wide text-muted">{etiqueta}</p>
      <p className={`font-bold leading-tight ${grande ? 'text-title' : 'text-label'}`}>{valor}</p>
    </div>
  );
}
