'use client';

import { useState } from 'react';

import { useToast } from '@/components/Toast';
import { buscarEnviosPorDocumento, type EnvioPorDocumento } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

/** Saca todos los números de 7 a 12 dígitos del texto pegado (DNI, RUC, CE). */
function extraerDocumentos(texto: string): string[] {
  return texto.match(/\d{7,12}/g) ?? [];
}

/**
 * Pega los errores que devuelve Shalom ("documento X no está registrado")
 * y salen todos esos pedidos juntos, con nombre, teléfono, agencia y tipo
 * de paquete — para registrarlos a mano sin buscarlos uno por uno.
 */
export function BuscarPorDni({ storeId }: { storeId: string }) {
  const { mostrar } = useToast();
  const [texto, setTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<{
    encontrados: EnvioPorDocumento[];
    sinResultado: string[];
  } | null>(null);

  async function buscar() {
    const docs = extraerDocumentos(texto);
    if (docs.length === 0) {
      mostrar('No encontré ningún documento en ese texto');
      return;
    }

    setBuscando(true);
    try {
      const res = await buscarEnviosPorDocumento(createClient(), storeId, docs);
      setResultado(res);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        placeholder="Pega aquí los DNI o el mensaje de error de Shalom tal cual…"
        className="w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-label outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={() => void buscar()}
        disabled={buscando || texto.trim() === ''}
        className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
      >
        {buscando ? 'Buscando…' : '🔍 Buscar estos pedidos'}
      </button>

      {resultado && (
        <div className="space-y-2">
          {resultado.encontrados.length === 0 ? (
            <p className="text-label text-muted">Ninguno de esos documentos tiene un pedido acá.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
              {resultado.encontrados.map((e) => (
                <li key={`${e.orderCode}-${e.docNumber}`} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">{e.customerName || 'Sin nombre'}</p>
                    <span className="shrink-0 text-caption text-muted">{e.orderCode}</span>
                  </div>
                  <p className="text-label text-muted">
                    {e.docType} {e.docNumber}
                    {e.phone ? ` · ${e.phone}` : ''}
                  </p>
                  <p className="text-label text-muted">
                    → {e.destinyAgency ?? 'sin destino'} · {e.packageType}
                    {e.packagesCount > 1 ? ` · ${e.packagesCount} paquetes` : ''}
                  </p>
                  {e.yaRegistrado && (
                    <p className="mt-0.5 text-caption text-status-available">
                      ✅ Este envío ya figura como registrado
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {resultado.sinResultado.length > 0 && (
            <p className="text-caption text-muted">
              Sin pedido acá: {resultado.sinResultado.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
