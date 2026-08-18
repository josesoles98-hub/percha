'use client';

import { useEffect, useState } from 'react';

import { buscarAgencias, type Agencia } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/client';

/**
 * Selector de agencia de Shalom.
 *
 * Solo ofrece agencias del catálogo oficial, así que es imposible elegir un
 * nombre que Shalom rechace — que es la causa número uno de errores en la
 * carga masiva. La búsqueda va contra `search_key`, que está sin tildes, de
 * modo que «jaen» encuentra «JAÉN».
 */
export function SelectorAgencia({
  valor,
  nombreValor,
  onCambio,
  soloDestino = true,
  etiqueta = 'Agencia',
}: {
  valor: number | null;
  nombreValor: string | null;
  onCambio: (agencia: Agencia | null) => void;
  soloDestino?: boolean;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<Agencia[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!abierto) return;

    let cancelado = false;
    const t = setTimeout(async () => {
      setBuscando(true);
      const supabase = createClient();
      const encontradas = await buscarAgencias(supabase, termino);
      if (!cancelado) {
        setResultados(encontradas);
        setBuscando(false);
      }
    }, 200);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [abierto, termino, soloDestino]);

  return (
    <div>
      <span className="mb-2 block text-label font-medium">{etiqueta}</span>

      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="tap flex w-full items-center justify-between rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-left"
      >
        <span className={nombreValor ? '' : 'text-muted'}>
          {nombreValor ?? 'Buscar agencia…'}
        </span>
        <span className="text-muted" aria-hidden>
          ▾
        </span>
      </button>

      {abierto && (
        <div role="dialog" aria-modal="true" aria-label="Elegir agencia" className="fixed inset-0 z-[75] flex items-end">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setAbierto(false)}
            className="absolute inset-0 bg-black/50"
          />

          <div className="relative flex max-h-[85dvh] w-full flex-col rounded-t-[--radius-sheet] bg-bg pb-safe pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />

            <div className="px-4">
              <input
                autoFocus
                type="search"
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                placeholder="Escribe el nombre de la agencia"
                aria-label="Buscar agencia"
                className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
              />
              <p className="mt-2 text-caption text-muted">
                Solo aparecen las agencias que acepta Shalom.
              </p>
            </div>

            <ul className="mt-2 flex-1 overflow-y-auto px-4 pb-4">
              {valor !== null && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onCambio(null);
                      setAbierto(false);
                    }}
                    className="tap w-full border-b border-line py-3 text-left text-label text-muted"
                  >
                    Quitar agencia
                  </button>
                </li>
              )}

              {buscando && resultados.length === 0 && (
                <li className="py-3 text-label text-muted">Buscando…</li>
              )}

              {!buscando && resultados.length === 0 && (
                <li className="py-3 text-label text-muted">
                  Ninguna agencia coincide con «{termino}».
                </li>
              )}

              {resultados.map((agencia) => (
                <li key={agencia.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onCambio(agencia);
                      setAbierto(false);
                    }}
                    className={`tap w-full border-b border-line py-3 text-left ${
                      agencia.id === valor ? 'font-semibold' : ''
                    }`}
                  >
                    {agencia.name}
                    {agencia.id === valor && <span aria-hidden> ✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
