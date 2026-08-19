'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast, vibrar } from '@/components/Toast';
import { prepararFoto } from '@/lib/photos/prepare';
import { borrarModelo, listarModelos, rutaModelo, type GeneroModelo, type ModeloFoto } from '@/lib/tryon/models';
import { createClient } from '@/lib/supabase/client';

const CONCURRENCIA = 3;

interface EnCola {
  id: string;
  file: File;
  estado: 'esperando' | 'subiendo' | 'lista' | 'error';
}

/**
 * Librería compartida de fotos de modelos para el try-on automático.
 *
 * No es por prenda ni por tienda: es una base que se arma una vez y que
 * usa la Función Edge para componer la 3ra foto de cada prenda nueva.
 * Sube de a pocas a la vez para no saturar el navegador con un lote
 * grande (140 fotos de una sola vez).
 */
export function ModelosTryonPanel() {
  const { mostrar } = useToast();
  const [genero, setGenero] = useState<GeneroModelo>('dama');
  const [fotos, setFotos] = useState<ModeloFoto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cola, setCola] = useState<EnCola[]>([]);
  const enVueloRef = useRef(0);

  const cargar = useCallback(async (g: GeneroModelo) => {
    setCargando(true);
    const supabase = createClient();
    setFotos(await listarModelos(supabase, g));
    setCargando(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void cargar(genero), 0);
    return () => clearTimeout(t);
  }, [genero, cargar]);

  const procesarUno = useCallback(
    async (item: EnCola) => {
      setCola((previa) => previa.map((c) => (c.id === item.id ? { ...c, estado: 'subiendo' } : c)));

      let estadoFinal: EnCola['estado'] = 'lista';
      try {
        const preparada = await prepararFoto(item.file);
        const supabase = createClient();
        const path = rutaModelo(genero);

        const { error } = await supabase.storage
          .from('tryon-models')
          .upload(path, preparada.blob, { contentType: 'image/jpeg' });
        if (error) throw error;

        setFotos((previa) => [{ path, url: preparada.previewUrl }, ...previa]);
      } catch {
        estadoFinal = 'error';
      }

      // Se detecta el fin del lote acá mismo (no con un efecto separado
      // observando la cola) porque esto ya corre fuera del cuerpo síncrono
      // del efecto que la programó.
      setCola((previa) => {
        const actualizada = previa.map((c) => (c.id === item.id ? { ...c, estado: estadoFinal } : c));
        const quedanPendientes = actualizada.some(
          (c) => c.estado === 'esperando' || c.estado === 'subiendo',
        );
        if (quedanPendientes) return actualizada;

        vibrar();
        const conError = actualizada.filter((c) => c.estado === 'error').length;
        mostrar(conError > 0 ? `Listo, ${conError} con error` : 'Fotos subidas');
        return [];
      });
    },
    [genero, mostrar],
  );

  // Cola con concurrencia limitada: arranca nuevas subidas apenas se libera
  // un cupo, en vez de esperar a que termine todo un lote de a 3.
  useEffect(() => {
    const siguientes = cola.filter((c) => c.estado === 'esperando');
    const cupos = CONCURRENCIA - enVueloRef.current;
    if (cupos <= 0 || siguientes.length === 0) return;

    for (const item of siguientes.slice(0, cupos)) {
      enVueloRef.current += 1;
      void procesarUno(item).finally(() => {
        enVueloRef.current -= 1;
      });
    }
  }, [cola, procesarUno]);

  function agregarArchivos(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    const nuevos: EnCola[] = Array.from(archivos).map((file) => ({
      id: crypto.randomUUID(),
      file,
      estado: 'esperando',
    }));
    setCola((previa) => [...previa, ...nuevos]);
  }

  async function eliminar(foto: ModeloFoto) {
    setFotos((previa) => previa.filter((f) => f.path !== foto.path));
    const supabase = createClient();
    const { error } = await borrarModelo(supabase, foto.path);
    if (error) {
      mostrar('No se pudo borrar');
      void cargar(genero);
    }
  }

  const pendientes = cola.filter((c) => c.estado === 'esperando' || c.estado === 'subiendo');

  return (
    <div>
      <div className="flex gap-2">
        {(['dama', 'varon'] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGenero(g)}
            className={`tap flex-1 rounded-[--radius-control] border px-4 py-2.5 font-medium ${
              genero === g
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line bg-surface text-ink'
            }`}
          >
            {g === 'dama' ? 'Dama' : 'Varón'} {cargando ? '' : `(${fotos.length})`}
          </button>
        ))}
      </div>

      <label className="tap mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-[--radius-control] border border-dashed border-line bg-surface px-4 py-3.5 font-medium">
        📤 Agregar fotos
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            agregarArchivos(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {pendientes.length > 0 && (
        <p className="mt-2 text-center text-label text-muted">
          Subiendo {cola.length - pendientes.length + 1} de {cola.length}…
        </p>
      )}

      {cargando ? (
        <p className="mt-6 text-center text-label text-muted">Cargando…</p>
      ) : fotos.length === 0 && pendientes.length === 0 ? (
        <div className="mt-6 rounded-[--radius-card] border border-line bg-surface p-6 text-center">
          <div className="text-4xl" aria-hidden>
            🧍
          </div>
          <p className="mt-2 font-medium">Sin fotos todavía</p>
          <p className="mt-0.5 text-label text-muted">
            Agrega las fotos de modelos para {genero === 'dama' ? 'dama' : 'varón'}.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {fotos.map((foto) => (
            <div key={foto.path} className="group relative aspect-[3/4] overflow-hidden rounded-[--radius-card] bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => void eliminar(foto)}
                className="tap absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label="Borrar"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
