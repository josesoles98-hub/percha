'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatMoney, formatShortDate } from '@percha/core';

import { useToast } from '@/components/Toast';
import { restaurarDePapelera } from '@/lib/data/mutations';
import { borrarDefinitivo, type PrendaEnPapelera } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/client';

export function PapeleraList({
  prendas,
  simbolo,
  esDueno,
}: {
  prendas: PrendaEnPapelera[];
  simbolo: string;
  esDueno: boolean;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [ocupada, setOcupada] = useState<string | null>(null);

  async function restaurar(prenda: PrendaEnPapelera) {
    setOcupada(prenda.id);
    const { error } = await restaurarDePapelera(createClient(), prenda.id);
    setOcupada(null);

    if (error) {
      mostrar('No se pudo restaurar');
      return;
    }
    mostrar(`${prenda.code} restaurada`);
    router.refresh();
  }

  async function borrar(prenda: PrendaEnPapelera) {
    // Este SÍ pide confirmación: es la única acción irreversible de la app.
    if (
      !confirm(
        `¿Borrar ${prenda.code} para siempre? Se pierden sus fotos y su historial. No se puede deshacer.`,
      )
    )
      return;

    setOcupada(prenda.id);
    const { error } = await borrarDefinitivo(createClient(), prenda.id);
    setOcupada(null);

    if (error) {
      mostrar('No se pudo borrar');
      return;
    }
    mostrar(`${prenda.code} borrada definitivamente`);
    router.refresh();
  }

  if (prendas.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 py-24 text-center">
        <div className="text-5xl" aria-hidden>
          🗑
        </div>
        <h2 className="text-title">Papelera vacía</h2>
        <p className="max-w-xs text-muted">
          Las prendas eliminadas se guardan aquí 30 días antes de poder borrarse del todo.
        </p>
      </section>
    );
  }

  return (
    <ul className="space-y-2 pb-8">
      {prendas.map((prenda) => (
        <li
          key={prenda.id}
          className="flex items-center gap-3 rounded-[--radius-card] border border-line bg-surface p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{prenda.name ?? prenda.code}</p>
            <p className="text-caption text-muted">
              {prenda.code} · {formatMoney(prenda.priceCents, { symbol: simbolo })} · eliminada el{' '}
              {formatShortDate(prenda.deletedAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void restaurar(prenda)}
            disabled={ocupada === prenda.id}
            className="tap shrink-0 rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label disabled:opacity-40"
          >
            Restaurar
          </button>

          {esDueno && (
            <button
              type="button"
              onClick={() => void borrar(prenda)}
              disabled={ocupada === prenda.id}
              aria-label={`Borrar ${prenda.code} definitivamente`}
              className="tap shrink-0 rounded-[--radius-control] px-2 py-2 text-label text-status-sold disabled:opacity-40"
            >
              Borrar
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
