'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { formatMoney } from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import { armarCola, detenerCola, type EstadoCola, type PrendaEnCola } from '@/lib/data/publish';
import { buscarPrendasDisponibles, type PrendaDisponible } from '@/lib/data/orders';
import { soportaPush, suscribirNotificaciones } from '@/lib/push/subscribe';
import { createClient } from '@/lib/supabase/client';

const INTERVALOS = [5, 6, 7];

// El servidor no puede saber si este navegador soporta push; se resuelve
// con useSyncExternalStore (no un efecto) para no romper la hidratación,
// igual que la detección de "app instalada" en InstalarApp.tsx. No hay
// evento al que suscribirse porque el soporte no cambia mientras la
// página está abierta.
function suscribirseSoportePush(): () => void {
  return () => {};
}

/**
 * Cola de publicación: elegir prendas y un intervalo, y que el celular
 * avise sola cada vez que toca la siguiente — con la foto y el texto ya
 * listos para pegar en WhatsApp. La usuaria sigue tocando "enviar": esto
 * solo le ahorra decidir y preparar qué sigue.
 *
 * Fotos grandes en cuadrícula, como elegir fotos en la galería del
 * celular: con miniaturas chiquitas era difícil distinguir prendas
 * parecidas antes de tocar una por error.
 */
