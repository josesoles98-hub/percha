'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { parseMoneyToCents } from '@percha/core';

import { usePhotoUploads } from '@/hooks/usePhotoUploads';
import type { Catalogos } from '@/lib/data/inventory';
import { crearMarca, crearPrenda } from '@/lib/data/mutations';
import { idUnico } from '@/lib/id';
import { createClient } from '@/lib/supabase/client';

import { useToast, vibrar } from './Toast';

interface Grupo {
  id: string;
  archivos: File[];
}

/**
 * Carga rápida por lotes.
 *
 * Cuando llega mercadería, subir prenda por prenda desde /nueva significa
 * repetir el mismo formulario completo veinte veces seguidas. Acá se
 * eligen todas las fotos juntas y la pantalla las reparte en grupos de 2 o
 * 3 (lo que elijas antes de elegir las fotos); cada grupo es una tarjeta
 * con solo marca, talla y precio — lo mínimo para vender — y se guarda
 * sola en cuanto está lista, sin esperar a las demás.
 *
 * Si en la misma mercadería hay prendas con 2 fotos y otras con 3,
 * conviene subirlas en dos tandas separadas (una con "2 fotos" elegido,
 * otra con "3").
 */
export function CargaRapidaForm({
  storeId,
  simbolo,
  catalogos,
}: {
  storeId: string;
  simbolo: string;
  catalogos: Catalogos;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [porGrupo, setPorGrupo] = useState<2 | 3>(3);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());

  function elegirFotos(archivos: FileList) {
    const lista = Array.from(archivos);
    const nuevosGrupos: Grupo[] = [];
    for (let i = 0; i < lista.length; i += porGrupo) {
      nuevosGrupos.push({ id: idUnico(), archivos: lista.slice(i, i + porGrupo) });
    }
    setGrupos((previos) => [...previos, ...nuevosGrupos]);
  }

  function marcarGuardada(id: string) {
    setGuardadas((previas) => new Set(previas).add(id));
  }

  const pendientes = grupos.filter((g) => !guardadas.has(g.id));

  if (grupos.length === 0) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 pb-safe pt-safe">
        <header className="flex items-center justify-between">
          <Link href="/" className="tap text-label text-muted">
            ‹ Atrás
          </Link>
          <h1 className="text-label font-semibold">Carga rápida</h1>
          <span className="w-12" />
        </header>

        <div className="space-y-2 text-center">
          <p className="text-title">Elige todas las fotos de una vez</p>
          <p className="text-label text-muted">
            La pantalla las reparte solas por prenda. Después solo pones marca, talla y precio a
            cada una.
          </p>
        </div>

        <div>
          <span className="mb-2 block text-center text-label font-medium">
            ¿Cuántas fotos por prenda?
          </span>
          <div className="flex justify-center gap-2">
            {([2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPorGrupo(n)}
                aria-pressed={porGrupo === n}
                className={`tap rounded-full border px-6 text-label font-medium transition-colors ${
                  porGrupo === n ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                }`}
              >
                {n} fotos
              </button>
            ))}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) elegirFotos(e.target.files);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-4 text-lg font-semibold text-accent-ink"
        >
          📷 Elegir fotos
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-safe">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 py-3 backdrop-blur">
        <Link href="/" className="tap text-label text-muted">
          Terminar
        </Link>
        <p className="text-label font-semibold">
          {guardadas.size} de {grupos.length} guardadas
        </p>
        <button type="button" onClick={() => inputRef.current?.click()} className="tap text-label text-accent">
          + Fotos
        </button>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) elegirFotos(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="mt-4 space-y-4">
        {pendientes.map((grupo) => (
          <TarjetaCargaRapida
            key={grupo.id}
            grupo={grupo}
            storeId={storeId}
            simbolo={simbolo}
            catalogos={catalogos}
            onGuardada={() => marcarGuardada(grupo.id)}
          />
        ))}
      </div>

      {pendientes.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-title">Todas guardadas 🎉</p>
          <Link
            href="/"
            className="tap mt-4 inline-flex items-center rounded-[--radius-control] bg-accent px-5 py-3 font-medium text-accent-ink"
          >
            Ver inventario
          </Link>
        </div>
      )}
    </div>
  );
}

const TALLAS_SIEMPRE_VISIBLES = ['ropa', 'pantalon'];

