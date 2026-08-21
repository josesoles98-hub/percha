'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatMoney, formatShortDate } from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import { cambiarEstadoPedido, type EstadoPedido, type PedidoResumen } from '@/lib/data/orders';
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
 * entrar a cada ficha — solo tiene sentido entre confirmado y empacado,
 * los dos estados de antes de despachar.
 */
export function PedidosLista({
  pedidos: pedidosIniciales,
  simbolo,
}: {
  pedidos: PedidoResumen[];
  simbolo: string;
}) {
  const { mostrar } = useToast();
  const [pedidos, setPedidos] = useState(pedidosIniciales);

  async function alternarEmpacado(pedido: PedidoResumen) {
    const yaEmpacado = pedido.status === 'packed';
    const nuevoEstado: EstadoPedido = yaEmpacado ? 'confirmed' : 'packed';

    // Optimista: no tiene sentido esperar al servidor para un tache.
    setPedidos((previos) =>
      previos.map((p) => (p.id === pedido.id ? { ...p, status: nuevoEstado } : p)),
    );
    vibrar();

    const { error } = await cambiarEstadoPedido(createClient(), pedido.id, nuevoEstado);
    if (error) {
      mostrar('No se pudo actualizar');
      setPedidos((previos) =>
        previos.map((p) => (p.id === pedido.id ? { ...p, status: pedido.status } : p)),
      );
    }
  }

  return (
    <ul className="space-y-2 pb-8">
      {pedidos.map((pedido) => {
        const puedeEmpacar = pedido.status === 'confirmed' || pedido.status === 'packed';

        return (
          <li key={pedido.id}>
            <div
              className={`flex items-start gap-2 rounded-[--radius-card] border border-line bg-surface p-4 ${
                pedido.status === 'packed' ? 'opacity-50' : ''
              }`}
            >
              <Link href={`/pedidos/${pedido.code}`} className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{pedido.code}</p>
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
                  aria-label={pedido.status === 'packed' ? 'Desmarcar como empacado' : 'Marcar como empacado'}
                  className={`tap flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-label ${
                    pedido.status === 'packed'
                      ? 'border-status-available bg-status-available text-white'
                      : 'border-line bg-bg text-muted'
                  }`}
                >
                  {pedido.status === 'packed' ? '✓' : '📦'}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