export function ColaPublicacion({
  storeId,
  simbolo,
  estadoInicial,
}: {
  storeId: string;
  simbolo: string;
  estadoInicial: EstadoCola;
}) {
  const router = useRouter();
  const { mostrar } = useToast();

  const [estado, setEstado] = useState(estadoInicial);
  const [prendas, setPrendas] = useState<PrendaDisponible[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<PrendaDisponible[]>([]);
  const [buscando, setBuscando] = useState(true);
  const [intervalo, setIntervalo] = useState(estadoInicial.intervaloMinutos || 6);
  const [ocupado, setOcupado] = useState(false);
  const [push, setPush] = useState<'sin-revisar' | 'activando' | 'activo'>('sin-revisar');
  const soportado = useSyncExternalStore(suscribirseSoportePush, soportaPush, () => false);

  useEffect(() => {
    let cancelado = false;
    const t = setTimeout(async () => {
      if (!cancelado) setBuscando(true);
      const encontradas = await buscarPrendasDisponibles(createClient(), storeId, busqueda, 24);
      if (!cancelado) {
        setResultados(encontradas);
        setBuscando(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [busqueda, storeId]);

  function alternar(prenda: PrendaDisponible) {
    vibrar();
    setPrendas((previas) =>
      previas.some((p) => p.id === prenda.id)
        ? previas.filter((p) => p.id !== prenda.id)
        : [...previas, prenda],
    );
  }

  async function activarAvisos() {
    setPush('activando');
    const resultado = await suscribirNotificaciones(createClient(), storeId);
    if (resultado.ok) {
      setPush('activo');
      mostrar('Avisos activados en este celular');
    } else {
      setPush('sin-revisar');
      mostrar(
        resultado.motivo === 'permiso-denegado'
          ? 'No diste permiso de notificaciones'
          : 'No se pudo activar los avisos',
      );
    }
  }

  async function empezar() {
    if (prendas.length === 0) return;
    setOcupado(true);

    if (push !== 'activo' && soportado) {
      const resultado = await suscribirNotificaciones(createClient(), storeId);
      if (resultado.ok) setPush('activo');
    }

    const { error } = await armarCola(
      createClient(),
      storeId,
      prendas.map((p) => p.id),
      intervalo,
    );
    setOcupado(false);

    if (error) {
      mostrar(error);
      return;
    }

    vibrar();
    mostrar(`Cola armada: ${prendas.length} prendas cada ${intervalo} min`);
    router.refresh();
    setEstado({
      activa: true,
      intervaloMinutos: intervalo,
      prendas: prendas.map((p, indice) => ({
        itemId: p.id,
        code: p.code,
        name: p.name,
        priceCents: p.priceCents,
        photoUrl: p.photoUrl,
        position: indice,
        status: 'pending',
      })),
    });
  }

  async function detener() {
    setOcupado(true);
    const { error } = await detenerCola(createClient(), storeId);
    setOcupado(false);

    if (error) {
      mostrar('No se pudo detener');
      return;
    }

    mostrar('Cola detenida');
    router.refresh();
    setEstado((previo) => ({ ...previo, activa: false }));
  }

  // ── Cola activa: progreso ──────────────────────────────────────────
  if (estado.activa) {
    const enviadas = estado.prendas.filter((p) => p.status === 'sent').length;
    const total = estado.prendas.length;
    const siguienteId = estado.prendas.find((p) => p.status === 'pending')?.itemId;
    const progreso = total > 0 ? Math.round((enviadas / total) * 100) : 0;

    return (
      <div className="space-y-5">
        <div className="rounded-[--radius-card] border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-medium">
              {enviadas} de {total} avisadas
            </p>
            <p className="text-label text-muted">cada {estado.intervaloMinutos} min</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>

        {soportado && push !== 'activo' && (
          <button
            type="button"
            onClick={() => void activarAvisos()}
            disabled={push === 'activando'}
            className="tap w-full rounded-[--radius-control] border border-accent bg-accent-soft px-4 py-3 text-label font-medium disabled:opacity-60"
          >
            {push === 'activando' ? 'Activando…' : '🔔 Activar avisos en este celular'}
          </button>
        )}
        {!soportado && (
          <p className="rounded-[--radius-card] bg-surface p-3 text-caption text-muted">
            Este celular no puede recibir avisos automáticos. Mantén la app abierta y revisa esta
            pantalla para ver cuál sigue.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          {estado.prendas.map((p) => (
            <TarjetaProgreso key={p.itemId} prenda={p} esSiguiente={p.itemId === siguienteId} simbolo={simbolo} />
          ))}
        </div>

        <button
          type="button"
          onClick={() => void detener()}
          disabled={ocupado}
          className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 font-medium text-status-sold disabled:opacity-40"
        >
          Detener cola
        </button>
      </div>
    );
  }

  // ── Armar cola nueva ──────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-24">
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar prenda, marca, código…"
        className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-2.5 outline-none focus:border-accent"
      />

      <div>
        <span className="mb-2 block text-label font-medium">Cada cuánto</span>
        <div className="flex gap-2">
          {INTERVALOS.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => setIntervalo(min)}
              aria-pressed={intervalo === min}
              className={`tap flex-1 rounded-full border py-2 text-label font-medium transition-colors ${
                intervalo === min ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
              }`}
            >
              {min} min
            </button>
          ))}
        </div>
      </div>

      {!soportado && (
        <p className="rounded-[--radius-card] bg-surface p-3 text-caption text-muted">
          Este celular no puede recibir avisos automáticos (hace falta instalar la app en la
          pantalla de inicio). La cola igual se arma; revisa esta pantalla para ver cuál sigue.
        </p>
      )}

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-label font-medium">Toca las que quieras publicar</span>
          {prendas.length > 0 && (
            <span className="text-caption text-muted">{prendas.length} elegidas</span>
          )}
        </div>

        {buscando && resultados.length === 0 ? (
          <p className="py-8 text-center text-caption text-muted">Buscando…</p>
        ) : resultados.length === 0 ? (
          <p className="py-8 text-center text-caption text-muted">Sin prendas disponibles</p>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {resultados.map((p) => {
              const orden = prendas.findIndex((s) => s.id === p.id);
              return (
                <TarjetaSeleccionable
                  key={p.id}
                  prenda={p}
                  simbolo={simbolo}
                  seleccionada={orden !== -1}
                  orden={orden}
                  onTocar={() => alternar(p)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Botón fijo: con la cuadrícula puede haber scroll largo, y "Empezar"
          siempre tiene que estar a un toque de distancia. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 py-3 pb-safe backdrop-blur">
        <button
          type="button"
          onClick={() => void empezar()}
          disabled={prendas.length === 0 || ocupado}
          className="tap mx-auto flex w-full max-w-2xl items-center justify-center rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
        >
          {ocupado ? 'Empezando…' : `Empezar (${prendas.length})`}
        </button>
      </div>
    </div>
  );
}

function TarjetaSeleccionable({
  prenda,
  simbolo,
  seleccionada,
  orden,
  onTocar,
}: {
  prenda: PrendaDisponible;
  simbolo: string;
  seleccionada: boolean;
  orden: number;
  onTocar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTocar}
      className={`enter tap relative flex flex-col overflow-hidden rounded-[--radius-card] border-2 text-left transition-colors ${
        seleccionada ? 'border-accent' : 'border-transparent'
      }`}
    >
      <div className="relative aspect-3/4 w-full overflow-hidden rounded-[--radius-card] bg-surface">
        {prenda.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada
          <img
            src={prenda.photoUrl}
            alt={prenda.name ?? prenda.code}
            loading="lazy"
            className={`size-full object-cover transition-transform duration-200 ${
              seleccionada ? 'scale-95' : 'scale-100'
            }`}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-2xl text-muted" aria-hidden>
            👕
          </div>
        )}

        {seleccionada ? (
          <span className="enter absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-caption font-semibold text-accent-ink shadow-card">
            {orden + 1}
          </span>
        ) : (
          <span className="absolute right-1.5 top-1.5 size-6 rounded-full border-2 border-white/80 bg-black/10" />
        )}
      </div>
      <p className="mt-1 truncate text-caption font-medium">{prenda.name ?? prenda.code}</p>
      <p className="text-caption tabular-nums text-muted">
        {formatMoney(prenda.priceCents, { symbol: simbolo })}
      </p>
    </button>
  );
}

function TarjetaProgreso({
  prenda,
  esSiguiente,
  simbolo,
}: {
  prenda: PrendaEnCola;
  esSiguiente: boolean;
  simbolo: string;
}) {
  const enviada = prenda.status === 'sent';

  return (
    <div
      className={`enter relative flex flex-col overflow-hidden rounded-[--radius-card] border-2 ${
        esSiguiente ? 'border-accent' : 'border-transparent'
      }`}
    >
      <div className="relative aspect-3/4 w-full overflow-hidden rounded-[--radius-card] bg-surface">
        {prenda.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada
          <img
            src={prenda.photoUrl}
            alt={prenda.name ?? prenda.code}
            loading="lazy"
            className={`size-full object-cover ${enviada ? 'opacity-40 grayscale' : ''}`}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-2xl text-muted" aria-hidden>
            👕
          </div>
        )}

        {enviada && (
          <span className="enter absolute inset-0 flex items-center justify-center bg-black/20 text-3xl">
            ✅
          </span>
        )}
        {esSiguiente && (
          <span className="absolute inset-x-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-center text-caption font-semibold text-accent-ink">
            Sigue
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-caption font-medium">{prenda.name ?? prenda.code}</p>
      <p className="text-caption tabular-nums text-muted">
        {formatMoney(prenda.priceCents, { symbol: simbolo })}
      </p>
    </div>
  );
}
