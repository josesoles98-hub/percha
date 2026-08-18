'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatMoney, parseMoneyToCents, type Item, type StoreSettings } from '@percha/core';

import { PrendaThumb } from '@/components/PrendaThumb';
import { useToast, vibrar } from '@/components/Toast';
import { cambiarEstado } from '@/lib/data/mutations';
import { buscarPrendasDisponibles, type PrendaDisponible } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

/**
 * Reserva varias prendas de una vez para el mismo cliente.
 *
 * Cada prenda guarda su propio adelanto —no hay un "adelanto del pedido"
 * en la base, cada fila de `items` es independiente— así que si el
 * cliente cambia de opinión sobre una sola pieza, las demás siguen con su
 * información intacta. Por eso al confirmar se hacen N actualizaciones
 * independientes en vez de una operación atómica: si una falla, las que
 * ya se aplicaron deben quedar reservadas igual.
 */
export function ReservarVariasForm({
  storeId,
  store,
  item,
  fotoUrlInicial,
}: {
  storeId: string;
  store: StoreSettings;
  item: Item;
  fotoUrlInicial: string | null;
}) {
  const router = useRouter();
  const { mostrar } = useToast();

  const depositoSugerido = store.shareDepositCents > 0 ? String(store.shareDepositCents / 100) : '';

  const [prendas, setPrendas] = useState<PrendaDisponible[]>([
    {
      id: item.id,
      code: item.code,
      name: item.name,
      sizeLabel: item.sizeLabel,
      priceCents: item.priceCents,
      photoUrl: fotoUrlInicial,
    },
  ]);
  const [depositos, setDepositos] = useState<Record<string, string>>({
    [item.id]: depositoSugerido,
  });

  const [buscandoPrenda, setBuscandoPrenda] = useState(false);
  const [terminoPrenda, setTerminoPrenda] = useState('');
  const [resultadosPrenda, setResultadosPrenda] = useState<PrendaDisponible[]>([]);
  const [cargandoPrendas, setCargandoPrendas] = useState(false);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!buscandoPrenda) return;

    let cancelado = false;
    const t = setTimeout(async () => {
      setCargandoPrendas(true);
      const encontradas = await buscarPrendasDisponibles(createClient(), storeId, terminoPrenda);
      if (!cancelado) {
        setResultadosPrenda(encontradas);
        setCargandoPrendas(false);
      }
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [buscandoPrenda, terminoPrenda, storeId]);

  const disponiblesParaAnadir = resultadosPrenda.filter((r) => !prendas.some((p) => p.id === r.id));

  function agregarPrenda(prenda: PrendaDisponible) {
    setPrendas((previas) => (previas.some((p) => p.id === prenda.id) ? previas : [...previas, prenda]));
    setDepositos((previos) => ({ ...previos, [prenda.id]: depositoSugerido }));
  }

  function quitarPrenda(id: string) {
    // Siempre debe quedar al menos una: una reserva sin prendas no tiene sentido.
    setPrendas((previas) => (previas.length > 1 ? previas.filter((p) => p.id !== id) : previas));
  }

  const totalPrecio = prendas.reduce((suma, p) => suma + p.priceCents, 0);
  const totalAdelanto = prendas.reduce(
    (suma, p) => suma + (parseMoneyToCents(depositos[p.id]) ?? 0),
    0,
  );
  const totalFalta = totalPrecio - totalAdelanto;

  const puedeGuardar = nombre.trim() !== '' && telefono.trim() !== '' && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;

    setGuardando(true);
    setError(null);
    const supabase = createClient();

    const resultados = await Promise.allSettled(
      prendas.map((prenda) =>
        cambiarEstado(supabase, prenda.id, 'reserved', {
          reservedForName: nombre,
          reservedForPhone: telefono,
          reservedDepositCents: parseMoneyToCents(depositos[prenda.id]),
        }),
      ),
    );

    const fallidas = prendas.filter((_prenda, i) => {
      const r = resultados[i];
      return !r || r.status === 'rejected' || r.value.error !== null;
    });

    setGuardando(false);

    if (fallidas.length > 0) {
      const huboExito = fallidas.length < prendas.length;
      setError(
        huboExito
          ? `No se pudo reservar: ${fallidas.map((p) => p.code).join(', ')}. Las demás sí quedaron reservadas.`
          : 'No se pudo reservar ninguna prenda.',
      );
      if (huboExito) {
        vibrar();
        router.refresh();
      }
      return;
    }

    vibrar();
    mostrar(`${prendas.length} ${prendas.length === 1 ? 'prenda reservada' : 'prendas reservadas'} para ${nombre}`);
    router.push('/?estado=reserved');
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 pt-safe backdrop-blur">
        <button type="button" onClick={() => router.back()} className="tap text-label text-muted">
          Cancelar
        </button>
        <h1 className="text-label font-semibold">Reservar prendas</h1>
        <span className="w-16" />
      </header>

      <div className="flex-1 space-y-7 px-4 py-4">
        {/* ── Prendas ─────────────────────────────────────────────── */}
        <section className="rounded-[--radius-card] border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-caption text-muted">
              {prendas.length === 1 ? 'Prenda' : `${prendas.length} prendas`}
            </p>
            <button
              type="button"
              onClick={() => setBuscandoPrenda(true)}
              className="tap text-label font-medium text-accent"
            >
              + Añadir otra
            </button>
          </div>

          <ul className="mt-2 divide-y divide-line">
            {prendas.map((prenda) => {
              const depositoCents = parseMoneyToCents(depositos[prenda.id]);
              const falta = prenda.priceCents - (depositoCents ?? 0);

              return (
                <li key={prenda.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <PrendaThumb url={prenda.photoUrl} alt={prenda.name ?? prenda.code} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{prenda.name ?? prenda.code}</p>
                      <p className="text-label text-muted">
                        {prenda.code}
                        {prenda.sizeLabel ? ` · Talla ${prenda.sizeLabel}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tabular-nums">
                        {formatMoney(prenda.priceCents, { symbol: store.currencySymbol })}
                      </span>
                      {prendas.length > 1 && (
                        <button
                          type="button"
                          onClick={() => quitarPrenda(prenda.id)}
                          aria-label={`Quitar ${prenda.code} de la reserva`}
                          className="tap text-muted"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[3.75rem]">
                    <span className="text-caption text-muted">Adelanto</span>
                    <div className="flex items-center gap-1 rounded-[--radius-control] border border-line bg-bg px-2.5 focus-within:border-accent">
                      <span className="text-caption text-muted">{store.currencySymbol}</span>
                      <input
                        inputMode="decimal"
                        value={depositos[prenda.id] ?? ''}
                        onChange={(e) =>
                          setDepositos((previos) => ({ ...previos, [prenda.id]: e.target.value }))
                        }
                        placeholder="0"
                        aria-label={`Adelanto de ${prenda.code}`}
                        className="w-14 bg-transparent py-1.5 tabular-nums outline-none"
                      />
                    </div>
                    <span className="text-caption text-muted">
                      Falta: {formatMoney(falta, { symbol: store.currencySymbol })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Con una sola prenda esto repetiría la misma fila de arriba: solo
              aporta cuando hay varias que sumar. */}
          {prendas.length > 1 && (
            <div className="mt-2 space-y-0.5 border-t border-line pt-2 text-label">
              <p className="flex items-center justify-between text-muted">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(totalPrecio, { symbol: store.currencySymbol })}</span>
              </p>
              <p className="flex items-center justify-between text-muted">
                <span>Adelanto</span>
                <span className="tabular-nums">
                  {formatMoney(totalAdelanto, { symbol: store.currencySymbol })}
                </span>
              </p>
              <p className="flex items-center justify-between font-medium">
                <span>Falta por cobrar</span>
                <span className="tabular-nums">{formatMoney(totalFalta, { symbol: store.currencySymbol })}</span>
              </p>
            </div>
          )}
        </section>

        {/* ── Cliente ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-label font-medium">Cliente</h2>

          <div>
            <label htmlFor="nombre-reserva" className="mb-1.5 block text-label">
              Nombre
            </label>
            <input
              id="nombre-reserva"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="María Quispe"
              className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />
          </div>

          <div>
            <label htmlFor="telefono-reserva" className="mb-1.5 block text-label">
              Teléfono
            </label>
            <input
              id="telefono-reserva"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="987654321"
              className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />
          </div>

          <p className="text-caption text-muted">
            La reserva vence en {store.reserveDays} días. Después cada prenda vuelve sola a
            disponible.
          </p>
        </section>

        {error && (
          <p role="alert" className="text-label text-status-sold">
            {error}
          </p>
        )}
      </div>

      <footer className="sticky bottom-0 border-t border-line bg-bg/95 px-4 py-3 pb-safe backdrop-blur">
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={!puedeGuardar}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3.5 font-semibold text-accent-ink disabled:opacity-40"
        >
          {guardando
            ? 'Reservando…'
            : prendas.length > 1
              ? `Reservar ${prendas.length} prendas`
              : 'Reservar'}
        </button>
      </footer>

      {/* ── Añadir prenda ─────────────────────────────────────────────── */}
      {buscandoPrenda && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Añadir prenda a la reserva"
          className="fixed inset-0 z-[75] flex items-end"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setBuscandoPrenda(false)}
            className="absolute inset-0 bg-black/50"
          />

          <div className="relative flex max-h-[85dvh] w-full flex-col rounded-t-[--radius-sheet] bg-bg pb-safe pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />

            <div className="flex items-center justify-between px-4">
              <h2 className="text-title">Añadir prenda</h2>
              <button
                type="button"
                onClick={() => setBuscandoPrenda(false)}
                className="tap text-label font-medium text-accent"
              >
                Listo
              </button>
            </div>

            <div className="px-4 pt-2">
              <input
                autoFocus
                type="search"
                value={terminoPrenda}
                onChange={(e) => setTerminoPrenda(e.target.value)}
                placeholder="Nombre, código o marca"
                aria-label="Buscar prenda disponible"
                className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
              />
              <p className="mt-2 text-caption text-muted">
                {prendas.length} {prendas.length === 1 ? 'prenda en la reserva' : 'prendas en la reserva'}
              </p>
            </div>

            <ul className="mt-2 flex-1 overflow-y-auto px-4 pb-4">
              {cargandoPrendas && disponiblesParaAnadir.length === 0 && (
                <li className="py-3 text-label text-muted">Buscando…</li>
              )}

              {!cargandoPrendas && disponiblesParaAnadir.length === 0 && (
                <li className="py-3 text-label text-muted">
                  {terminoPrenda
                    ? `Ninguna prenda disponible coincide con «${terminoPrenda}».`
                    : 'No quedan más prendas disponibles para añadir.'}
                </li>
              )}

              {disponiblesParaAnadir.map((prenda) => (
                <li key={prenda.id}>
                  <button
                    type="button"
                    onClick={() => agregarPrenda(prenda)}
                    className="tap flex w-full items-center gap-3 border-b border-line py-3 text-left"
                  >
                    <PrendaThumb url={prenda.photoUrl} alt={prenda.name ?? prenda.code} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{prenda.name ?? prenda.code}</span>
                      <span className="block text-caption text-muted">
                        {prenda.code}
                        {prenda.sizeLabel ? ` · Talla ${prenda.sizeLabel}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-label">
                      {formatMoney(prenda.priceCents, { symbol: store.currencySymbol })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
