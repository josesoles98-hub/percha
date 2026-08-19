'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GENDER_META, ITEM_GENDERS, parseMoneyToCents, type ItemGender } from '@percha/core';

import { usePhotoUploads, type FotoExistente } from '@/hooks/usePhotoUploads';
import type { Catalogos } from '@/lib/data/inventory';
import { actualizarPrenda, crearMarca, crearPrenda, sincronizarFotos } from '@/lib/data/mutations';
import { idUnico } from '@/lib/id';
import { createClient } from '@/lib/supabase/client';
import { dispararGeneracionTryon } from '@/lib/tryon/models';

import { PhotoPicker } from './PhotoPicker';
import { useToast, vibrar } from './Toast';

const BORRADOR_KEY = 'percha:borrador-prenda';

interface Campos {
  precio: string;
  sizeId: string | null;
  brandId: string | null;
  categoryId: string | null;
  colorId: string | null;
  gender: ItemGender | null;
  nombre: string;
  descripcion: string;
}

const CAMPOS_VACIOS: Campos = {
  precio: '',
  sizeId: null,
  brandId: null,
  categoryId: null,
  colorId: null,
  gender: null,
  nombre: '',
  descripcion: '',
};

export interface PrendaFormProps {
  storeId: string;
  simbolo: string;
  catalogos: Catalogos;
  /**
   * 'crear': alta rápida con borrador autoguardado. Si además llega
   * `inicial`, es un duplicado precargado (sin borrador).
   * 'editar': modifica una prenda existente; requiere itemId y codigo.
   */
  modo?: 'crear' | 'editar';
  inicial?: Partial<Campos>;
  itemId?: string;
  codigo?: string;
  fotosIniciales?: FotoExistente[];
}

/**
 * Formulario de prenda: alta rápida, duplicado y edición.
 *
 * Objetivo del modo crear: 20 segundos. Cada decisión de esta pantalla se
 * justifica contra ese número:
 *  · Solo foto, talla y precio son obligatorios.
 *  · Las fotos se suben en segundo plano mientras se escribe el precio.
 *  · La talla son chips de un toque, no un desplegable (la rueda de iOS es lenta).
 *  · El precio usa teclado numérico y el símbolo ya está puesto.
 *  · "Más detalles" está cerrado: el 80 % de las prendas no lo necesita.
 */
