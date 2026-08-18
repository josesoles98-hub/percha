import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

import { requireSupabaseEnv } from '../env';

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * Usa las cookies de la petición, así que respeta la sesión del usuario y sus
 * políticas RLS. Nunca usa la clave `service_role`.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Los Server Components no pueden escribir cookies. No pasa nada:
          // el middleware ya refrescó la sesión antes de llegar aquí.
        }
      },
    },
  });
}
