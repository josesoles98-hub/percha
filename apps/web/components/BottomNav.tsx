'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Barra inferior fija.
 *
 * Va abajo y no arriba porque toda acción primaria tiene que caer en el
 * tercio inferior de la pantalla, donde llega el pulgar sin recolocar el
 * teléfono. `pb-safe` respeta la barra del iPhone con Face ID.
 *
 * Cinco pestañas es el máximo antes de que los objetivos táctiles se
 * estrechen demasiado: Alertas y Ajustes se agrupan bajo «Más».
 */
const PESTANAS = [
  { href: '/', label: 'Inventario', icono: '▣' },
  { href: '/pedidos', label: 'Pedidos', icono: '🧾' },
  { href: '/envios', label: 'Envíos', icono: '📦' },
  { href: '/panel', label: 'Panel', icono: '◷' },
  { href: '/mas', label: 'Más', icono: '⋯' },
] as const;

export function BottomNav({ alertas = 0 }: { alertas?: number }) {
  const pathname = usePathname();

  const estaActiva = (href: string) => {
    if (href === '/') return pathname === '/';
    // «Más» agrupa alertas y ajustes, así que se ilumina con cualquiera.
    if (href === '/mas') {
      return ['/mas', '/alertas', '/ajustes'].some((r) => pathname.startsWith(r));
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-safe backdrop-blur"
    >
      <ul className="mx-auto flex max-w-3xl">
        {PESTANAS.map((pestana) => {
          const activa = estaActiva(pestana.href);
          const conAviso = pestana.href === '/mas' && alertas > 0;

          return (
            <li key={pestana.href} className="flex-1">
              <Link
                href={pestana.href}
                aria-current={activa ? 'page' : undefined}
                className={`tap flex flex-col items-center gap-0.5 py-2 text-caption transition-colors ${
                  activa ? 'text-ink' : 'text-muted'
                }`}
              >
                <span className="relative text-lg leading-none" aria-hidden>
                  {pestana.icono}
                  {conAviso && (
                    <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-status-sold px-1 text-[10px] font-semibold leading-4 text-white">
                      {alertas > 9 ? '9+' : alertas}
                    </span>
                  )}
                </span>
                {pestana.label}
                {conAviso && <span className="sr-only">{alertas} alertas sin leer</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