export function PrendaForm({
  storeId,
  simbolo,
  catalogos,
  modo = 'crear',
  inicial,
  itemId: itemIdProp,
  codigo,
  fotosIniciales = [],
}: PrendaFormProps) {
  const router = useRouter();
  const { mostrar } = useToast();
  const editando = modo === 'editar';

  // El id se genera aquí porque la ruta de las fotos en Storage lo incluye:
  // así la foto ya está en su sitio definitivo antes de guardar la prenda.
  const [itemId, setItemId] = useState(() => itemIdProp ?? idUnico());

  const [campos, setCampos] = useState<Campos>({ ...CAMPOS_VACIOS, ...inicial });
  const [detallesAbiertos, setDetallesAbiertos] = useState(
    // Al editar o duplicar conviene ver todos los campos desde el inicio.
    editando || Boolean(inicial),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marcaNueva, setMarcaNueva] = useState('');
  // Calzado empieza cerrado: la tienda tiene poco stock de zapatillas y
  // ver sus 11 tallas cada vez que se sube una polera es puro ruido. Si al
  // editar o duplicar la prenda ya es un calzado, arranca abierto.
  const [calzadoAbierto, setCalzadoAbierto] = useState(() => {
    if (!inicial?.sizeId) return false;
    return catalogos.sizes.find((t) => t.id === inicial.sizeId)?.group === 'calzado';
  });

  const fotos = usePhotoUploads(storeId, itemId, fotosIniciales);

  // ── Borrador autoguardado (solo alta limpia) ─────────────────────────
  // Si el usuario cierra la app a media carga, al volver no ha perdido nada.
  // Al editar o duplicar no aplica: los datos ya viven en otra parte.
  const usaBorrador = !editando && !inicial;

  useEffect(() => {
    if (!usaBorrador) return;
    try {
      const guardado = localStorage.getItem(BORRADOR_KEY);
      // Rehidratar desde localStorage sí es sincronizar con un sistema
      // externo, pero tiene que ocurrir DESPUÉS de la hidratación: leerlo en
      // el inicializador del useState rompería el emparejamiento con el HTML
      // que renderizó el servidor, que no tiene acceso a localStorage.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ver arriba
      if (guardado) setCampos({ ...CAMPOS_VACIOS, ...JSON.parse(guardado) });
    } catch {
      // Un borrador corrupto no debe impedir subir una prenda.
    }
  }, [usaBorrador]);

  useEffect(() => {
    if (!usaBorrador) return;
    const t = setTimeout(() => {
      const vacio = JSON.stringify(campos) === JSON.stringify(CAMPOS_VACIOS);
      if (vacio) localStorage.removeItem(BORRADOR_KEY);
      else localStorage.setItem(BORRADOR_KEY, JSON.stringify(campos));
    }, 500);
    return () => clearTimeout(t);
  }, [campos, usaBorrador]);

  const set = useCallback(<K extends keyof Campos>(clave: K, valor: Campos[K]) => {
    setCampos((previos) => ({ ...previos, [clave]: valor }));
  }, []);

  const priceCents = useMemo(() => parseMoneyToCents(campos.precio), [campos.precio]);
  const puedeGuardar = priceCents !== null && campos.sizeId !== null && !guardando;

  const tallasPorGrupo = useMemo(() => {
    const grupos = new Map<string, Catalogos['sizes']>();
    for (const talla of catalogos.sizes) {
      const lista = grupos.get(talla.group) ?? [];
      lista.push(talla);
      grupos.set(talla.group, lista);
    }
    return grupos;
  }, [catalogos.sizes]);

  const marcasFrecuentes = catalogos.brands.slice(0, 6);

  async function resolverMarca(supabase: ReturnType<typeof createClient>) {
    if (campos.brandId || !marcaNueva.trim()) return campos.brandId;
    const { data } = await crearMarca(supabase, storeId, marcaNueva);
    return data?.id ?? null;
  }

  const fotosListas = () =>
    fotos.listas.map((f) => ({
      path: f.path as string,
      position: f.position,
      width: f.width,
      height: f.height,
      bytes: f.bytes,
    }));

  async function guardarEdicion() {
    if (priceCents === null || !campos.sizeId || !itemIdProp || !codigo) return;

    setGuardando(true);
    setError(null);

    const supabase = createClient();
    const brandId = await resolverMarca(supabase);

    const { error: errorCampos } = await actualizarPrenda(supabase, itemIdProp, {
      priceCents,
      sizeId: campos.sizeId,
      brandId,
      categoryId: campos.categoryId,
      colorId: campos.colorId,
      gender: campos.gender,
      name: campos.nombre.trim() || null,
      description: campos.descripcion.trim() || null,
    });

    if (errorCampos) {
      setError(errorCampos);
      setGuardando(false);
      return;
    }

    const { error: errorFotos } = await sincronizarFotos(
      supabase,
      itemIdProp,
      storeId,
      fotosListas(),
    );

    vibrar();
    mostrar(errorFotos ? `Guardada, pero una foto falló: ${errorFotos}` : `${codigo} actualizada`);
    router.push(`/prenda/${codigo}`);
    router.refresh();
  }

  async function guardar(despues: 'ficha' | 'compartir' | 'seguir') {
    if (editando) return guardarEdicion();
    if (priceCents === null || !campos.sizeId) return;

    setGuardando(true);
    setError(null);

    const supabase = createClient();
    const brandId = await resolverMarca(supabase);

    const { data, error: errorAlta } = await crearPrenda(supabase, {
      id: itemId,
      storeId,
      priceCents,
      sizeId: campos.sizeId,
      brandId,
      categoryId: campos.categoryId,
      colorId: campos.colorId,
      gender: campos.gender,
      name: campos.nombre.trim() || null,
      description: campos.descripcion.trim() || null,
      costCents: null,
      status: 'available',
      fotos: fotosListas(),
    });

    if (!data) {
      setError(errorAlta ?? 'No se pudo guardar');
      setGuardando(false);
      return;
    }

    dispararGeneracionTryon(supabase, itemId);

    if (usaBorrador) localStorage.removeItem(BORRADOR_KEY);
    vibrar();

    if (errorAlta) mostrar(errorAlta);
    else mostrar(`${data.code} guardada`);

    if (despues === 'seguir') {
      // Conserva marca, categoría, talla y género: cargar un fardo de 20
      // prendas parecidas pasa a ser 20 × (foto + precio) en lugar de 20
      // formularios completos.
      setItemId(idUnico());
      setCampos((previos) => ({
        ...CAMPOS_VACIOS,
        sizeId: previos.sizeId,
        brandId: previos.brandId,
        categoryId: previos.categoryId,
        gender: previos.gender,
      }));
      for (const foto of fotos.fotos) fotos.quitar(foto.position);
      setGuardando(false);
      router.refresh();
      return;
    }

    router.push(
      despues === 'compartir' ? `/prenda/${data.code}?compartir=1` : `/prenda/${data.code}`,
    );
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 pt-safe backdrop-blur">
        <button type="button" onClick={() => router.back()} className="tap text-label text-muted">
          Cancelar
        </button>
        <h1 className="text-label font-semibold">{editando ? 'Editar prenda' : 'Nueva prenda'}</h1>
        <button
          type="button"
          onClick={() => void guardar('ficha')}
          disabled={!puedeGuardar}
          className="tap text-label font-semibold disabled:opacity-40"
        >
          Guardar
        </button>
      </header>

      <div className="flex-1 space-y-7 px-4 py-4">
        {!editando && !inicial && (
          <Link href="/carga-rapida" className="tap -mt-2 block text-caption text-muted underline underline-offset-4">
            ¿Subiendo varias prendas? Prueba la carga rápida
          </Link>
        )}

        <PhotoPicker
          fotos={fotos.fotos}
          onAgregar={fotos.agregar}
          onQuitar={fotos.quitar}
          onReintentar={fotos.reintentar}
        />

        {fotos.subiendo && (
          <p className="-mt-5 text-caption text-muted">
            Subiendo fotos… puedes seguir llenando, no hace falta esperar.
          </p>
        )}

        {/* ── TALLA ─────────────────────────────────────────────────── */}
        <fieldset>
          <legend className="mb-2 text-label font-medium">Talla</legend>
          {[...tallasPorGrupo.entries()]
            .filter(([grupo]) => grupo !== 'calzado')
            .map(([grupo, tallas]) => (
              <div key={grupo} className="mb-2">
                {tallasPorGrupo.size > 1 && (
                  <p className="mb-1.5 text-caption capitalize text-muted">{grupo}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {tallas.map((talla) => {
                    const activa = campos.sizeId === talla.id;
                    return (
                      <button
                        key={talla.id}
                        type="button"
                        onClick={() => set('sizeId', activa ? null : talla.id)}
                        aria-pressed={activa}
                        className={`tap min-w-14 rounded-full border px-4 text-label font-medium transition-colors ${
                          activa
                            ? 'border-accent bg-accent text-accent-ink'
                            : 'border-line bg-surface'
                        }`}
                      >
                        {talla.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

          {tallasPorGrupo.has('calzado') && (
            <div>
              <button
                type="button"
                onClick={() => setCalzadoAbierto((v) => !v)}
                aria-expanded={calzadoAbierto}
                className="tap mb-1.5 flex items-center gap-1 text-caption text-muted"
              >
                <span aria-hidden>{calzadoAbierto ? '▾' : '▸'}</span> Calzado
              </button>
              {calzadoAbierto && (
                <div className="flex flex-wrap gap-2">
                  {tallasPorGrupo.get('calzado')!.map((talla) => {
                    const activa = campos.sizeId === talla.id;
                    return (
                      <button
                        key={talla.id}
                        type="button"
                        onClick={() => set('sizeId', activa ? null : talla.id)}
                        aria-pressed={activa}
                        className={`tap min-w-14 rounded-full border px-4 text-label font-medium transition-colors ${
                          activa
                            ? 'border-accent bg-accent text-accent-ink'
                            : 'border-line bg-surface'
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
        </fieldset>

        {/* ── MARCA ─────────────────────────────────────────────────── */}
        <div>
          <span className="mb-2 block text-label font-medium">Marca</span>
          <div className="mb-2 flex flex-wrap gap-2">
            {marcasFrecuentes.map((marca) => {
              const activa = campos.brandId === marca.id;
              return (
                <button
                  key={marca.id}
                  type="button"
                  onClick={() => {
                    set('brandId', activa ? null : marca.id);
                    setMarcaNueva('');
                  }}
                  aria-pressed={activa}
                  className={`tap rounded-full border px-4 text-label transition-colors ${
                    activa ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                  }`}
                >
                  {marca.name}
                </button>
              );
            })}
          </div>
          <input
            placeholder="O escribe una marca nueva"
            value={marcaNueva}
            onChange={(e) => {
              setMarcaNueva(e.target.value);
              if (e.target.value) set('brandId', null);
            }}
            className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-2.5 outline-none focus:border-accent"
          />
        </div>

        {/* ── PRECIO ────────────────────────────────────────────────── */}
        <div>
          <label htmlFor="precio" className="mb-2 block text-label font-medium">
            Precio
          </label>
          <div className="flex items-center gap-2 rounded-[--radius-control] border border-line bg-surface px-4 focus-within:border-accent">
            <span className="text-title text-muted">{simbolo}</span>
            <input
              id="precio"
              // decimal, no numeric: así el teclado del iPhone trae el punto
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={campos.precio}
              onChange={(e) => set('precio', e.target.value)}
              className="w-full bg-transparent py-3 text-[1.75rem] font-semibold tabular-nums outline-none"
            />
          </div>
        </div>

        {/* ── MÁS DETALLES ──────────────────────────────────────────── */}
        <div>
          <button
            type="button"
            onClick={() => setDetallesAbiertos((v) => !v)}
            aria-expanded={detallesAbiertos}
            className="tap flex w-full items-center gap-2 text-label text-muted"
          >
            <span aria-hidden>{detallesAbiertos ? '▾' : '▸'}</span> Más detalles
          </button>

          {detallesAbiertos && (
            <div className="mt-4 space-y-5">
              <div>
                <span className="mb-2 block text-label font-medium">Categoría</span>
                <div className="flex flex-wrap gap-2">
                  {catalogos.categories.map((cat) => {
                    const activa = campos.categoryId === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => set('categoryId', activa ? null : cat.id)}
                        aria-pressed={activa}
                        className={`tap rounded-full border px-4 text-label transition-colors ${
                          activa ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                        }`}
                      >
                        {cat.emoji} {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-label font-medium">Para quién</span>
                <div className="flex flex-wrap gap-2">
                  {ITEM_GENDERS.map((genero) => {
                    const activo = campos.gender === genero;
                    return (
                      <button
                        key={genero}
                        type="button"
                        onClick={() => set('gender', activo ? null : genero)}
                        aria-pressed={activo}
                        className={`tap rounded-full border px-4 text-label transition-colors ${
                          activo ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                        }`}
                      >
                        {GENDER_META[genero].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-label font-medium">Color</span>
                <div className="flex flex-wrap gap-2">
                  {catalogos.colors.map((color) => {
                    const activa = campos.colorId === color.id;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => set('colorId', activa ? null : color.id)}
                        aria-pressed={activa}
                        className={`tap flex items-center gap-2 rounded-full border px-3 text-label transition-colors ${
                          activa ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                        }`}
                      >
                        <span
                          className="size-3 rounded-full border border-line"
                          style={{ background: color.hex ?? 'transparent' }}
                          aria-hidden
                        />
                        {color.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="nombre" className="mb-2 block text-label font-medium">
                  Nombre
                </label>
                <input
                  id="nombre"
                  maxLength={120}
                  placeholder="Casaca cortavientos"
                  value={campos.nombre}
                  onChange={(e) => set('nombre', e.target.value)}
                  className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-2.5 outline-none focus:border-accent"
                />
              </div>

              <div>
                <label htmlFor="descripcion" className="mb-2 block text-label font-medium">
                  Descripción
                </label>
                <textarea
                  id="descripcion"
                  rows={3}
                  maxLength={1000}
                  placeholder="Estado, detalles, medidas…"
                  value={campos.descripcion}
                  onChange={(e) => set('descripcion', e.target.value)}
                  className="w-full rounded-[--radius-control] border border-line bg-surface px-4 py-2.5 outline-none focus:border-accent"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-label text-status-sold">
            {error}
          </p>
        )}
      </div>

      {/* ── ACCIONES FIJAS ───────────────────────────────────────────── */}
      <footer className="sticky bottom-0 space-y-2 border-t border-line bg-bg/95 px-4 py-3 pb-safe backdrop-blur">
        {editando ? (
          <button
            type="button"
            onClick={() => void guardar('ficha')}
            disabled={!puedeGuardar}
            className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void guardar('ficha')}
                disabled={!puedeGuardar}
                className="tap flex-1 rounded-[--radius-control] border border-line bg-surface px-4 py-3 font-medium disabled:opacity-40"
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => void guardar('compartir')}
                disabled={!puedeGuardar}
                className="tap flex-2 rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
              >
                Guardar y compartir
              </button>
            </div>
            <button
              type="button"
              onClick={() => void guardar('seguir')}
              disabled={!puedeGuardar}
              className="tap w-full text-caption text-muted disabled:opacity-40"
            >
              Guardar y seguir cargando
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
