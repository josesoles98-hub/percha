import type { SupabaseClient } from '@supabase/supabase-js';

import type { Resultado } from './mutations';

/**
 * Ajustes de la tienda y papelera.
 *
 * Las escrituras de stores están limitadas al dueño por RLS: si un vendedor
 * llama a esto, la base rechaza el cambio aunque la interfaz fallara en
 * ocultárselo.
 */

export interface CambiosTienda {
  name?: string;
  currency?: string;
  currencySymbol?: string;
  reserveDays?: number;
  codePrefix?: string;
  shareTemplate?: string;
  shareDepositCents?: number;
  sellersSeeTotals?: boolean;
  shalomOriginAgencyId?: number | null;
  defaultPackageType?: string;
  shippingEnabled?: boolean;
}

export async function actualizarTienda(
  supabase: SupabaseClient,
  storeId: string,
  cambios: CambiosTienda,
): Promise<Resultado<null>> {
  const payload: Record<string, unknown> = {};
  if (cambios.name !== undefined) payload.name = cambios.name.trim();
  if (cambios.currency !== undefined) payload.currency = cambios.currency;
  if (cambios.currencySymbol !== undefined) payload.currency_symbol = cambios.currencySymbol;
  if (cambios.reserveDays !== undefined) payload.reserve_days = cambios.reserveDays;
  if (cambios.codePrefix !== undefined) payload.code_prefix = cambios.codePrefix.toUpperCase();
  if (cambios.shareTemplate !== undefined) payload.share_template = cambios.shareTemplate;
  if (cambios.shareDepositCents !== undefined)
    payload.share_deposit_cents = cambios.shareDepositCents;
  if (cambios.sellersSeeTotals !== undefined)
    payload.sellers_see_totals = cambios.sellersSeeTotals;
  if (cambios.shalomOriginAgencyId !== undefined)
    payload.shalom_origin_agency_id = cambios.shalomOriginAgencyId;
  if (cambios.defaultPackageType !== undefined)
    payload.default_package_type = cambios.defaultPackageType;
  if (cambios.shippingEnabled !== undefined)
    payload.shipping_enabled = cambios.shippingEnabled;

  const { error } = await supabase.from('stores').update(payload).eq('id', storeId);
  return { data: null, error: error?.message ?? null };
}

export interface PrendaEnPapelera {
  id: string;
  code: string;
  name: string | null;
  priceCents: number;
  deletedAt: string;
}

/**
 * La papelera se consulta directo sobre `items` porque `items_view`
 * excluye lo borrado a propósito.
 */
export async function listarPapelera(
  supabase: SupabaseClient,
  storeId: string,
): Promise<PrendaEnPapelera[]> {
  const { data } = await supabase
    .from('items')
    .select('id, code, name, price_cents, deleted_at')
    .eq('store_id', storeId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  return (data ?? []).map((fila) => ({
    id: fila.id,
    code: fila.code,
    name: fila.name,
    priceCents: fila.price_cents,
    deletedAt: fila.deleted_at,
  }));
}

/**
 * Borrado DEFINITIVO. Solo el dueño (RLS). Primero los archivos de Storage,
 * después la fila: el cascade se lleva las filas de fotos.
 */
export async function borrarDefinitivo(
  supabase: SupabaseClient,
  itemId: string,
): Promise<Resultado<null>> {
  const { data: fotos } = await supabase
    .from('item_photos')
    .select('storage_path')
    .eq('item_id', itemId);

  if (fotos && fotos.length > 0) {
    await supabase.storage.from('item-photos').remove(fotos.map((f) => f.storage_path));
  }

  const { error } = await supabase.from('items').delete().eq('id', itemId);
  return { data: null, error: error?.message ?? null };
}

export interface Notificacion {
  id: number;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  itemCode: string | null;
}

export async function listarNotificaciones(
  supabase: SupabaseClient,
  storeId: string,
): Promise<Notificacion[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, read_at, created_at, items(code)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(100);

  return (data ?? []).map((fila) => ({
    id: fila.id,
    type: fila.type,
    title: fila.title,
    body: fila.body,
    readAt: fila.read_at,
    createdAt: fila.created_at,
    itemCode: (fila.items as unknown as { code: string } | null)?.code ?? null,
  }));
}

export async function marcarTodasLeidas(
  supabase: SupabaseClient,
  storeId: string,
): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .is('read_at', null);
}
