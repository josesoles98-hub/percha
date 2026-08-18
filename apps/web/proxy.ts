import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PUBLIC_PATHS = ['/login', '/auth', '/configurar'];

/**
 * Refresca la sesión en cada petición y protege las rutas privadas.
 *
 * Sin esto, el token de acceso caduca a la hora y el usuario se encuentra
 * cerrada la sesión a mitad de una carga de prendas.
 */
export default async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sin configurar: la app muestra la pantalla de ayuda en vez de romperse.
  if (!url || !anonKey) return NextResponse.next();

  // Cada <Link> de la cuadrícula precarga su página en cuanto entra en
  // pantalla. Sin este atajo, cada precarga disparaba su propia validación
  // de sesión contra Supabase (una llamada de red), multiplicando por
  // decenas la cantidad de peticiones y sintiéndose todo lentísimo. Una
  // precarga no es una navegación real: la sesión igual se revalida en
  // cuanto el usuario de verdad toca la tarjeta.
  if (request.headers.get('Next-Router-Prefetch') === '1') {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() valida el token contra el servidor de auth. getSession() se fía
  // de la cookie, que el cliente puede manipular: no sirve para proteger.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    // Para volver a donde iba después de entrar
    if (pathname !== '/') login.searchParams.set('siguiente', pathname);
    return NextResponse.redirect(login);
  }

  if (user && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo excepto estáticos e imágenes: no tiene sentido validar la sesión
     * para servir un icono.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)',
  ],
};
