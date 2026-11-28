/**
 * Orden natural de tallas: letras de menor a mayor (XS, S, M, L, XL, XXL,
 * 3XL, 4XL…) y después los números de menor a mayor (12, 14, 16, 28, 30…).
 *
 * Sirve para que una talla nueva quede en su lugar sin importar cuándo se
 * agregó, en vez de aparecer al principio o al final de la lista.
 */
const LETRAS = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL'];
const POSICION_XL = LETRAS.indexOf('XL');

export function rangoTalla(label: string): number {
  const t = label.trim().toUpperCase().replace(/\s+/g, '');

  const i = LETRAS.indexOf(t);
  if (i >= 0) return i;

  // XXL, XXXL, XXXXL → una X de más por cada talla extra
  const equis = t.match(/^(X{2,})L$/);
  if (equis?.[1]) return POSICION_XL + (equis[1].length - 1);

  // 2XL, 3XL, 4XL, 5XL…
  const numerica = t.match(/^(\d{1,2})XL$/);
  if (numerica?.[1]) return POSICION_XL + (Number(numerica[1]) - 1);

  // Talla única: después de las letras y antes de los números
  if (['ONESIZE', 'UNICA', 'ÚNICA', 'TALLAUNICA', 'TALLAÚNICA', 'OS'].includes(t)) return 50;

  const n = parseFloat(t);
  return Number.isNaN(n) ? 999 : 100 + n;
}

/** Para `Array.sort`: talla menor primero. */
export function compararTallas(a: string, b: string): number {
  return rangoTalla(a) - rangoTalla(b) || a.localeCompare(b, 'es');
}
