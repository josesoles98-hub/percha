import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateItemData, ItemStatus } from '@percha/core';

/**
 * Escrituras sobre el inventario.
 *
 * Todas devuelven el error como valor en lugar de lanzarlo, para que la
 * interfaz pueda revertir una actualización optimista sin envolver cada
 * llamada en try/catch.
 */

export interface Resultado<T> {
  data: T | null;
  error: string | null;
}

export interface CrearPrendaInput extends CreateItemData {
  /**
   * El id se genera en el cliente ANTES de subir las fotos, porque la ruta
   * en Storage lo incluye. Así la foto ya está subida en su sitio definitivo
   * cuando se guarda la prenda: no hay que moverla ni renombrarla después.
   */
  id: string;
  storeId: string;
  fotos: Array<{ path: string; position: number; width?: number; height?: number; bytes?: number }>;
}

export async function crearPrenda(
  supabase: SupabaseClient,
  input: CrearPrendaInput,
): Promise<Resultado<{ id: string; code: string }>> {
  const { data, error } = await supabase
    .from('items')
    .insert({
      id: input.id,
      store_id: input.storeId,
      name: input.name ?? null,
      description: input.description ?? null,
      price_cents: input.priceCents,
      cost_cents: input.costCents ?? null,
      brand_id: input.brandId ?? null,
      size_id: input.sizeId,
      category_id: input.categoryId ?? null,
      color_id: input.colorId ?? null,
      gender: input.gender ?? null,
      status: input.status,
    })
    .select('id, code')
    .single();

  if (error) return { data: null, error: error.message };

  if (input.fotos.length > 0) {
    const { error: fotoError } = await supabase.from('item_photos').insert(
      input.fotos.map((f) => ({
        item_id: input.id,
        store_id: input.storeId,
        storage_path: f.path,
        position: f.position,
        width: f.width ?? null,
        height: f.height ?? null,
        bytes: f.bytes ?? null,
        status: 'ready' as const,
      })),
    );
    // La prenda ya existe: que falle el registro de una foto no debe
    // deshacer el alta. Se avisa y se puede reintentar desde la ficha.
    if (fotoError) {
      return { data, error: `La prenda se guardó, pero una foto no se registró: ${fotoError.message}` };
    }
  }

  return { data, error: null };
}

export async function actualizarPrenda(
  supabase: SupabaseClient,
  id: string,
  cambios: Partial<CreateItemData>,
): Promise<Resultado<null>> {
  const payload: Record<string, unknown> = {};
  if ('name' in cambios) payload.name = cambios.name ?? null;
  if ('description' in cambios) payload.description = cambios.description ?? null;
  if ('priceCents' in cambios) payload.price_cents = cambios.priceCents;
  if ('costCents' in cambios) payload.cost_cents = cambios.costCents ?? null;
  if ('brandId' in cambios) payload.brand_id = cambios.brandId ?? null;
  if ('sizeId' in cambios) payload.size_id = cambios.sizeId ?? null;
  if ('categoryId' in cambios) payload.category_id = cambios.categoryId ?? null;
  if ('colorId' in cambios) payload.color_id = cambios.colorId ?? null;
  if ('gender' in cambios) payload.gender = cambios.gender ?? null;

  const { error } = await supabase.from('items').update(payload).eq('id', id);
  return { data: null, error: error?.message ?? null };
}

export interface CambiarEstadoOpciones {
  reservedForName?: string | null;
  reservedForPhone?: string | null;
  /** Lo que adelantó el cliente en esta reserva; null si no se registró. */
  reservedDepositCents?: number | null;
}

/**
 * Cambia el estado. Los automatismos (fecha de reserva, congelar los días,
 * fecha de venta, historial) los aplica la base de datos con sus triggers,
 * así que aquí solo se manda el estado nuevo.
 *
 * Llamarla con `status: 'reserved'` mientras la prenda ya está reservada
 * no reinicia la cuenta atrás — el trigger solo congela `reserve_days` la
 * primera vez que entra en reserva — así que también sirve para editar el
 * nombre, teléfono o adelanto de una reserva en curso.
 */
