'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatMoney, type StoreSettings } from '@percha/core';

import { ElegirClienteSheet, type ClienteElegido } from '@/components/clientes/ElegirClienteSheet';
import { PrendaThumb } from '@/components/PrendaThumb';
import { useToast, vibrar } from '@/components/Toast';
import { cambiarEstado } from '@/lib/data/mutations';
import { buscarOCrearCliente, buscarPrendasParaVender, type PrendaParaVender } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

/**
 * Lo que pasa después de cerrar una venta por WhatsApp: hay que decirle a
 * la app si la prenda se vendió o se separó, y eso significaba entrar a su
 * ficha completa cada vez. Acá es: buscar (nombre, código o marca) y tocar
 * un botón — sin ficha, sin diálogo largo. "Vendida" pide el cliente (para
 * que el historial se vaya armando solo) y se aplica con Deshacer;
 * "Reservar" abre el flujo de reserva ya existente.
 */
export function VentaRapida({ storeId, store }: { storeId: string; store: StoreSettings }) {
  const router = useRouter();
  const { mostrar } = useToast();

  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<PrendaParaVender[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [vendidas, setVendidas] = useState<Set<string>>(new Set());

  const [prendaEligiendoCliente, setPrendaEligiendoCliente] = useState<PrendaParaVender | null>(null);
  const [confirmandoVenta, setConfirmandoVenta] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const t = setTimeout(async () => {
      setBuscando(true);
      const encontradas = await buscarPrendasParaVender(createClient(), storeId, termino);
      if (!cancelado) {
        setResultados(encontradas);
        setBuscando(false);
      }
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termino, storeId]);

  async function confirmarVenta(cliente: ClienteElegido) {
    const prenda = prendaEligiendoCliente;
    if (!prenda) return;

    setConfirmandoVenta(true);
    const supabase = createClient();

    // Si ya se eligió un cliente existente no hace falta buscarlo de nuevo.
    let clienteId = cliente.clienteId;
    if (!clienteId) {
      const { data, error } = await buscarOCrearCliente(supabase, storeId, {
        fullName: cliente.fullName,
        phone: cliente.phone,
      });
      if (!data) {
        setConfirmandoVenta(false);
        mostrar(error ?? 'No se pudo guardar el cliente');
        return;
      }
      clienteId = data.id;
    }

    setConfirmandoVenta(false);
    setPrendaEligiendoCliente(null);

    // Optimista: desaparece de la lista al toque, para seguir con la
    // siguiente venta sin esperar a la red.
    setVendidas((previas) => new Set(previas).add(prenda.id));
    vibrar();

    const { error: errorVenta } = await cambiarEstado(supabase, prenda.id, 'sold', { customerId: clienteId });

    if (errorVenta) {
      setVendidas((previas) => {
        const siguiente = new Set(previas);
        siguiente.delete(prenda.id);
        return siguiente;
      });
      mostrar('No se pudo marcar vendida');
      return;
    }

    mostrar(`${prenda.name ?? prenda.code} vendida a ${cliente.fullName} ✅`, async () => {
      // Deshacer debe devolverla a como estaba, no siempre a 'available':
      // si era una reserva, la reserva vuelve con su nombre, adelanto y cliente.
      await cambiarEstado(supabase, prenda.id, prenda.status, {
        reservedForName: prenda.reservedForName ?? undefined,
        reservedForPhone: prenda.reservedForPhone ?? undefined,
        reservedDepositCents: prenda.reservedDepositCents,
        customerId: prenda.customerId,
      });
      router.refresh();
    });

    router.refresh();
  }

  function irAReservar(prenda: PrendaParaVender) {
    // Reusa el flujo de reservar ya existente: ahí mismo reconoce si el
    // cliente ya tiene algo apartado y sugiere su nombre y teléfono.
    router.push(`/reservar/nuevo?prenda=${prenda.code}`);
  }

  const visibles = resultados.filter((p) => !vendidas.has(p.id));

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-8 pt-safe">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-bg/95 py-3 pt-safe backdrop-blur">
        <button type="button" onClick={() => router.back()} className="tap text-label text-muted">
          ‹ Atrás
        </button>
        <h1 className="text-label font-semibold">Venta rápida</h1>
      </header>

      <input
        autoFocus
        type="search"
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        placeholder="Busca por nombre, código o marca"
        aria-label="Buscar prenda para marcar vendida o separada"
        className="tap mt-2 w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
      />
      <p className="mt-2 text-caption text-muted">
        Encuentra la prenda y toca «Vendida» o «Reservar» — nada más.
      </p>

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
        {visibles.map((prenda) => (
          <li key={prenda.id} className="flex items-center gap-3 px-3 py-3">
            <PrendaThumb url={prenda.photoUrl} alt={prenda.name ?? prenda.code} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{prenda.name ?? prenda.code}</p>
              <p className="text-caption text-muted">
                {formatMoney(prenda.priceCents, { symbol: store.currencySymbol })}
                {prenda.sizeLabel ? ` · Talla ${prenda.sizeLabel}` : ''}
              </p>
              {prenda.status === 'reserved' && (
                <p className="text-caption text-status-reserved">
                  Reservada{prenda.reservedForName ? ` para ${prenda.reservedForName}` : ''}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setPrendaEligiendoCliente(prenda)}
                className="tap rounded-[--radius-control] bg-accent px-3 py-1.5 text-caption font-semibold text-accent-ink"
              >
                Vendida
              </button>
              {prenda.status === 'available' && (
                <button
                  type="button"
                  onClick={() => irAReservar(prenda)}
                  className="tap rounded-[--radius-control] border border-line bg-bg px-3 py-1.5 text-caption font-medium"
                >
                  Reservar
                </button>
              )}
            </div>
          </li>
        ))}

        {!buscando && visibles.length === 0 && (
          <li className="p-4 text-center text-label text-muted">
            {termino.trim()
              ? `Ninguna prenda disponible coincide con «${termino}».`
              : 'Escribe para buscar entre tus prendas disponibles y reservadas.'}
          </li>
        )}
      </ul>

      <ElegirClienteSheet
        key={prendaEligiendoCliente?.id ?? 'sheet-cerrado'}
        abierto={prendaEligiendoCliente !== null}
        onCerrar={() => setPrendaEligiendoCliente(null)}
        onConfirmar={(cliente) => void confirmarVenta(cliente)}
        storeId={storeId}
        titulo={`¿Quién compró "${prendaEligiendoCliente?.name ?? prendaEligiendoCliente?.code ?? ''}"?`}
        guardando={confirmandoVenta}
        sugerido={
          prendaEligiendoCliente?.status === 'reserved'
            ? {
                clienteId: prendaEligiendoCliente.customerId,
                fullName: prendaEligiendoCliente.reservedForName ?? '',
                phone: prendaEligiendoCliente.reservedForPhone,
              }
            : null
        }
      />
    </div>
  );
}
