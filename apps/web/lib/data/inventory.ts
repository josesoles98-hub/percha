import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseSearchQuery,
  type Item,
  type ItemGender,
  type ItemStatus,
  type StoreSettings,
} from '@percha/core';

import { ITEM_COLUMNS, STORE_COLUMNS, mapItem, mapStore, type ItemRow, type StoreRow } from './mappers';

/**
 * Consultas del inventario.
 *
 * Reciben el cliente de Supabase como parámetro en lugar de crearlo dentro:
 * así las mismas funciones sirven en el servidor (RSC) y en el navegador, sin
 * duplicar lógica.
 */

export interface Catalogos {
  brands: Array<{ id: string; name: string; useCount: number }>;
  sizes: Array<{ id: string; label: string; group: string }>;
  categories: Array<{ id: string; name: string; emoji: string | null }>;
  colors: Array<{ id: string; name: string; hex: string | null }>;
}

export interface Membresia {
  storeId: string;
  role: 'owner' | 'seller';
  store: StoreSettings;
}

export async function getMembresia(supabase: SupabaseClient): Promise<Membresia | null> {
  const { data, error } = await supabase
    .from('store_members')
    .select(`role, stores!inner(${STORE_COLUMNS})`)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const store = data.stores as unknown as StoreRow;
  return {
    storeId: store.id,
    role: data.role as 'owner' | 'seller',
    store: mapStore(store),
  };
}

export type Orden = 'recientes' | 'precio_asc' | 'precio_desc' | 'vencimiento';

export interface Filtros {
  /** Lo que el usuario escribió en el buscador. */
  q?: string;
  status?: ItemStatus | 'all';
  brandId?: string | null;
  sizeId?: string | null;
  categoryId?: string | null;
  colorId?: string | null;
  gender?: ItemGender | null;
  /** En centavos. */
  precioMin?: number | null;
  precioMax?: number | null;
  /** Solo las de los últimos 7 días. */
  nuevas?: boolean;
  orden?: Orden;
}

export interface ListarOpciones {
  storeId: string;
  /** Cursor: `created_at` del último elemento cargado (orden por recientes). */
  cursor?: string | null;
  /** Desplazamiento, para las ordenaciones que no admiten cursor. */
  offset?: number | null;
  limit?: number;
  filtros?: Filtros;
  /** Tallas del catálogo, para reconocer 'L' o '32' en el buscador. */
  tallas?: readonly string[];
}

export interface Pagina {
  items: Item[];
  /** Cursor para la siguiente página; null si ya no hay más. */
  nextCursor: string | null;
  /** Desplazamiento para la siguiente página; null si ya no hay más. */
  nextOffset: number | null;
}

/**
 * Limpia un valor antes de meterlo en la cadena de `.or()`.
 *
 * PostgREST separa las condiciones por comas y agrupa con paréntesis, así
 * que esos caracteres romperían la consulta. No es un riesgo de inyección
 * SQL (el cliente parametriza), pero sí de que la búsqueda falle con un 400
 * en cuanto alguien escriba una coma.
 */
