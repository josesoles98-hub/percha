import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

/**
 * Destino del enlace mágico del correo.
 *
 * Usa `verifyOtp` con el token del enlace en lugar del flujo PKCE, y esa
 * diferencia es la que hace que funcione de verdad: PKCE guarda una clave
 * en el navegador que PIDIÓ el enlace, así que si lo pides en la
 * computadora y lo abres en el teléfono —que es justo lo que pasa cuando
 * lees el correo en el móvil— el intercambio falla y te devuelve al login
 * sin explicación.
 *
 * Con el token del correo no hay clave que compartir: el enlace funciona
 * desde cualquier navegador y cualquier dispositivo.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const siguiente = searchParams.get('siguiente') ?? '/';

  // Solo rutas internas: evita que un enlace manipulado lleve fuera.
  const destino = siguiente.startsWith('/') && !siguiente.startsWith('//') ? siguiente : '/';

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=enlace_invalido`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // Los enlaces caducan y son de un solo uso: si ya lo abriste antes, o
    // pasó demasiado tiempo, hay que pedir uno nuevo.
    return NextResponse.redirect(`${origin}/login?error=enlace_expirado`);
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
