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
}: {
  item: Item;
  fotoUrl: string | null;
  simbolo: string;
}) {
  // Se parte del vencimiento que calculó la base con los días congelados al
  // reservar, no de los días configurados hoy.
  const reserva =
    item.effectiveStatus === 'reserved'
      ? getReserveInfoFromExpiry(item.reserveExpiresAt)
      : null;

  const subtitulo = [item.brandName, item.sizeLabel].filter(Boolean).join(' · ');

  return (
    <Link
      href={`/prenda/${item.code}`}
      className="group block overflow-hidden rounded-[--radius-card] border border-line bg-surface shadow-card transition-transform active:scale-[0.98]"
    >
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
    </Link>
  );
}
