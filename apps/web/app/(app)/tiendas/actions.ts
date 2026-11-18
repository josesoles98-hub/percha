'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { COOKIE_TIENDA, listarMembresias } from '@/lib/data/tienda-activa';
import { createClient } from '@/lib/supabase/server';

/** Cambia la tienda activa y vuelve al inventario de esa tienda. */
export async function elegirTienda(formData: FormData) {
  const storeId = String(formData.get('storeId') ?? '');

  const supabase = await createClient();
  const membresias = await listarMembresias(supabase);
  if (!membresias.some((m) => m.storeId === storeId)) redirect('/tiendas');

  (await cookies()).set(COOKIE_TIENDA, storeId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  redirect('/');
}
