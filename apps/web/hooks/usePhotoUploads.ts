'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import {
  aJpeg,
  prepararFotoDesdeJpeg,
  prepararFotoHd,
  rutaFoto,
  rutaFotoHd,
} from '@/lib/photos/prepare';

export type EstadoFoto = 'preparando' | 'subiendo' | 'lista' | 'error';

/**
 * Estado de la copia HD, que se sube DESPUÉS de la normal.
 * 'sin' = esta foto no tiene copia HD (una foto anterior a que existiera).
 */
export type EstadoHd = 'pendiente' | 'subiendo' | 'lista' | 'error' | 'sin';

export interface FotoEnCurso {
  /** Posición 1, 2 o 3. */
  position: number;
  estado: EstadoFoto;
  hdEstado: EstadoHd;
  previewUrl: string | null;
  path: string | null;
  width?: number;
  height?: number;
  bytes?: number;
  hdPath?: string | null;
  hdWidth?: number | null;
  hdHeight?: number | null;
  hdBytes?: number | null;
  error?: string;
}

/** Foto ya subida (modo editar): se muestra con su URL firmada. */
export interface FotoExistente {
  position: number;
  path: string;
  previewUrl: string;
  hdPath?: string | null;
  hdWidth?: number | null;
  hdHeight?: number | null;
  hdBytes?: number | null;
}

/** Lo que se registra en la base de datos al guardar. */
export interface FotoParaGuardar {
  path: string;
  position: number;
  width?: number;
  height?: number;
  bytes?: number;
  hdPath: string | null;
  hdWidth: number | null;
  hdHeight: number | null;
  hdBytes: number | null;
}

// Cuántas copias HD se preparan a la vez, en toda la página. Cada una
// decodifica una foto de varios megapíxeles: en la carga rápida hay decenas
// esperando y, todas juntas, un celular se queda sin memoria. Con 2 sigue
// yendo más rápido de lo que se tarda en poner marca, talla y precio.
const MAX_HD_A_LA_VEZ = 2;
let hdActivas = 0;
const hdEnEspera: Array<() => void> = [];

async function conCupoHd<T>(tarea: () => Promise<T>): Promise<T> {
  if (hdActivas < MAX_HD_A_LA_VEZ) {
    hdActivas += 1;
  } else {
    // Al despertar, este ya hereda el cupo de quien terminó.
    await new Promise<void>((resolver) => hdEnEspera.push(resolver));
  }

  try {
    return await tarea();
  } finally {
    const siguiente = hdEnEspera.shift();
    if (siguiente) siguiente();
    else hdActivas -= 1;
  }
}

