'use client';

import { useState } from 'react';
import { buildWhatsAppUrl, type MemberRole } from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import {
  cancelarInvitacion,
  invitarMiembro,
  quitarMiembro,
  type Invitacion,
  type Miembro,
} from '@/lib/data/equipo';
import { getSiteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

const ETIQUETA_ROL: Record<MemberRole, string> = { owner: 'Dueña', seller: 'Vendedor' };

/**
 * Invitar no manda un correo real: la dueña le pasa el link a la persona
 * (por WhatsApp, con el botón de abajo) y esta entra por su cuenta con el
 * MISMO correo que se invitó. Cuando esa persona se registra,
 * `aceptar_invitacion()` la suma sola a esta tienda — no hace falta nada
 * más de este lado.
 */
export function EquipoPanel({
  storeId,
  storeName,
  miembrosIniciales,
  invitacionesIniciales,
}: {
  storeId: string;
  storeName: string;
  miembrosIniciales: Miembro[];
  invitacionesIniciales: Invitacion[];
}) {
  const { mostrar } = useToast();

  const [miembros, setMiembros] = useState(miembrosIniciales);
  const [invitaciones, setInvitaciones] = useState(invitacionesIniciales);

  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<MemberRole>('seller');
  const [invitando, setInvitando] = useState(false);

  async function invitar() {
    if (!email.trim()) return;
    setInvitando(true);

    const supabase = createClient();
    const { data, error } = await invitarMiembro(supabase, storeId, { email, role: rol });

    setInvitando(false);

    if (!data) {
      mostrar(error ?? 'No se pudo invitar');
      return;
    }

    vibrar();
    setInvitaciones((previas) => [data, ...previas]);
    setEmail('');
    mostrar(`Invitación creada para ${data.email}`);
  }

  async function cancelar(invitacion: Invitacion) {
    setInvitaciones((previas) => previas.filter((i) => i.id !== invitacion.id));
    const { error } = await cancelarInvitacion(createClient(), invitacion.id);
    if (error) {
      mostrar('No se pudo cancelar');
      setInvitaciones((previas) => [invitacion, ...previas]);
    }
  }

  async function quitar(miembro: Miembro) {
    if (!confirm(`¿Quitar a ${miembro.fullName} del equipo?`)) return;
    setMiembros((previos) => previos.filter((m) => m.userId !== miembro.userId));
    const { error } = await quitarMiembro(createClient(), storeId, miembro.userId);
    if (error) {
      mostrar('No se pudo quitar');
      setMiembros((previos) => [...previos, miembro]);
    }
  }

  function enviarInstrucciones(invitacion: Invitacion) {
    const mensaje = [
      `¡Hola! Te invité a Percha, la app donde manejamos ${storeName}.`,
      '',
      `Entra a ${getSiteUrl()} y crea tu cuenta con este correo: ${invitacion.email}`,
      'Con eso entras directo a la tienda, sin tener que hacer nada más.',
    ].join('\n');
    window.open(buildWhatsAppUrl(mensaje), '_blank', 'noopener');
  }

  return (
    <div className="space-y-6 pb-8">
      <section>
        <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">Miembros</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
          {miembros.map((miembro) => (
            <li key={miembro.userId} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{miembro.fullName}</p>
                <p className="text-caption text-muted">
                  {ETIQUETA_ROL[miembro.role]}
                  {miembro.phone ? ` · ${miembro.phone}` : ''}
                </p>
              </div>
              {miembro.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => void quitar(miembro)}
                  className="tap text-label text-status-sold"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {invitaciones.length > 0 && (
        <section>
          <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
            Invitaciones pendientes
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
            {invitaciones.map((invitacion) => (
              <li key={invitacion.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{invitacion.email}</p>
                  <p className="text-caption text-muted">
                    {ETIQUETA_ROL[invitacion.role]} · esperando que entre
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => enviarInstrucciones(invitacion)}
                  className="tap rounded-[--radius-control] border border-line bg-bg px-3 py-1.5 text-caption font-medium"
                >
                  📤 Enviar
                </button>
                <button
                  type="button"
                  onClick={() => void cancelar(invitacion)}
                  aria-label={`Cancelar invitación a ${invitacion.email}`}
                  className="tap text-label text-muted"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
          Invitar a alguien
        </h2>
        <div className="rounded-[--radius-card] border border-line bg-surface p-4">
          <label htmlFor="invitar-email" className="mb-1.5 block text-label">
            Correo de la persona
          </label>
          <input
            id="invitar-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@correo.com"
            className="tap w-full rounded-[--radius-control] border border-line bg-bg px-4 py-3 outline-none focus:border-accent"
          />

          <div className="mt-3 flex gap-2">
            {(['seller', 'owner'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRol(r)}
                aria-pressed={rol === r}
                className={`tap rounded-full border px-4 py-1.5 text-label transition-colors ${
                  rol === r ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-bg'
                }`}
              >
                {ETIQUETA_ROL[r]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-caption text-muted">
            {rol === 'seller'
              ? 'Puede gestionar el inventario y los pedidos, pero no ve costos ni ganancias.'
              : 'Ve y puede cambiar absolutamente todo, igual que tú.'}
          </p>

          <button
            type="button"
            onClick={() => void invitar()}
            disabled={!email.trim() || invitando}
            className="tap mt-3 w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
          >
            {invitando ? 'Invitando…' : 'Invitar'}
          </button>
        </div>
      </section>
    </div>
  );
}
