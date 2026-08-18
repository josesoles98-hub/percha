/**
 * Fechas en español peruano, con formatos cortos.
 *
 * En la ficha de una prenda interesa "hoy, 14:30" o "22 jul", no
 * "27/07/2026 14:30:00". El formato largo solo aparece en el historial.
 */

import { format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';

const toDate = (value: Date | string): Date =>
  typeof value === 'string' ? new Date(value) : value;

/** '22 jul' · '22 jul 2025' si es de otro año. */
export function formatShortDate(value: Date | string): string {
  const date = toDate(value);
  return format(date, isThisYear(date) ? "d MMM" : "d MMM yyyy", { locale: es });
}

/** 'hoy, 14:30' · 'ayer, 09:05' · '22 jul, 14:30'. */
export function formatDateTime(value: Date | string): string {
  const date = toDate(value);
  const time = format(date, 'HH:mm');
  if (isToday(date)) return `hoy, ${time}`;
  if (isYesterday(date)) return `ayer, ${time}`;
  return `${formatShortDate(date)}, ${time}`;
}

/** 'hace 3 días'. Para el historial de cambios. */
export function formatRelative(value: Date | string): string {
  return formatDistanceToNowStrict(toDate(value), { locale: es, addSuffix: true });
}

/** '22 de julio de 2026'. Formato largo, solo donde hay sitio. */
export function formatLongDate(value: Date | string): string {
  return format(toDate(value), "d 'de' MMMM 'de' yyyy", { locale: es });
}
