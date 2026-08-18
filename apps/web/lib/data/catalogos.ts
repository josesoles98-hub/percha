import type { SupabaseClient } from '@supabase/supabase-js';

import type { Resultado } from './mutations';

/**
 * Edición de los catálogos: marcas, categorías, tallas y colores.
 *
 * Los cuatro se comportan igual, así que comparten estas funciones en vez
 * de tener cuatro copias casi idénticas.
 *
 * Nunca se borran de verdad: se archivan. Borrar una marca dejaría a las
 * prendas que la usan sin marca y sin forma de recuperarla, y el historial
 * de la prenda quedaría mintiendo.
 */

export type TipoCatalogo = 'marcas' | 'categorias' | 'tallas' | 'colores';

interface Definicion {
  tabla: 'brands' | 'categories' | 'sizes' | 'colors';
  /** Columna con el texto visible. Las tallas usan `label`, el resto `name`. */
  columna: 'name' | 'label';
  singular: string;
  plural: string;
  /** Si el catálogo admite archivar (los colores no lo necesitan). */
  archivable: boolean;
}

export const CATALOGOS: Record<TipoCatalogo, Definicion> = {
  marcas: { tabla: 'brands', columna: 'name', singular: 'marca', plural: 'Marcas', archivable: true },
  categorias: {
    tabla: 'categories',
    columna: 'name',
    singular: 'categoría',
    plural: 'Categorías',
    archivable: true,
  },
  tallas: { tabla: 'sizes', columna: 'label', singular: 'talla', plural: 'Tallas', archivable: true },
  colores: {
    tabla: 'colors',
    columna: 'name',
    singular: 'color',
    plural: 'Colores',
    archivable: false,
  },
};

export interface EntradaCatalogo {
  id: string;
  nombre: string;
  archivado: boolean;
  /** Cuántas prendas la usan: avisa antes de archivar algo en uso. */
  enUso: number;
  /** Solo en tallas: 'ropa', 'pantalon' o 'calzado'. */
  grupo?: string;
  /** Solo en categorías. */
  emoji?: string | null;
  /** Solo en colores. */
  hex?: string | null;
}

/** Columna de `items` que apunta a cada catálogo. */
const COLUMNA_EN_ITEMS: Record<TipoCatalogo, string> = {
  marcas: 'brand_id',
  categorias: 'category_id',
  tallas: 'size_id',
  colores: 'color_id',
};

export async function listarCatalogo(
  supabase: SupabaseClient,
  storeId: string,
  tipo: TipoCatalogo,
): Promise<EntradaCatalogo[]> {
  const def = CATALOGOS[tipo];

  const campos = [
    'id',
    def.columna,
    def.archivable ? 'archived' : null,
    tipo === 'tallas' ? 'group_name, position' : null,
    tipo === 'categorias' ? 'emoji, position' : null,
    tipo === 'colores' ? 'hex, position' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const [{ data: filas }, { data: usos }] = await Promise.all([
    supabase.from(def.tabla).select(campos).eq('store_id', storeId).order(def.columna),
    // Un conteo por prenda de cuántas usan cada entrada. Se trae entero y
    // se agrupa en memoria: son cientos de filas, no millones, y evita una
    // vista más en la base solo para esto.
    supabase
      .from('items')
      .select(COLUMNA_EN_ITEMS[tipo])
      .eq('store_id', storeId)
      .is('deleted_at', null)
      .not(COLUMNA_EN_ITEMS[tipo], 'is', null),
  ]);

  const conteo = new Map<string, number>();
  for (const fila of (usos ?? []) as unknown as Array<Record<string, string>>) {
    const id = fila[COLUMNA_EN_ITEMS[tipo]];
    if (id) conteo.set(id, (conteo.get(id) ?? 0) + 1);
  }

  return ((filas ?? []) as unknown as Array<Record<string, unknown>>).map((fila) => ({
    id: fila.id as string,
    nombre: fila[def.columna] as string,
    archivado: Boolean(fila.archived),
    enUso: conteo.get(fila.id as string) ?? 0,
    grupo: fila.group_name as string | undefined,
    emoji: (fila.emoji as string) ?? null,
    hex: (fila.hex as string) ?? null,
  }));
}

export async function crearEntrada(
  supabase: SupabaseClient,
  storeId: string,
  tipo: TipoCatalogo,
  nombre: string,
  extra: { grupo?: string } = {},
): Promise<Resultado<{ id: string }>> {
  const def = CATALOGOS[tipo];
  const limpio = nombre.trim();
  if (!limpio) return { data: null, error: 'Escribe un nombre' };

  const payload: Record<string, unknown> = { store_id: storeId, [def.columna]: limpio };
  if (tipo === 'tallas') payload.group_name = extra.grupo ?? 'ropa';

  const { data, error } = await supabase.from(def.tabla).insert(payload).select('id').single();

  if (error) {
    return {
      data: null,
      error:
        error.code === '23505'
          ? `Ya tienes una ${def.singular} con ese nombre.`
          : error.message,
    };
  }

  return { data, error: null };
}

export async function renombrarEntrada(
  supabase: SupabaseClient,
  tipo: TipoCatalogo,
  id: string,
  nombre: string,
): Promise<Resultado<null>> {
  const def = CATALOGOS[tipo];
  const limpio = nombre.trim();
  if (!limpio) return { data: null, error: 'El nombre no puede quedar vacío' };

  const { error } = await supabase
    .from(def.tabla)
    .update({ [def.columna]: limpio })
    .eq('id', id);

  if (error) {
    return {
      data: null,
      error: error.code === '23505' ? `Ya existe otra ${def.singular} así.` : error.message,
    };
  }

  return { data: null, error: null };
}

/**
 * Archivar deja de ofrecerla al subir prendas, pero las que ya la usan la
 * conservan. Es reversible.
 */
export async function archivarEntrada(
  supabase: SupabaseClient,
  tipo: TipoCatalogo,
  id: string,
  archivado: boolean,
): Promise<Resultado<null>> {
  const def = CATALOGOS[tipo];
  if (!def.archivable) return { data: null, error: 'Este catálogo no se puede archivar' };

  const { error } = await supabase.from(def.tabla).update({ archived: archivado }).eq('id', id);
  return { data: null, error: error?.message ?? null };
}

/**
 * Borrado definitivo. Solo se permite si no la usa ninguna prenda: la
 * comprobación real la hace la clave foránea, pero se avisa antes para no
 * mostrar un error críptico de Postgres.
 */
export async function borrarEntrada(
  supabase: SupabaseClient,
  tipo: TipoCatalogo,
  id: string,
): Promise<Resultado<null>> {
  const def = CATALOGOS[tipo];
  const { error } = await supabase.from(def.tabla).delete().eq('id', id);

  if (error) {
    return {
      data: null,
      error:
        error.code === '23503'
          ? `No se puede borrar: hay prendas usando esta ${def.singular}. Archívala en su lugar.`
          : error.message,
    };
  }

  return { data: null, error: null };
}
