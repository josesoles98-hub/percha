'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatMoney, formatShortDate } from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import {
  cambiarEstadoPedido,
  desmarcarEmpacado,
  marcarEmpacado,
  type EstadoPedido,
  type PedidoResumen,
} from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  draft: '📝 Borrador',
  confirmed: '✅ Confirmado',
  packed: '📦 Empacado',
  shipped: '🚚 Enviado',
  delivered: '🏠 Entregado',
  cancelled: '✖️ Cancelado',
};

/**
 * Lista de pedidos, con un botón para marcar/desmarcar "Empacado" sin
 * entrar a cada ficha. Es un tache aparte del status real del pedido (ver
 * migración 0015): la mayoría de los pedidos quedan en 'draft' —los que
 * registran los clientes solos— así que atarlo al status real los habría
 * dejado sin este botón.
 *
 * "Seleccionar varios" existe porque marcar de a uno un día con muchos
 * pedidos (empacar 15 de una sentada) se sentía lento: se eligen varios
 * primero y se aplica la acción una sola vez, en vez de tocar el círculo
 * pedido por pedido.
 */
export function PedidosLista({
  pedidos: pedidosIniciales,
  simbolo,
}: {
  pedidos: PedidoResumen[];
  simbolo: string;
}) {
  const { mostrar } = useToast();
  const router = useRouter();
  const [pedidos, setPedidos] = useState(pedidosIniciales);
  const [enviandoTodos, setEnviandoTodos] = useState(false);

  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);

  function salirDeSeleccion() {
    setModoSeleccion(false);
    setSeleccionados(new Set());
  }

  function alternarSeleccion(id: string) {
    setSeleccionados((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  async function marcarTodosEnviados() {
    if (pedidos.length === 0) return;
    if (!confirm(`¿Marcar los ${pedidos.length} pedidos como enviados?`)) return;
    await marcarComoEnviados(pedidos);
  }

  async function marcarComoEnviados(objetivo: PedidoResumen[]) {
    setEnviandoTodos(true);
    const supabase = createClient();
    const idsOk: string[] = [];

    for (const pedido of objetivo) {
      // Un pedido en borrador tiene que pasar por "confirmado" primero:
      // ese paso es el que marca la prenda como vendida. Saltarlo directo
      // a "enviado" dejaría el inventario descuadrado.
      if (pedido.status === 'draft') {
        const { error } = await cambiarEstadoPedido(supabase, pedido.id, 'confirmed');
        if (error) continue;
      }
      const { error } = await cambiarEstadoPedido(supabase, pedido.id, 'shipped');
      if (!error) idsOk.push(pedido.id);
    }

    setPedidos((previos) => previos.filter((p) => !idsOk.includes(p.id)));
    setEnviandoTodos(false);
    vibrar();
    mostrar(
      idsOk.length === objetivo.length
        ? `${idsOk.length} pedidos marcados como enviados`
        : `${idsOk.length} de ${objetivo.length} marcados — revisa el resto`,
    );
    router.refresh();
  }

  async function marcarSeleccionadosEmpacados() {
    const objetivo = pedidos.filter((p) => seleccionados.has(p.id) && p.status !== 'cancelled');
    if (objetivo.length === 0) return salirDeSeleccion();

    setAplicando(true);
    const ahora = new Date().toISOString();
    setPedidos((previos) =>
      previos.map((p) => (seleccionados.has(p.id) ? { ...p, packedAt: ahora } : p)),
    );

    const supabase = createClient();
    const resultados = await Promise.all(objetivo.map((p) => marcarEmpacado(supabase, p.id)));
    const fallidos = resultados.filter((r) => r.error).length;

    setAplicando(false);
    vibrar();
    mostrar(
      fallidos === 0
        ? `${objetivo.length} pedidos marcados como empacados`
        : `${objetivo.length - fallidos} de ${objetivo.length} marcados — revisa el resto`,
    );
    salirDeSeleccion();
    router.refresh();
  }

  async function marcarSeleccionadosEnviados() {
    const objetivo = pedidos.filter((p) => seleccionados.has(p.id) && p.status !== 'cancelled');
    if (objetivo.length === 0) return salirDeSeleccion();
    await marcarComoEnviados(objetivo);
    salirDeSeleccion();
  }

  async function alternarEmpacado(pedido: PedidoResumen) {
    const yaEmpacado = Boolean(pedido.packedAt);

    // Optimista: no tiene sentido esperar al servidor para un tache.
    setPedidos((previos) =>
      previos.map((p) =>
        p.id === pedido.id ? { ...p, packedAt: yaEmpacado ? null : new Date().toISOString() } : p,
      ),
    );
    vibrar();

    const supabase = createClient();
    const { error } = yaEmpacado
      ? await desmarcarEmpacado(supabase, pedido.id)
      : await marcarEmpacado(supabase, pedido.id);

    if (error) {
      mostrar('No se pudo actualizar');
      setPedidos((previos) =>
        previos.map((p) => (p.id === pedido.id ? { ...p, packedAt: pedido.packedAt } : p)),
      );
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        {modoSeleccion ? (
          <p className="text-label text-muted">
            {seleccionados.size} {seleccionados.size === 1 ? 'seleccionado' : 'seleccionados'}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setModoSeleccion(true)}
            disabled={pedidos.length === 0}
            className="tap text-label underline underline-offset-4 disabled:opacity-40"
          >
            Seleccionar varios
          </button>
        )}

        {!modoSeleccion && (
          <button
            type="button"
            onClick={() => void marcarTodosEnviados()}
            disabled={enviandoTodos || pedidos.length === 0}
            className="tap rounded-[--radius-control] border border-line bg-surface px-3 py-2 text-label disabled:opacity-40"
          >
            {enviandoTodos ? 'Marcando…' : `🚚 Marcar todos como enviados (${pedidos.length})`}
          </button>
        )}
      </div>

      <ul className="space-y-2 pb-24">
        {pedidos.map((pedido) => {
        const empacado = Boolean(pedido.packedAt);
        const puedeEmpacar = pedido.status !== 'cancelled';
        const marcado = seleccionados.has(pedido.id);

        return (
          <li key={pedido.id}>
            <div
              className={`flex items-start gap-2 rounded-[--radius-card] border p-4 ${
                marcado ? 'border-accent bg-accent/10' : 'border-line bg-surface'
              } ${empacado && !modoSeleccion ? 'opacity-50' : ''}`}
            >
              {modoSeleccion ? (
                <button
                  type="button"
                  onClick={() => alternarSeleccion(pedido.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <FilaPedido pedido={pedido} simbolo={simbolo} empacado={empacado} />
                </button>
              ) : (
                <Link href={`/pedidos/${pedido.code}`} className="min-w-0 flex-1">
                  <FilaPedido pedido={pedido} simbolo={simbolo} empacado={empacado} />
                </Link>
              )}

              {modoSeleccion ? (
                <span
                  aria-hidden
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-label ${
                    marcado ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-bg'
                  }`}
                >
                  {marcado ? '✓' : ''}
                </span>
              ) : (
                puedeEmpacar && (
                  <button
                    type="button"
                    onClick={() => void alternarEmpacado(pedido)}
                    aria-label={empacado ? 'Desmarcar como empacado' : 'Marcar como empacado'}
                    className={`tap flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-label ${
                      empacado
                        ? 'border-status-available bg-status-available text-white'
                        : 'border-line bg-bg text-muted'
                    }`}
                  >
                    {empacado ? '✓' : '📦'}
                  </button>
                )
              )}
            </div>
          </li>
        );
        })}
      </ul>

      {modoSeleccion && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 py-3 pb-safe backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2">
            <button
              type="button"
              onClick={salirDeSeleccion}
              className="tap rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-label"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void marcarSeleccionadosEmpacados()}
              disabled={aplicando || seleccionados.size === 0}
              className="tap flex-1 rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-label font-medium disabled:opacity-40"
            >
              📦 Empacados
            </button>
            <button
              type="button"
              onClick={() => void marcarSeleccionadosEnviados()}
              disabled={aplicando || seleccionados.size === 0}
              className="tap flex-1 rounded-[--radius-control] bg-accent px-4 py-3 text-label font-medium text-accent-ink disabled:opacity-40"
            >
              🚚 Enviados
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function FilaPedido({
  pedido,
  simbolo,
  empacado,
}: {
  pedido: PedidoResumen;
  simbolo: string;
  empacado: boolean;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">
          {pedido.code}
          {empacado && (
            <span className="ml-2 text-caption font-normal text-status-available">📦 Empacado</span>
          )}
        </p>
        <p className="font-semibold tabular-nums">{formatMoney(pedido.totalCents, { symbol: simbolo })}</p>
      </div>
      <p className="mt-0.5 truncate text-label text-muted">{pedido.customerName}</p>
      <p className="mt-0.5 text-caption text-muted">
        {ETIQUETA_ESTADO[pedido.status]} · {pedido.prendas} {pedido.prendas === 1 ? 'prenda' : 'prendas'}
        {pedido.destinyAgencyName ? ` · → ${pedido.destinyAgencyName}` : ''} ·{' '}
        {formatShortDate(pedido.createdAt)}
      </p>
    </>
  );
}
