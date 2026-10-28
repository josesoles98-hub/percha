'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '@/components/Toast';
import { actualizarTienda } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/client';

type Lado = 2048 | 4000;

const OPCIONES: Array<{ valor: Lado; titulo: string; detalle: string }> = [
  {
    valor: 2048,
    titulo: 'Alta · 2048 px',
    detalle: 'Entre 0.5 y 1.5 MB por foto. Sube rápido y ocupa poco espacio.',
  },
  {
    valor: 4000,
    titulo: 'Máxima · 4000 px',
    detalle:
      'Casi sin pérdida, cerca del tope HD de WhatsApp. Entre 2 y 5 MB por foto: tarda más en subir y en bajar al compartir, y ocupa unas 3 a 5 veces más espacio.',
  },
];

/** Tamaño de la copia HD de las fotos NUEVAS. Las ya subidas no cambian. */
export function CalidadHdForm({
  storeId,
  inicial,
  puedeEditar,
}: {
  storeId: string;
  inicial: Lado;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [valor, setValor] = useState<Lado>(inicial);
  const [guardando, setGuardando] = useState(false);

  async function elegir(nuevo: Lado) {
    if (nuevo === valor || !puedeEditar) return;
    const anterior = valor;
    setValor(nuevo);
    setGuardando(true);

    const { error } = await actualizarTienda(createClient(), storeId, { hdMaxSide: nuevo });
    setGuardando(false);

    if (error) {
      setValor(anterior);
      mostrar('No se pudo guardar');
      return;
    }
    mostrar(nuevo === 4000 ? 'HD máxima activada' : 'HD alta activada');
    router.refresh();
  }

  return (
    <section className="rounded-[--radius-card] border border-line bg-surface p-4">
      <p className="text-label font-medium">Calidad de la copia HD</p>
      <p className="mt-1 text-caption text-muted">
        Vale para las fotos que subas desde ahora. Las que ya están subidas no cambian.
      </p>

      <div className="mt-3 space-y-2">
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            type="button"
            disabled={!puedeEditar || guardando}
            onClick={() => void elegir(o.valor)}
            aria-pressed={valor === o.valor}
            className={`tap w-full rounded-[--radius-control] border-2 p-3 text-left disabled:opacity-60 ${
              valor === o.valor ? 'border-accent bg-accent/10' : 'border-line bg-bg'
            }`}
          >
            <span className="block font-medium">{o.titulo}</span>
            <span className="mt-0.5 block text-caption text-muted">{o.detalle}</span>
          </button>
        ))}
      </div>

      {!puedeEditar && (
        <p className="mt-2 text-caption text-muted">Solo el dueño puede cambiar esto.</p>
      )}
    </section>
  );
}
