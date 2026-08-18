'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { prepararFoto, rutaFoto } from '@/lib/photos/prepare';

export type EstadoFoto = 'preparando' | 'subiendo' | 'lista' | 'error';

export interface FotoEnCurso {
  /** Posición 1, 2 o 3. */
  position: number;
  estado: EstadoFoto;
  previewUrl: string | null;
  path: string | null;
  width?: number;
  height?: number;
  bytes?: number;
  error?: string;
}

/** Foto ya subida (modo editar): se muestra con su URL firmada. */
export interface FotoExistente {
  position: number;
  path: string;
  previewUrl: string;
}

/**
 * Sube las fotos en segundo plano mientras el usuario sigue rellenando.
 *
 * Este hook es el corazón del objetivo de 20 segundos: en cuanto se elige la
 * foto se muestra la vista previa local (instantánea) y la conversión,
 * compresión y subida ocurren en paralelo, sin bloquear nada. Al pulsar
 * Guardar lo normal es que ya esté todo arriba.
 */
export function usePhotoUploads(
  storeId: string,
  itemId: string,
  iniciales: FotoExistente[] = [],
) {
  // Las fotos existentes (modo editar) entran ya como 'lista': no hay nada
  // que subir salvo que el usuario las reemplace.
  const [fotos, setFotos] = useState<FotoEnCurso[]>(() =>
    iniciales.map((f) => ({
      position: f.position,
      estado: 'lista' as const,
      previewUrl: f.previewUrl,
      path: f.path,
    })),
  );
  const archivosRef = useRef<Map<number, File>>(new Map());

  // Liberar las URLs locales al desmontar evita una fuga de memoria que se
  // nota tras cargar 20 prendas seguidas sin recargar la página.
  useEffect(() => {
    return () => {
      for (const foto of fotos) {
        if (foto.previewUrl) URL.revokeObjectURL(foto.previewUrl);
      }
    };
    // Solo al desmontar: la lista cambia constantemente durante la subida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actualizar = useCallback((position: number, cambios: Partial<FotoEnCurso>) => {
    setFotos((previas) =>
      previas.map((f) => (f.position === position ? { ...f, ...cambios } : f)),
    );
  }, []);

  const procesar = useCallback(
    async (file: File, position: number) => {
      archivosRef.current.set(position, file);

      try {
        const preparada = await prepararFoto(file);

        actualizar(position, {
          estado: 'subiendo',
          previewUrl: preparada.previewUrl,
          width: preparada.width,
          height: preparada.height,
          bytes: preparada.bytes,
        });

        const path = rutaFoto(storeId, itemId, position);
        const supabase = createClient();

        const { error } = await supabase.storage
          .from('item-photos')
          .upload(path, preparada.blob, {
            contentType: 'image/jpeg',
            upsert: true, // reemplazar si el usuario cambia de foto
          });

        if (error) throw error;

        actualizar(position, { estado: 'lista', path });
      } catch (error) {
        actualizar(position, {
          estado: 'error',
          error: error instanceof Error ? error.message : 'No se pudo subir',
        });
      }
    },
    [actualizar, itemId, storeId],
  );

  /** Añade una o varias fotos (el selector de iOS permite elegir 3 de golpe). */
  const agregar = useCallback(
    (archivos: FileList | File[]) => {
      const lista = Array.from(archivos);
      if (lista.length === 0) return;

      setFotos((previas) => {
        const ocupadas = new Set(previas.map((f) => f.position));
        const nuevas: FotoEnCurso[] = [];

        for (const file of lista) {
          let position = 1;
          while (ocupadas.has(position) && position <= 3) position += 1;
          if (position > 3) break; // máximo 3 fotos por prenda

          ocupadas.add(position);
          nuevas.push({ position, estado: 'preparando', previewUrl: null, path: null });
          void procesar(file, position);
        }

        return [...previas, ...nuevas].sort((a, b) => a.position - b.position);
      });
    },
    [procesar],
  );

  const quitar = useCallback((position: number) => {
    setFotos((previas) => {
      const foto = previas.find((f) => f.position === position);
      if (foto?.previewUrl) URL.revokeObjectURL(foto.previewUrl);
      return previas.filter((f) => f.position !== position);
    });
    archivosRef.current.delete(position);
  }, []);

  const reintentar = useCallback(
    (position: number) => {
      const file = archivosRef.current.get(position);
      if (!file) return;
      actualizar(position, { estado: 'preparando', error: undefined });
      void procesar(file, position);
    },
    [actualizar, procesar],
  );

  const listas = fotos.filter((f) => f.estado === 'lista');
  const subiendo = fotos.some((f) => f.estado === 'preparando' || f.estado === 'subiendo');
  const conError = fotos.filter((f) => f.estado === 'error');

  return { fotos, agregar, quitar, reintentar, listas, subiendo, conError };
}
