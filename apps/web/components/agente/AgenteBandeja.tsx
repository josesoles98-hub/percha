"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import {
  accionAgente,
  type Borrador,
  type PrendaCoincidente,
} from "@/lib/data/agente";
import { BuscadorPrendas } from "./BuscadorPrendas";
import { createClient } from "@/lib/supabase/client";

const ETIQUETA_ACCION: Record<Borrador["suggestedAction"], string> = {
  none: "",
  reservar: "Marcar como reservado (S/10) en HighLevel",
  acumula: 'Poner etiqueta "acumula" en HighLevel',
  pago_saldo: 'Pasar a "Pagó saldo" en HighLevel',
};

function haceCuanto(fecha: string) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

export function AgenteBandeja({
  storeId,
  pendientes,
  recientes,
}: {
  storeId: string;
  pendientes: Borrador[];
  recientes: Borrador[];
}) {
  const router = useRouter();
  const [cargando, startTransition] = useTransition();
  const [actualizado, setActualizado] = useState(() => Date.now());
  const [, setTic] = useState(0);

  const refrescar = useCallback(() => {
    startTransition(() => {
      router.refresh();
      setActualizado(Date.now());
    });
  }, [router]);

  // El agente trabaja solo cada minuto: la bandeja se refresca sola mientras
  // está a la vista, y en cuanto vuelves a la app (en el celular el reloj se
  // pausa cuando la app queda en segundo plano).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refrescar();
      setTic((t) => t + 1);
    }, 20_000);
    const alVolver = () => {
      if (document.visibilityState === "visible") refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, [refrescar]);

  // Al instante: cada borrador nuevo o cambiado avisa por Realtime.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`agente-${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_drafts",
          filter: `store_id=eq.${storeId}`,
        },
        () => refrescar(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [storeId, refrescar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted" aria-live="polite" suppressHydrationWarning>
          {cargando
            ? "Buscando mensajes nuevos…"
            : `${pendientes.length} ${pendientes.length === 1 ? "chat" : "chats"} por responder · actualizado ${haceCuanto(new Date(actualizado).toISOString())}`}
        </p>
        <button
          type="button"
          onClick={refrescar}
          disabled={cargando}
          className="tap flex shrink-0 items-center gap-2 rounded-[--radius-control] border border-line bg-surface px-3 py-2 text-label disabled:opacity-60"
        >
          <span aria-hidden className={cargando ? "inline-block animate-spin" : "inline-block"}>
            ↻
          </span>
          {cargando ? "Cargando…" : "Refrescar"}
        </button>
      </div>

      {pendientes.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="text-5xl" aria-hidden>
            💬
          </div>
          <h2 className="text-title">Todo respondido</h2>
          <p className="max-w-xs text-muted">
            Cuando un cliente escriba por WhatsApp, aquí aparecerá la respuesta
            que propone el agente para que la apruebes.
          </p>
        </section>
      ) : (
        pendientes.map((b) => (
          <Tarjeta key={b.id} borrador={b} storeId={storeId} />
        ))
      )}

      {recientes.length > 0 && (
        <details className="rounded-[--radius-card] border border-line bg-surface p-4">
          <summary className="tap cursor-pointer text-label font-medium">
            Resueltos hace poco ({recientes.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {recientes.map((b) => (
              <li key={b.id} className="text-caption">
                <span className="font-medium">
                  {b.contactName ?? b.phone ?? "Cliente"}
                </span>{" "}
                <span className="text-muted">
                  ·{" "}
                  {b.status !== "sent"
                    ? "🗑 descartado"
                    : b.autoSent
                      ? "🤖 respondió solo"
                      : "✅ enviado"}
                </span>
                {b.finalReply && (
                  <p className="mt-0.5 text-muted">“{b.finalReply}”</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Tarjeta({
  borrador: b,
  storeId,
}: {
  borrador: Borrador;
  storeId: string;
}) {
  const router = useRouter();
  const [buscando, setBuscando] = useState(false);
  // Prendas elegidas a mano con el buscador (van arriba de las que propuso el agente).
  const [aMano, setAMano] = useState<PrendaCoincidente[]>([]);
  const prendas = [
    ...aMano,
    ...b.itemMatches.filter((p) => !aMano.some((m) => m.id === p.id)),
  ];
  const [texto, setTexto] = useState(b.proposedReply ?? "");
  const [prenda, setPrenda] = useState(
    [
      b.actionData.tipo,
      b.actionData.marca,
      b.actionData.talla ? `talla ${b.actionData.talla}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  const [saldo, setSaldo] = useState(String(b.actionData.saldo_soles || ""));
  // Prendas de Percha que se marcarán reservadas/vendidas al aprobar
  // (un cliente puede separar o pagar varias).
  const reconocida = b.itemMatches.find((p) => p.elegida && p.id);
  const [seleccion, setSeleccion] = useState<string[]>(
    reconocida?.id ? [reconocida.id] : [],
  );
  // Reservar / vendida: lo sugiere el agente, o lo elige la dueña al
  // confirmar la prenda ("✅ Es esta") aunque el agente no lo haya detectado.
  const [accionElegida, setAccionElegida] = useState<
    "reservar" | "pago_saldo" | null
  >(null);
  const accion: Borrador["suggestedAction"] =
    accionElegida ?? b.suggestedAction;
  const precioCaptura = b.actionData.precio_soles || 0;
  // Precio de cada prenda elegida: el de la captura manda (es la oferta del
  // día); si no se vio, el que tiene la prenda en Percha.
  const [precios, setPrecios] = useState<Record<string, string>>(() =>
    reconocida?.id
      ? {
          [reconocida.id]: precioCaptura
            ? String(precioCaptura)
            : reconocida.price_cents
              ? String(reconocida.price_cents / 100)
              : "",
        }
      : {},
  );
  const codigoDe = (id: string) =>
    prendas.find((p) => p.id === id)?.code ?? "la prenda";
  const codigos = seleccion.map(codigoDe).join(", ");

  function alternar(p: PrendaCoincidente) {
    if (!p.id) return;
    const id = p.id;
    if (seleccion.includes(id)) {
      setSeleccion(seleccion.filter((x) => x !== id));
      return;
    }
    setSeleccion([...seleccion, id]);
    setPrecios((actuales) => ({
      ...actuales,
      [id]:
        actuales[id] ??
        (seleccion.length === 0 && precioCaptura
          ? String(precioCaptura)
          : p.price_cents
            ? String(p.price_cents / 100)
            : ""),
    }));
  }
  const [ocupado, setOcupado] = useState<
    null | "enviar" | "descartar" | "accion"
  >(null);
  const [aviso, setAviso] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);

  async function hacer(tipo: "enviar" | "descartar" | "accion") {
    setOcupado(tipo);
    setAviso(null);
    const resultado = await accionAgente(createClient(), {
      draftId: b.id,
      tipo,
      texto: tipo === "enviar" ? texto : undefined,
      prenda: tipo === "accion" ? prenda : undefined,
      saldo: tipo === "accion" && saldo ? Number(saldo) : undefined,
      itemId: tipo === "accion" ? (seleccion[0] ?? null) : undefined,
      precio:
        tipo === "accion" && seleccion[0] && precios[seleccion[0]]
          ? Number(precios[seleccion[0]])
          : undefined,
      prendas:
        tipo === "accion" && seleccion.length
          ? seleccion.map((id) => ({
              itemId: id,
              precio: Number(precios[id]) || undefined,
            }))
          : undefined,
      accion: tipo === "accion" && accionElegida ? accionElegida : undefined,
    });
    setOcupado(null);
    if (!resultado.ok) {
      setAviso({ tipo: "error", texto: resultado.error });
      router.refresh();
      return;
    }
    if (tipo === "accion") {
      setAviso({
        tipo: "ok",
        texto: resultado.prenda
          ? `Listo: HighLevel actualizado y ${resultado.prenda} marcada en Percha ✅`
          : "Listo, HighLevel actualizado ✅",
      });
    }
    router.refresh();
  }

  const nombre = b.contactName ?? b.phone ?? "Cliente";
  const ultimos = b.transcript.slice(-5);
  const hecha = b.actionStatus === "done";
  const hayAccion = accion !== "none" && !hecha;
  const marcaPercha =
    hayAccion && (accion === "reservar" || accion === "pago_saldo");
  // Se puede confirmar una prenda mientras no se haya hecho la acción.
  const puedeElegir = !hecha;

  return (
    <article className="enter rounded-[--radius-card] border border-line bg-bg p-4 shadow-card">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="truncate font-semibold">{nombre}</h2>
        <span className="shrink-0 text-caption text-muted" suppressHydrationWarning>
          {haceCuanto(b.lastInboundAt)}
        </span>
      </header>

      {b.kind === "promo" && (
        <p className="mb-2 text-caption font-medium text-accent">
          🎁 Promo para cliente que acumula
        </p>
      )}

      {/* El chat, como en WhatsApp */}
      {ultimos.length > 0 && (
        <div className="space-y-1.5 rounded-[--radius-control] bg-surface p-3">
          {ultimos.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.de === "tienda" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-1.5 text-label ${
                  m.de === "tienda"
                    ? "bg-accent-soft"
                    : "border border-line bg-bg"
                }`}
              >
                {m.adjuntos.map((url) =>
                  /\.(jpe?g|png|webp)$/i.test(url) ? (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="Foto del cliente"
                        className="mb-1 max-h-40 rounded-lg"
                      />
                    </a>
                  ) : (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-accent underline"
                    >
                      📎 adjunto
                    </a>
                  ),
                )}
                {m.texto && (
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {b.status === "error" ? (
        <p className="mt-3 rounded-[--radius-control] bg-surface p-3 text-caption text-status-sold">
          El agente no pudo preparar una respuesta: {b.error}
        </p>
      ) : (
        <>
          {(b.needsHuman || b.humanNote) && (
            <p className="mt-3 rounded-[--radius-control] border border-status-reserved/40 bg-status-reserved/10 p-3 text-label">
              👀 <span className="font-medium">Para ti:</span>{" "}
              {b.humanNote ?? "Revisa este chat."}
            </p>
          )}

          {prendas.length > 0 && (
            <div className="mt-3 text-caption">
              <p className="mb-1.5 font-medium">
                {aMano
                  ? "🔍 Prenda que elegiste:"
                  : prendas[0]?.elegida
                    ? "📸 Reconocí la prenda de la foto:"
                    : "Posibles prendas en Percha:"}
              </p>
              <ul className="space-y-1.5">
                {prendas.map((p) => {
                  const marcada = p.id != null && seleccion.includes(p.id);
                  return (
                    <li key={p.code}>
                      <button
                        type="button"
                        disabled={!puedeElegir || !p.id}
                        onClick={() => {
                          alternar(p);
                        }}
                        className={`flex w-full items-center gap-3 rounded-[--radius-control] border p-1.5 text-left ${
                          marcada
                            ? "border-accent bg-accent-soft"
                            : p.elegida
                              ? "border-accent/40"
                              : "border-line"
                        }`}
                      >
                        {p.foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.foto}
                            alt=""
                            className="size-12 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="size-12 shrink-0 rounded-md bg-surface" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {p.code} · {p.name ?? p.brand_name ?? "Prenda"}
                          </span>
                          {precioCaptura > 0 &&
                            Math.round(precioCaptura * 100) !== p.price_cents &&
                            p.elegida && (
                              <span className="block text-status-reserved">
                                En la foto: S/{precioCaptura} · en Percha: S/
                                {(p.price_cents / 100).toFixed(0)}
                              </span>
                            )}
                          <span className="text-muted">
                            {p.size_label ? `${p.size_label} · ` : ""}S/
                            {(p.price_cents / 100).toFixed(0)} ·{" "}
                            {p.effective_status === "available"
                              ? "🟢 disponible"
                              : p.effective_status === "reserved"
                                ? "🟡 reservada"
                                : "🔴 vendida"}
                          </span>
                        </span>
                        {puedeElegir && p.id && (
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-semibold ${
                              marcada
                                ? "bg-accent text-accent-ink"
                                : "border border-accent/50 text-accent"
                            }`}
                          >
                            {marcada ? "✅ Es esta" : "¿Es esta?"}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {seleccion.length > 0 && !marcaPercha && !hecha && (
            <div className="mt-3 rounded-[--radius-control] border border-accent/40 bg-accent-soft p-3">
              <p className="text-label font-medium">
                ¿Qué pasa con{" "}
                {codigos}?
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAccionElegida("reservar")}
                  className="tap rounded-[--radius-control] border border-line bg-bg px-3 py-2.5 text-label font-medium"
                >
                  🟡 La separó
                </button>
                <button
                  type="button"
                  onClick={() => setAccionElegida("pago_saldo")}
                  className="tap rounded-[--radius-control] border border-line bg-bg px-3 py-2.5 text-label font-medium"
                >
                  🔴 Pagó todo
                </button>
              </div>
            </div>
          )}

          {buscando ? (
            <BuscadorPrendas
              storeId={storeId}
              onCerrar={() => setBuscando(false)}
              onElegir={(p) => {
                setAMano((lista) => [p, ...lista.filter((x) => x.id !== p.id)]);
                setBuscando(false);
                if (!seleccion.includes(p.id)) alternar(p);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setBuscando(true)}
              className="tap mt-2 w-full rounded-[--radius-control] border border-dashed border-line px-3 py-2 text-label text-muted"
            >
              🔍 {prendas.length ? "¿No es ninguna? Buscar la prenda" : "Buscar la prenda en Percha"}
            </button>
          )}

          <label className="mt-3 block">
            <span className="mb-1 block text-caption text-muted">
              Respuesta propuesta (puedes corregirla)
            </span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={Math.min(8, Math.max(3, texto.split("\n").length + 1))}
              placeholder="El agente sugiere no responder nada. Escribe algo si quieres responder."
              className="w-full rounded-[--radius-control] border border-line bg-surface px-3 py-2 text-label outline-none focus:border-accent"
            />
          </label>

          {hayAccion && (
            <div className="mt-3 rounded-[--radius-control] border border-accent/30 bg-accent-soft p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-label font-medium">
                  ✨ {ETIQUETA_ACCION[accion]}
                </p>
                {accionElegida && (
                  <button
                    type="button"
                    onClick={() => setAccionElegida(null)}
                    className="tap shrink-0 text-caption text-muted underline underline-offset-2"
                  >
                    Cambiar
                  </button>
                )}
              </div>
              {accion === "reservar" && (
                <div className="mt-2 grid grid-cols-[1fr_6rem] gap-2">
                  <input
                    value={prenda}
                    onChange={(e) => setPrenda(e.target.value)}
                    placeholder="Prenda (ej. Polo Nike talla M)"
                    className="rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label outline-none focus:border-accent"
                  />
                  <input
                    value={saldo}
                    onChange={(e) =>
                      setSaldo(e.target.value.replace(/[^\d.]/g, ""))
                    }
                    inputMode="decimal"
                    placeholder="Saldo S/"
                    className="rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label outline-none focus:border-accent"
                  />
                </div>
              )}
              {marcaPercha && seleccion.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-caption">
                    {accion === "reservar" ? "Precio acordado" : "Precio de venta"}
                    {seleccion.length > 1 ? " de cada prenda" : ""}:
                  </p>
                  {seleccion.map((id) => (
                    <label key={id} className="flex items-center gap-2 text-caption">
                      <span className="min-w-24 font-medium">{codigoDe(id)}</span>
                      <span>S/</span>
                      <input
                        value={precios[id] ?? ""}
                        onChange={(e) =>
                          setPrecios((actuales) => ({
                            ...actuales,
                            [id]: e.target.value.replace(/[^\d.]/g, ""),
                          }))
                        }
                        inputMode="decimal"
                        placeholder="0"
                        className="w-20 rounded-[--radius-control] border border-line bg-bg px-2 py-1.5 text-label outline-none focus:border-accent"
                      />
                    </label>
                  ))}
                </div>
              )}
              {marcaPercha && (
                <p className="mt-2 text-caption">
                  {seleccion.length
                    ? `También se ${seleccion.length > 1 ? "marcarán" : "marcará"} ${codigos} como ${accion === "reservar" ? (seleccion.length > 1 ? "reservadas" : "reservada") : seleccion.length > 1 ? "vendidas" : "vendida"} en Percha.`
                    : accion === "pago_saldo"
                      ? "Si este cliente tiene una sola prenda reservada en Percha, se marcará como vendida."
                      : "Toca una o varias prendas de arriba para marcarlas también como reservadas en Percha."}
                </p>
              )}
              <p className="mt-2 text-caption text-muted">
                Apruébalo solo si ya revisaste el pago en tu Yape o Plin.
              </p>
              <button
                type="button"
                onClick={() => void hacer("accion")}
                disabled={ocupado !== null}
                className="tap mt-2 w-full rounded-[--radius-control] bg-accent px-4 py-2.5 text-label font-semibold text-accent-ink disabled:opacity-50"
              >
                {ocupado === "accion" ? "Actualizando…" : "Aprobar"}
              </button>
            </div>
          )}
          {b.actionStatus === "done" && (
            <p className="mt-3 text-caption text-status-available">
              ✅ HighLevel ya está actualizado
            </p>
          )}
        </>
      )}

      {aviso && (
        <p
          className={`mt-3 text-caption ${aviso.tipo === "error" ? "text-status-sold" : "text-status-available"}`}
        >
          {aviso.texto}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void hacer("descartar")}
          disabled={ocupado !== null}
          className="tap rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-label disabled:opacity-50"
        >
          {ocupado === "descartar" ? "…" : "Descartar"}
        </button>
        {b.kind === "promo" && b.phone && texto.trim() && (
          <a
            href={`https://wa.me/${b.phone.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => void hacer("descartar")}
            className="tap rounded-[--radius-control] border border-line bg-surface px-3 py-3 text-center text-label"
          >
            Abrir en mi WhatsApp
          </a>
        )}
        {b.status !== "error" && (
          <button
            type="button"
            onClick={() => void hacer("enviar")}
            disabled={ocupado !== null || !texto.trim()}
            className="tap flex-1 rounded-[--radius-control] bg-[#25D366] px-4 py-3 text-label font-bold text-white disabled:opacity-40"
          >
            {ocupado === "enviar" ? "Enviando…" : "Enviar por WhatsApp"}
          </button>
        )}
      </div>
    </article>
  );
}
