import type { ItemGender, ItemStatus } from '@percha/core';

import type { Filtros, Orden } from './data/inventory';

/**
 * Filtros ↔ parámetros de la URL.
 *
 * El estado de los filtros vive en la URL y no en memoria: así la vista
 * filtrada se puede recargar, compartir por WhatsApp y sobre todo volver
 * atrás desde una ficha sin perder lo que estabas mirando.
 *
 * Los nombres van en español porque la URL la ve el usuario.
 */

const ESTADOS: readonly string[] = ['available', 'reserved', 'sold', 'hidden'];
const GENEROS: readonly string[] = ['varon', 'dama', 'unisex'];
const ORDENES: readonly string[] = ['recientes', 'precio_asc', 'precio_desc', 'vencimiento'];

export type ParamsPlanos = Record<string, string | string[] | undefined>;

const primero = (valor: string | string[] | undefined): string | undefined =>
  Array.isArray(valor) ? valor[0] : valor;

function aCentavos(valor: string | undefined): number | null {
  if (!valor) return null;
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) && numero >= 0 ? numero * 100 : null;
}

export function filtrosDesdeParams(params: ParamsPlanos): Filtros {
  const estado = primero(params.estado);
  const genero = primero(params.genero);
  const orden = primero(params.orden);

  return {
    q: primero(params.q) ?? '',
    status: estado && ESTADOS.includes(estado) ? (estado as ItemStatus) : 'all',
    brandId: primero(params.marca) ?? null,
    sizeId: primero(params.talla) ?? null,
    categoryId: primero(params.categoria) ?? null,
    colorId: primero(params.color) ?? null,
    gender: genero && GENEROS.includes(genero) ? (genero as ItemGender) : null,
    precioMin: aCentavos(primero(params.min)),
    precioMax: aCentavos(primero(params.max)),
    nuevas: primero(params.nuevas) === '1',
    orden: orden && ORDENES.includes(orden) ? (orden as Orden) : 'recientes',
  };
}

/** Solo se escriben los parámetros con valor: la URL limpia es `/`. */
export function paramsDesdeFiltros(filtros: Filtros): URLSearchParams {
  const params = new URLSearchParams();

  if (filtros.q) params.set('q', filtros.q);
  if (filtros.status && filtros.status !== 'all') params.set('estado', filtros.status);
  if (filtros.brandId) params.set('marca', filtros.brandId);
  if (filtros.sizeId) params.set('talla', filtros.sizeId);
  if (filtros.categoryId) params.set('categoria', filtros.categoryId);
  if (filtros.colorId) params.set('color', filtros.colorId);
  if (filtros.gender) params.set('genero', filtros.gender);
  if (typeof filtros.precioMin === 'number') params.set('min', String(filtros.precioMin / 100));
  if (typeof filtros.precioMax === 'number') params.set('max', String(filtros.precioMax / 100));
  if (filtros.nuevas) params.set('nuevas', '1');
  if (filtros.orden && filtros.orden !== 'recientes') params.set('orden', filtros.orden);

  return params;
}

/** Cuántos filtros hay puestos, sin contar la búsqueda ni el orden. */
export function contarFiltrosActivos(filtros: Filtros): number {
  let total = 0;
  if (filtros.status && filtros.status !== 'all') total += 1;
  if (filtros.brandId) total += 1;
  if (filtros.sizeId) total += 1;
  if (filtros.categoryId) total += 1;
  if (filtros.colorId) total += 1;
  if (filtros.gender) total += 1;
  if (typeof filtros.precioMin === 'number' || typeof filtros.precioMax === 'number') total += 1;
  if (filtros.nuevas) total += 1;
  return total;
}

/**
 * Clave estable de los filtros. Se usa para remontar la cuadrícula cuando
 * cambian, de modo que no mezcle resultados de la búsqueda anterior con los
 * de la nueva.
 */
export function claveFiltros(filtros: Filtros): string {
  return paramsDesdeFiltros(filtros).toString();
}
