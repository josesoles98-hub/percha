'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast, vibrar } from '@/components/Toast';
import {
  CATALOGOS,
  archivarEntrada,
  borrarEntrada,
  crearEntrada,
  renombrarEntrada,
  type EntradaCatalogo,
  type TipoCatalogo,
} from '@/lib/data/catalogos';
import { createClient } from '@/lib/supabase/client';

const GRUPOS_TALLA = [
  { valor: 'ropa', etiqueta: 'Ropa' },
  { valor: 'pantalon', etiqueta: 'Pantalón' },
  { valor: 'calzado', etiqueta: 'Calzado' },
];

/**
 * Editor de catálogos.
 *
 * Uno solo para marcas, categorías, tallas y colores: se comportan igual y
 * cuatro copias casi idénticas se desincronizarían a la primera mejora.
 *
 * Archivar en vez de borrar es lo importante aquí: una marca borrada
 * dejaría sin marca a las prendas que la usan y el historial pasaría a
 * mentir. Borrar de verdad solo se ofrece cuando no la usa nadie.
 */
export function EditorCatalogo({
  tipo,
  entradas: entradasIniciales,
  storeId,
  puedeBorrar,
}: {
  tipo: TipoCatalogo;
  entradas: EntradaCatalogo[];
  storeId: string;
  puedeBorrar: boolean;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const def = CATALOGOS[tipo];

  const [entradas, setEntradas] = useState(entradasIniciales);
  const [nuevo, setNuevo] = useState('');
  const [grupoNuevo, setGrupoNuevo] = useState('ropa');
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEdicion, setTextoEdicion] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const visibles = entradas.filter((e) => verArchivadas || !e.archivado);
  const archivadas = entradas.filter((e) => e.archivado).length;

  async function refrescar() {
    router.refresh();
  }

  async function agregar() {
    const nombre = nuevo.trim();
    if (!nombre || ocupado) return;

    setOcupado(true);
    const { data, error } = await crearEntrada(createClient(), storeId, tipo, nombre, {
      grupo: grupoNuevo,
    });
    setOcupado(false);

    if (!data) {
      mostrar(error ?? 'No se pudo crear');
      return;
    }

    vibrar();
    setEntradas((previas) => [
      ...previas,
      {
        id: data.id,
        nombre,
        archivado: false,
        enUso: 0,
        ...(tipo === 'tallas' ? { grupo: grupoNuevo } : {}),
      },
    ]);
    setNuevo('');
    void refrescar();
  }

  async function renombrar(id: string) {
    const nombre = textoEdicion.trim();
    const actual = entradas.find((e) => e.id === id);

    if (!nombre || nombre === actual?.nombre) {
      setEditando(null);
      return;
    }

    setOcupado(true);
    const { error } = await renombrarEntrada(createClient(), tipo, id, nombre);
    setOcupado(false);

    if (error) {
      mostrar(error);
      return;
    }

    setEntradas((previas) => previas.map((e) => (e.id === id ? { ...e, nombre } : e)));
    setEditando(null);
    void refrescar();
  }

  async function alternarArchivo(entrada: EntradaCatalogo) {
    setOcupado(true);
    const { error } = await archivarEntrada(createClient(), tipo, entrada.id, !entrada.archivado);
    setOcupado(false);

    if (error) {
      mostrar(error);
      return;
    }

    setEntradas((previas) =>
      previas.map((e) => (e.id === entrada.id ? { ...e, archivado: !e.archivado } : e)),
    );
    mostrar(entrada.archivado ? 'Restaurada' : 'Archivada');
    void refrescar();
  }

  async function borrar(entrada: EntradaCatalogo) {
    if (!confirm(`¿Borrar «${entrada.nombre}»? No se puede deshacer.`)) return;

    setOcupado(true);
    const { error } = await borrarEntrada(createClient(), tipo, entrada.id);
    setOcupado(false);

    if (error) {
      mostrar(error);
      return;
    }

    setEntradas((previas) => previas.filter((e) => e.id !== entrada.id));
    mostrar('Borrada');
    void refrescar();
  }

  return (
    <div className="pb-8">
      {/* ── Añadir ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void agregar();
            }}
            placeholder={`Añadir ${def.singular}`}
            aria-label={`Nueva ${def.singular}`}
            className="tap flex-1 rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void agregar()}
            disabled={ocupado || nuevo.trim() === ''}
            className="tap shrink-0 rounded-[--radius-control] bg-accent px-5 font-medium text-accent-ink disabled:opacity-40"
          >
            Añadir
          </button>
        </div>

        {tipo === 'tallas' && (
          <div className="flex gap-2">
            {GRUPOS_TALLA.map((g) => (
              <button
                key={g.valor}
                type="button"
                onClick={() => setGrupoNuevo(g.valor)}
                aria-pressed={grupoNuevo === g.valor}
                className={`tap rounded-full border px-4 text-label transition-colors ${
                  grupoNuevo === g.valor
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-line bg-surface'
                }`}
              >
                {g.etiqueta}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Lista ─────────────────────────────────────────────────── */}
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
        {visibles.map((entrada) => (
          <li key={entrada.id} className="flex items-center gap-2 px-4 py-2.5">
            {entrada.hex && (
              <span
                className="size-4 shrink-0 rounded-full border border-line"
                style={{ background: entrada.hex }}
                aria-hidden
              />
            )}

            {editando === entrada.id ? (
              <input
                autoFocus
                value={textoEdicion}
                onChange={(e) => setTextoEdicion(e.target.value)}
                onBlur={() => void renombrar(entrada.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void renombrar(entrada.id);
                  if (e.key === 'Escape') setEditando(null);
                }}
                aria-label={`Renombrar ${entrada.nombre}`}
                className="min-w-0 flex-1 rounded-[--radius-control] border border-accent bg-bg px-2 py-1.5 outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditando(entrada.id);
                  setTextoEdicion(entrada.nombre);
                }}
                className="min-w-0 flex-1 truncate py-1 text-left"
              >
                {entrada.emoji ? `${entrada.emoji} ` : ''}
                <span className={entrada.archivado ? 'text-muted line-through' : ''}>
                  {entrada.nombre}
                </span>
                {entrada.grupo && tipo === 'tallas' && (
                  <span className="ml-2 text-caption text-muted">{entrada.grupo}</span>
                )}
              </button>
            )}

            <span className="shrink-0 text-caption tabular-nums text-muted">
              {entrada.enUso > 0 ? `${entrada.enUso}` : ''}
            </span>

            {def.archivable && (
              <button
                type="button"
                onClick={() => void alternarArchivo(entrada)}
                disabled={ocupado}
                aria-label={entrada.archivado ? `Restaurar ${entrada.nombre}` : `Archivar ${entrada.nombre}`}
                className="tap shrink-0 px-2 text-label text-muted disabled:opacity-40"
              >
                {entrada.archivado ? '↩' : '📥'}
              </button>
            )}

            {puedeBorrar && entrada.enUso === 0 && (
              <button
                type="button"
                onClick={() => void borrar(entrada)}
                disabled={ocupado}
                aria-label={`Borrar ${entrada.nombre}`}
                className="tap shrink-0 px-2 text-label text-status-sold disabled:opacity-40"
              >
                ✕
              </button>
            )}
          </li>
        ))}

        {visibles.length === 0 && (
          <li className="px-4 py-6 text-center text-label text-muted">
            Todavía no hay ninguna {def.singular}.
          </li>
        )}
      </ul>

      <p className="mt-2 px-1 text-caption text-muted">
        Toca el nombre para cambiarlo. El número es cuántas prendas la usan.
      </p>

      {def.archivable && (
        <p className="mt-2 px-1 text-caption text-muted">
          Archivar deja de ofrecerla al subir prendas, pero las que ya la usan la conservan.
          {archivadas > 0 && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setVerArchivadas((v) => !v)}
                className="underline underline-offset-4"
              >
                {verArchivadas ? 'Ocultar' : `Ver ${archivadas} archivadas`}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
