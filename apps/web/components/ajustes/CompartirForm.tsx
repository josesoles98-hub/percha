'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import {
  PLANTILLA_RECOMENDADA,
  SHARE_VARIABLES,
  formatMoney,
  parseMoneyToCents,
  renderTemplate,
  type StoreSettings,
} from '@percha/core';

import { useToast } from '@/components/Toast';
import { actualizarTienda } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/client';

export function CompartirForm({
  store,
  puedeEditar,
}: {
  store: StoreSettings;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const [plantilla, setPlantilla] = useState(store.shareTemplate);
  const [adelanto, setAdelanto] = useState(String(store.shareDepositCents / 100));
  const [guardando, setGuardando] = useState(false);

  const adelantoCents = parseMoneyToCents(adelanto);

  // Vista previa con una prenda de ejemplo: lo que verías en el grupo.
  const vistaPrevia = useMemo(
    () =>
      renderTemplate(plantilla, {
        marca: 'Nike',
        talla: 'L',
        precio: formatMoney(5000, { symbol: store.currencySymbol }),
        estado: 'Disponible',
        codigo: `${store.codePrefix}-000128`,
        nombre: 'Casaca cortavientos',
        descripcion: 'En excelente estado',
        categoria: 'Casacas',
        color: 'Negro',
        adelanto: formatMoney(adelantoCents ?? 0, { symbol: store.currencySymbol }),
        tienda: store.name,
      }),
    [plantilla, adelantoCents, store],
  );

  function insertarVariable(clave: string) {
    const area = areaRef.current;
    const texto = `{{${clave}}}`;
    if (!area) {
      setPlantilla((p) => p + texto);
      return;
    }
    const inicio = area.selectionStart ?? plantilla.length;
    const fin = area.selectionEnd ?? plantilla.length;
    setPlantilla((p) => p.slice(0, inicio) + texto + p.slice(fin));
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(inicio + texto.length, inicio + texto.length);
    });
  }

  async function guardar() {
    if (!plantilla.trim() || adelantoCents === null) return;
    setGuardando(true);

    const { error } = await actualizarTienda(createClient(), store.id, {
      shareTemplate: plantilla,
      shareDepositCents: adelantoCents,
    });

    setGuardando(false);
    if (error) {
      mostrar('No se pudo guardar');
      return;
    }
    mostrar('Plantilla guardada');
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-2">
        <label htmlFor="plantilla" className="block text-label font-medium">
          Plantilla del mensaje
        </label>
        <textarea
          id="plantilla"
          ref={areaRef}
          rows={9}
          maxLength={2000}
          disabled={!puedeEditar}
          value={plantilla}
          onChange={(e) => setPlantilla(e.target.value)}
          className="w-full rounded-[--radius-card] border border-line bg-surface p-3 font-mono text-label outline-none focus:border-accent disabled:opacity-50"
        />
        <p className="text-caption text-muted">
          Si una variable está vacía en la prenda, su línea desaparece del mensaje.
        </p>
        {puedeEditar && plantilla !== PLANTILLA_RECOMENDADA && (
          <button
            type="button"
            onClick={() => setPlantilla(PLANTILLA_RECOMENDADA)}
            className="tap text-caption text-muted underline underline-offset-4"
          >
            Usar el mensaje recomendado (marca, talla y precio)
          </button>
        )}
      </div>

      <div>
        <span className="mb-2 block text-label font-medium">Insertar variable</span>
        <div className="flex flex-wrap gap-2">
          {SHARE_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              disabled={!puedeEditar}
              onClick={() => insertarVariable(v.key)}
              title={`${v.label} · ej: ${v.example}`}
              className="tap rounded-full border border-line bg-surface px-3 font-mono text-caption disabled:opacity-50"
            >
              {`{{${v.key}}}`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="adelanto" className="block text-label font-medium">
          Monto de reserva ({'{{adelanto}}'})
        </label>
        <div className="flex w-36 items-center gap-2 rounded-[--radius-control] border border-line bg-surface px-4 focus-within:border-accent">
          <span className="text-muted">{store.currencySymbol}</span>
          <input
            id="adelanto"
            inputMode="decimal"
            disabled={!puedeEditar}
            value={adelanto}
            onChange={(e) => setAdelanto(e.target.value)}
            className="w-full bg-transparent py-2.5 tabular-nums outline-none disabled:opacity-50"
          />
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-label font-medium">Vista previa</span>
        <div className="rounded-[--radius-card] border border-line bg-surface p-4">
          <pre className="whitespace-pre-wrap break-words font-sans text-label">{vistaPrevia}</pre>
        </div>
      </div>

      {puedeEditar ? (
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || !plantilla.trim() || adelantoCents === null}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      ) : (
        <p className="text-caption text-muted">Solo el dueño puede cambiar la plantilla.</p>
      )}
    </div>
  );
}
