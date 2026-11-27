"use client";

import { useEffect, useState } from "react";

import {
  buscarPrendasAgente,
  TIPOS_PRENDA,
  type PrendaEncontrada,
} from "@/lib/data/agente";
import { createClient } from "@/lib/supabase/client";

const ESTADO: Record<string, string> = {
  available: "🟢",
  reserved: "🟡",
  sold: "🔴",
};

/**
 * Buscador para identificar rápido la prenda que el cliente compra o separa:
 * por tipo (Shorts, Casacas…) y/o palabras ("negra", "nike", "PR-000737").
 * Los tipos y las palabras salen de lo que la IA vio en la foto de cada prenda.
 */
export function BuscadorPrendas({
  storeId,
  onElegir,
  onCerrar,
}: {
  storeId: string;
  onElegir: (p: PrendaEncontrada) => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  const [soloDisponibles, setSoloDisponibles] = useState(true);
  const [resultados, setResultados] = useState<PrendaEncontrada[] | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let vigente = true;
    const t = setTimeout(async () => {
      setCargando(true);
      const r = await buscarPrendasAgente(createClient(), storeId, {
        texto,
        tipo,
        soloDisponibles,
      });
      if (!vigente) return;
      setResultados(r);
      setCargando(false);
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [storeId, texto, tipo, soloDisponibles]);

  return (
    <div className="mt-3 rounded-[--radius-control] border border-accent/40 bg-surface p-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar: negra, nike, capucha, PR-000737…"
          className="min-w-0 flex-1 rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={onCerrar}
          className="tap shrink-0 rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label"
        >
          Cerrar
        </button>
      </div>

      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TIPOS_PRENDA.map((t) => (
          <button
            key={t.tipo}
            type="button"
            onClick={() => setTipo(tipo === t.tipo ? null : t.tipo)}
            className={`tap shrink-0 rounded-full border px-3 py-1.5 text-caption ${
              tipo === t.tipo
                ? "border-accent bg-accent-soft font-medium"
                : "border-line bg-bg"
            }`}
          >
            {t.emoji} {t.etiqueta}
          </button>
        ))}
      </div>

      <label className="mt-1 flex items-center gap-2 text-caption text-muted">
        <input
          type="checkbox"
          checked={soloDisponibles}
          onChange={(e) => setSoloDisponibles(e.target.checked)}
          className="accent-[--color-accent]"
        />
        Solo disponibles
      </label>

      <p className="mt-2 text-caption text-muted" aria-live="polite">
        {cargando
          ? "Buscando…"
          : resultados
            ? resultados.length === 0
              ? "No encontré prendas así."
              : `${resultados.length === 60 ? "60+" : resultados.length} prendas · toca la que es`
            : ""}
      </p>

      {resultados && resultados.length > 0 && (
        <ul className="mt-2 grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto">
          {resultados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onElegir(p)}
                title={p.ai_desc ?? undefined}
                className="tap block w-full overflow-hidden rounded-[--radius-control] border border-line bg-bg text-left"
              >
                {p.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.foto}
                    alt={p.ai_desc ?? p.code}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <span className="block aspect-square w-full bg-surface" />
                )}
                <span className="block truncate px-1.5 pt-1 text-caption font-medium">
                  {ESTADO[p.effective_status] ?? ""} {p.code.replace("PR-", "")}
                </span>
                <span className="block truncate px-1.5 pb-1 text-caption text-muted">
                  {[p.size_label, p.price_cents ? `S/${(p.price_cents / 100).toFixed(0)}` : ""]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
