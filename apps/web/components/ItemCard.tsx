import Link from 'next/link';
import { formatMoney, getReserveInfoFromExpiry, type Item } from '@percha/core';

import { StatusPill } from './StatusPill';

/**
 * Tarjeta de la cuadrícula.
 *
 * Solo cuatro datos: foto, estado, precio y marca · talla. En una pantalla
 * con 40 tarjetas, cada dato de más es ruido que hace más lento encontrar
 * lo que buscas.
 */
export function ItemCard({
  item,
  fotoUrl,
  simbolo,
  modoSeleccion = false,
  seleccionado = false,
  onToggleSeleccion,
}: {
  item: Item;
  fotoUrl: string | null;
  simbolo: string;
  /** Con esto activo, la tarjeta ya no navega: toca para elegir/quitar. */
  modoSeleccion?: boolean;
  seleccionado?: boolean;
  onToggleSeleccion?: () => void;
}) {
  // Se parte del vencimiento que calculó la base con los días congelados al
  // reservar, no de los días configurados hoy.
  const reserva =
    item.effectiveStatus === 'reserved'
      ? getReserveInfoFromExpiry(item.reserveExpiresAt)
      : null;

  const subtitulo = [item.brandName, item.sizeLabel].filter(Boolean).join(' · ');

  const contenido = (
    <>
      <div className="relative aspect-3/4 bg-line">
        {fotoUrl ? (
          // Las fotos llegan con URL firmada de duración corta: pasarlas por
          // el optimizador de Next volvería a firmarlas en cada render y se
          // perdería la caché del CDN de Supabase.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fotoUrl}
            alt={item.name ?? item.code}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-3xl text-muted" aria-hidden>
            👕
          </div>
        )}

        <span className="absolute right-2 top-2">
          <StatusPill status={item.effectiveStatus} compact />
        </span>

        {item.effectiveStatus === 'sold' && (
          <span className="absolute left-2 top-2 rounded-full bg-status-sold px-2 py-0.5 text-caption font-semibold text-white">
            Vendida
          </span>
        )}

        {modoSeleccion && (
          <span
            aria-hidden
            className={`absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border text-caption ${
              seleccionado ? 'border-accent bg-accent text-accent-ink' : 'border-white bg-black/30 text-white'
            }`}
          >
            {seleccionado ? '✓' : ''}
          </span>
        )}
      </div>

      <div className="p-2.5">
        <p className="font-semibold tabular-nums">
          {formatMoney(item.priceCents, { symbol: simbolo })}
        </p>
        {subtitulo && <p className="truncate text-caption text-muted">{subtitulo}</p>}
      </div>

      {reserva && !reserva.expired && (
        <p className="bg-status-reserved/15 px-2.5 py-1 text-caption font-medium text-ink">
          {reserva.label}
        </p>
      )}
    </>
  );

  const clases = `group block w-full overflow-hidden rounded-[--radius-card] border bg-surface text-left shadow-card transition-transform active:scale-[0.98] ${
    seleccionado ? 'border-accent ring-2 ring-accent' : 'border-line'
  }`;

  if (modoSeleccion) {
    return (
      <button type="button" onClick={onToggleSeleccion} className={clases}>
        {contenido}
      </button>
    );
  }

  return (
    <Link href={`/prenda/${item.code}`} className={clases}>
      {contenido}
    </Link>
  );
}
