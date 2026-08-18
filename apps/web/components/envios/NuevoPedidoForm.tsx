'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  PACKAGE_TYPES,
  formatMoney,
  validarDocumento,
  type DocType,
  type Item,
  type PackageType,
} from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import {
  buscarClientes,
  buscarPrendasDisponibles,
  crearCliente,
  crearPedido,
  type Agencia,
  type Cliente,
  type PrendaDisponible,
} from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

import { PrendaThumb } from '../PrendaThumb';

import { SelectorAgencia } from './SelectorAgencia';

const TIPOS_DOC: DocType[] = ['DNI', 'RUC', 'CE'];

/**
 * Convierte una prenda en pedido.
 *
 * Aprovecha lo que ya se capturó al reservar: si la prenda estaba
 * reservada para alguien, el nombre y el teléfono vienen rellenos y lo
 * único nuevo que hay que pedir es el documento —que Shalom exige— y la
 * agencia de destino. La segunda compra del mismo cliente son dos toques,
 * porque queda guardado con su agencia habitual.
 */
export function NuevoPedidoForm({
  storeId,
  item,
  fotoUrlInicial,
  simbolo,
  origenId,
  origenNombre,
  paquetePorDefecto,
}: {
  storeId: string;
  item: Item;
  fotoUrlInicial: string | null;
  simbolo: string;
  origenId: number | null;
  origenNombre: string | null;
  paquetePorDefecto: PackageType;
}) {
  const router = useRouter();
  const { mostrar } = useToast();

  // ── Prendas ────────────────────────────────────────────────────────
  // Empieza con la que abrió el formulario; se pueden añadir más para que
  // un mismo cliente se lleve varias piezas en un solo pedido.
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
  const [buscandoPrenda, setBuscandoPrenda] = useState(false);
  const [terminoPrenda, setTerminoPrenda] = useState('');
  const [resultadosPrenda, setResultadosPrenda] = useState<PrendaDisponible[]>([]);
  const [cargandoPrendas, setCargandoPrendas] = useState(false);

  const totalPrendas = prendas.reduce((suma, p) => suma + p.priceCents, 0);

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

  // Ya añadidas: no tiene sentido que sigan apareciendo en los resultados.
  const disponiblesParaAnadir = resultadosPrenda.filter(
    (r) => !prendas.some((p) => p.id === r.id),
  );

  function agregarPrenda(prenda: PrendaDisponible) {
    setPrendas((previas) => (previas.some((p) => p.id === prenda.id) ? previas : [...previas, prenda]));
  }

  function quitarPrenda(id: string) {
    // Siempre debe quedar al menos una: un pedido sin prendas no tiene sentido.
    setPrendas((previas) => (previas.length > 1 ? previas.filter((p) => p.id !== id) : previas));
  }

  // ── Cliente ────────────────────────────────────────────────────────
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState<Cliente[]>([]);

  // La reserva ya capturó nombre y teléfono: se usan de arranque.
  const [nombre, setNombre] = useState(item.reservedForName ?? '');
  const [telefono, setTelefono] = useState(item.reservedForPhone ?? '');
  const [tipoDoc, setTipoDoc] = useState<DocType>('DNI');
  const [documento, setDocumento] = useState('');

  // ── Envío ──────────────────────────────────────────────────────────
  const [destino, setDestino] = useState<Agencia | null>(null);
  const [paquete, setPaquete] = useState<PackageType>(paquetePorDefecto);
  const [bultos, setBultos] = useState(1);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sugerencias de clientes ya existentes mientras se escribe el nombre.
  useEffect(() => {
    if (clienteElegido) return;
    const termino = busqueda || nombre;

    let cancelado = false;
    // Tanto buscar como vaciar ocurren dentro del temporizador: hacerlo en
    // el cuerpo del efecto provocaría un render de más en cada tecla.
    const t = setTimeout(async () => {
      if (termino.trim().length < 2) {
        if (!cancelado) setSugerencias([]);
        return;
      }
      const encontrados = await buscarClientes(createClient(), storeId, termino, 5);
      if (!cancelado) setSugerencias(encontrados);
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [busqueda, nombre, clienteElegido, storeId]);

  function elegirCliente(cliente: Cliente) {
    setClienteElegido(cliente);
    setNombre(cliente.fullName);
    setTelefono(cliente.phone ?? '');
    setTipoDoc(cliente.docType);
    setDocumento(cliente.docNumber ?? '');
    setSugerencias([]);
    if (cliente.defaultAgencyId && cliente.defaultAgencyName) {
      setDestino({ id: cliente.defaultAgencyId, name: cliente.defaultAgencyName });
    }
  }

  const errorDoc = documento.trim() ? validarDocumento(tipoDoc, documento) : null;
  const puedeGuardar =
    nombre.trim() !== '' &&
    telefono.trim() !== '' &&
    documento.trim() !== '' &&
    !errorDoc &&
    destino !== null &&
    origenId !== null &&
    !guardando;

  async function guardar() {
    if (!puedeGuardar || !destino || origenId === null) return;

    setGuardando(true);
    setError(null);
    const supabase = createClient();

    // Cliente: se reutiliza el elegido o se crea uno nuevo.
    let clienteId = clienteElegido?.id ?? null;

    if (!clienteId) {
      const { data, error: errorCliente } = await crearCliente(supabase, storeId, {
        fullName: nombre,
        docType: tipoDoc,
        docNumber: documento,
        phone: telefono,
        defaultAgencyId: destino.id,
      });

      if (!data) {
        setError(errorCliente ?? 'No se pudo guardar el cliente');
        setGuardando(false);
        return;
      }
      clienteId = data.id;
    }

    const { data: pedido, error: errorPedido } = await crearPedido(supabase, {
      storeId,
      customerId: clienteId,
      itemIds: prendas.map((p) => p.id),
      precios: Object.fromEntries(prendas.map((p) => [p.id, p.priceCents])),
      envio: {
        originAgencyId: origenId,
        destinyAgencyId: destino.id,
        packageType: paquete,
        packagesCount: bultos,
      },
    });

    if (!pedido) {
      setError(errorPedido ?? 'No se pudo crear el pedido');
      setGuardando(false);
      return;
    }

    vibrar();
    mostrar(`${pedido.code} creado`);
    router.push(`/pedidos/${pedido.code}`);
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 pt-safe backdrop-blur">
        <button type="button" onClick={() => router.back()} className="tap text-label text-muted">
          Cancelar
        </button>
        <h1 className="text-label font-semibold">Nuevo pedido</h1>
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

          <ul className="mt-1 divide-y divide-line">
            {prendas.map((prenda) => (
              <li key={prenda.id} className="flex items-center gap-3 py-2.5">
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
                    {formatMoney(prenda.priceCents, { symbol: simbolo })}
                  </span>
                  {prendas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => quitarPrenda(prenda.id)}
                      aria-label={`Quitar ${prenda.code} del pedido`}
                      className="tap text-muted"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {prendas.length > 1 && (
            <p className="mt-1 flex items-center justify-between border-t border-line pt-2 font-medium">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(totalPrendas, { symbol: simbolo })}</span>
            </p>
          )}
        </section>

        {/* ── Cliente ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-label font-medium">Cliente</h2>

          {clienteElegido && (
            <p className="rounded-[--radius-control] bg-surface px-3 py-2 text-label">
              Cliente ya registrado · {clienteElegido.ordersCount}{' '}
              {clienteElegido.ordersCount === 1 ? 'pedido' : 'pedidos'}{' '}
              <button
                type="button"
                onClick={() => setClienteElegido(null)}
                className="underline underline-offset-4"
              >
                Cambiar
              </button>
            </p>
          )}

          <div>
            <label htmlFor="nombre" className="mb-1.5 block text-label">
              Nombre
            </label>
            <input
              id="nombre"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setBusqueda(e.target.value);
              }}
              placeholder="María Quispe"
              className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />

            {sugerencias.length > 0 && !clienteElegido && (
              <ul className="mt-1 overflow-hidden rounded-[--radius-control] border border-line">
                {sugerencias.map((cliente) => (
                  <li key={cliente.id}>
                    <button
                      type="button"
                      onClick={() => elegirCliente(cliente)}
                      className="tap w-full border-b border-line bg-surface px-3 py-2 text-left text-label last:border-0"
                    >
                      {cliente.fullName}
                      <span className="text-muted">
                        {cliente.docNumber ? ` · ${cliente.docNumber}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor="telefono" className="mb-1.5 block text-label">
              Teléfono
            </label>
            <input
              id="telefono"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="987654321"
              className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-label">Documento</span>
            <div className="flex gap-2">
              <div className="flex gap-1">
                {TIPOS_DOC.map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setTipoDoc(tipo)}
                    aria-pressed={tipoDoc === tipo}
                    className={`tap rounded-[--radius-control] border px-3 text-label transition-colors ${
                      tipoDoc === tipo
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-line bg-surface'
                    }`}
                  >
                    {tipo}
                  </button>
                ))}
              </div>
              <input
                inputMode={tipoDoc === 'CE' ? 'text' : 'numeric'}
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder={tipoDoc === 'DNI' ? '70503353' : tipoDoc === 'RUC' ? '20512345678' : 'A12345678'}
                aria-invalid={Boolean(errorDoc)}
                className="tap w-full flex-1 rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
              />
            </div>
            {errorDoc && (
              <p role="alert" className="mt-1 text-caption text-status-sold">
                {errorDoc}.
              </p>
            )}
            <p className="mt-1 text-caption text-muted">Shalom lo exige para registrar el envío.</p>
          </div>
        </section>

        {/* ── Envío ───────────────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-label font-medium">Envío</h2>

          <SelectorAgencia
            etiqueta="Agencia de destino"
            valor={destino?.id ?? null}
            nombreValor={destino?.name ?? null}
            onCambio={setDestino}
          />

          <div>
            <span className="mb-2 block text-label">Tamaño del paquete</span>
            <div className="flex flex-wrap gap-2">
              {PACKAGE_TYPES.map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setPaquete(tipo)}
                  aria-pressed={paquete === tipo}
                  className={`tap rounded-full border px-4 text-label transition-colors ${
                    paquete === tipo ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                  }`}
                >
                  {tipo.replace('PAQUETE ', '')}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-caption text-muted">
              Shalom pesa y mide en la agencia; esto es lo que define la tarifa.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-label">Cantidad</span>
            <button
              type="button"
              onClick={() => setBultos((b) => Math.max(1, b - 1))}
              aria-label="Un bulto menos"
              className="tap rounded-[--radius-control] border border-line bg-surface px-4 text-title"
            >
              −
            </button>
            <output className="min-w-8 text-center text-title tabular-nums">{bultos}</output>
            <button
              type="button"
              onClick={() => setBultos((b) => b + 1)}
              aria-label="Un bulto más"
              className="tap rounded-[--radius-control] border border-line bg-surface px-4 text-title"
            >
              +
            </button>
          </div>

          <p className="text-caption text-muted">
            Origen: {origenNombre ?? 'sin configurar'}
          </p>
        </section>

        {error && (
          <p role="alert" className="text-label text-status-sold">
            {error}
          </p>
        )}

        {origenId === null && (
          <p className="rounded-[--radius-card] bg-status-sold/10 p-3 text-label">
            Configura tu agencia de origen en Ajustes › Envíos antes de crear pedidos.
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
            ? 'Creando…'
            : `Crear pedido${prendas.length > 1 ? ` · ${formatMoney(totalPrendas, { symbol: simbolo })}` : ''}`}
        </button>
      </footer>

      {/* ── Añadir prenda ─────────────────────────────────────────────── */}
      {buscandoPrenda && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Añadir prenda al pedido"
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
                {prendas.length} {prendas.length === 1 ? 'prenda en el pedido' : 'prendas en el pedido'}
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
                      {formatMoney(prenda.priceCents, { symbol: simbolo })}
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
