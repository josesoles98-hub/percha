'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { StoreSettings } from '@percha/core';

import { useToast } from '@/components/Toast';
import { actualizarTienda } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/client';

const MONEDAS = [
  { currency: 'PEN', symbol: 'S/', nombre: 'Sol peruano' },
  { currency: 'USD', symbol: '$', nombre: 'Dólar' },
  { currency: 'MXN', symbol: '$', nombre: 'Peso mexicano' },
  { currency: 'COP', symbol: '$', nombre: 'Peso colombiano' },
  { currency: 'CLP', symbol: '$', nombre: 'Peso chileno' },
  { currency: 'ARS', symbol: '$', nombre: 'Peso argentino' },
] as const;

export function TiendaForm({
  store,
  puedeEditar,
}: {
  store: StoreSettings;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { mostrar } = useToast();

  const [nombre, setNombre] = useState(store.name);
  const [moneda, setMoneda] = useState(store.currency);
  const [prefijo, setPrefijo] = useState(store.codePrefix);
  const [verTotales, setVerTotales] = useState(store.sellersSeeTotals);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefijoValido = /^[A-Z]{1,4}$/.test(prefijo.toUpperCase());
  const hayCambios =
    nombre.trim() !== store.name ||
    moneda !== store.currency ||
    prefijo.toUpperCase() !== store.codePrefix ||
    verTotales !== store.sellersSeeTotals;

  async function guardar() {
    if (!nombre.trim() || !prefijoValido) return;
    setGuardando(true);
    setError(null);

    const elegida = MONEDAS.find((m) => m.currency === moneda);
    const { error: errorGuardado } = await actualizarTienda(createClient(), store.id, {
      name: nombre,
      currency: moneda,
      currencySymbol: elegida?.symbol ?? store.currencySymbol,
      codePrefix: prefijo,
      sellersSeeTotals: verTotales,
    });

    setGuardando(false);
    if (errorGuardado) {
      setError(errorGuardado);
      return;
    }
    mostrar('Ajustes guardados');
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-2">
        <label htmlFor="nombre" className="block text-label font-medium">
          Nombre de la tienda
        </label>
        <input
          id="nombre"
          maxLength={60}
          disabled={!puedeEditar}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent disabled:opacity-50"
        />
        <p className="text-caption text-muted">Aparece en el mensaje de WhatsApp como {'{{tienda}}'}.</p>
      </div>

      <div className="space-y-2">
        <span className="block text-label font-medium">Moneda</span>
        <div className="flex flex-wrap gap-2">
          {MONEDAS.map((m) => (
            <button
              key={m.currency}
              type="button"
              disabled={!puedeEditar}
              onClick={() => setMoneda(m.currency)}
              aria-pressed={moneda === m.currency}
              className={`tap rounded-full border px-4 text-label transition-colors disabled:opacity-50 ${
                moneda === m.currency
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line bg-surface'
              }`}
            >
              {m.symbol} {m.currency}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="prefijo" className="block text-label font-medium">
          Prefijo del código
        </label>
        <input
          id="prefijo"
          maxLength={4}
          disabled={!puedeEditar}
          value={prefijo}
          onChange={(e) => setPrefijo(e.target.value.toUpperCase())}
          className="tap w-24 rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-center font-mono uppercase outline-none focus:border-accent disabled:opacity-50"
        />
        <p className="text-caption text-muted">
          {prefijoValido
            ? `Las prendas nuevas serán ${prefijo.toUpperCase()}-000123. Las existentes no cambian.`
            : 'De 1 a 4 letras, sin números ni espacios.'}
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 py-1">
        <span className="text-label font-medium">
          Los vendedores ven el valor del inventario
        </span>
        <input
          type="checkbox"
          disabled={!puedeEditar}
          checked={verTotales}
          onChange={(e) => setVerTotales(e.target.checked)}
          className="size-6 accent-[--color-accent]"
        />
      </label>

      {error && (
        <p role="alert" className="text-label text-status-sold">
          {error}
        </p>
      )}

      {puedeEditar ? (
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || !hayCambios || !nombre.trim() || !prefijoValido}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      ) : (
        <p className="text-caption text-muted">Solo el dueño puede cambiar estos datos.</p>
      )}
    </div>
  );
}
