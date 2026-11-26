'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { accionAgente, type Borrador } from '@/lib/data/agente';
import { createClient } from '@/lib/supabase/client';

const ETIQUETA_ACCION: Record<Borrador['suggestedAction'], string> = {
  none: '',
  reservar: 'Marcar como reservado (S/10) en HighLevel',
  acumula: 'Poner etiqueta "acumula" en HighLevel',
  pago_saldo: 'Pasar a "Pagó saldo" en HighLevel',
};

function haceCuanto(fecha: string) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

export function AgenteBandeja({
  pendientes,
  recientes,
}: {
  pendientes: Borrador[];
  recientes: Borrador[];
}) {
  const router = useRouter();

  // El agente trabaja solo cada minuto: la bandeja se refresca sola.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="space-y-4">
      {pendientes.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="text-5xl" aria-hidden>
            💬
          </div>
          <h2 className="text-title">Todo respondido</h2>
          <p className="max-w-xs text-muted">
            Cuando un cliente escriba por WhatsApp, aquí aparecerá la respuesta que propone el
            agente para que la apruebes.
          </p>
        </section>
      ) : (
        pendientes.map((b) => <Tarjeta key={b.id} borrador={b} />)
      )}

      {recientes.length > 0 && (
        <details className="rounded-[--radius-card] border border-line bg-surface p-4">
          <summary className="tap cursor-pointer text-label font-medium">
            Resueltos hace poco ({recientes.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {recientes.map((b) => (
              <li key={b.id} className="text-caption">
                <span className="font-medium">{b.contactName ?? b.phone ?? 'Cliente'}</span>{' '}
                <span className="text-muted">
                  · {b.status === 'sent' ? '✅ enviado' : '🗑 descartado'}
                </span>
                {b.finalReply && <p className="mt-0.5 text-muted">“{b.finalReply}”</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Tarjeta({ borrador: b }: { borrador: Borrador }) {
  const router = useRouter();
  const [texto, setTexto] = useState(b.proposedReply ?? '');
  const [prenda, setPrenda] = useState(
    [b.actionData.tipo, b.actionData.marca, b.actionData.talla ? `talla ${b.actionData.talla}` : '']
      .filter(Boolean)
      .join(' '),
  );
  const [saldo, setSaldo] = useState(String(b.actionData.saldo_soles || ''));
  const [ocupado, setOcupado] = useState<null | 'enviar' | 'descartar' | 'accion'>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  async function hacer(tipo: 'enviar' | 'descartar' | 'accion') {
    setOcupado(tipo);
    setAviso(null);
    const resultado = await accionAgente(createClient(), {
      draftId: b.id,
      tipo,
      texto: tipo === 'enviar' ? texto : undefined,
      prenda: tipo === 'accion' ? prenda : undefined,
      saldo: tipo === 'accion' && saldo ? Number(saldo) : undefined,
    });
    setOcupado(null);
    if (!resultado.ok) {
      setAviso({ tipo: 'error', texto: resultado.error });
      router.refresh();
      return;
    }
    if (tipo === 'accion') setAviso({ tipo: 'ok', texto: 'Listo, HighLevel actualizado ✅' });
    router.refresh();
  }

  const nombre = b.contactName ?? b.phone ?? 'Cliente';
  const ultimos = b.transcript.slice(-5);
  const hayAccion = b.suggestedAction !== 'none' && b.actionStatus !== 'done';

  return (
    <article className="enter rounded-[--radius-card] border border-line bg-bg p-4 shadow-card">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="truncate font-semibold">{nombre}</h2>
        <span className="shrink-0 text-caption text-muted">{haceCuanto(b.lastInboundAt)}</span>
      </header>

      {/* El chat, como en WhatsApp */}
      <div className="space-y-1.5 rounded-[--radius-control] bg-surface p-3">
        {ultimos.map((m, i) => (
          <div key={i} className={`flex ${m.de === 'tienda' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-1.5 text-label ${
                m.de === 'tienda' ? 'bg-accent-soft' : 'border border-line bg-bg'
              }`}
            >
              {m.adjuntos.map((url) =>
                /\.(jpe?g|png|webp)$/i.test(url) ? (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Foto del cliente" className="mb-1 max-h-40 rounded-lg" />
                  </a>
                ) : (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="block text-accent underline">
                    📎 adjunto
                  </a>
                ),
              )}
              {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
            </div>
          </div>
        ))}
      </div>

      {b.status === 'error' ? (
        <p className="mt-3 rounded-[--radius-control] bg-surface p-3 text-caption text-status-sold">
          El agente no pudo preparar una respuesta: {b.error}
        </p>
      ) : (
        <>
          {(b.needsHuman || b.humanNote) && (
            <p className="mt-3 rounded-[--radius-control] border border-status-reserved/40 bg-status-reserved/10 p-3 text-label">
              👀 <span className="font-medium">Para ti:</span> {b.humanNote ?? 'Revisa este chat.'}
            </p>
          )}

          {b.itemMatches.length > 0 && (
            <div className="mt-3 text-caption">
              <p className="mb-1 font-medium">Posibles prendas en Percha:</p>
              <ul className="space-y-0.5 text-muted">
                {b.itemMatches.map((p) => (
                  <li key={p.code}>
                    {p.code} · {p.name ?? p.brand_name} {p.size_label ? `· ${p.size_label}` : ''} · S/
                    {(p.price_cents / 100).toFixed(0)} ·{' '}
                    {p.effective_status === 'available'
                      ? '🟢 disponible'
                      : p.effective_status === 'reserved'
                        ? '🟡 reservada'
                        : '🔴 vendida'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="mt-3 block">
            <span className="mb-1 block text-caption text-muted">Respuesta propuesta (puedes corregirla)</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={Math.min(8, Math.max(3, texto.split('\n').length + 1))}
              placeholder="El agente sugiere no responder nada. Escribe algo si quieres responder."
              className="w-full rounded-[--radius-control] border border-line bg-surface px-3 py-2 text-label outline-none focus:border-accent"
            />
          </label>

          {hayAccion && (
            <div className="mt-3 rounded-[--radius-control] border border-accent/30 bg-accent-soft p-3">
              <p className="text-label font-medium">✨ {ETIQUETA_ACCION[b.suggestedAction]}</p>
              {b.suggestedAction === 'reservar' && (
                <div className="mt-2 grid grid-cols-[1fr_6rem] gap-2">
                  <input
                    value={prenda}
                    onChange={(e) => setPrenda(e.target.value)}
                    placeholder="Prenda (ej. Polo Nike talla M)"
                    className="rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label outline-none focus:border-accent"
                  />
                  <input
                    value={saldo}
                    onChange={(e) => setSaldo(e.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    placeholder="Saldo S/"
                    className="rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label outline-none focus:border-accent"
                  />
                </div>
              )}
              <p className="mt-2 text-caption text-muted">
                Apruébalo solo si ya revisaste el pago en tu Yape o Plin.
              </p>
              <button
                type="button"
                onClick={() => void hacer('accion')}
                disabled={ocupado !== null}
                className="tap mt-2 w-full rounded-[--radius-control] bg-accent px-4 py-2.5 text-label font-semibold text-accent-ink disabled:opacity-50"
              >
                {ocupado === 'accion' ? 'Actualizando…' : 'Aprobar'}
              </button>
            </div>
          )}
          {b.actionStatus === 'done' && (
            <p className="mt-3 text-caption text-status-available">✅ HighLevel ya está actualizado</p>
          )}
        </>
      )}

      {aviso && (
        <p
          className={`mt-3 text-caption ${aviso.tipo === 'error' ? 'text-status-sold' : 'text-status-available'}`}
        >
          {aviso.texto}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void hacer('descartar')}
          disabled={ocupado !== null}
          className="tap rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-label disabled:opacity-50"
        >
          {ocupado === 'descartar' ? '…' : 'Descartar'}
        </button>
        {b.status !== 'error' && (
          <button
            type="button"
            onClick={() => void hacer('enviar')}
            disabled={ocupado !== null || !texto.trim()}
            className="tap flex-1 rounded-[--radius-control] bg-[#25D366] px-4 py-3 text-label font-bold text-white disabled:opacity-40"
          >
            {ocupado === 'enviar' ? 'Enviando…' : 'Enviar por WhatsApp'}
          </button>
        )}
      </div>
    </article>
  );
}
