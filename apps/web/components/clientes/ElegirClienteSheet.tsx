'use client';

import { useEffect, useState } from 'react';

import { buscarClientes, type Cliente } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

export interface ClienteElegido {
  /** null cuando es un cliente nuevo: el que lo llama decide cómo crearlo. */
  clienteId: string | null;
  fullName: string;
  phone: string | null;
}

/**
 * Hoja para decir "¿quién compró/reservó esto?" — buscar entre los
 * clientes que ya existen o describir uno nuevo (solo nombre obligatorio,
 * el teléfono queda opcional para no trabar la venta).
 *
 * No toca la base de datos: solo junta nombre, teléfono y —si se eligió
 * uno ya existente— su id, y se lo entrega a quien la abrió. Así sirve
 * igual para vender que para reservar, sin saber nada de esas acciones.
 */
/**
 * NOTA para quien la use: pásale una `key` que cambie entre "cerrado" y
 * "abierto para tal prenda/cliente" (ver VentaRapida.tsx e ItemDetail.tsx).
 * Así React la remonta de cero cada vez que se abre y `sugerido` se
 * precarga solo, sin necesitar un efecto que reasigne el estado a mano.
 */
export function ElegirClienteSheet({
  abierto,
  onCerrar,
  onConfirmar,
  storeId,
  titulo = '¿Quién compró esto?',
  sugerido = null,
  guardando = false,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar: (cliente: ClienteElegido) => void;
  storeId: string;
  titulo?: string;
  sugerido?: ClienteElegido | null;
  guardando?: boolean;
}) {
  const [nombre, setNombre] = useState(sugerido?.fullName ?? '');
  const [telefono, setTelefono] = useState(sugerido?.phone ?? '');
  const [clienteId, setClienteId] = useState<string | null>(sugerido?.clienteId ?? null);
  const [sugerencias, setSugerencias] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);

  const puedeSugerir = abierto && !clienteId && nombre.trim().length >= 2;

  useEffect(() => {
    if (!puedeSugerir) return;

    let cancelado = false;
    const t = setTimeout(async () => {
      setBuscando(true);
      const encontrados = await buscarClientes(createClient(), storeId, nombre, 6);
      if (!cancelado) {
        setSugerencias(encontrados);
        setBuscando(false);
      }
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [nombre, puedeSugerir, storeId]);

  function elegir(cliente: Cliente) {
    setNombre(cliente.fullName);
    setTelefono(cliente.phone ?? '');
    setClienteId(cliente.id);
    setSugerencias([]);
  }

  function confirmar() {
    if (!nombre.trim() || guardando) return;
    onConfirmar({ clienteId, fullName: nombre.trim(), phone: telefono.trim() || null });
  }

  if (!abierto) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-[80] flex items-end">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/50" />

      <div className="relative w-full space-y-3 rounded-t-[--radius-sheet] bg-bg px-4 pb-safe pt-4">
        <h2 className="text-title">{titulo}</h2>

        <div className="relative">
          <label htmlFor="cliente-nombre" className="mb-1.5 block text-label">
            Nombre
          </label>
          <input
            id="cliente-nombre"
            autoFocus
            autoComplete="off"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setClienteId(null);
            }}
            placeholder="María Quispe"
            className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
          />

          {puedeSugerir && (buscando || sugerencias.length > 0) && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-[--radius-control] border border-line bg-bg shadow-lg">
              {buscando && sugerencias.length === 0 && (
                <li className="px-4 py-2.5 text-label text-muted">Buscando…</li>
              )}
              {sugerencias.map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    onClick={() => elegir(cliente)}
                    className="tap flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-2.5 text-left last:border-b-0"
                  >
                    <span className="font-medium">{cliente.fullName}</span>
                    <span className="text-caption text-muted">
                      {cliente.ordersCount > 0
                        ? `${cliente.ordersCount} ${cliente.ordersCount === 1 ? 'pedido' : 'pedidos'} antes`
                        : 'Cliente ya registrado'}
                      {cliente.phone ? ` · ${cliente.phone}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {clienteId && (
          <p className="rounded-[--radius-control] bg-accent/10 px-3 py-2 text-caption text-ink">
            🔁 Cliente ya registrado — se suma esto a su historial.
          </p>
        )}

        <div>
          <label htmlFor="cliente-telefono" className="mb-1.5 block text-label">
            Teléfono <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="cliente-telefono"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="987654321"
            className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
          />
        </div>

        <button
          type="button"
          onClick={confirmar}
          disabled={!nombre.trim() || guardando}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-semibold text-accent-ink disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}
