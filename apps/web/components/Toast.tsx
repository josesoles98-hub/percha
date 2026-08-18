'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Avisos breves con opción de deshacer.
 *
 * Los cambios de estado no piden confirmación: se aplican y se ofrece
 * "Deshacer" durante unos segundos. Es más rápido que un diálogo y menos
 * molesto cuando cambias el estado de diez prendas seguidas.
 */

interface Aviso {
  id: number;
  mensaje: string;
  deshacer?: () => void;
}

interface ToastContexto {
  mostrar: (mensaje: string, deshacer?: () => void) => void;
}

const Contexto = createContext<ToastContexto | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const mostrar = useCallback((mensaje: string, deshacer?: () => void) => {
    const id = Date.now() + Math.random();
    setAvisos((previos) => [...previos, { id, mensaje, deshacer }]);
    setTimeout(() => {
      setAvisos((previos) => previos.filter((a) => a.id !== id));
    }, deshacer ? 6000 : 3000);
  }, []);

  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        {avisos.map((aviso) => (
          <div
            key={aviso.id}
            className="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-[--radius-control] bg-accent px-4 py-3 text-label text-accent-ink shadow-lg"
          >
            <span>{aviso.mensaje}</span>
            {aviso.deshacer && (
              <button
                type="button"
                onClick={() => {
                  aviso.deshacer?.();
                  setAvisos((previos) => previos.filter((a) => a.id !== aviso.id));
                }}
                className="shrink-0 font-semibold underline underline-offset-2"
              >
                Deshacer
              </button>
            )}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useToast(): ToastContexto {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useToast necesita estar dentro de <ToastProvider>');
  return contexto;
}

/** Vibración corta de confirmación. En iOS solo funciona si el navegador la soporta. */
export function vibrar(patron: number | number[] = 10) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(patron);
  }
}
