'use client';

import { useState } from 'react';
import {
  BOM_UTF8,
  nombreArchivoCsvPedidos,
  pedidosACsv,
  type StoreSettings,
} from '@percha/core';

import { useToast } from '@/components/Toast';
import { listarTodosLosPedidos, type EstadoPedido } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

const ETIQUETA: Record<EstadoPedido, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmado',
  packed: 'Empacado',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

/** Descarga de todos los pedidos, igual que ExportarCsv para el inventario. */
export function ExportarPedidosCsv({ storeId, store }: { storeId: string; store: StoreSettings }) {
  const { mostrar } = useToast();
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    setExportando(true);

    try {
      const supabase = createClient();
      const pedidos = await listarTodosLosPedidos(supabase, storeId);

      if (pedidos.length === 0) {
        mostrar('No hay pedidos que descargar');
        return;
      }

      const csv =
        BOM_UTF8 +
        pedidosACsv(
          pedidos.map((p) => ({
            code: p.code,
            statusLabel: ETIQUETA[p.status],
            customerName: p.customerName,
            prendas: p.prendas,
            totalCents: p.totalCents,
            destinyAgencyName: p.destinyAgencyName,
            createdAt: p.createdAt,
          })),
          store,
        );

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreArchivoCsvPedidos(store.name);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      // Con retraso: en Safari, revocarla al instante cancela la descarga.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      mostrar(`${pedidos.length} pedidos exportados`);
    } catch {
      mostrar('No se pudo descargar');
    } finally {
      setExportando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void exportar()}
      disabled={exportando}
      className="tap text-label underline underline-offset-4 disabled:opacity-40"
    >
      {exportando ? 'Descargando…' : '⬇️ Descargar'}
    </button>
  );
}
