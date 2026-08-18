'use client';

import { useState } from 'react';
import { BOM_UTF8, inventarioACsv, nombreArchivoCsv, type StoreSettings } from '@percha/core';

import { useToast } from '@/components/Toast';
import { listarPrendas } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/client';

const POR_PAGINA = 500;

/**
 * Descarga del inventario completo.
 *
 * Es la salida de emergencia del producto: que puedas irte con tus datos
 * cuando quieras, sin depender de que este proyecto siga vivo ni de que
 * Supabase exista.
 */
export function ExportarCsv({ storeId, store }: { storeId: string; store: StoreSettings }) {
  const { mostrar } = useToast();
  const [exportando, setExportando] = useState(false);
  const [progreso, setProgreso] = useState(0);

  async function exportar() {
    setExportando(true);
    setProgreso(0);

    try {
      const supabase = createClient();
      const todas = [];

      // Se pagina en bloques: con miles de prendas, pedirlas de una vez
      // agota la memoria del móvil y Supabase corta la respuesta.
      let cursor: string | null = null;
      do {
        const pagina = await listarPrendas(supabase, {
          storeId,
          cursor,
          limit: POR_PAGINA,
          filtros: { status: 'all' },
        });

        todas.push(...pagina.items);
        setProgreso(todas.length);
        cursor = pagina.nextCursor;
      } while (cursor);

      if (todas.length === 0) {
        mostrar('No hay prendas que exportar');
        return;
      }

      const csv = BOM_UTF8 + inventarioACsv(todas, store);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreArchivoCsv(store.name);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      // Con retraso: en Safari, revocarla al instante cancela la descarga.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      mostrar(`${todas.length} prendas exportadas`);
    } catch (error) {
      mostrar(error instanceof Error ? error.message : 'No se pudo exportar');
    } finally {
      setExportando(false);
      setProgreso(0);
    }
  }

  return (
    <div className="rounded-[--radius-card] border border-line bg-surface p-4">
      <p className="font-medium">Exportar inventario</p>
      <p className="mt-0.5 text-label text-muted">
        Un archivo CSV con todas tus prendas, que abre en Excel o en Google Sheets.
      </p>

      <button
        type="button"
        onClick={() => void exportar()}
        disabled={exportando}
        className="tap mt-3 w-full rounded-[--radius-control] border border-line bg-bg px-4 py-3 font-medium disabled:opacity-40"
      >
        {exportando
          ? progreso > 0
            ? `Preparando… ${progreso} prendas`
            : 'Preparando…'
          : '⬇️ Descargar CSV'}
      </button>
    </div>
  );
}
