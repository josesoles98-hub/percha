/**
 * Formato y parseo de dinero.
 *
 * El dinero se guarda SIEMPRE como centavos enteros. Este módulo es la única
 * frontera donde se convierte a texto y de vuelta. Si algún día aparece un
 * `price / 100` suelto en un componente, es un bug esperando a ocurrir.
 */

export interface MoneyFormatOptions {
  /** Símbolo de la tienda. Por defecto 'S/'. */
  symbol?: string;
  /**
   * Mostrar siempre dos decimales. Por defecto false: S/50 en lugar de
   * S/50.00, porque en la tienda los precios son casi siempre redondos y el
   * ruido visual se nota en una cuadrícula con 40 precios en pantalla.
   */
  alwaysCents?: boolean;
  /** Separador entre símbolo e importe. Por defecto '' → 'S/50'. */
  space?: boolean;
}

/**
 * 5000 → 'S/50' · 5050 → 'S/50.50' · 123456 → 'S/1,234.56'
 */
export function formatMoney(cents: number, options: MoneyFormatOptions = {}): string {
  const { symbol = 'S/', alwaysCents = false, space = false } = options;

  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);

  const units = Math.floor(abs / 100);
  const remainder = abs % 100;

  const showCents = alwaysCents || remainder !== 0;
  const unitsText = units.toLocaleString('es-PE');
  const amount = showCents
    ? `${unitsText}.${remainder.toString().padStart(2, '0')}`
    : unitsText;

  return `${negative ? '-' : ''}${symbol}${space ? ' ' : ''}${amount}`;
}

/**
 * Convierte lo que el usuario teclea en centavos.
 *
 * Acepta 'S/50', '50', '50.5', '50,50', ' 1,234.56 '. Devuelve null si no hay
 * un número reconocible, para que el formulario pueda distinguir "vacío" de
 * "cero" sin inventarse un valor.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }

  const cleaned = input.trim().replace(/[^\d.,-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;

  // Si hay ambos separadores, el último es el decimal: '1.234,56' y '1,234.56'
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized: string;
  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = cleaned.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma !== -1) {
    // Una sola coma: decimal si deja 1-2 dígitos detrás ('50,5'), si no es
    // separador de miles ('1,234')
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals <= 2 ? cleaned.replace(',', '.') : cleaned.split(',').join('');
  } else {
    normalized = cleaned;
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}
