import { STATUS_META, type ItemStatus } from '@percha/core';

const TONO: Record<ItemStatus, string> = {
  available: 'bg-status-available',
  reserved: 'bg-status-reserved',
  sold: 'bg-status-sold',
  hidden: 'bg-status-hidden',
};

/**
 * Indicador de estado.
 *
 * El color NUNCA va solo: siempre lleva el texto al lado (o como etiqueta
 * accesible). Quien no distingue el verde del rojo tiene que poder usar la
 * app igual de rápido.
 */
export function StatusPill({
  status,
  compact = false,
}: {
  status: ItemStatus;
  compact?: boolean;
}) {
  const meta = STATUS_META[status];

  if (compact) {
    return (
      <span
        className={`inline-block size-2.5 rounded-full ring-2 ring-bg ${TONO[status]}`}
        role="img"
        aria-label={meta.label}
        title={meta.label}
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg/90 px-2.5 py-1 text-caption font-medium backdrop-blur">
      <span className={`size-2 rounded-full ${TONO[status]}`} aria-hidden />
      {meta.label}
    </span>
  );
}
