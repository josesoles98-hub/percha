'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildWhatsAppUrl, formatDateTime, formatMoney, type StoreSettings } from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import { cambiarEstadoPedido, type EstadoPedido, type Pedido } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

const ETIQUETA: Record<EstadoPedido, string> = {
  draft: '📝 Borrador',
  confirmed: '✅ Confirmado',
  packed: '📦 Empacado',
  shipped: '🚚 Enviado',
  delivered: '🏠 Entregado',
  cancelled: '✖️ Cancelado',
};

const SIGUIENTES: Record<EstadoPedido, EstadoPedido[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: ['draft'],
};

export function FichaPedido({ pedido, store }: { pedido: Pedido; store: StoreSettings }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [ocupado, setOcupado] = useState(false);

  const simbolo = store.currencySymbol;
  const dinero = (cents: number) => formatMoney(cents, { symbol: simbolo });

  async function cambiar(estado: EstadoPedido) {
    if (estado === 'cancelled' && !confirm('¿Cancelar el pedido? Las prendas vuelven al inventario.')) {
      return;
    }

    setOcupado(true);
    const { error } = await cambiarEstadoPedido(createClient(), pedido.id, estado);
    setOcupado(false);

    if (error) {
      mostrar('No se pudo cambiar el estado');
      return;
    }

    vibrar();
    mostrar(ETIQUETA[estado]);
    router.refresh();
  }

  /**
   * Aviso al cliente. El mensaje se arma con lo que ya sabemos del envío,
   * para no tener que escribirlo a mano cada vez.
   */
  function avisarPorWhatsApp() {
    const lineas = [
      `Hola ${pedido.customerName.split(' ')[0] ?? ''} 👋`,
      '',
      'Tu pedido ya está en camino.',
      pedido.envio?.destinyAgencyName ? `Agencia: Shalom ${pedido.envio.destinyAgencyName}` : null,
      pedido.envio?.trackingCode ? `Código: ${pedido.envio.trackingCode}` : null,
      '',
      `Total: ${dinero(pedido.totalCents)}`,
      '',
      `— ${store.name}`,
    ].filter((l): l is string => l !== null);

    const url = buildWhatsAppUrl(lineas.join('\n'), pedido.customer?.phone ?? undefined);
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-safe">
      <header className="flex items-center gap-3 py-3">
        <button onClick={() => router.back()} className="tap text-label text-muted">
          ‹ Atrás
        </button>
      </header>

      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-title">{pedido.code}</h1>
        <p className="text-display tabular-nums">{dinero(pedido.totalCents)}</p>
      </div>
      <p className="mt-1 text-label text-muted">
        {ETIQUETA[pedido.status]} · {formatDateTime(pedido.createdAt)}
      </p>

      {/* ── Cliente ─────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-[--radius-card] border border-line bg-surface p-4">
        <h2 className="text-caption font-medium uppercase tracking-wide text-muted">Cliente</h2>
        <p className="mt-1 font-medium">{pedido.customerName}</p>
        <p className="text-label text-muted">
          {pedido.customer?.docType} {pedido.customer?.docNumber ?? '— sin documento'}
        </p>
        {pedido.customer?.phone && (
          <p className="text-label text-muted">{pedido.customer.phone}</p>
        )}
      </section>

      {/* ── Prendas ─────────────────────────────────────────────────── */}
      <section className="mt-4">
        <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
          Prendas ({pedido.items.length})
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
          {pedido.items.map((linea) => (
            <li key={linea.itemId}>
              <Link href={`/prenda/${linea.code}`} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate">{linea.name ?? linea.code}</span>
                <span className="tabular-nums">{dinero(linea.priceCents)}</span>
                <span className="text-muted" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {pedido.shippingCents > 0 && (
          <p className="mt-2 flex justify-between text-label">
            <span className="text-muted">Envío</span>
            <span className="tabular-nums">{dinero(pedido.shippingCents)}</span>
          </p>
        )}
        {pedido.paidCents > 0 && (
          <p className="mt-1 flex justify-between text-label">
            <span className="text-muted">Adelanto</span>
            <span className="tabular-nums">{dinero(pedido.paidCents)}</span>
          </p>
        )}
      </section>

      {/* ── Envío ───────────────────────────────────────────────────── */}
      {pedido.envio && (
        <section className="mt-4 rounded-[--radius-card] border border-line bg-surface p-4">
          <h2 className="text-caption font-medium uppercase tracking-wide text-muted">Envío</h2>
          <p className="mt-1">
            {pedido.envio.originAgencyName} → <strong>{pedido.envio.destinyAgencyName}</strong>
          </p>
          <p className="text-label text-muted">
            {pedido.envio.packageType} · {pedido.envio.packagesCount}{' '}
            {pedido.envio.packagesCount === 1 ? 'bulto' : 'bultos'}
          </p>
          <p className="mt-1 text-label">
            {pedido.envio.status === 'pending' && '⏳ Pendiente de registrar en Shalom'}
            {pedido.envio.status === 'exported' && '📄 En un archivo generado, falta subirlo'}
            {pedido.envio.status === 'registered' && '✅ Registrado en Shalom'}
            {pedido.envio.status === 'in_transit' && '🚚 En tránsito'}
            {pedido.envio.status === 'delivered' && '🏠 Entregado'}
          </p>
          {pedido.envio.trackingCode && (
            <p className="mt-1 text-label">Código: {pedido.envio.trackingCode}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/pedidos/${pedido.code}/rotulo`}
              className="tap inline-flex rounded-[--radius-control] border border-line bg-bg px-4 py-2.5 text-label"
            >
              🏷️ Imprimir rótulo
            </Link>
            {pedido.envio.status === 'pending' && (
              <Link
                href="/envios"
                className="tap inline-flex rounded-[--radius-control] border border-line bg-bg px-4 py-2.5 text-label"
              >
                Ir a envíos
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ── Acciones ────────────────────────────────────────────────── */}
      <section className="mt-6 space-y-2">
        {SIGUIENTES[pedido.status].map((estado) => (
          <button
            key={estado}
            type="button"
            onClick={() => void cambiar(estado)}
            disabled={ocupado}
            className={`tap w-full rounded-[--radius-control] px-4 py-3 font-medium disabled:opacity-40 ${
              estado === 'cancelled'
                ? 'border border-line bg-surface text-status-sold'
                : 'bg-accent text-accent-ink'
            }`}
          >
            {estado === 'confirmed' && 'Confirmar pedido (marca las prendas vendidas)'}
            {estado === 'shipped' && 'Marcar como enviado'}
            {estado === 'delivered' && 'Marcar como entregado'}
            {estado === 'cancelled' && 'Cancelar pedido'}
            {estado === 'draft' && 'Reabrir pedido'}
          </button>
        ))}

        {pedido.customer?.phone && pedido.status !== 'draft' && pedido.status !== 'cancelled' && (
          <button
            type="button"
            onClick={avisarPorWhatsApp}
            className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 font-medium"
          >
            📤 Avisar al cliente por WhatsApp
          </button>
        )}
      </section>
    </div>
  );
}
