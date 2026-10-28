import type { SupabaseClient } from '@supabase/supabase-js';
import { calidadFoto, type CalidadFoto } from '@percha/core';

/**
 * Verificador de fotos HD: para cada prenda, qué foto tiene copia HD y
 * cuál no. Lee `item_photos` directo (la copia HD no viene en items_view).
 */

export interface FotoCalidad {
  position: number;
  calidad: CalidadFoto;
  hdWidth: number | null;
  hdHeight: number | null;
}

export interface PrendaCalidad {
  code: string;
  fotos: FotoCalidad[];
}

const PAGINA = 1000;

export async function listarCalidadFotos(
  supabase: SupabaseClient,
  storeId: string,
): Promise<PrendaCalidad[]> {
  const filas: Array<Record<string, unknown>> = [];

  // PostgREST corta en 1000 filas por consulta: se pide por páginas.
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from('item_photos')
      .select('item_id, position, hd_path, hd_width, hd_height, items!inner(code)')
      .eq('store_id', storeId)
      .is('items.deleted_at', null)
      .order('item_id')
      .order('position')
      .range(desde, desde + PAGINA - 1);

    if (error || !data || data.length === 0) break;
    filas.push(...(data as unknown as Array<Record<string, unknown>>));
    if (data.length < PAGINA) break;
  }

  const porPrenda = new Map<string, PrendaCalidad>();
  for (const fila of filas) {
    const itemId = fila.item_id as string;
    const items = fila.items as { code: string } | Array<{ code: string }>;
    const code = Array.isArray(items) ? items[0]?.code : items?.code;
    if (!code) continue;

    const prenda = porPrenda.get(itemId) ?? { code, fotos: [] };
    prenda.fotos.push({
      position: fila.position as number,
      calidad: calidadFoto({
        hdPath: (fila.hd_path as string | null) ?? null,
        hdWidth: (fila.hd_width as number | null) ?? null,
        hdHeight: (fila.hd_height as number | null) ?? null,
      }),
      hdWidth: (fila.hd_width as number | null) ?? null,
      hdHeight: (fila.hd_height as number | null) ?? null,
    });
    porPrenda.set(itemId, prenda);
  }

  // Las más nuevas primero: son las que se están subiendo ahora.
  return [...porPrenda.values()].sort((a, b) => b.code.localeCompare(a.code));
}

export interface ResumenCalidad {
  prendas: number;
  prendasConFotosSinHd: number;
  fotos: number;
  enHd: number;
  chicas: number;
  sinHd: number;
}

export function resumirCalidad(prendas: PrendaCalidad[]): ResumenCalidad {
  const todas = prendas.flatMap((p) => p.fotos);
  return {
    prendas: prendas.length,
    prendasConFotosSinHd: prendas.filter((p) => p.fotos.some((f) => f.calidad === 'sin')).length,
    fotos: todas.length,
    enHd: todas.filter((f) => f.calidad === 'hd').length,
    chicas: todas.filter((f) => f.calidad === 'chica').length,
    sinHd: todas.filter((f) => f.calidad === 'sin').length,
  };
}
