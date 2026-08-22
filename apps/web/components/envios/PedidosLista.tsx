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

  async function marcarTodosEnviados() {
    if (pedidos.length === 0) return;
    if (!confirm(`¿Marcar los ${pedidos.length} pedidos como enviados?`)) return;

    setEnviandoTodos(true);
    const supabase = createClient();
    const idsOk: string[] = [];

    for (const pedido of pedidos) {
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
      idsOk.length === pedidos.length
        ? `${idsOk.length} pedidos marcados como enviados`
        : `${idsOk.length} de ${pedidos.length} marcados — revisa el resto`,
    );
    router.refresh();
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
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => void marcarTodosEnviados()}
          disabled={enviandoTodos || pedidos.length === 0}
          className="tap rounded-[--radius-control] border border-line bg-surface px-3 py-2 text-label disabled:opacity-40"
        >
          {enviandoTodos ? 'Marcando…' : `🚚 Marcar todos como enviados (${pedidos.length})`}
        </button>
      </div>

      <ul className="space-y-2 pb-8">
        {pedidos.map((pedido) => {
        const empacado = Boolean(pedido.packedAt);
        const puedeEmpacar = pedido.status !== 'cancelled';

        return (
          <li key={pedido.id}>
            <div
              className={`flex items-start gap-2 rounded-[--radius-card] border border-line bg-surface p-4 ${
                empacado ? 'opacity-50' : ''
              }`}
            >
              <Link href={`/pedidos/${pedido.code}`} className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {pedido.code}
                    {empacado && (
                      <span className="ml-2 text-caption font-normal text-status-available">
                        📦 Empacado
                      </span>
                    )}
                  </p>
                  <p className="font-semibold tabular-nums">
                    {formatMoney(pedido.totalCents, { symbol: simbolo })}
                  </p>
                </div>
                <p className="mt-0.5 truncate text-label text-muted">{pedido.customerName}</p>
                <p className="mt-0.5 text-caption text-muted">
                  {ETIQUETA_ESTADO[pedido.status]} · {pedido.prendas}{' '}
                  {pedido.prendas === 1 ? 'prenda' : 'prendas'}
                  {pedido.destinyAgencyName ? ` · → ${pedido.destinyAgencyName}` : ''} ·{' '}
                  {formatShortDate(pedido.createdAt)}
                </p>
              </Link>

              {puedeEmpacar && (
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
              )}
            </div>
          </li>
        );
        })}
      </ul>
    </>
  );
}
