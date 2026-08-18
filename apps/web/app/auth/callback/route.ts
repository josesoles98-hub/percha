import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * Destino del enlace mágico: canjea el código por una sesión y redirige.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const siguiente = searchParams.get('siguiente') ?? '/';

  // Solo rutas internas: evita que un enlace manipulado redirija fuera.
  const destino = siguiente.startsWith('/') && !siguiente.startsWith('//') ? siguiente : '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=enlace_invalido`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=enlace_expirado`);
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
