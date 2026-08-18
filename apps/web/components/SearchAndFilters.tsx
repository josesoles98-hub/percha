'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { formatMoney, GENDER_META, ITEM_GENDERS } from '@percha/core';

import type { Catalogos, Filtros, Orden } from '@/lib/data/inventory';
import { contarFiltrosActivos, paramsDesdeFiltros } from '@/lib/filtros-url';

const RAPIDOS = [
  { clave: 'todo', etiqueta: 'Todo' },
  { clave: 'available', etiqueta: '🟢 Disponibles' },
  { clave: 'reserved', etiqueta: '🟡 Reservadas' },
  { clave: 'sold', etiqueta: '🔴 Vendidas' },
  { clave: 'nuevas', etiqueta: '✨ Nuevas' },
] as const;

const ORDENES: Array<{ valor: Orden; etiqueta: string }> = [
  { valor: 'recientes', etiqueta: 'Más recientes' },
  { valor: 'precio_asc', etiqueta: 'Precio: menor primero' },
  { valor: 'precio_desc', etiqueta: 'Precio: mayor primero' },
  { valor: 'vencimiento', etiqueta: 'Reserva por vencer' },
];

/**
 * Buscador y filtros del inventario.
 *
 * Todo el estado va a la URL: la vista filtrada se puede recargar,
 * compartir y volver atrás sin perderla.
 */
