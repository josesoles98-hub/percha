'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseMoneyToCents } from '@percha/core';

import { TIPOS_PRENDA } from '@/lib/data/agente';
import { firmarFotos, type Catalogos } from '@/lib/data/inventory';
import { actualizarPrenda, crearMarca } from '@/lib/data/mutations';
import { createClient } from '@/lib/supabase/client';

import { useToast, vibrar } from './Toast';

interface Pendiente {
  id: string;
  code: string;
  fotos: Array<{ position: number; url: string | null }>;
  priceCents: number;
  sizeId: string | null;
  brandId: string | null;
  /** Lo que la IA vio en la foto ("polera gris Nike logo…"). */
  aiDesc: string | null;
}

/** Prendas a las que les falta precio, talla o marca. */
const FALTA_ALGO = 'price_cents.eq.0,size_id.is.null,brand_id.is.null';
/** Las gorras no van aquí (la tienda es solo ropa): las reconoce la IA por la foto. */
const SIN_GORRAS = 'ai_desc.is.null,and(ai_desc.not.ilike.*gorra*,ai_desc.not.ilike.*jockey*)';

/**
 * Marcas que también son palabras comunes o estampados ("vintage", "classic",
 * "barcelona"): la IA las usa para describir, no porque haya visto la marca.
 */
const PALABRAS_COMUNES = new Set([
  'americano', 'vintage', 'classic', 'active', 'essential', 'box', 'loose', 'signature',
  'singular', 'republic', 'lino', 'arena', 'aura', 'canada', 'london', 'new york',
  'barcelona', 'chelsea', 'manchester', 'discovery', 'shark', 'marmol', 'disney',
  'indiana', 'iowa', 'arizona', 'augusta', 'nba', 'nfl', 'mlb x yankis', 'kiss', 'george',
]);

