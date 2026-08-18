'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDateTime } from '@percha/core';

import type { Notificacion } from '@/lib/data/settings';
import { marcarTodasLeidas } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/client';

const ICONO: Record<string, string> = {
  reservation_expired: '⏰',
  expiring_today: '🟠',
};

export function AlertasList({
  notificaciones,
  storeId,
}: {
  notificaciones: Notificacion[];
  storeId: string;
}) {
  const router = useRouter();
  const [marcando, setMarcando] = useState(false);
  const sinLeer = notificaciones.filter((n) => !n.readAt).length;

  async function marcarLeidas() {
    setMarcando(true);
    await marcarTodasLeidas(createClient(), storeId);
    router.refresh();
    setMarcando(false);
  }

  if (notificaciones.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 py-24 text-center">
        <div className="text-5xl" aria-hidden>
          🔔
        </div>
        <h2 className="text-title">Sin novedades</h2>
        <p className="max-w-xs text-muted">
          Aquí te avisaremos cuando venza una reserva y la prenda vuelva a estar disponible.
        </p>
      </section>
    );
  }

  return (
    <>
      {sinLeer > 0 && (
        <button
          type="button"
          onClick={() => void marcarLeidas()}
          disabled={marcando}
          className="tap mb-3 text-label text-muted underline underline-offset-4 disabled:opacity-40"
        >
          Marcar todas como leídas ({sinLeer})
        </button>
      )}

      <ul className="space-y-2 pb-8">
        {notificaciones.map((n) => {
          const contenido = (
            <div
              className={`rounded-[--radius-card] border p-4 ${
                n.readAt ? 'border-line bg-bg opacity-60' : 'border-line bg-surface'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl" aria-hidden>
                  {ICONO[n.type] ?? '🔔'}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">
                    {n.title}
                    {!n.readAt && (
                      <span className="ml-2 inline-block size-2 rounded-full bg-status-sold align-middle">
                        <span className="sr-only">sin leer</span>
                      </span>
                    )}
                  </p>
                  {n.body && <p className="mt-0.5 text-label text-muted">{n.body}</p>}
                  <p className="mt-1 text-caption text-muted">{formatDateTime(n.createdAt)}</p>
                </div>
              </div>
            </div>
          );

          return (
            <li key={n.id}>
              {n.itemCode ? <Link href={`/prenda/${n.itemCode}`}>{contenido}</Link> : contenido}
            </li>
          );
        })}
      </ul>
    </>
  );
}
