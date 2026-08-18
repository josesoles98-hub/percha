'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/** El evento de instalación de Chrome; no está en los tipos del DOM. */
interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CONSULTA = '(display-mode: standalone)';

function suscribirse(alCambiar: () => void): () => void {
  const media = window.matchMedia(CONSULTA);
  media.addEventListener('change', alCambiar);
  return () => media.removeEventListener('change', alCambiar);
}

function estaInstalada(): boolean {
  return (
    window.matchMedia(CONSULTA).matches ||
    // Safari en iOS no expone display-mode: usa esta propiedad suya.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Ayuda para instalar la app en la pantalla de inicio.
 *
 * En Android, Chrome ofrece un diálogo nativo. En iOS **no existe**: hay que
 * explicar el gesto de Compartir → Añadir a pantalla de inicio, y esa es
 * justamente la plataforma que importa aquí. Si ya está instalada, este
 * bloque desaparece.
 *
 * La detección usa `useSyncExternalStore` y no un efecto: el servidor no
 * puede saber si la app está instalada, y esta API es la que React ofrece
 * precisamente para leer estado del navegador sin romper la hidratación. El
 * valor del servidor es «instalada» para que el bloque no aparezca y
 * desaparezca de golpe en quien ya la tiene.
 */
export function InstalarApp() {
  const instalada = useSyncExternalStore(suscribirse, estaInstalada, () => true);
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);

  useEffect(() => {
    const alPoderInstalar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacion);
    };

    window.addEventListener('beforeinstallprompt', alPoderInstalar);
    return () => window.removeEventListener('beforeinstallprompt', alPoderInstalar);
  }, []);

  if (instalada) return null;

  // Solo se evalúa en el cliente: cuando `instalada` es el valor del
  // servidor, arriba ya se devolvió null.
  const esIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  return (
    <section className="mt-4">
      <p className="mb-2 px-1 text-caption font-medium uppercase tracking-wide text-muted">
        Aplicación
      </p>
      <div className="rounded-[--radius-card] border border-line bg-surface p-4">
        <p className="font-medium">Instalar en tu teléfono</p>
        <p className="mt-0.5 text-label text-muted">
          Se abre a pantalla completa, sin la barra del navegador, y arranca más rápido.
        </p>

        {evento ? (
          <button
            type="button"
            onClick={() => void evento.prompt()}
            className="tap mt-3 w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink"
          >
            Instalar
          </button>
        ) : esIOS ? (
          <ol className="mt-3 space-y-1 text-label">
            <li>1. Toca Compartir en la barra de Safari</li>
            <li>2. Baja hasta «Añadir a pantalla de inicio»</li>
            <li>3. Toca Añadir</li>
          </ol>
        ) : (
          <p className="mt-3 text-label text-muted">
            Busca «Instalar» o «Añadir a pantalla de inicio» en el menú de tu navegador.
          </p>
        )}
      </div>
    </section>
  );
}
