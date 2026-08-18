'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '@/components/Toast';
import { actualizarTienda } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/client';

export function ReservasForm({
  storeId,
  diasActuales,
  puedeEditar,
}: {
  storeId: string;
  diasActuales: number;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [dias, setDias] = useState(diasActuales);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const { error } = await actualizarTienda(createClient(), storeId, { reserveDays: dias });
    setGuardando(false);

    if (error) {
      mostrar('No se pudo guardar');
      return;
    }
    mostrar(`Reservas de ${dias} ${dias === 1 ? 'día' : 'días'}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-6 py-6">
        <button
          type="button"
          onClick={() => setDias((d) => Math.max(1, d - 1))}
          disabled={!puedeEditar || dias <= 1}
          aria-label="Un día menos"
          className="tap size-14 rounded-full border border-line bg-surface text-title disabled:opacity-30"
        >
          −
        </button>
        <output className="min-w-28 text-center">
          <span className="block text-[2.5rem] font-bold tabular-nums">{dias}</span>
          <span className="text-label text-muted">{dias === 1 ? 'día' : 'días'}</span>
        </output>
        <button
          type="button"
          onClick={() => setDias((d) => Math.min(60, d + 1))}
          disabled={!puedeEditar || dias >= 60}
          aria-label="Un día más"
          className="tap size-14 rounded-full border border-line bg-surface text-title disabled:opacity-30"
        >
          +
        </button>
      </div>

      <p className="text-label text-muted">
        Las reservas nuevas durarán {dias} {dias === 1 ? 'día' : 'días'}. Las reservas que ya
        están activas mantienen los días con los que se crearon.
      </p>

      {puedeEditar ? (
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || dias === diasActuales}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      ) : (
        <p className="text-caption text-muted">Solo el dueño puede cambiar este ajuste.</p>
      )}
    </div>
  );
}