export function SearchAndFilters({
  filtros,
  catalogos,
  simbolo,
}: {
  filtros: Filtros;
  catalogos: Catalogos;
  simbolo: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, iniciarTransicion] = useTransition();

  const [texto, setTexto] = useState(filtros.q ?? '');
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const primerRender = useRef(true);

  // Si la URL cambia por fuera (botón atrás, enlace compartido), el input
  // tiene que seguirla. Se ajusta durante el render y no en un efecto:
  // hacerlo en un efecto provoca un render de más con el valor viejo, que
  // en un buscador se ve como un parpadeo del texto.
  const [ultimaQ, setUltimaQ] = useState(filtros.q ?? '');
  if ((filtros.q ?? '') !== ultimaQ) {
    setUltimaQ(filtros.q ?? '');
    setTexto(filtros.q ?? '');
  }

  const activos = contarFiltrosActivos(filtros);

  function navegar(siguientes: Filtros) {
    const params = paramsDesdeFiltros(siguientes);
    const query = params.toString();
    iniciarTransicion(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  // Debounce del buscador: 250 ms es el punto donde deja de sentirse lento
  // sin lanzar una consulta por cada tecla.
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (texto !== (filtros.q ?? '')) navegar({ ...filtros, q: texto });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  function alternarRapido(clave: (typeof RAPIDOS)[number]['clave']) {
    if (clave === 'todo') {
      navegar({ ...filtros, status: 'all', nuevas: false });
      return;
    }
    if (clave === 'nuevas') {
      navegar({ ...filtros, nuevas: !filtros.nuevas });
      return;
    }
    navegar({ ...filtros, status: filtros.status === clave ? 'all' : clave });
  }

  const rapidoActivo = (clave: (typeof RAPIDOS)[number]['clave']) => {
    if (clave === 'todo') return filtros.status === 'all' && !filtros.nuevas;
    if (clave === 'nuevas') return Boolean(filtros.nuevas);
    return filtros.status === clave;
  };

  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 bg-bg/95 px-4 pb-2 pt-safe backdrop-blur">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar prenda, marca, código…"
            aria-label="Buscar en el inventario"
            className="tap w-full rounded-[--radius-control] border border-line bg-surface py-3 pl-10 pr-10 outline-none focus:border-accent"
          />
          {texto && (
            <button
              type="button"
              onClick={() => {
                setTexto('');
                navegar({ ...filtros, q: '' });
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted"
            >
              ✕
            </button>
          )}
        </div>

        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {RAPIDOS.map((r) => (
            <Chip key={r.clave} activo={rapidoActivo(r.clave)} onClick={() => alternarRapido(r.clave)}>
              {r.etiqueta}
            </Chip>
          ))}

          <Chip activo={activos > 0} onClick={() => setHojaAbierta(true)}>
            Filtros{activos > 0 ? ` (${activos})` : ''} ▾
          </Chip>
        </div>
      </div>

      {pendiente && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-line" role="status">
          <div className="h-full w-1/3 animate-pulse bg-accent" />
          <span className="sr-only">Buscando…</span>
        </div>
      )}

      {hojaAbierta && (
        <HojaFiltros
          filtros={filtros}
          catalogos={catalogos}
          simbolo={simbolo}
          onAplicar={(siguientes) => {
            navegar(siguientes);
            setHojaAbierta(false);
          }}
          onCerrar={() => setHojaAbierta(false)}
        />
      )}
    </>
  );
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
      onClick={onClick}
      aria-pressed={activo}
      className={`tap shrink-0 whitespace-nowrap rounded-full border px-4 text-label transition-colors ${
        activo ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
      }`}
    >
      {children}
    </button>
  );
}

function HojaFiltros({
  filtros,
  catalogos,
  simbolo,
  onAplicar,
  onCerrar,
}: {
  filtros: Filtros;
  catalogos: Catalogos;
  simbolo: string;
  onAplicar: (filtros: Filtros) => void;
  onCerrar: () => void;
}) {
  const [borrador, setBorrador] = useState<Filtros>(filtros);

  const set = <K extends keyof Filtros>(clave: K, valor: Filtros[K]) =>
    setBorrador((previos) => ({ ...previos, [clave]: valor }));

  const alternar = <K extends keyof Filtros>(clave: K, valor: string) =>
    set(clave, (borrador[clave] === valor ? null : valor) as Filtros[K]);

  const soles = (cents: number | null | undefined) =>
    typeof cents === 'number' ? String(cents / 100) : '';

  return (
    <div role="dialog" aria-modal="true" aria-label="Filtros" className="fixed inset-0 z-[70] flex items-end">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/50" />

      <div className="relative max-h-[85dvh] w-full overflow-y-auto rounded-t-[--radius-sheet] bg-bg px-4 pb-safe pt-3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" aria-hidden />

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-title">Filtros</h2>
          <button
            type="button"
            onClick={() =>
              setBorrador({
                q: borrador.q,
                orden: borrador.orden,
                status: 'all',
                brandId: null,
                sizeId: null,
                categoryId: null,
                colorId: null,
                gender: null,
                precioMin: null,
                precioMax: null,
                nuevas: false,
              })
            }
            className="tap text-label text-muted underline underline-offset-4"
          >
            Limpiar todo
          </button>
        </div>

        <Grupo titulo="Marca">
          {catalogos.brands.map((b) => (
            <Chip key={b.id} activo={borrador.brandId === b.id} onClick={() => alternar('brandId', b.id)}>
              {b.name}
            </Chip>
          ))}
          {catalogos.brands.length === 0 && <Vacio>Todavía no has usado ninguna marca.</Vacio>}
        </Grupo>

        <Grupo titulo="Talla">
          {catalogos.sizes.map((s) => (
            <Chip key={s.id} activo={borrador.sizeId === s.id} onClick={() => alternar('sizeId', s.id)}>
              {s.label}
            </Chip>
          ))}
        </Grupo>

        <Grupo titulo="Categoría">
          {catalogos.categories.map((c) => (
            <Chip key={c.id} activo={borrador.categoryId === c.id} onClick={() => alternar('categoryId', c.id)}>
              {c.emoji} {c.name}
            </Chip>
          ))}
        </Grupo>

        <Grupo titulo="Color">
          {catalogos.colors.map((c) => (
            <Chip key={c.id} activo={borrador.colorId === c.id} onClick={() => alternar('colorId', c.id)}>
              {c.name}
            </Chip>
          ))}
        </Grupo>

        <Grupo titulo="Para quién">
          {ITEM_GENDERS.map((g) => (
            <Chip key={g} activo={borrador.gender === g} onClick={() => alternar('gender', g)}>
              {GENDER_META[g].label}
            </Chip>
          ))}
        </Grupo>

        <fieldset className="mt-5">
          <legend className="mb-2 text-label font-medium">Precio</legend>
          <div className="flex items-center gap-2">
            <CampoPrecio
              etiqueta="Desde"
              simbolo={simbolo}
              valor={soles(borrador.precioMin)}
              onChange={(v) => set('precioMin', v === '' ? null : Number(v) * 100)}
            />
            <span className="text-muted" aria-hidden>
              —
            </span>
            <CampoPrecio
              etiqueta="Hasta"
              simbolo={simbolo}
              valor={soles(borrador.precioMax)}
              onChange={(v) => set('precioMax', v === '' ? null : Number(v) * 100)}
            />
          </div>
          {typeof borrador.precioMin === 'number' && typeof borrador.precioMax === 'number' && borrador.precioMin > borrador.precioMax && (
            <p className="mt-1 text-caption text-status-sold">
              El mínimo ({formatMoney(borrador.precioMin, { symbol: simbolo })}) es mayor que el máximo.
            </p>
          )}
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 text-label font-medium">Ordenar por</legend>
          <div className="flex flex-wrap gap-2">
            {ORDENES.map((o) => (
              <Chip key={o.valor} activo={(borrador.orden ?? 'recientes') === o.valor} onClick={() => set('orden', o.valor)}>
                {o.etiqueta}
              </Chip>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={() => onAplicar(borrador)}
          className="tap mt-6 w-full rounded-[--radius-control] bg-accent px-4 py-3.5 font-semibold text-accent-ink"
        >
          Ver resultados
        </button>
        <div className="h-4" />
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-label font-medium">{titulo}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="text-caption text-muted">{children}</p>;
}

function CampoPrecio({
  etiqueta,
  simbolo,
  valor,
  onChange,
}: {
  etiqueta: string;
  simbolo: string;
  valor: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="flex flex-1 items-center gap-1.5 rounded-[--radius-control] border border-line bg-surface px-3 focus-within:border-accent">
      <span className="sr-only">{etiqueta}</span>
      <span className="text-caption text-muted">{simbolo}</span>
      <input
        inputMode="numeric"
        placeholder={etiqueta}
        value={valor}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        className="w-full bg-transparent py-2.5 tabular-nums outline-none"
      />
    </label>
  );
}
