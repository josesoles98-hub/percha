'use client';

import { useMemo, useState } from 'react';

import { linkLaQuiero, type Catalogo, type PrendaCatalogo } from '@/lib/catalogo';

const POR_PAGINA = 40;

const GENEROS: Array<{ id: 'dama' | 'varon'; etiqueta: string }> = [
  { id: 'dama', etiqueta: 'Mujer' },
  { id: 'varon', etiqueta: 'Hombre' },
];

// Orden natural de tallas: letras de menor a mayor y luego números.
const ORDEN_LETRAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
function ordenTalla(t: string) {
  const i = ORDEN_LETRAS.indexOf(t.toUpperCase());
  if (i >= 0) return i;
  const n = parseFloat(t);
  return Number.isNaN(n) ? 999 : 100 + n;
}

/**
 * Catálogo para clientes: todas las prendas disponibles, con filtros, y un
 * botón que abre WhatsApp con el código de la prenda ya escrito (así el
 * agente sabe exactamente cuál quieren).
 */
export function CatalogoCliente({ catalogo }: { catalogo: Catalogo }) {
  const { tienda, prendas } = catalogo;

  const [talla, setTalla] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [genero, setGenero] = useState<'dama' | 'varon' | null>(null);
  const [marca, setMarca] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<'nuevas' | 'precio'>('nuevas');
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [abierta, setAbierta] = useState<PrendaCatalogo | null>(null);

  const tallas = useMemo(
    () =>
      [...new Set(prendas.map((p) => p.talla).filter((t): t is string => !!t))].sort(
        (a, b) => ordenTalla(a) - ordenTalla(b),
      ),
    [prendas],
  );
  const categorias = useMemo(() => {
    const vistas = new Map<string, string | null>();
    for (const p of prendas) if (p.categoria && !vistas.has(p.categoria)) vistas.set(p.categoria, p.emoji);
    return [...vistas.entries()];
  }, [prendas]);
  const marcas = useMemo(
    () =>
      [...new Set(prendas.map((p) => p.marca).filter((m): m is string => !!m))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    [prendas],
  );
  const hayGeneros = prendas.some((p) => p.genero === 'dama' || p.genero === 'varon');

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = prendas.filter(
      (p) =>
        (!talla || p.talla === talla) &&
        (!categoria || p.categoria === categoria) &&
        (!genero || p.genero === genero || p.genero === 'unisex') &&
        (!marca || p.marca === marca) &&
        (!q ||
          p.codigo.toLowerCase().includes(q) ||
          (p.marca ?? '').toLowerCase().includes(q) ||
          (p.nombre ?? '').toLowerCase().includes(q)),
    );
    return orden === 'precio' ? [...lista].sort((a, b) => a.precio - b.precio) : lista;
  }, [prendas, talla, categoria, genero, marca, busqueda, orden]);

  const hayFiltros = Boolean(talla || categoria || genero || marca || busqueda);

  function limpiar() {
    setTalla(null);
    setCategoria(null);
    setGenero(null);
    setMarca('');
    setBusqueda('');
    setVisibles(POR_PAGINA);
  }

  // Cambiar un filtro vuelve a la primera página.
  function conReinicio<T>(fn: (v: T) => void) {
    return (v: T) => {
      fn(v);
      setVisibles(POR_PAGINA);
    };
  }

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line bg-surface px-4 pt-safe">
        <div className="mx-auto flex max-w-5xl items-center gap-3 py-4">
          {tienda.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tienda.logo} alt="" className="size-12 rounded-full object-cover" />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-title">{tienda.nombre}</h1>
            <p className="text-caption text-muted">
              {prendas.length} prendas disponibles · cada una es única
            </p>
          </div>
        </div>
      </header>

      {/* Filtros (no fijos: en el celular taparían media pantalla al bajar) */}
      <div className="border-b border-line bg-bg px-4 py-3">
        <div className="mx-auto max-w-5xl space-y-2.5">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => conReinicio(setBusqueda)(e.target.value)}
            placeholder="Buscar marca o código…"
            className="w-full rounded-[--radius-control] border border-line bg-surface px-3 py-2.5 text-label outline-none focus:border-accent"
          />

          {categorias.length > 1 && (
            <Fila>
              {categorias.map(([nombre, emoji]) => (
                <Chip
                  key={nombre}
                  activo={categoria === nombre}
                  onClick={() => conReinicio(setCategoria)(categoria === nombre ? null : nombre)}
                >
                  {emoji ? `${emoji} ` : ''}
                  {nombre}
                </Chip>
              ))}
            </Fila>
          )}

          {tallas.length > 1 && (
            <Fila>
              <span className="shrink-0 self-center text-caption text-muted">Talla</span>
              {tallas.map((t) => (
                <Chip key={t} activo={talla === t} onClick={() => conReinicio(setTalla)(talla === t ? null : t)}>
                  {t}
                </Chip>
              ))}
            </Fila>
          )}

          <Fila>
            {hayGeneros &&
              GENEROS.map((g) => (
                <Chip
                  key={g.id}
                  activo={genero === g.id}
                  onClick={() => conReinicio(setGenero)(genero === g.id ? null : g.id)}
                >
                  {g.etiqueta}
                </Chip>
              ))}
            {marcas.length > 1 && (
              <select
                value={marca}
                onChange={(e) => conReinicio(setMarca)(e.target.value)}
                aria-label="Marca"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-label ${
                  marca ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                }`}
              >
                <option value="">Todas las marcas</option>
                {marcas.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value as 'nuevas' | 'precio')}
              aria-label="Ordenar"
              className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-label"
            >
              <option value="nuevas">Más nuevas</option>
              <option value="precio">Menor precio</option>
            </select>
          </Fila>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-4">
        <div className="mb-3 flex items-center justify-between text-caption text-muted">
          <span>
            {filtradas.length} {filtradas.length === 1 ? 'prenda' : 'prendas'}
          </span>
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="tap text-accent underline">
              Quitar filtros
            </button>
          )}
        </div>

        {filtradas.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-title">No hay prendas así ahora</p>
            <p className="mt-1 text-muted">Prueba con otra talla o escríbenos: siempre llega ropa nueva ✨</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtradas.slice(0, visibles).map((p) => (
              <Tarjeta
                key={p.codigo}
                prenda={p}
                simbolo={tienda.simbolo}
                whatsapp={tienda.whatsapp}
                onVer={() => setAbierta(p)}
              />
            ))}
          </ul>
        )}

        {visibles < filtradas.length && (
          <button
            type="button"
            onClick={() => setVisibles((v) => v + POR_PAGINA)}
            className="tap mx-auto mt-6 block rounded-full border border-line bg-surface px-6 py-3 text-label font-medium"
          >
            Ver más prendas ({filtradas.length - visibles})
          </button>
        )}
      </main>

      {abierta && (
        <Detalle
          prenda={abierta}
          simbolo={tienda.simbolo}
          whatsapp={tienda.whatsapp}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  );
}

function Fila({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">{children}</div>;
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`tap shrink-0 rounded-full border px-3 py-1.5 text-label ${
        activo ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
      }`}
    >
      {children}
    </button>
  );
}

function BotonLaQuiero({
  prenda,
  simbolo,
  whatsapp,
  grande = false,
}: {
  prenda: PrendaCatalogo;
  simbolo: string;
  whatsapp: string | null;
  grande?: boolean;
}) {
  if (!whatsapp) return null;
  return (
    <a
      href={linkLaQuiero(whatsapp, prenda, simbolo)}
      target="_blank"
      rel="noreferrer"
      className={`tap block rounded-[--radius-control] bg-[#25D366] text-center font-semibold text-white ${
        grande ? 'px-4 py-3.5 text-body' : 'px-2 py-2 text-label'
      }`}
    >
      La quiero 🤍
    </a>
  );
}

function Tarjeta({
  prenda: p,
  simbolo,
  whatsapp,
  onVer,
}: {
  prenda: PrendaCatalogo;
  simbolo: string;
  whatsapp: string | null;
  onVer: () => void;
}) {
  return (
    <li className="flex flex-col overflow-hidden rounded-[--radius-card] border border-line bg-bg shadow-card">
      <button type="button" onClick={onVer} className="relative block aspect-[4/5] bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.fotos[0]} alt={p.nombre ?? p.marca ?? p.codigo} loading="lazy" className="size-full object-cover" />
        {p.nueva && (
          <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-caption font-semibold text-accent-ink">
            Nueva
          </span>
        )}
        {p.fotos.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-caption text-white">
            {p.fotos.length} fotos
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="min-w-0">
          <p className="truncate text-label font-semibold">{p.marca ?? p.nombre ?? 'Prenda vintage'}</p>
          <p className="text-caption text-muted">
            {p.talla ? `Talla ${p.talla}` : 'Talla por confirmar'}
          </p>
          <p className="mt-0.5 text-body font-bold">
            {simbolo}
            {p.precio}
          </p>
        </div>
        <div className="mt-auto">
          <BotonLaQuiero prenda={p} simbolo={simbolo} whatsapp={whatsapp} />
        </div>
      </div>
    </li>
  );
}

function Detalle({
  prenda: p,
  simbolo,
  whatsapp,
  onCerrar,
}: {
  prenda: PrendaCatalogo;
  simbolo: string;
  whatsapp: string | null;
  onCerrar: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={p.marca ?? p.codigo}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onCerrar}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[--radius-sheet] bg-bg pb-safe sm:rounded-[--radius-sheet]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fotos: se deslizan de lado */}
        <div className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
          {p.fotos.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={`Foto ${i + 1}`}
              className="aspect-[4/5] w-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>
        <div className="space-y-3 p-4">
          {p.fotos.length > 1 && (
            <p className="text-center text-caption text-muted">← Desliza para ver las {p.fotos.length} fotos →</p>
          )}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-title">{p.marca ?? p.nombre ?? 'Prenda vintage'}</h2>
              <p className="text-muted">
                {[p.categoria, p.talla ? `Talla ${p.talla}` : null].filter(Boolean).join(' · ')}
              </p>
              <p className="text-caption text-muted">Código {p.codigo} · pieza única</p>
            </div>
            <p className="text-display">
              {simbolo}
              {p.precio}
            </p>
          </div>
          <BotonLaQuiero prenda={p} simbolo={simbolo} whatsapp={whatsapp} grande />
          <button type="button" onClick={onCerrar} className="tap w-full py-2 text-label text-muted">
            Seguir viendo
          </button>
        </div>
      </div>
    </div>
  );
}