/** Marca que la IA leyó en la foto, si coincide con una de la tienda. */
function marcaSugerida(desc: string | null, marcas: Catalogos['brands']) {
  if (!desc) return null;
  const texto = ` ${desc.toLowerCase().replace(/[^a-z0-9áéíóúñ ]+/g, ' ')} `;
  return (
    [...marcas]
      .filter((m) => m.name.length >= 3 && !PALABRAS_COMUNES.has(m.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)
      .find((m) => texto.includes(` ${m.name.toLowerCase()} `)) ?? null
  );
}

const LOTE = 30;
const CLAVE_PRECIOS = 'percha-precios-recientes';
const CLAVE_MARCAS = 'percha-marcas-recientes';
const GRUPOS_ABIERTOS = ['ropa', 'pantalon'];

/**
 * Poner precio y talla a las prendas que entraron sin ellos.
 *
 * Una prenda a la vez: foto grande, botones de talla y el precio. Al guardar
 * pasa sola a la siguiente. Los últimos precios usados quedan como botones
 * para repetirlos de un toque (en cada tanda muchas prendas comparten precio).
 */
export function PendientesForm({
  storeId,
  simbolo,
  catalogos,
}: {
  storeId: string;
  simbolo: string;
  catalogos: Catalogos;
}) {
  const { mostrar } = useToast();
  const [cola, setCola] = useState<Pendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [hayMas, setHayMas] = useState(true);
  const [faltan, setFaltan] = useState<number | null>(null);
  const [hechas, setHechas] = useState(0);
  const [fotoVista, setFotoVista] = useState(0);
  const [sizeId, setSizeId] = useState<string | null>(null);
  const [precio, setPrecio] = useState('');
  const [preciosRecientes, setPreciosRecientes] = useState<number[]>([]);
  const [marca, setMarca] = useState('');
  const [marcasRecientes, setMarcasRecientes] = useState<string[]>([]);
  const [marcas, setMarcas] = useState(catalogos.brands);
  const [tipo, setTipo] = useState<string | null>(null);
  const [calzadoAbierto, setCalzadoAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ultima, setUltima] = useState<Pendiente | null>(null);
  const tipoRef = useRef<string | null>(null);
  const cargandoRef = useRef(false);
  const idsVistos = useRef<Set<string>>(new Set());
  const precioRef = useRef<HTMLInputElement>(null);
  const mostrarRef = useRef(mostrar);
  mostrarRef.current = mostrar;

  useEffect(() => {
    try {
      const guardados = JSON.parse(localStorage.getItem(CLAVE_PRECIOS) ?? '[]');
      if (Array.isArray(guardados)) setPreciosRecientes(guardados.filter((n) => typeof n === 'number'));
      const recientes = JSON.parse(localStorage.getItem(CLAVE_MARCAS) ?? '[]');
      if (Array.isArray(recientes)) setMarcasRecientes(recientes.filter((n) => typeof n === 'string'));
    } catch {
      /* sin precios recientes */
    }
  }, []);

  const cargarMas = useCallback(async () => {
    if (cargandoRef.current) return;
    cargandoRef.current = true;
    setCargando(true);
    const supabase = createClient();

    const tipoActual = tipoRef.current;
    // Las más nuevas primero: son las que los clientes están pidiendo.
    let consulta = supabase
      .from('items')
      .select('id, code, created_at, price_cents, size_id, brand_id, ai_desc, item_photos(storage_path, position)')
      .eq('store_id', storeId)
      .eq('status', 'available')
      .or(FALTA_ALGO)
      .or(SIN_GORRAS)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('code', { ascending: false })
      .limit(LOTE + idsVistos.current.size);
    let conteo = supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'available')
      .or(FALTA_ALGO)
      .or(SIN_GORRAS)
      .is('deleted_at', null);
    if (tipoActual) {
      consulta = consulta.eq('ai_tipo', tipoActual);
      conteo = conteo.eq('ai_tipo', tipoActual);
    }
    const [{ data, error }, { count }] = await Promise.all([consulta, conteo]);

    if (error) {
      mostrarRef.current(error.message);
      cargandoRef.current = false;
      setCargando(false);
      return;
    }

    setFaltan(count ?? null);

    const nuevas = (data ?? []).filter((fila) => !idsVistos.current.has(fila.id as string)).slice(0, LOTE);
    const rutas = nuevas.flatMap((fila) =>
      ((fila.item_photos as Array<{ storage_path: string }> | null) ?? []).map((f) => f.storage_path),
    );
    const urls = await firmarFotos(supabase, rutas);

    const pendientes: Pendiente[] = nuevas.map((fila) => {
      idsVistos.current.add(fila.id as string);
      const fotos = ((fila.item_photos as Array<{ storage_path: string; position: number }> | null) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((f) => ({ position: f.position, url: urls.get(f.storage_path) ?? null }));
      return {
        id: fila.id as string,
        code: fila.code as string,
        fotos,
        priceCents: (fila.price_cents as number) ?? 0,
        sizeId: (fila.size_id as string | null) ?? null,
        brandId: (fila.brand_id as string | null) ?? null,
        aiDesc: (fila.ai_desc as string | null) ?? null,
      };
    });

    // Si mientras cargaba se cambió el tipo, este lote ya no sirve.
    if (tipoRef.current !== tipoActual) {
      cargandoRef.current = false;
      return;
    }
    setCola((previa) => [...previa, ...pendientes]);
    setHayMas(nuevas.length === LOTE);
    cargandoRef.current = false;
    setCargando(false);
  }, [storeId]);

  useEffect(() => {
    void cargarMas();
  }, [cargarMas]);

  // Cuando quedan pocas en la cola, se trae el siguiente lote.
  useEffect(() => {
    if (cola.length < 6 && hayMas && !cargandoRef.current) void cargarMas();
  }, [cola.length, hayMas, cargarMas]);

  function cambiarTipo(nuevo: string | null) {
    tipoRef.current = nuevo;
    setTipo(nuevo);
    idsVistos.current = new Set();
    setCola([]);
    setHayMas(true);
    cargandoRef.current = false;
    void cargarMas();
  }

  const actual = cola[0] ?? null;
  const sugerida = actual && !actual.brandId ? marcaSugerida(actual.aiDesc, marcas) : null;

  // Cada prenda nueva: vuelve a la primera foto y trae lo que ya tenga
  // (talla, precio, marca; si no tiene marca, la que leyó la IA). Se ajusta
  // durante el render, como recomienda React, en vez de en un efecto.
  const [preparada, setPreparada] = useState<string | null>(null);
  if ((actual?.id ?? null) !== preparada) {
    setPreparada(actual?.id ?? null);
    setFotoVista(0);
    setSizeId(actual?.sizeId ?? null);
    setPrecio(actual?.priceCents ? String(actual.priceCents / 100) : '');
    setMarca(
      actual?.brandId
        ? (marcas.find((m) => m.id === actual.brandId)?.name ?? '')
        : (marcaSugerida(actual?.aiDesc ?? null, marcas)?.name ?? ''),
    );
  }

  // El cursor queda en el precio.
  useEffect(() => {
    // En la computadora el cursor queda en el precio; en el celular no, porque
    // el teclado taparía la foto y las tallas.
    if (actual && window.matchMedia('(pointer: fine)').matches) {
      precioRef.current?.focus({ preventScroll: true });
    }
  }, [actual?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const priceCents = parseMoneyToCents(precio);
  const puedeGuardar = actual !== null && priceCents !== null && priceCents > 0 && sizeId !== null && !guardando;

  async function guardar() {
    if (!puedeGuardar || !actual) return;
    const prenda = actual;
    const talla = sizeId!;
    const cents = priceCents!;
    const nombreMarca = marca.trim();

    // Optimista: pasa a la siguiente ya; si falla, vuelve.
    setCola((c) => c.slice(1));
    setUltima(prenda);
    setHechas((n) => n + 1);
    setFaltan((n) => (n === null ? n : Math.max(0, n - 1)));
    vibrar();

    const nuevos = [cents, ...preciosRecientes.filter((p) => p !== cents)].slice(0, 8);
    setPreciosRecientes(nuevos);
    try {
      localStorage.setItem(CLAVE_PRECIOS, JSON.stringify(nuevos));
    } catch {
      /* sin memoria de precios */
    }

    if (nombreMarca) {
      const marcasNuevas = [nombreMarca, ...marcasRecientes.filter((m) => m.toLowerCase() !== nombreMarca.toLowerCase())].slice(0, 8);
      setMarcasRecientes(marcasNuevas);
      try {
        localStorage.setItem(CLAVE_MARCAS, JSON.stringify(marcasNuevas));
      } catch {
        /* sin memoria de marcas */
      }
    }
    setGuardando(true);
    const supabase = createClient();
    let brandId: string | null = null;
    let error: string | null = null;
    if (nombreMarca) {
      const existente = marcas.find((m) => m.name.toLowerCase() === nombreMarca.toLowerCase());
      if (existente) brandId = existente.id;
      else {
        const nueva = await crearMarca(supabase, storeId, nombreMarca);
        if (nueva.data) {
          const creada = nueva.data;
          brandId = creada.id;
          setMarcas((lista) => [...lista, { id: creada.id, name: creada.name, useCount: 0 }]);
        } else error = nueva.error;
      }
    }
    if (!error) {
      ({ error } = await actualizarPrenda(supabase, prenda.id, {
        priceCents: cents,
        sizeId: talla,
        ...(nombreMarca ? { brandId } : {}),
      }));
    }
    setGuardando(false);

    if (error) {
      mostrar(`No se guardó ${prenda.code}: ${error}`);
      setCola((c) => [prenda, ...c]);
      setHechas((n) => Math.max(0, n - 1));
      setFaltan((n) => (n === null ? n : n + 1));
    }
  }

  async function deshacer() {
    if (!ultima) return;
    const prenda = ultima;
    setUltima(null);
    const { error } = await actualizarPrenda(createClient(), prenda.id, {
      priceCents: prenda.priceCents,
      sizeId: prenda.sizeId,
      brandId: prenda.brandId,
    });
    if (error) {
      mostrar(`No se pudo deshacer ${prenda.code}: ${error}`);
      return;
    }
    setCola((c) => [prenda, ...c]);
    setHechas((n) => Math.max(0, n - 1));
    setFaltan((n) => (n === null ? n : n + 1));
    mostrar(`${prenda.code} vuelve a pendientes`);
  }

  function saltar() {
    setCola((c) => (c.length > 1 ? [...c.slice(1), c[0]!] : c));
  }

  const tallasPorGrupo = new Map<string, Catalogos['sizes']>();
  for (const talla of catalogos.sizes) {
    const lista = tallasPorGrupo.get(talla.group) ?? [];
    lista.push(talla);
    tallasPorGrupo.set(talla.group, lista);
  }
  const gruposVisibles = [...tallasPorGrupo.entries()].filter(([g]) => g !== 'calzado');
  const calzado = tallasPorGrupo.get('calzado');

  function chipTalla(id: string, etiqueta: string) {
    const activa = sizeId === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setSizeId(activa ? null : id)}
        aria-pressed={activa}
        className={`tap min-w-12 rounded-full border px-4 py-2 text-label font-medium transition-colors ${
          activa ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-bg'
        }`}
      >
        {etiqueta}
      </button>
    );
  }

  const cabecera = (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 py-3 backdrop-blur">
      <Link href="/" className="tap text-label text-muted">
        ‹ Salir
      </Link>
      <p className="text-label font-semibold" role="status">
        {faltan === null ? 'Cargando…' : `Faltan ${faltan}`}
        {hechas > 0 && <span className="font-normal text-muted"> · hechas {hechas}</span>}
      </p>
      <button
        type="button"
        onClick={() => void deshacer()}
        disabled={!ultima}
        className="tap text-label text-accent disabled:opacity-30"
      >
        ↩ Deshacer
      </button>
    </header>
  );

  // Por tipo (lo que la IA vio en la foto): así se hacen seguidas todas las
  // poleras, que suelen compartir precio.
  const filtroTipo = (
    <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
      <button
        type="button"
        onClick={() => cambiarTipo(null)}
        className={`tap shrink-0 rounded-full border px-3 py-1.5 text-caption ${
          tipo === null ? 'border-accent bg-accent-soft font-medium' : 'border-line bg-bg'
        }`}
      >
        Todas
      </button>
      {TIPOS_PRENDA.map((t) => (
        <button
          key={t.tipo}
          type="button"
          onClick={() => cambiarTipo(tipo === t.tipo ? null : t.tipo)}
          className={`tap shrink-0 rounded-full border px-3 py-1.5 text-caption ${
            tipo === t.tipo ? 'border-accent bg-accent-soft font-medium' : 'border-line bg-bg'
          }`}
        >
          {t.emoji} {t.etiqueta}
        </button>
      ))}
    </div>
  );

  if (!actual) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-safe">
        {cabecera}
        {filtroTipo}
        <div className="py-20 text-center">
          {cargando ? (
            <p className="text-label text-muted">Cargando prendas…</p>
          ) : (
            <>
              <p className="text-title">No hay prendas pendientes 🎉</p>
              <p className="mt-2 text-label text-muted">
                {tipo ? 'Todas las de este tipo tienen precio, talla y marca.' : 'Todas tienen precio, talla y marca.'}
              </p>
              <Link
                href="/"
                className="tap mt-5 inline-flex items-center rounded-[--radius-control] bg-accent px-5 py-3 font-medium text-accent-ink"
              >
                Ver inventario
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const principal = actual.fotos[fotoVista]?.url ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-safe">
      {cabecera}
      {filtroTipo}
      <div className="mt-3 gap-6 md:grid md:grid-cols-2">
        <div>
          <div className="flex h-[42dvh] w-full items-center justify-center overflow-hidden rounded-[--radius-card] bg-line md:h-[78dvh]">
            {principal ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage
              <img src={principal} alt={`Foto ${fotoVista + 1} de ${actual.code}`} className="size-full object-contain" />
            ) : (
              <span className="text-label text-muted">Sin foto</span>
            )}
          </div>
          {actual.fotos.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {actual.fotos.map((foto, indice) => (
                <button
                  key={foto.position}
                  type="button"
                  onClick={() => setFotoVista(indice)}
                  aria-label={`Ver foto ${indice + 1}`}
                  className={`size-16 shrink-0 overflow-hidden rounded-[--radius-control] border-2 ${
                    indice === fotoVista ? 'border-accent' : 'border-transparent'
                  }`}
                >
                  {foto.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage
                    <img src={foto.url} alt="" className="size-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-4 md:mt-0">
          <p className="text-label text-muted">
            {actual.code} · {actual.fotos.length} {actual.fotos.length === 1 ? 'foto' : 'fotos'}
          </p>
          {actual.aiDesc && <p className="-mt-2 text-caption text-muted">🤖 {actual.aiDesc}</p>}

          <div className="space-y-2">
            <label htmlFor="marca" className="text-label font-medium">
              Marca <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input
              id="marca"
              list="marcas-tienda"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Escribe o elige"
              autoComplete="off"
              className="w-full rounded-[--radius-control] border border-line bg-surface px-3 py-3 text-label outline-none focus:border-accent"
            />
            <datalist id="marcas-tienda">
              {marcas.map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-1.5">
              {sugerida && (
                <button
                  type="button"
                  onClick={() => setMarca(sugerida.name)}
                  className="tap rounded-full border border-accent bg-accent-soft px-3 py-1 text-label"
                >
                  🤖 {sugerida.name}
                </button>
              )}
              {[...new Set([...marcasRecientes, ...marcas.slice().sort((a, b) => b.useCount - a.useCount).slice(0, 8).map((m) => m.name)])]
                .filter((n) => n !== sugerida?.name)
                .slice(0, 10)
                .map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMarca(marca === n ? '' : n)}
                    className={`tap rounded-full border px-3 py-1 text-label ${
                      marca === n ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-bg'
                    }`}
                  >
                    {n}
                  </button>
                ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-label font-medium">Talla</p>
            {gruposVisibles.map(([grupo, tallas]) => (
              <div key={grupo} className="flex flex-wrap items-center gap-1.5">
                {!GRUPOS_ABIERTOS.includes(grupo) && (
                  <span className="mr-1 text-caption capitalize text-muted">{grupo}</span>
                )}
                {tallas.map((t) => chipTalla(t.id, t.label))}
              </div>
            ))}
            {calzado && (
              <div>
                <button type="button" onClick={() => setCalzadoAbierto((v) => !v)} className="tap text-caption text-muted">
                  {calzadoAbierto ? '▾' : '▸'} Calzado
                </button>
                {calzadoAbierto && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {calzado.map((t) => chipTalla(t.id, t.label))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="precio" className="text-label font-medium">
              Precio
            </label>
            <div className="flex items-center gap-2 rounded-[--radius-control] border border-line bg-surface px-3 focus-within:border-accent">
              <span className="text-muted">{simbolo}</span>
              <input
                id="precio"
                ref={precioRef}
                inputMode="decimal"
                placeholder="0"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void guardar();
                }}
                className="w-full bg-transparent py-3 text-lg font-semibold tabular-nums outline-none"
              />
            </div>
            {preciosRecientes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {preciosRecientes.map((cents) => (
                  <button
                    key={cents}
                    type="button"
                    onClick={() => setPrecio(String(cents / 100))}
                    className="tap rounded-full border border-line bg-bg px-3 text-label tabular-nums"
                  >
                    {simbolo}
                    {cents / 100}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void guardar()}
            disabled={!puedeGuardar}
            className="tap w-full rounded-[--radius-control] bg-accent px-4 py-4 text-lg font-semibold text-accent-ink disabled:opacity-40"
          >
            Guardar y siguiente
          </button>
          <button type="button" onClick={saltar} className="tap w-full text-label text-muted">
            Saltar esta prenda
          </button>
        </div>
      </div>
    </div>
  );
}