export async function cambiarEstado(
  supabase: SupabaseClient,
  id: string,
  status: ItemStatus,
  opciones: CambiarEstadoOpciones = {},
): Promise<Resultado<null>> {
  const payload: Record<string, unknown> = { status };

  if (status === 'reserved') {
    payload.reserved_for_name = opciones.reservedForName?.trim() || null;
    payload.reserved_for_phone = opciones.reservedForPhone?.trim() || null;
    payload.reserved_deposit_cents = opciones.reservedDepositCents ?? null;
  }

  const { error } = await supabase.from('items').update(payload).eq('id', id);
  return { data: null, error: error?.message ?? null };
}

/** Envía a la papelera. Reversible durante 30 días. */
export async function enviarAPapelera(
  supabase: SupabaseClient,
  id: string,
): Promise<Resultado<null>> {
  const { error } = await supabase
    .from('items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  return { data: null, error: error?.message ?? null };
}

export async function restaurarDePapelera(
  supabase: SupabaseClient,
  id: string,
): Promise<Resultado<null>> {
  const { error } = await supabase.from('items').update({ deleted_at: null }).eq('id', id);
  return { data: null, error: error?.message ?? null };
}

/**
 * Sincroniza las fotos de una prenda tras editarla: borra (fila + archivo)
 * las que el usuario quitó y registra las nuevas o reemplazadas.
 */
export async function sincronizarFotos(
  supabase: SupabaseClient,
  itemId: string,
  storeId: string,
  fotos: Array<{ path: string; position: number; width?: number; height?: number; bytes?: number }>,
): Promise<Resultado<null>> {
  const { data: actuales, error: errorLectura } = await supabase
    .from('item_photos')
    .select('id, storage_path')
    .eq('item_id', itemId);

  if (errorLectura) return { data: null, error: errorLectura.message };

  const conservadas = new Set(fotos.map((f) => f.path));
  const sobrantes = (actuales ?? []).filter((a) => !conservadas.has(a.storage_path));

  if (sobrantes.length > 0) {
    const { error } = await supabase
      .from('item_photos')
      .delete()
      .in('id', sobrantes.map((s) => s.id));
    if (error) return { data: null, error: error.message };

    // El archivo se borra después de la fila: si esto falla queda un archivo
    // huérfano en Storage (inofensivo), nunca una fila sin archivo.
    await supabase.storage.from('item-photos').remove(sobrantes.map((s) => s.storage_path));
  }

  if (fotos.length > 0) {
    const { error } = await supabase.from('item_photos').upsert(
      fotos.map((f) => ({
        item_id: itemId,
        store_id: storeId,
        storage_path: f.path,
        position: f.position,
        width: f.width ?? null,
        height: f.height ?? null,
        bytes: f.bytes ?? null,
        status: 'ready' as const,
      })),
      { onConflict: 'item_id,position' },
    );
    if (error) return { data: null, error: error.message };
  }

  return { data: null, error: null };
}

/** Crea una marca al vuelo desde el formulario de alta. */
export async function crearMarca(
  supabase: SupabaseClient,
  storeId: string,
  name: string,
): Promise<Resultado<{ id: string; name: string }>> {
  const limpio = name.trim();
  if (!limpio) return { data: null, error: 'El nombre está vacío' };

  // Si ya existe (aunque sea con otras mayúsculas), se reutiliza en lugar de
  // duplicarla: "Nike" y "nike" deben ser la misma marca.
  const { data: existente } = await supabase
    .from('brands')
    .select('id, name')
    .eq('store_id', storeId)
    .ilike('name', limpio)
    .maybeSingle();

  if (existente) return { data: existente, error: null };

  const { data, error } = await supabase
    .from('brands')
    .insert({ store_id: storeId, name: limpio })
    .select('id, name')
    .single();

  return { data, error: error?.message ?? null };
}

export async function registrarCompartido(
  supabase: SupabaseClient,
  id: string,
  shareCount: number,
): Promise<void> {
  await supabase.from('items').update({ share_count: shareCount + 1 }).eq('id', id);
}
