/**
 * Lógica de reservas.
 *
 * La base de datos ya calcula el vencimiento y lo corrige al leer, pero el
 * cliente necesita las mismas reglas para pintar el contador sin esperar una
 * consulta. Ambos deben coincidir: si cambias algo aquí, revisa
 * `items_view` en la migración 0003.
 */

import type { ItemStatus } from '../types/index';

/** Cuán urgente es una reserva. Define el color del indicador. */
export type ReserveUrgency = 'expired' | 'today' | 'soon' | 'normal';

export interface ReserveInfo {
  /** Fecha exacta de vencimiento. */
  expiresAt: Date;
  /** Días completos que faltan. 0 = vence hoy. Nunca negativo. */
  daysLeft: number;
  /** Horas que faltan; útil el último día ('Vence hoy · 6 h'). */
  hoursLeft: number;
  expired: boolean;
  urgency: ReserveUrgency;
  /** Texto listo para mostrar: 'Vence en 4 días', 'Vence mañana'… */
  label: string;
}

/**
 * Calcula el vencimiento congelando los días indicados.
 *
 * Se pasa `reserveDays` explícitamente (no se lee de los ajustes actuales)
 * porque una reserva creada con 5 días debe seguir venciendo a los 5 aunque
 * después cambies el ajuste a 7. Cambiar una preferencia no puede alterar un
 * compromiso ya adquirido con un cliente.
 */
export function computeExpiry(reservedAt: Date | string, reserveDays: number): Date {
  const start = typeof reservedAt === 'string' ? new Date(reservedAt) : reservedAt;
  const expires = new Date(start.getTime());
  expires.setDate(expires.getDate() + reserveDays);
  return expires;
}

/**
 * Información de la reserva a partir de la fecha de vencimiento ya
 * calculada.
 *
 * ESTA es la que debe usar la interfaz. La base de datos calcula
 * `reserve_expires_at` con los días que se congelaron al reservar, así que
 * partir de esa fecha es lo único que garantiza que la pantalla y la base
 * digan lo mismo. Recalcularlo con los días configurados *ahora* haría que,
 * tras cambiar el ajuste, la app le prometiera al cliente una fecha que la
 * base no va a respetar.
 */
export function getReserveInfoFromExpiry(
  expiresAt: Date | string | null,
  now: Date = new Date(),
): ReserveInfo | null {
  if (!expiresAt) return null;

  const fecha = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(fecha.getTime())) return null;

  const ms = fecha.getTime() - now.getTime();
  const expired = ms <= 0;

  const hoursLeft = expired ? 0 : Math.ceil(ms / 3_600_000);
  const daysLeft = expired ? 0 : Math.ceil(ms / 86_400_000);

  let urgency: ReserveUrgency;
  if (expired) urgency = 'expired';
  else if (hoursLeft < 24) urgency = 'today';
  else if (daysLeft <= 2) urgency = 'soon';
  else urgency = 'normal';

  return {
    expiresAt: fecha,
    daysLeft,
    hoursLeft,
    expired,
    urgency,
    label: buildLabel(expired, daysLeft, hoursLeft),
  };
}

/**
 * Igual, pero calculando el vencimiento a partir de la fecha de reserva y
 * unos días concretos.
 *
 * Se usa antes de guardar (para previsualizar cuándo vencería) y en los
 * tests. Para pintar una reserva ya existente hay que usar
 * `getReserveInfoFromExpiry`, no esta: los días que se le pasen aquí
 * pueden no ser los que se congelaron al crearla.
 */
export function getReserveInfo(
  reservedAt: Date | string | null,
  reserveDays: number | null,
  now: Date = new Date(),
): ReserveInfo | null {
  if (!reservedAt || !reserveDays) return null;
  return getReserveInfoFromExpiry(computeExpiry(reservedAt, reserveDays), now);
}

function buildLabel(expired: boolean, daysLeft: number, hoursLeft: number): string {
  if (expired) return 'Reserva vencida';
  // Estrictamente menor que 24: a exactamente un día de distancia vence
  // mañana, no hoy.
  if (hoursLeft < 24) {
    return hoursLeft <= 1 ? 'Vence en menos de 1 h' : `Vence hoy · ${hoursLeft} h`;
  }
  if (daysLeft === 1) return 'Vence mañana';
  return `Vence en ${daysLeft} días`;
}

/**
 * Estado efectivo en el cliente: si la reserva ya venció, la prenda está
 * disponible aunque la base todavía diga 'reserved' porque el job de los
 * 15 minutos aún no ha corrido.
 */
export function effectiveStatus(
  status: ItemStatus,
  reservedAt: Date | string | null,
  reserveDays: number | null,
  now: Date = new Date(),
): ItemStatus {
  if (status !== 'reserved') return status;
  const info = getReserveInfo(reservedAt, reserveDays, now);
  return info?.expired ? 'available' : 'reserved';
}

/** Igual, partiendo del vencimiento ya calculado por la base de datos. */
export function effectiveStatusFromExpiry(
  status: ItemStatus,
  expiresAt: Date | string | null,
  now: Date = new Date(),
): ItemStatus {
  if (status !== 'reserved') return status;
  const info = getReserveInfoFromExpiry(expiresAt, now);
  return info?.expired ? 'available' : 'reserved';
}
