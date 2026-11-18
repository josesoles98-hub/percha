import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import type { Membresia } from './inventory';
import { STORE_COLUMNS, mapStore, type StoreRow } from './mappers';

/**
 * Tienda activa.
 *
 * Una misma cuenta puede llevar varias tiendas (p. ej. la de ropa y la de
 * gorras), cada una con su inventario, pedidos y ajustes de envío propios.
 * La que se está usando se recuerda en una cookie; todas las pantallas leen
 * la tienda de `getMembresia`, así que cambiar la cookie cambia la app
 * entera de tienda.
 *
 * Solo para el servidor (usa `next/headers`). Por eso vive aparte de
 * `inventory.ts`, que también importan componentes del navegador.
 */

export const COOKIE_TIENDA = 'percha_tienda';

/** Todas las tiendas de la cuenta, en el orden en que se unió a ellas. */
export async function listarMembresias(supabase: SupabaseClient): Promise<Membresia[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('store_members')
    .select(`role, created_at, stores!inner(${STORE_COLUMNS})`)
    // Sin este filtro, la dueña también vería las filas de su equipo.
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return (data ?? []).map((fila) => {
    const store = fila.stores as unknown as StoreRow;
    return {
      storeId: store.id,
      role: fila.role as 'owner' | 'seller',
      store: mapStore(store),
    };
  });
}

/**
 * La tienda con la que se está trabajando.
 *
 * Sin membresía todavía, intenta unirse solo a una tienda que la haya
 * invitado (ver migración 0019) antes de rendirse. Sin esto, alguien
 * invitado que entra por primera vez terminaría en /bienvenida creando
 * SU PROPIA tienda en vez de sumarse a la de quien lo invitó.
 */
export async function getMembresia(supabase: SupabaseClient): Promise<Membresia | null> {
  let membresias = await listarMembresias(supabase);

  if (membresias.length === 0) {
    const { data: tiendaUnida } = await supabase.rpc('aceptar_invitacion');
    if (tiendaUnida) membresias = await listarMembresias(supabase);
  }

  if (membresias.length === 0) return null;

  const elegida = (await cookies()).get(COOKIE_TIENDA)?.value;
  // Si la cookie apunta a una tienda que ya no es suya, cae en la primera.
  return membresias.find((m) => m.storeId === elegida) ?? membresias[0]!;
}
