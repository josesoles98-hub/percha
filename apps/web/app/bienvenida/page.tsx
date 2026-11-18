'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Alta de tienda.
 *
 * Tres preguntas, todas con valor por defecto: se puede terminar en 15
 * segundos pulsando "Crear mi tienda" sin tocar nada más. El resto de
 * catálogos (categorías, tallas, colores) los crea `bootstrap_store` en la
 * misma llamada.
 */
export default function BienvenidaPage() {
  // useSearchParams exige un Suspense alrededor al prerenderizar.
  return (
    <Suspense>
      <Bienvenida />
    </Suspense>
  );
}

function Bienvenida() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [dias, setDias] = useState(5);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ?otra=1: ya tiene una tienda y está creando la segunda (desde /tiendas).
  const otra = useSearchParams().has('otra');

  async function crear(event: React.FormEvent) {
    event.preventDefault();
    if (!nombre.trim()) return;

    setEnviando(true);
    setError(null);

    const supabase = createClient();
    const { data: storeId, error: rpcError } = await supabase.rpc('bootstrap_store', {
      p_name: nombre.trim(),
      p_currency: 'PEN',
      p_symbol: 'S/',
      p_reserve_days: dias,
    });

    if (rpcError) {
      setError(rpcError.message);
      setEnviando(false);
      return;
    }

    // La tienda recién creada pasa a ser la activa (ver lib/data/tienda-activa).
    if (typeof storeId === 'string') {
      document.cookie = `percha_tienda=${storeId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4">
      <header className="space-y-1">
        <h1 className="text-display">{otra ? 'Nueva tienda' : 'Bienvenido'}</h1>
        <p className="text-muted">
          {otra
            ? 'Tendrá su propio inventario, pedidos y ajustes de envío.'
            : 'Dos datos y empezamos.'}
        </p>
      </header>

      <form onSubmit={crear} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="nombre" className="block text-label font-medium">
            ¿Cómo se llama tu tienda?
          </label>
          <input
            id="nombre"
            autoFocus
            required
            maxLength={60}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ropa Americana JS"
            className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-2">
          <span className="block text-label font-medium">¿Cuántos días dura una reserva?</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setDias((d) => Math.max(1, d - 1))}
              aria-label="Un día menos"
              className="tap rounded-[--radius-control] border border-line text-title"
            >
              −
            </button>
            <output className="min-w-24 text-center text-title tabular-nums">
              {dias} {dias === 1 ? 'día' : 'días'}
            </output>
            <button
              type="button"
              onClick={() => setDias((d) => Math.min(60, d + 1))}
              aria-label="Un día más"
              className="tap rounded-[--radius-control] border border-line text-title"
            >
              +
            </button>
          </div>
          <p className="text-caption text-muted">
            Se puede cambiar cuando quieras. Las reservas ya activas mantienen los días con los
            que se crearon.
          </p>
        </div>

        <button
          type="submit"
          disabled={enviando || nombre.trim() === ''}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
        >
          {enviando ? 'Creando…' : 'Crear mi tienda'}
        </button>

        {error && (
          <p role="alert" className="text-label text-status-sold">
            {error}
          </p>
        )}
      </form>

      <p className="text-caption text-muted">
        Moneda: S/ (soles). Se cambia después en Ajustes.
      </p>

      {otra && (
        <Link href="/tiendas" className="text-center text-label text-muted underline">
          Volver a mis tiendas
        </Link>
      )}
    </main>
  );
}