function TarjetaCargaRapida({
  grupo,
  storeId,
  simbolo,
  catalogos,
  onGuardada,
}: {
  grupo: Grupo;
  storeId: string;
  simbolo: string;
  catalogos: Catalogos;
  onGuardada: () => void;
}) {
  const { mostrar } = useToast();
  const disparado = useRef(false);
  const fotos = usePhotoUploads(storeId, grupo.id, []);

  // Las fotos de este grupo ya están elegidas (vienen del selector de la
  // pantalla anterior): se suben apenas aparece la tarjeta, una sola vez.
  useEffect(() => {
    if (disparado.current) return;
    disparado.current = true;
    fotos.agregar(grupo.archivos);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr una vez, ver el guard de arriba
  }, []);

  const [sizeId, setSizeId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [marcaNueva, setMarcaNueva] = useState('');
  const [precio, setPrecio] = useState('');
  const [calzadoAbierto, setCalzadoAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const tallasPorGrupo = new Map<string, Catalogos['sizes']>();
  for (const talla of catalogos.sizes) {
    const lista = tallasPorGrupo.get(talla.group) ?? [];
    lista.push(talla);
    tallasPorGrupo.set(talla.group, lista);
  }
  const marcasFrecuentes = catalogos.brands.slice(0, 6);

  const priceCents = parseMoneyToCents(precio);
  const puedeGuardar = priceCents !== null && sizeId !== null && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);

    const supabase = createClient();
    let brandIdFinal = brandId;
    if (!brandIdFinal && marcaNueva.trim()) {
      const { data } = await crearMarca(supabase, storeId, marcaNueva);
      brandIdFinal = data?.id ?? null;
    }

    const { data, error } = await crearPrenda(supabase, {
      id: grupo.id,
      storeId,
      priceCents: priceCents!,
      sizeId: sizeId!,
      brandId: brandIdFinal,
      categoryId: null,
      colorId: null,
      gender: null,
      name: null,
      description: null,
      costCents: null,
      status: 'available',
      fotos: fotos.listas.map((f) => ({
        path: f.path as string,
        position: f.position,
        width: f.width,
        height: f.height,
        bytes: f.bytes,
      })),
    });

    setGuardando(false);

    if (!data) {
      mostrar(error ?? 'No se pudo guardar');
      return;
    }

    vibrar();
    mostrar(`${data.code} guardada`);
    onGuardada();
  }

  return (
    <div className="rounded-[--radius-card] border border-line bg-surface p-3">
      <div className="flex gap-2">
        {grupo.archivos.map((_, indice) => {
          const foto = fotos.fotos.find((f) => f.position === indice + 1);
          return (
            <div
              key={indice}
              className="relative aspect-3/4 flex-1 overflow-hidden rounded-[--radius-control] bg-line"
            >
              {foto?.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- objectURL local
                <img src={foto.previewUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-caption text-muted">
                  {foto?.estado === 'error' ? '✕' : '…'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {marcasFrecuentes.map((marca) => {
          const activa = brandId === marca.id;
          return (
            <button
              key={marca.id}
              type="button"
              onClick={() => {
                setBrandId(activa ? null : marca.id);
                setMarcaNueva('');
              }}
              aria-pressed={activa}
              className={`tap rounded-full border px-3 text-caption transition-colors ${
                activa ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-bg'
              }`}
            >
              {marca.name}
            </button>
          );
        })}
      </div>
      <input
        placeholder="O escribe la marca"
        value={marcaNueva}
        onChange={(e) => {
          setMarcaNueva(e.target.value);
          if (e.target.value) setBrandId(null);
        }}
        className="tap mt-1.5 w-full rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label outline-none focus:border-accent"
      />

      <div className="mt-3 space-y-1.5">
        {[...tallasPorGrupo.entries()]
          .filter(([grupoTalla]) => TALLAS_SIEMPRE_VISIBLES.includes(grupoTalla))
          .map(([, tallas]) => (
            <div key={tallas[0]?.id} className="flex flex-wrap gap-1.5">
              {tallas.map((talla) => {
                const activa = sizeId === talla.id;
                return (
                  <button
                    key={talla.id}
                    type="button"
                    onClick={() => setSizeId(activa ? null : talla.id)}
                    aria-pressed={activa}
                    className={`tap min-w-11 rounded-full border px-3 text-label font-medium transition-colors ${
                      activa ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-bg'
                    }`}
                  >
                    {talla.label}
                  </button>
                );
              })}
            </div>
          ))}

        {tallasPorGrupo.has('calzado') && (
          <div>
            <button
              type="button"
              onClick={() => setCalzadoAbierto((v) => !v)}
              className="tap text-caption text-muted"
            >
              {calzadoAbierto ? '▾' : '▸'} Calzado
            </button>
            {calzadoAbierto && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {tallasPorGrupo.get('calzado')!.map((talla) => {
                  const activa = sizeId === talla.id;
                  return (
                    <button
                      key={talla.id}
                      type="button"
                      onClick={() => setSizeId(activa ? null : talla.id)}
                      aria-pressed={activa}
                      className={`tap min-w-11 rounded-full border px-3 text-label font-medium transition-colors ${
                        activa ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-bg'
                      }`}
                    >
                      {talla.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-[--radius-control] border border-line bg-bg px-3 focus-within:border-accent">
        <span className="text-muted">{simbolo}</span>
        <input
          inputMode="decimal"
          placeholder="Precio"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          className="w-full bg-transparent py-2.5 text-label font-semibold tabular-nums outline-none"
        />
      </div>

      <button
        type="button"
        onClick={() => void guardar()}
        disabled={!puedeGuardar}
        className="tap mt-3 w-full rounded-[--radius-control] bg-accent px-4 py-2.5 text-label font-medium text-accent-ink disabled:opacity-40"
      >
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}
