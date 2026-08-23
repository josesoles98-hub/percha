'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast, vibrar } from '@/components/Toast';
import { importarTrackingPorDni } from '@/lib/data/orders';
import { formatearCodigoSeguimiento, leerBoletaShalom } from '@/lib/shipping/leer-boleta';
import { createClient } from '@/lib/supabase/client';

interface Resultado {
  archivo: string;
  ok: boolean;
  detalle: string;
}

/**
 * Sube varias boletas de Shalom (PDF) de una sola vez. Cada una se lee
 * sola —DNI, número de orden y código— y se guarda en el pedido que le
 * corresponde por DNI, sin tener que abrir boleta por boleta para
 * reconocer de quién es.
 */
export function ImportarBoletas({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 });
  const [resultados, setResultados] = useState<Resultado[]>([]);

  async function procesarArchivos(archivos: FileList) {
    const lista = Array.from(archivos);
    setProcesando(true);
    setResultados([]);
    setProgreso({ hecho: 0, total: lista.length });

    const supabase = createClient();
    const nuevos: Resultado[] = [];

    for (const archivo of lista) {
      try {
        const datos = await leerBoletaShalom(archivo);
        const codigo = formatearCodigoSeguimiento(datos);

        if (!datos.dni || !codigo) {
          nuevos.push({
            archivo: archivo.name,
            ok: false,
            detalle: 'No se pudo leer el DNI o el código en este PDF',
          });
        } else {
          const resultado = await importarTrackingPorDni(supabase, storeId, datos.dni, codigo);
          nuevos.push({
            archivo: archivo.name,
            ok: resultado.ok,
            detalle: resultado.ok
              ? `${resultado.orderCode} · ${resultado.customerName}`
              : (resultado.motivo ?? 'No se pudo emparejar'),
          });
        }
      } catch {
        nuevos.push({ archivo: archivo.name, ok: false, detalle: 'No se pudo leer el archivo' });
      }

      setProgreso((p) => ({ ...p, hecho: p.hecho + 1 }));
    }

    setResultados(nuevos);
    setProcesando(false);
    vibrar();
    const exitosos = nuevos.filter((r) => r.ok).length;
    mostrar(`${exitosos} de ${nuevos.length} boletas emparejadas`);
    router.refresh();
  }

  return (
    <div>
      <label className="tap flex cursor-pointer items-center justify-center gap-2 rounded-[--radius-control] border border-dashed border-line bg-surface px-4 py-3.5 font-medium">
        {procesando ? `Leyendo ${progreso.hecho}/${progreso.total}…` : '📄 Subir boletas (PDF)'}
        <input
          type="file"
          accept="application/pdf"
          multiple
          disabled={procesando}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void procesarArchivos(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {resultados.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {resultados.map((r, indice) => (
            <li
              key={indice}
              className={`rounded-[--radius-control] border p-2.5 text-label ${
                r.ok ? 'border-line bg-surface' : 'border-status-sold/40 bg-status-sold/10'
              }`}
            >
              <span aria-hidden>{r.ok ? '✅' : '⚠️'}</span> <strong>{r.archivo}</strong>
              <br />
              <span className="text-muted">{r.detalle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
