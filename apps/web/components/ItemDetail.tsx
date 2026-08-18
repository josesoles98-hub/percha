'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  GENDER_META,
  STATUS_META,
  formatDateTime,
  formatMoney,
  formatShortDate,
  getReserveInfoFromExpiry,
  parseMoneyToCents,
  type Item,
  type ItemStatus,
  type StoreSettings,
} from '@percha/core';

import { cambiarEstado, enviarAPapelera } from '@/lib/data/mutations';
import { createClient } from '@/lib/supabase/client';

import { ShareSheet } from './ShareSheet';
import { StatusPill } from './StatusPill';
import { useToast, vibrar } from './Toast';

const SIGUIENTES: Record<ItemStatus, ItemStatus[]> = {
  available: ['reserved', 'sold', 'hidden'],
  reserved: ['sold', 'available'],
  sold: ['available'],
  hidden: ['available'],
};

const ETIQUETA_ACCION: Record<ItemStatus, string> = {
  available: 'Marcar disponible',
  reserved: 'Reservar',
  sold: 'Marcar vendida',
  hidden: 'Ocultar',
};

export function ItemDetail({
  item,
  store,
  fotoUrls,
  historial,
}: {
  item: Item;
  store: StoreSettings;
  fotoUrls: string[];
  historial: Array<{ id: number; type: string; created_at: string; payload: Record<string, unknown> }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { mostrar } = useToast();

  // Al venir de "Guardar y compartir", la hoja se abre sola: un toque menos.
  const [compartiendo, setCompartiendo] = useState(params.get('compartir') === '1');
  const [reservando, setReservando] = useState(false);
  const [editandoReserva, setEditandoReserva] = useState(false);
  const [nombreReserva, setNombreReserva] = useState('');
  const [telefonoReserva, setTelefonoReserva] = useState('');
  const [depositoReserva, setDepositoReserva] = useState('');
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [fotoActiva, setFotoActiva] = useState(0);
  const carruselRef = useRef<HTMLDivElement>(null);

  function irAFoto(indice: number) {
    const nodo = carruselRef.current;
    if (!nodo) return;
    nodo.scrollTo({ left: indice * nodo.clientWidth, behavior: 'smooth' });
  }

  function alDesplazar() {
    const nodo = carruselRef.current;
    if (!nodo || nodo.clientWidth === 0) return;
    const indice = Math.round(nodo.scrollLeft / nodo.clientWidth);
    setFotoActiva((previa) => (previa === indice ? previa : indice));
  }

  useEffect(() => {
    if (params.get('compartir') === '1') {
      router.replace(`/prenda/${item.code}`, { scroll: false });
    }
  }, [item.code, params, router]);

  // El vencimiento viene calculado de la base con los días que se
  // congelaron al reservar. Recalcularlo con store.reserveDays haría que,
  // tras cambiar el ajuste, la ficha mostrara una fecha que la base no va
  // a respetar.
  const reserva =
    item.effectiveStatus === 'reserved'
      ? getReserveInfoFromExpiry(item.reserveExpiresAt)
      : null;

  /** Nueva reserva: campos en blanco salvo el adelanto sugerido de la tienda. */
  function abrirReservar() {
    setEditandoReserva(false);
    setNombreReserva('');
    setTelefonoReserva('');
    setDepositoReserva(store.shareDepositCents > 0 ? String(store.shareDepositCents / 100) : '');
    setReservando(true);
  }

  /**
   * Reabre la misma hoja para corregir una reserva ya activa —por ejemplo,
   * si el nombre se escribió mal o el cliente completa el adelanto después.
   * Llamar a `cambiarEstado` con el mismo estado 'reserved' no reinicia la
   * cuenta atrás (ver el comentario en mutations.ts), así que es seguro.
   */
  function abrirEditarReserva() {
    setEditandoReserva(true);
    setNombreReserva(item.reservedForName ?? '');
    setTelefonoReserva(item.reservedForPhone ?? '');
    setDepositoReserva(
      item.reservedDepositCents != null ? String(item.reservedDepositCents / 100) : '',
    );
    setReservando(true);
  }

  async function aplicarEstado(
    nuevo: ItemStatus,
    opciones: {
      reservedForName?: string;
      reservedForPhone?: string;
      reservedDepositCents?: number | null;
    } = {},
  ) {
    const anterior = item.status;
    const soloEdicion = anterior === nuevo; // mismo estado: se corrigen datos, no se transiciona
    const supabase = createClient();

    const { error } = await cambiarEstado(supabase, item.id, nuevo, opciones);

    if (error) {
      mostrar('No se pudo cambiar el estado');
      return;
    }

    vibrar();
    // Sin diálogo de confirmación: se aplica y se ofrece deshacer. Es más
    // rápido cuando cambias el estado de varias prendas seguidas.
    mostrar(soloEdicion ? 'Reserva actualizada' : STATUS_META[nuevo].label, async () => {
      // Si solo se editaron los datos de una reserva que ya existía, deshacer
      // debe devolver ESOS datos anteriores, no dejar la reserva en blanco.
      await cambiarEstado(
        supabase,
        item.id,
        anterior,
        soloEdicion
          ? {
              reservedForName: item.reservedForName ?? undefined,
              reservedForPhone: item.reservedForPhone ?? undefined,
              reservedDepositCents: item.reservedDepositCents,
            }
          : {},
      );
      router.refresh();
    });

    setReservando(false);
    setNombreReserva('');
    setTelefonoReserva('');
    setDepositoReserva('');
    router.refresh();
  }

  async function eliminar() {
    if (!confirm('¿Eliminar esta prenda? Va a la papelera 30 días.')) return;

    const supabase = createClient();
    const { error } = await enviarAPapelera(supabase, item.id);

    if (error) {
      mostrar('No se pudo eliminar');
      return;
    }

    mostrar(`${item.code} en la papelera`);
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <div className="mx-auto max-w-2xl pb-32">
        <header className="flex items-center justify-between px-4 py-3 pt-safe">
          <button onClick={() => router.back()} className="tap text-label text-muted">
            ‹ Atrás
          </button>
        </header>

        {/* ── Fotos ─────────────────────────────────────────────────── */}
        <div className="relative aspect-3/4 w-full overflow-hidden bg-surface">
          {fotoUrls.length > 0 ? (
            <>
              <div
                ref={carruselRef}
                onScroll={alDesplazar}
                className="flex size-full snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {fotoUrls.map((url, indice) => (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada
                  <img
                    key={url}
                    src={url}
                    alt={`${item.name ?? item.code} · foto ${indice + 1}`}
                    className="size-full shrink-0 snap-center object-cover"
                  />
                ))}
              </div>
              {fotoUrls.length > 1 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                  {fotoUrls.map((url, indice) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => irAFoto(indice)}
                      aria-label={`Ver foto ${indice + 1}`}
                      className={`pointer-events-auto size-2 rounded-full transition-colors ${
                        indice === fotoActiva ? 'bg-white' : 'bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex size-full items-center justify-center text-5xl text-muted" aria-hidden>
              👕
            </div>
          )}

          <span className="absolute left-3 top-3">
            <StatusPill status={item.effectiveStatus} />
          </span>
        </div>

        {/* ── Datos ─────────────────────────────────────────────────── */}
        <div className="space-y-5 px-4 pt-4">
          <div>
            <p className="text-display tabular-nums">
              {formatMoney(item.priceCents, { symbol: store.currencySymbol })}
            </p>
            {item.name && <p className="text-title">{item.name}</p>}
            <button
              type="button"
              onClick={() => {
                // navigator.clipboard no existe fuera de un contexto seguro
                // (https, o localhost) — probando desde el celular por la IP
                // de la red local, por ejemplo. Sin este try/catch, tocar el
                // botón rompería la página en vez de simplemente no copiar.
                navigator.clipboard
                  ?.writeText(item.code)
                  .then(() => mostrar('Código copiado'))
                  .catch(() => {});
              }}
              className="mt-0.5 text-caption text-muted"
            >
              {item.code} ⧉
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {item.brandName && <Chip>{item.brandName}</Chip>}
            {item.sizeLabel && <Chip>Talla {item.sizeLabel}</Chip>}
            {item.categoryName && (
              <Chip>
                {item.categoryEmoji} {item.categoryName}
              </Chip>
            )}
            {item.colorName && <Chip>{item.colorName}</Chip>}
            {item.gender && <Chip>{GENDER_META[item.gender].label}</Chip>}
          </div>

          {reserva && !reserva.expired && (
            <div className="rounded-[--radius-card] bg-status-reserved/15 p-4">
              {/* Separador en vez de "el": formatDateTime devuelve "ayer, 11:45"
                  y "Reservada el ayer" no se dice. */}
              <p className="font-medium">
                🟡 Reservada · {item.reservedAt ? formatDateTime(item.reservedAt) : ''}
              </p>
              <p className="mt-0.5 text-label">
                {reserva.label}
                {item.reserveExpiresAt && ` (${formatShortDate(item.reserveExpiresAt)})`}
              </p>
              {item.reservedForName && (
                <p className="mt-0.5 text-label">
                  Para: {item.reservedForName}
                  {item.reservedForPhone && ` · ${item.reservedForPhone}`}
                </p>
              )}
              {item.reservedDepositCents != null && (
                <p className="mt-0.5 text-label">
                  Adelanto: {formatMoney(item.reservedDepositCents, { symbol: store.currencySymbol })}
                  {' · Falta: '}
                  {formatMoney(item.priceCents - item.reservedDepositCents, {
                    symbol: store.currencySymbol,
                  })}
                </p>
              )}
              <button
                type="button"
                onClick={abrirEditarReserva}
                className="tap mt-1 text-caption text-muted underline underline-offset-4"
              >
                Editar reserva
              </button>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void aplicarEstado('sold')}
                  className="tap flex-1 rounded-[--radius-control] bg-accent px-3 py-2 text-label font-medium text-accent-ink"
                >
                  Vender
                </button>
                <button
                  type="button"
                  onClick={() => void aplicarEstado('available')}
                  className="tap flex-1 rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label"
                >
                  Cancelar reserva
                </button>
              </div>
            </div>
          )}

          {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}

          <div className="space-y-0.5 text-caption text-muted">
            <p>Publicada: {formatShortDate(item.createdAt)}</p>
            <p>Modificada: {formatDateTime(item.updatedAt)}</p>
            {item.shareCount > 0 && <p>Compartida {item.shareCount} veces</p>}
          </div>

          {historial.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setHistorialAbierto((v) => !v)}
                aria-expanded={historialAbierto}
                className="tap text-label text-muted"
              >
                {historialAbierto ? '▾' : '▸'} Ver historial · {historial.length}{' '}
                {historial.length === 1 ? 'cambio' : 'cambios'}
              </button>

              {historialAbierto && (
                <ul className="mt-3 space-y-2 border-l border-line pl-4">
                  {historial.map((evento) => (
                    <li key={evento.id} className="text-caption">
                      <span className="text-muted">{formatDateTime(evento.created_at)}</span>
                      {' — '}
                      {describirEvento(evento, store.currencySymbol)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/*
            Reservar varias: solo desde una prenda disponible, para que el
            estado de partida sea siempre coherente (no tiene sentido
            "reservar junto con otras" algo que ya está reservado o vendido).
          */}
          {item.effectiveStatus === 'available' && (
            <Link
              href={`/reservar/nuevo?prenda=${item.code}`}
              className="tap flex w-full items-center justify-center rounded-[--radius-control] border border-line bg-surface py-3 font-medium"
            >
              🗓️ Reservar junto con otras
            </Link>
          )}

          {/* Convertir en pedido: solo tiene sentido si aún no se vendió. */}
          {(item.effectiveStatus === 'available' || item.effectiveStatus === 'reserved') && (
            <Link
              href={`/pedidos/nuevo?prenda=${item.code}`}
              className="tap flex w-full items-center justify-center rounded-[--radius-control] border border-line bg-surface py-3 font-medium"
            >
              🧾 Convertir en pedido
            </Link>
          )}

          <div className="flex gap-2 pt-2">
            <Link
              href={`/prenda/${item.code}/editar`}
              className="tap flex-1 rounded-[--radius-control] border border-line bg-surface py-2.5 text-center text-label"
            >
              Editar
            </Link>
            <Link
              href={`/nueva?duplicar=${item.code}`}
              className="tap flex-1 rounded-[--radius-control] border border-line bg-surface py-2.5 text-center text-label"
            >
              Duplicar
            </Link>
            <button
              type="button"
              onClick={() => void eliminar()}
              className="tap flex-1 rounded-[--radius-control] border border-line bg-surface py-2.5 text-label text-status-sold"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>

      {/*
        ── Barra de acción fija ──────────────────────────────────────────
        Esta ficha vive dentro de (app), que ya pone su propia barra de
        navegación fija en bottom-0 con el mismo z-40. Si esta barra se
        quedara también en bottom-0, la de navegación —que se pinta
        después en el árbol— la taparía por completo: el botón COMPARTIR
        seguiría ahí, pero cualquier toque real caería sobre "Pedidos" en
        su lugar. Por eso va pegada encima de la barra de navegación, con
        el mismo alto que usa el botón + (Fab.tsx) para lo mismo.
      */}
      <footer
        className="fixed inset-x-0 z-40 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          <button
            type="button"
            onClick={() => setCompartiendo(true)}
            className="tap flex-[65] rounded-[--radius-control] bg-accent py-3.5 text-lg font-semibold text-accent-ink"
          >
            📤 COMPARTIR
          </button>

          <div className="flex-[35]">
            <select
              aria-label="Cambiar estado"
              value=""
              onChange={(e) => {
                const nuevo = e.target.value as ItemStatus;
                if (!nuevo) return;
                if (nuevo === 'reserved') abrirReservar();
                else void aplicarEstado(nuevo);
              }}
              className="tap size-full rounded-[--radius-control] border border-line bg-surface px-2 text-label"
            >
              <option value="">Estado ▾</option>
              {SIGUIENTES[item.effectiveStatus].map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETA_ACCION[estado]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </footer>

      {/* ── Reservar ──────────────────────────────────────────────────── */}
      {reservando && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[70] flex items-end">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setReservando(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative w-full rounded-t-[--radius-sheet] bg-bg px-4 pb-safe pt-4">
            <h2 className="text-title">{editandoReserva ? 'Editar reserva' : 'Reservar'}</h2>
            {!editandoReserva && (
              <p className="mt-1 text-label text-muted">
                La reserva vence en {store.reserveDays} días. Después vuelve sola a disponible.
              </p>
            )}

            <input
              autoFocus
              placeholder="¿Para quién? (opcional)"
              value={nombreReserva}
              onChange={(e) => setNombreReserva(e.target.value)}
              className="tap mt-4 w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />
            <input
              inputMode="tel"
              placeholder="Teléfono (opcional)"
              value={telefonoReserva}
              onChange={(e) => setTelefonoReserva(e.target.value)}
              className="tap mt-2 w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />

            <label htmlFor="deposito-reserva" className="mt-3 block text-label text-muted">
              Adelanto (opcional)
            </label>
            <div className="tap mt-1.5 flex w-full items-center gap-2 rounded-[--radius-control] border border-line bg-surface px-4 focus-within:border-accent">
              <span className="text-muted">{store.currencySymbol}</span>
              <input
                id="deposito-reserva"
                inputMode="decimal"
                value={depositoReserva}
                onChange={(e) => setDepositoReserva(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent py-3 tabular-nums outline-none"
              />
            </div>
            {(() => {
              const depositoCents = parseMoneyToCents(depositoReserva);
              if (depositoCents === null || depositoCents <= 0) return null;
              const falta = item.priceCents - depositoCents;
              return (
                <p className="mt-1.5 text-caption text-muted">
                  Falta por cobrar: {formatMoney(falta, { symbol: store.currencySymbol })}
                </p>
              );
            })()}

            <button
              type="button"
              onClick={() =>
                void aplicarEstado('reserved', {
                  reservedForName: nombreReserva,
                  reservedForPhone: telefonoReserva,
                  reservedDepositCents: parseMoneyToCents(depositoReserva),
                })
              }
              className="tap mt-4 w-full rounded-[--radius-control] bg-accent py-3 font-medium text-accent-ink"
            >
              {editandoReserva ? 'Guardar' : 'Reservar'}
            </button>
            <div className="h-4" />
          </div>
        </div>
      )}

      <ShareSheet
        item={item}
        store={store}
        fotoUrls={fotoUrls}
        abierto={compartiendo}
        onCerrar={() => setCompartiendo(false)}
      />
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line bg-surface px-3 py-1 text-label">
      {children}
    </span>
  );
}

function describirEvento(
  evento: { type: string; payload: Record<string, unknown> },
  simbolo: string,
): string {
  const precio = evento.payload.price_cents as [number, number] | undefined;

  switch (evento.type) {
    case 'created':
      return 'Creada';
    case 'reserved':
      return `Reservada${evento.payload.reserved_for ? ` para ${evento.payload.reserved_for}` : ''}`;
    case 'sold':
      return 'Vendida';
    case 'reservation_expired':
      return 'Reserva vencida';
    case 'status_changed':
      return 'Cambio de estado';
    case 'deleted':
      return 'Enviada a la papelera';
    case 'restored':
      return 'Restaurada';
    case 'updated':
      if (precio) {
        return `Precio ${formatMoney(precio[0], { symbol: simbolo })} → ${formatMoney(precio[1], { symbol: simbolo })}`;
      }
      return 'Editada';
    default:
      return evento.type;
  }
}
