'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatMoney, parseMoneyToCents, type ExpenseCategory } from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import { borrarGasto, registrarGasto, type Gasto } from '@/lib/data/finanzas';
import { createClient } from '@/lib/supabase/client';

const ETIQUETA_CATEGORIA: Record<ExpenseCategory, string> = {
  ads: '📣 Ads',
  otro: '🧾 Otro',
};

function hoyISO(): string {
  // 'en-CA' da 'YYYY-MM-DD' directo, lo que pide el input type="date" y la
  // columna `occurred_on`.
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

/**
 * Cargar un gasto (Meta Ads, casi siempre) toma 10 segundos: fecha, monto y
 * listo. Se resta de la ganancia neta del día en el Panel de Ganancias.
 */
export function GastosPanel({
  storeId,
  simbolo,
  gastosIniciales,
}: {
  storeId: string;
  simbolo: string;
  gastosIniciales: Gasto[];
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [gastos, setGastos] = useState(gastosIniciales);

  const [fecha, setFecha] = useState(hoyISO());
  const [monto, setMonto] = useState('');
  const [categoria, setCategoria] = useState<ExpenseCategory>('ads');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const montoCents = parseMoneyToCents(monto);
  const puedeGuardar = montoCents !== null && montoCents > 0 && !guardando;

  async function agregar() {
    if (montoCents === null || montoCents <= 0) return;
    setGuardando(true);

    const notaFinal = nota.trim() || null;
    const supabase = createClient();
    const { id, error } = await registrarGasto(supabase, storeId, {
      occurredOn: fecha,
      amountCents: montoCents,
      category: categoria,
      note: notaFinal,
    });

    setGuardando(false);

    if (error || !id) {
      mostrar('No se pudo guardar el gasto');
      return;
    }

    vibrar();
    mostrar('Gasto registrado');
    // Con el id real (no uno inventado), luego sí se puede borrar desde
    // esta misma lista sin esperar a recargar la página.
    setGastos((previos) => [
      { id, occurredOn: fecha, amountCents: montoCents, category: categoria, note: notaFinal },
      ...previos,
    ]);
    setMonto('');
    setNota('');
    router.refresh(); // recalcula las tarjetas de ganancia (Hoy / Este mes) con este gasto
  }

  async function borrar(id: string) {
    const previos = gastos;
    setGastos((actuales) => actuales.filter((g) => g.id !== id));

    const supabase = createClient();
    const { error } = await borrarGasto(supabase, id);

    if (error) {
      mostrar('No se pudo borrar');
      setGastos(previos);
      return;
    }

    vibrar();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[--radius-card] border border-line bg-surface p-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="gasto-fecha" className="mb-1 block text-caption text-muted">
              Fecha
            </label>
            <input
              id="gasto-fecha"
              type="date"
              value={fecha}
              max={hoyISO()}
              onChange={(e) => setFecha(e.target.value)}
              className="tap w-full rounded-[--radius-control] border border-line bg-bg px-3 py-2.5 text-label outline-none focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="gasto-monto" className="mb-1 block text-caption text-muted">
              Monto
            </label>
            <div className="flex items-center gap-1.5 rounded-[--radius-control] border border-line bg-bg px-3 focus-within:border-accent">
              <span className="text-label text-muted">{simbolo}</span>
              <input
                id="gasto-monto"
                inputMode="decimal"
                placeholder="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full bg-transparent py-2.5 text-label tabular-nums outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-2 flex gap-1.5">
          {(Object.keys(ETIQUETA_CATEGORIA) as ExpenseCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoria(cat)}
              aria-pressed={categoria === cat}
              className={`tap rounded-full border px-3 py-1.5 text-label transition-colors ${
                categoria === cat ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-bg'
              }`}
            >
              {ETIQUETA_CATEGORIA[cat]}
            </button>
          ))}
        </div>

        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional)"
          className="tap mt-2 w-full rounded-[--radius-control] border border-line bg-bg px-3 py-2.5 text-label outline-none focus:border-accent"
        />

        <button
          type="button"
          onClick={() => void agregar()}
          disabled={!puedeGuardar}
          className="tap mt-3 w-full rounded-[--radius-control] bg-accent px-4 py-2.5 font-medium text-accent-ink disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Agregar gasto'}
        </button>
      </div>

      {gastos.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
          {gastos.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-2.5">
              <span aria-hidden>{g.category === 'ads' ? '📣' : '🧾'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-label">
                  {new Date(`${g.occurredOn}T12:00:00`).toLocaleDateString('es-PE', {
                    day: 'numeric',
                    month: 'short',
                  })}
                  {g.note ? ` · ${g.note}` : ''}
                </p>
              </div>
              <span className="tabular-nums">{formatMoney(g.amountCents, { symbol: simbolo })}</span>
              <button
                type="button"
                onClick={() => void borrar(g.id)}
                aria-label="Borrar gasto"
                className="tap text-muted"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
