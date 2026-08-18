import type { SupabaseClient } from '@supabase/supabase-js';

import { firmarFotos } from './inventory';
import type { Resultado } from './mutations';

/**
 * Cola de publicación automática.
 *
 * La usuaria arma una lista de prendas y un intervalo; a partir de ahí, un
 * cron en Supabase (ver supabase/functions/publicar-cola) le avisa por
 * notificación push cada vez que le toca a la siguiente. Ella sigue
 * tocando "enviar" en WhatsApp — esto solo le ahorra decidir y preparar
 * qué sigue.
 */

export interface PrendaEnCola {
  itemId: string;
  code: string;
  name: string | null;
  priceCents: number;
  photoUrl: string | null;
  position: number;
  status: 'pending' | 'sent' | 'skipped';
}

export interface EstadoCola {
  activa: boolean;
  intervaloMinutos: number;
  prendas: PrendaEnCola[];
}

const COLUMNAS_COLA = `
  item_id, position, status,
  items ( code, name, price_cents, item_photos ( storage_path, position ) )
`;

export async function getEstadoCola(
  supabase: SupabaseClient,
  storeId: string,
): Promise<EstadoCola> {
  const [{ data: tienda }, { data: filas }] = await Promise.all([
    supabase
      .from('stores')
      .select('publish_active, publish_interval_minutes')
      .eq('id', storeId)
      .single(),
    supabase
      .from('publish_queue')
      .select(COLUMNAS_COLA)
      .eq('store_id', storeId)
      .neq('status', 'skipped')
      .order('position', { ascending: true }),
  ]);

  const crudas = (filas ?? []) as unknown as Array<Record<string, unknown>>;

  const rutas = crudas
    .map((f) => {
      const item = f.items as { item_photos: Array<{ storage_path: string; position: number }> } | null;
      return item?.item_photos?.find((p) => p.position === 1)?.storage_path;
    })
    .filter((p): p is string => Boolean(p));
  const firmadas = await firmarFotos(supabase, rutas);

  const prendas: PrendaEnCola[] = crudas.map((f) => {
    const item = f.items as {
      code: string;
      name: string | null;
      price_cents: number;
      item_photos: Array<{ storage_path: string; position: number }>;
    } | null;
    const foto = item?.item_photos?.find((p) => p.position === 1);

    return {
      itemId: f.item_id as string,
      code: item?.code ?? '',
      name: item?.name ?? null,
      priceCents: item?.price_cents ?? 0,
      photoUrl: foto ? (firmadas.get(foto.storage_path) ?? null) : null,
      position: f.position as number,
      status: f.status as PrendaEnCola['status'],
    };
  });

  return {
    activa: tienda?.publish_active ?? false,
    intervaloMinutos: tienda?.publish_interval_minutes ?? 6,
    prendas,
  };
}

/**
 * Arma y arranca la cola: reemplaza cualquier cola anterior por la nueva
 * lista, en el orden en que se pasen los ids.
 */
export async function armarCola(
  supabase: SupabaseClient,
  storeId: string,
  itemIds: string[],
  intervaloMinutos: number,
): Promise<Resultado<null>> {
  if (itemIds.length === 0) return { data: null, error: 'No hay prendas para publicar' };

  // Se limpia lo anterior: empezar una cola nueva reemplaza a la vieja en
  // vez de sumarse, para no mezclar dos tandas distintas.
  const { error: errorBorrar } = await supabase
    .from('publish_queue')
    .delete()
    .eq('store_id', storeId);
  if (errorBorrar) return { data: null, error: errorBorrar.message };

  const { error: errorInsertar } = await supabase.from('publish_queue').insert(
    itemIds.map((itemId, indice) => ({
      store_id: storeId,
      item_id: itemId,
      position: indice,
    })),
  );
  if (errorInsertar) return { data: null, error: errorInsertar.message };

  const { error: errorTienda } = await supabase
    .from('stores')
    .update({ publish_active: true, publish_interval_minutes: intervaloMinutos })
    .eq('id', storeId);
  if (errorTienda) return { data: null, error: errorTienda.message };

  return { data: null, error: null };
}

export async function detenerCola(
  supabase: SupabaseClient,
  storeId: string,
): Promise<Resultado<null>> {
  const { error } = await supabase
    .from('stores')
    .update({ publish_active: false })
    .eq('id', storeId);

  return { data: null, error: error?.message ?? null };
}
