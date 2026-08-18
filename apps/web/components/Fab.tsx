'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Botón flotante de alta rápida.
 *
 * 64 pt, esquina inferior derecha, por encima de la barra de navegación. Es
 * el punto de entrada al flujo más frecuente de la app y por eso está
 * siempre a la vista, en cualquier pantalla del inventario.
 *
 * Excepto en la ficha de una prenda: ahí ya hay una barra propia fija en la
 * misma esquina (Compartir + Estado), y el FAB le tapaba el selector de
 * Estado. Esa pantalla tampoco es de navegar el inventario, así que no
 * pierde nada al no tenerlo.
 */
export function Fab() {
  const pathname = usePathname();
  if (/^\/prenda\/[^/]+$/.test(pathname)) return null;

  return (
    <Link
      href="/nueva"
      aria-label="Subir prenda"
      className="fixed bottom-20 right-4 z-50 flex size-16 items-center justify-center rounded-full bg-accent text-3xl font-light text-accent-ink shadow-float transition-transform active:scale-95"
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
    >
      <span aria-hidden>+</span>
    </Link>
  );
}
