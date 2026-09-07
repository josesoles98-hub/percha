'use client';

import { useState } from 'react';
import {
  BOM_UTF8,
  gananciasACsv,
  nombreArchivoCsvGanancias,
  nombreArchivoCsvPrendasVendidas,
  prendasVendidasACsv,
  type StoreSettings,
} from '@percha/core';

import { useToast } from '@/components/Toast';
import { agruparPorDia, listarGastos, listarPrendasVendidas } from '@/lib/data/finanzas';
import { createClient } from '@/lib/supabase/client';

const DIAS_HISTORIAL = 31;

function descargar(contenido: string, nombreArchivo: string) {
  const blob = new Blob([BOM_UTF8 + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Con retraso: en Safari, revocarla al instante cancela la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Bajar las ganancias en CSV — para un banco, una mentoría o un contador
 * que pida ver los números, no solo mirarlos en pantalla. Mismos últimos
 * 31 días que ya se ven en /ganancias.
 */
export function DescargarGanancias({ storeId, store }: { storeId: string; store: StoreSettings }) {
  const { mostrar } = useToast();
  const [descargandoResumen, setDescargandoResumen] = useState(false);
  const [descargandoPrendas, setDescargandoPrendas] = useState(false);

  async function descargarResumen() {
    setDescargandoResumen(true);
    try {
      const desde = new Date();
      desde.setDate(desde.getDate() - DIAS_HISTORIAL);
      const supabase = createClient();

      const [prendas, gastos] = await Promise.all([
        listarPrendasVendidas(supabase, storeId, desde),
        listarGastos(supabase, storeId, desde),
      ]);
      const dias = agruparPorDia(prendas, gastos, DIAS_HISTORIAL, store.timezone);

      descargar(gananciasACsv(dias, store), nombreArchivoCsvGanancias(store.name));
      mostrar(`Descargado: últimos ${DIAS_HISTORIAL} días`);
    } finally {
      setDescargandoResumen(false);
    }
  }

  async function descargarPrendas() {
    setDescargandoPrendas(true);
    try {
      const desde = new Date();
      desde.setDate(desde.getDate() - DIAS_HISTORIAL);
      const supabase = createClient();
      const prendas = await listarPrendasVendidas(supabase, storeId, desde);

      if (prendas.length === 0) {
        mostrar('No hay prendas vendidas que descargar');
        return;
      }

      descargar(
        prendasVendidasACsv(
          prendas.map((p) => ({
            code: p.code,
            name: p.name,
            fecha: p.soldAt,
            soldPriceCents: p.soldPriceCents,
            costCents: p.costCents,
            marginCents: p.marginCents,
          })),
          store,
        ),
        nombreArchivoCsvPrendasVendidas(store.name),
      );
      mostrar(`${prendas.length} prendas descargadas`);
    } finally {
      setDescargandoPrendas(false);
    }
  }

  return (
    <section className="mt-6 pb-4">
      <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
        Descargar (para tu mentoría, banco o contador)
      </h2>
      <div className="flex flex-col gap-2 rounded-[--radius-card] border border-line bg-surface p-4">
        <button
          type="button"
          onClick={() => void descargarResumen()}
          disabled={descargandoResumen}
          className="tap w-full rounded-[--radius-control] border border-line bg-bg px-4 py-3 font-medium disabled:opacity-40"
        >
          {descargandoResumen ? 'Preparando…' : `⬇️ Resumen por día (últimos ${DIAS_HISTORIAL} días)`}
        </button>
        <button
          type="button"
          onClick={() => void descargarPrendas()}
          disabled={descargandoPrendas}
          className="tap w-full rounded-[--radius-control] border border-line bg-bg px-4 py-3 font-medium disabled:opacity-40"
        >
          {descargandoPrendas ? 'Preparando…' : '⬇️ Detalle de prendas vendidas'}
        </button>
        <p className="text-caption text-muted">Archivos CSV, abren directo en Excel o Google Sheets.</p>
      </div>
    </section>
  );
}
