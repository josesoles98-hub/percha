'use client';

import { createBrowserClient } from '@supabase/ssr';

import { requireSupabaseEnv } from '../env';

/**
 * Cliente de Supabase para el navegador.
 *
 * El cliente habla DIRECTAMENTE con Supabase, sin pasar por nuestro servidor.
 * Eso elimina un salto de red en cada lectura del inventario. La seguridad no
 * se resiente porque quien decide qué puede leer cada usuario son las
 * políticas RLS de PostgreSQL, no el servidor de Next.
 */
export function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
