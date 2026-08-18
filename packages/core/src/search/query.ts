/**
 * Detección de intención en el buscador.
 *
 * El usuario no debería tener que elegir "buscar por código" o "buscar por
 * precio" en un desplegable: escribe y ya. Este módulo mira lo que tecleó y
 * decide qué puede ser, para que la consulta busque en los sitios correctos.
 *
 * Cuando algo es ambiguo NO se elige: se devuelven las dos lecturas y la
 * consulta hace un OR. Escribir "50" puede ser el precio S/50 o la prenda
 * PR-000050, y adivinar mal significa no encontrar lo que buscas.
 */

import { parseMoneyToCents } from '../format/money';

export interface SearchIntent {
  /** Lo que se tecleó, sin espacios sobrantes. */
  raw: string;
  /** Texto libre: se busca en nombre, marca, categoría, color y descripción. */
  text: string | null;
  /** Código completo tecleado entero, normalizado: 'pr-128' → 'PR-000128'. */
  code: string | null;
  /** Solo dígitos: puede ser el final de un código. */
  codeDigits: string | null;
  /** Importe en centavos, si puede leerse como precio. */
  priceCents: number | null;
  /** Talla exacta, solo si coincide con una del catálogo de la tienda. */
  sizeLabel: string | null;
  /** true si no hay nada que buscar. */
  vacio: boolean;
}

const VACIO: Omit<SearchIntent, 'raw'> = {
  text: null,
  code: null,
  codeDigits: null,
  priceCents: null,
  sizeLabel: null,
  vacio: true,
};

/** 'pr-128' + prefijo 'PR' → 'PR-000128' */
export function normalizarCodigo(letras: string, digitos: string): string {
  return `${letras.toUpperCase()}-${digitos.padStart(6, '0')}`;
}

export function parseSearchQuery(
  entrada: string,
  opciones: { tallas?: readonly string[] } = {},
): SearchIntent {
  const raw = entrada.trim();
  if (raw === '') return { raw, ...VACIO };

  const base = { raw, ...VACIO, vacio: false };

  // ── Talla exacta del catálogo: 'L', 'XL', '32', '9.5' ───────────────
  // Va primero porque 'L' como texto libre no sirve de nada, y '32' es
  // mucho más probable que sea una talla de pantalón que un precio.
  const talla = opciones.tallas?.find((t) => t.toLowerCase() === raw.toLowerCase());
  if (talla) {
    // '32' también podría ser el código 32, así que se conserva esa lectura.
    const soloDigitos = /^\d{1,6}$/.test(raw);
    return {
      ...base,
      sizeLabel: talla,
      codeDigits: soloDigitos ? raw : null,
    };
  }

  // ── Código completo: 'PR-000128', 'pr-128', 'PR128' ─────────────────
  const conLetras = raw.match(/^([a-zA-Z]{1,4})[-\s]?(\d{1,6})$/);
  if (conLetras?.[1] && conLetras[2]) {
    return {
      ...base,
      code: normalizarCodigo(conLetras[1], conLetras[2]),
      codeDigits: conLetras[2],
    };
  }

  // ── Solo dígitos: ambiguo entre código y precio ─────────────────────
  if (/^\d{1,6}$/.test(raw)) {
    return {
      ...base,
      codeDigits: raw,
      priceCents: parseMoneyToCents(raw),
    };
  }

  // ── Precio explícito: 'S/50', '50.50', '$120' ───────────────────────
  // Lleva símbolo de moneda o decimales, así que no es texto libre.
  if (/^[^\d]{0,3}\d[\d.,\s]*$/.test(raw)) {
    const cents = parseMoneyToCents(raw);
    if (cents !== null) return { ...base, priceCents: cents };
  }

  // ── Texto libre ─────────────────────────────────────────────────────
  return { ...base, text: raw };
}
