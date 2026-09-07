import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberRole } from '@percha/core';

import type { Resultado } from './mutations';

/**
 * Equipo de la tienda: quién ya es miembro y a quién se invitó pero
 * todavía no entró. Solo la dueña lo gestiona — ver RLS de
 * `store_members`/`store_invites`.
 */

export interface Miembro {
  userId: string;
  fullName: string;
  phone: string | null;
  role: MemberRole;
}

export interface Invitacion {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: string;
}

export async function listarMiembros(supabase: SupabaseClient, storeId: string): Promise<Miembro[]> {
  const { data } = await supabase
    .from('store_members')
    .select('user_id, role, profiles!inner(full_name, phone)')
    .eq('store_id', storeId)
    .order('role', { ascending: true }); // 'owner' antes que 'seller', alfabético ya alcanza

  return ((data ?? []) as Array<Record<string, unknown>>).map((fila) => {
    const perfil = fila.profiles as { full_name: string | null; phone: string | null };
    return {
      userId: fila.user_id as string,
      fullName: perfil.full_name ?? 'Sin nombre',
      phone: perfil.phone,
      role: fila.role as MemberRole,
    };
  });
}

export async function listarInvitaciones(
  supabase: SupabaseClient,
  storeId: string,
): Promise<Invitacion[]> {
  const { data } = await supabase
    .from('store_invites')
    .select('id, email, role, created_at')
    .eq('store_id', storeId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  return (data ?? []).map((fila) => ({
    id: fila.id as string,
    email: fila.email as string,
    role: fila.role as MemberRole,
    createdAt: fila.created_at as string,
  }));
}

export async function invitarMiembro(
  supabase: SupabaseClient,
  storeId: string,
  datos: { email: string; role: MemberRole },
): Promise<Resultado<Invitacion>> {
  const { data, error } = await supabase
    .from('store_invites')
    .insert({ store_id: storeId, email: datos.email.trim().toLowerCase(), role: datos.role })
    .select('id, email, role, created_at')
    .single();

  if (error) {
    // El índice único de invitación pendiente por correo.
    const mensaje = error.code === '23505' ? 'Ya invitaste a ese correo.' : error.message;
    return { data: null, error: mensaje };
  }

  return {
    data: {
      id: data.id as string,
      email: data.email as string,
      role: data.role as MemberRole,
      createdAt: data.created_at as string,
    },
    error: null,
  };
}

export async function cancelarInvitacion(
  supabase: SupabaseClient,
  invitacionId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('store_invites').delete().eq('id', invitacionId);
  return { error: error?.message ?? null };
}

/** Saca a alguien del equipo. La dueña no puede sacarse a sí misma desde acá. */
export async function quitarMiembro(
  supabase: SupabaseClient,
  storeId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('store_members')
    .delete()
    .eq('store_id', storeId)
    .eq('user_id', userId);
  return { error: error?.message ?? null };
}
