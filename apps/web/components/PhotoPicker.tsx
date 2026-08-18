'use client';

import { useRef } from 'react';

import type { FotoEnCurso } from '@/hooks/usePhotoUploads';

/**
 * Selector de las tres fotos.
 *
 * El primer recuadro es grande y los otros dos pequeños porque la foto
 * principal es la que se ve en la cuadrícula y en WhatsApp: merece más
 * atención al elegirla.
 *
 * `multiple` permite escoger las tres de una vez desde la fototeca del
 * iPhone, que es lo que ahorra más segundos al cargar un lote.
 */
export function PhotoPicker({
  fotos,
  onAgregar,
  onQuitar,
  onReintentar,
}: {
  fotos: FotoEnCurso[];
  onAgregar: (archivos: FileList) => void;
  onQuitar: (position: number) => void;
  onReintentar: (position: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const huecos = [1, 2, 3];
  const completas = fotos.length >= 3;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) onAgregar(e.target.files);
          // Permite volver a elegir el mismo archivo si se quitó antes
          e.target.value = '';
        }}
      />

      <div className="flex gap-2">
        {huecos.map((position) => {
          const foto = fotos.find((f) => f.position === position);
          const esPrincipal = position === 1;

          return (
            <div
              key={position}
              className={`relative overflow-hidden rounded-[--radius-card] border border-line bg-surface ${
                esPrincipal ? 'aspect-3/4 flex-2' : 'aspect-3/4 flex-1'
              }`}
            >
              {foto ? (
                <>
                  {foto.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- objectURL local
                    <img
                      src={foto.previewUrl}
                      alt={`Foto ${position}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-caption text-muted">
                      Preparando…
                    </div>
                  )}

                  {(foto.estado === 'preparando' || foto.estado === 'subiendo') && (
                    <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-line">
                      <div className="h-full w-1/2 animate-pulse bg-accent" />
                    </div>
                  )}

                  {foto.estado === 'error' && (
                    <button
                      type="button"
                      onClick={() => onReintentar(position)}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-bg/85 text-caption"
                    >
                      <span className="text-status-sold">No subió</span>
                      <span className="underline">Reintentar</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onQuitar(position)}
                    aria-label={`Quitar foto ${position}`}
                    className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-bg/90 text-caption backdrop-blur"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={completas}
                  className="flex size-full flex-col items-center justify-center gap-1 text-muted disabled:opacity-40"
                >
                  <span className="text-2xl" aria-hidden>
                    {esPrincipal ? '📷' : '+'}
                  </span>
                  {esPrincipal && <span className="text-caption">Añadir foto</span>}
                  <span className="sr-only">Añadir foto {position}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