function limpiarParaOr(valor: string): string {
  return valor.replace(/[,()"\\*]/g, ' ').trim();
}

export async function listarPrendas(
  supabase: SupabaseClient,
  { storeId, cursor = null, offset = null, limit = 30, filtros = {}, tallas }: ListarOpciones,
): Promise<Pagina> {
  const {
    q = '',
    status = 'all',
    brandId,
    sizeId,
    categoryId,
    colorId,
    gender,
    precioMin,
    precioMax,
    nuevas,
    orden = 'recientes',
  } = filtros;

  let query = supabase.from('items_view').select(ITEM_COLUMNS).eq('store_id', storeId);

  // ── Filtros ────────────────────────────────────────────────────────
  if (status !== 'all') query = query.eq('effective_status', status);
  if (brandId) query = query.eq('brand_id', brandId);
  if (sizeId) query = query.eq('size_id', sizeId);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (colorId) query = query.eq('color_id', colorId);
  if (gender) query = query.eq('gender', gender);
  if (typeof precioMin === 'number') query = query.gte('price_cents', precioMin);
  if (typeof precioMax === 'number') query = query.lte('price_cents', precioMax);

  if (nuevas) {
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);
    query = query.gte('created_at', hace7dias.toISOString());
  }

  // ── Búsqueda ───────────────────────────────────────────────────────
  // Se usa ILIKE sobre las columnas de la vista, no el `search_vector`,
  // porque hace falta buscar también por marca, categoría y color, que
  // viven en otras tablas y no caben en una columna generada. El índice
  // trigram de `items` acelera los ILIKE con comodín inicial sobre nombre
  // y código. Si el inventario llegara a decenas de miles de prendas,
  // tocaría mantener un vector de búsqueda con trigger que incluya el
  // nombre de la marca.
  const intent = parseSearchQuery(q, tallas ? { tallas } : {});

  if (!intent.vacio) {
    const condiciones: string[] = [];

    if (intent.code) condiciones.push(`code.eq.${intent.code}`);
    if (intent.codeDigits) condiciones.push(`code.ilike.*${intent.codeDigits}`);
    if (intent.priceCents !== null) condiciones.push(`price_cents.eq.${intent.priceCents}`);
    if (intent.sizeLabel) condiciones.push(`size_label.ilike.${limpiarParaOr(intent.sizeLabel)}`);

    if (intent.text) {
      const texto = limpiarParaOr(intent.text);
      if (texto) {
        condiciones.push(
          `name.ilike.*${texto}*`,
          `brand_name.ilike.*${texto}*`,
          `category_name.ilike.*${texto}*`,
          `color_name.ilike.*${texto}*`,
          `description.ilike.*${texto}*`,
        );
      }
    }

    if (condiciones.length > 0) query = query.or(condiciones.join(','));
  }

  // ── Orden y paginación ─────────────────────────────────────────────
  // El orden por recientes usa cursor: con offset, subir una prenda
  // mientras haces scroll desplaza las filas y acabas viendo duplicados.
  // Las demás ordenaciones no tienen una clave estable equivalente, así
  // que usan offset; el riesgo ahí es mucho menor porque no se insertan
  // prendas en mitad de la lista.
  const usaCursor = orden === 'recientes';

  switch (orden) {
    case 'precio_asc':
      query = query.order('price_cents', { ascending: true }).order('created_at', { ascending: false });
      break;
    case 'precio_desc':
      query = query.order('price_cents', { ascending: false }).order('created_at', { ascending: false });
      break;
    case 'vencimiento':
      query = query
        .order('reserve_expires_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  if (usaCursor) {
    if (cursor) query = query.lt('created_at', cursor);
    query = query.limit(limit);
  } else {
    const desde = offset ?? 0;
    query = query.range(desde, desde + limit - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`No se pudo cargar el inventario: ${error.message}`);

  const rows = (data ?? []) as unknown as ItemRow[];
  const items = rows.map(mapItem);
  const hayMas = rows.length === limit;

  return {
    items,
    nextCursor: hayMas && usaCursor ? (rows[rows.length - 1]?.created_at ?? null) : null,
    nextOffset: hayMas && !usaCursor ? (offset ?? 0) + limit : null,
  };
}

export async function getPrendaPorCodigo(
  supabase: SupabaseClient,
  storeId: string,
  code: string,
): Promise<Item | null> {
  const { data, error } = await supabase
    .from('items_view')
    .select(ITEM_COLUMNS)
    .eq('store_id', storeId)
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (error || !data) return null;
  return mapItem(data as unknown as ItemRow);
}

export async function getCatalogos(
  supabase: SupabaseClient,
  storeId: string,
): Promise<Catalogos> {
  const [brands, sizes, categories, colors] = await Promise.all([
    supabase
      .from('brands')
      .select('id, name, use_count')
      .eq('store_id', storeId)
      .eq('archived', false)
      .order('use_count', { ascending: false })
      .order('name'),
    supabase
      .from('sizes')
      .select('id, label, group_name')
      .eq('store_id', storeId)
      .eq('archived', false)
      .order('group_name')
      .order('position'),
    supabase
      .from('categories')
      .select('id, name, emoji')
      .eq('store_id', storeId)
      .eq('archived', false)
      .order('position'),
    supabase.from('colors').select('id, name, hex').eq('store_id', storeId).order('position'),
  ]);

  return {
    brands: (brands.data ?? []).map((b) => ({ id: b.id, name: b.name, useCount: b.use_count })),
    sizes: (sizes.data ?? []).map((s) => ({ id: s.id, label: s.label, group: s.group_name })),
    categories: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji })),
    colors: (colors.data ?? []).map((c) => ({ id: c.id, name: c.name, hex: c.hex })),
  };
}

/**
 * URLs firmadas de las fotos.
 *
 * El bucket es privado: nadie puede ver una foto adivinando la URL. Las
 * firmas duran una hora, tiempo de sobra para una sesión de navegación.
 */
export async function firmarFotos(
  supabase: SupabaseClient,
  paths: string[],
  segundos = 3600,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;

  const { data, error } = await supabase.storage
    .from('item-photos')
    .createSignedUrls(paths, segundos);

  if (error || !data) return urls;

  for (const entry of data) {
    if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}
