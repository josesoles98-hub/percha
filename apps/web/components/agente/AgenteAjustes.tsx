'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { guardarAjustesAgente, type AjustesAgente } from '@/lib/data/agente';
import { createClient } from '@/lib/supabase/client';

const MODELOS = [
  { id: 'claude-haiku-5-5', nombre: 'Haiku', detalle: 'Económico (~US$8/mes)' },
  { id: 'claude-sonnet-5-5', nombre: 'Sonnet', detalle: 'Muy bueno (~US$110/mes)' },
  { id: 'claude-opus-5-5', nombre: 'Opus', detalle: 'El mejor (~US$220/mes)' },
];

export function AgenteAjustes({
  storeId,
  iniciales,
}: {
  storeId: string;
  iniciales: AjustesAgente;
}) {
  const router = useRouter();
  const [a, setA] = useState(iniciales);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function cambiar<K extends keyof AjustesAgente>(clave: K, valor: AjustesAgente[K]) {
    setA((prev) => ({ ...prev, [clave]: valor }));
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const r = await guardarAjustesAgente(createClient(), storeId, a);
    setGuardando(false);
    setAviso(r.ok ? { ok: true, texto: 'Guardado ✅' } : { ok: false, texto: r.error });
    if (r.ok) router.refresh();
  }

  return (
    <div className="space-y-6">
      <label className="tap flex items-center justify-between gap-4 rounded-[--radius-card] border border-line bg-surface p-4">
        <span>
          <span className="block font-medium">Agente encendido</span>
          <span className="text-caption text-muted">
            Revisa el WhatsApp cada minuto y te deja respuestas para aprobar. No envía nada solo.
          </span>
        </span>
        <input
          type="checkbox"
          checked={a.enabled}
          onChange={(e) => cambiar('enabled', e.target.checked)}
          className="size-6 accent-[--color-accent]"
        />
      </label>

      <label className="tap flex items-center justify-between gap-4 rounded-[--radius-card] border border-line bg-surface p-4">
        <span>
          <span className="block font-medium">Resumen de la mañana ☀️</span>
          <span className="text-caption text-muted">
            A las 8:00 te llega cuánto vendiste ayer, qué reservas vencen y qué chats esperan.
          </span>
        </span>
        <input
          type="checkbox"
          checked={a.dailySummary}
          onChange={(e) => cambiar('dailySummary', e.target.checked)}
          className="size-6 accent-[--color-accent]"
        />
      </label>

      <section className="rounded-[--radius-card] border border-line bg-surface p-4">
        <label className="tap flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Promo para los que acumulan 🎁</span>
            <span className="text-caption text-muted">
              Al día {a.promoDay} de acumular, te deja listo un mensaje: una prenda más de S/{a.promoMinSoles} o
              más en 24 horas y el envío sale gratis. Una vez por cliente; tú lo apruebas.
            </span>
          </span>
          <input
            type="checkbox"
            checked={a.promoEnabled}
            onChange={(e) => cambiar('promoEnabled', e.target.checked)}
            className="size-6 shrink-0 accent-[--color-accent]"
          />
        </label>
        {a.promoEnabled && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-caption">
            <label>
              <span className="mb-1 block text-muted">Día de acumulado</span>
              <input
                type="number"
                min={1}
                max={60}
                value={a.promoDay}
                onChange={(e) => cambiar('promoDay', Number(e.target.value))}
                className="w-full rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label"
              />
            </label>
            <label>
              <span className="mb-1 block text-muted">Prenda mínima S/</span>
              <input
                type="number"
                min={0}
                value={a.promoMinSoles}
                onChange={(e) => cambiar('promoMinSoles', Number(e.target.value))}
                className="w-full rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label"
              />
            </label>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-medium">Cerebro</h2>
        <p className="mb-2 text-caption text-muted">
          Cómo habla la tienda, qué puede responder y qué te deja a ti. Lo que cambies aquí lo usa
          desde el siguiente mensaje.
        </p>
        <textarea
          value={a.cerebro}
          onChange={(e) => cambiar('cerebro', e.target.value)}
          rows={18}
          className="w-full rounded-[--radius-control] border border-line bg-surface px-3 py-2 font-mono text-caption outline-none focus:border-accent"
        />
      </section>

      <section>
        <h2 className="mb-2 font-medium">Inteligencia</h2>
        <div className="grid grid-cols-3 gap-2">
          {MODELOS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => cambiar('model', m.id)}
              className={`tap rounded-[--radius-control] border p-3 text-left ${
                a.model === m.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
              }`}
            >
              <span className="block text-label font-medium">{m.nombre}</span>
              <span className="text-caption text-muted">{m.detalle}</span>
            </button>
          ))}
        </div>
      </section>

      <details className="rounded-[--radius-card] border border-line bg-surface p-4">
        <summary className="tap cursor-pointer text-label font-medium">Conexión con HighLevel</summary>
        <div className="mt-3 space-y-3">
          {(
            [
              ['hlLocationId', 'Sub-cuenta (location ID)'],
              ['hlPipelineId', 'Embudo de reservas (pipeline ID)'],
              ['hlStageReservo', 'Etapa "Reservó (S/10)"'],
              ['hlStagePagoSaldo', 'Etapa "Pagó saldo"'],
            ] as const
          ).map(([clave, etiqueta]) => (
            <label key={clave} className="block">
              <span className="mb-1 block text-caption text-muted">{etiqueta}</span>
              <input
                value={a[clave]}
                onChange={(e) => cambiar(clave, e.target.value)}
                className="w-full rounded-[--radius-control] border border-line bg-bg px-3 py-2 font-mono text-caption outline-none focus:border-accent"
              />
            </label>
          ))}
        </div>
      </details>

      {aviso && (
        <p className={`text-label ${aviso.ok ? 'text-status-available' : 'text-status-sold'}`}>
          {aviso.texto}
        </p>
      )}

      <button
        type="button"
        onClick={() => void guardar()}
        disabled={guardando}
        className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3.5 font-semibold text-accent-ink disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}