/**
 * Sube las fotos en segundo plano mientras el usuario sigue rellenando.
 *
 * Este hook es el corazón del objetivo de 20 segundos: en cuanto se elige la
 * foto se muestra la vista previa local (instantánea) y la conversión,
 * compresión y subida ocurren en paralelo, sin bloquear nada. Al pulsar
 * Guardar lo normal es que ya esté todo arriba.
 *
 * Cada foto se sube dos veces: la copia normal (liviana, la que usa la app)
 * y, justo después, una copia HD que solo se usa al compartir por WhatsApp.
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
      hdEstado: f.hdPath ? ('lista' as const) : ('sin' as const),
      previewUrl: f.previewUrl,
      path: f.path,
      hdPath: f.hdPath ?? null,
      hdWidth: f.hdWidth ?? null,
      hdHeight: f.hdHeight ?? null,
      hdBytes: f.hdBytes ?? null,
    })),
  );
  const archivosRef = useRef<Map<number, File>>(new Map());
  const jpegRef = useRef<Map<number, File>>(new Map());
  // Cada vez que se (re)procesa una posición se anota una versión nueva: un
  // resultado que llega tarde de una foto ya quitada o reemplazada no debe
  // pisar el estado de la que está ahora en ese hueco.
  const versionRef = useRef<Map<number, number>>(new Map());
  const contadorRef = useRef(0);

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

  const subirHd = useCallback(
    async (jpeg: File, position: number, version: number) => {
      const vigente = () => versionRef.current.get(position) === version;
      if (!vigente()) return;

      actualizar(position, { hdEstado: 'subiendo' });

      try {
        const hd = await conCupoHd(async () => {
          if (!vigente()) return null;

          const preparada = await prepararFotoHd(jpeg);
          if (!vigente()) return null;

          const path = rutaFotoHd(storeId, itemId, position);
          const { error } = await createClient()
            .storage.from('item-photos')
            .upload(path, preparada.blob, { contentType: 'image/jpeg', upsert: true });
          if (error) throw error;

          return { path, ...preparada };
        });

        if (!hd || !vigente()) return;

        jpegRef.current.delete(position);
        actualizar(position, {
          hdEstado: 'lista',
          hdPath: hd.path,
          hdWidth: hd.width,
          hdHeight: hd.height,
          hdBytes: hd.bytes,
        });
      } catch {
        // Se conserva el jpeg para poder reintentar solo la copia HD.
        if (vigente()) actualizar(position, { hdEstado: 'error' });
      }
    },
    [actualizar, itemId, storeId],
  );

  const procesar = useCallback(
    async (file: File, position: number) => {
      archivosRef.current.set(position, file);
      const version = contadorRef.current + 1;
      contadorRef.current = version;
      versionRef.current.set(position, version);
      const vigente = () => versionRef.current.get(position) === version;

      let jpeg: File;
      try {
        // El HEIC se convierte una sola vez: de este jpeg salen las dos copias.
        jpeg = await aJpeg(file);
        const preparada = await prepararFotoDesdeJpeg(jpeg);

        if (!vigente()) {
          URL.revokeObjectURL(preparada.previewUrl);
          return;
        }

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

        if (!vigente()) return;
        actualizar(position, { estado: 'lista', path });
      } catch (error) {
        if (vigente()) {
          actualizar(position, {
            estado: 'error',
            error: error instanceof Error ? error.message : 'No se pudo subir',
          });
        }
        return;
      }

      // La copia normal ya está arriba (la prenda ya se puede guardar con
      // ella); ahora se sube la HD, en segundo plano.
      jpegRef.current.set(position, jpeg);
      void subirHd(jpeg, position, version);
    },
    [actualizar, itemId, storeId, subirHd],
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
          nuevas.push({
            position,
            estado: 'preparando',
            hdEstado: 'pendiente',
            previewUrl: null,
            path: null,
          });
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
    jpegRef.current.delete(position);
    versionRef.current.delete(position);
  }, []);

  const reintentar = useCallback(
    (position: number) => {
      const file = archivosRef.current.get(position);
      if (!file) return;
      actualizar(position, { estado: 'preparando', hdEstado: 'pendiente', error: undefined });
      void procesar(file, position);
    },
    [actualizar, procesar],
  );

  /** Reintenta solo la copia HD (la normal ya está arriba). */
  const reintentarHd = useCallback(
    (position: number) => {
      const jpeg = jpegRef.current.get(position);
      const version = versionRef.current.get(position);
      if (!jpeg || version === undefined) return;
      actualizar(position, { hdEstado: 'pendiente' });
      void subirHd(jpeg, position, version);
    },
    [actualizar, subirHd],
  );

  const listas = fotos.filter((f) => f.estado === 'lista');

  // Solo cuenta la HD de las fotos cuya copia normal ya subió: si la normal
  // falló, su HD nunca arranca y no debe dejar el botón Guardar bloqueado.
  const normalEnCurso = fotos.some((f) => f.estado === 'preparando' || f.estado === 'subiendo');
  const hdEnCurso = fotos.some(
    (f) => f.estado === 'lista' && (f.hdEstado === 'pendiente' || f.hdEstado === 'subiendo'),
  );
  const subiendo = normalEnCurso || hdEnCurso;
  const subiendoHd = hdEnCurso && !normalEnCurso;

  const conError = fotos.filter((f) => f.estado === 'error');
  const hdConError = fotos.filter((f) => f.estado === 'lista' && f.hdEstado === 'error');

  const paraGuardar: FotoParaGuardar[] = listas.map((f) => {
    const conHd = f.hdEstado === 'lista' && Boolean(f.hdPath);
    return {
      path: f.path as string,
      position: f.position,
      width: f.width,
      height: f.height,
      bytes: f.bytes,
      hdPath: conHd ? (f.hdPath ?? null) : null,
      hdWidth: conHd ? (f.hdWidth ?? null) : null,
      hdHeight: conHd ? (f.hdHeight ?? null) : null,
      hdBytes: conHd ? (f.hdBytes ?? null) : null,
    };
  });

  return {
    fotos,
    agregar,
    quitar,
    reintentar,
    reintentarHd,
    listas,
    paraGuardar,
    subiendo,
    subiendoHd,
    conError,
    hdConError,
  };
}
