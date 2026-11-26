import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AgenteBandeja } from '@/components/agente/AgenteBandeja';
import { getAjustesAgente, listarPendientes, listarRecientes } from '@/lib/data/agente';
import { getMembresia } from '@/lib/data/tienda-activa';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Bandeja del agente IA: cada tarjeta es un chat de WhatsApp que espera
 * respuesta, con lo que el agente propone decir. Nada sale sin que alguien
 * toque "Enviar".
 */
export default async function AgentePage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const [ajustes, pendientes, recientes] = await Promise.all([
    getAjustesAgente(supabase, membresia.storeId),
    listarPendientes(supabase, membresia.storeId),
    listarRecientes(supabase, membresia.storeId),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe pb-24">
      <header className="flex items-center justify-between gap-3 py-4">
        <div>
          <h1 className="text-title">Agente IA</h1>
          <p className="text-caption text-muted">
            {ajustes?.enabled ? '🟢 Revisando WhatsApp cada minuto' : '⚪ Apagado'}
          </p>
        </div>
        {membresia.role === 'owner' && (
          <Link
            href="/agente/ajustes"
            className="tap rounded-[--radius-control] border border-line bg-surface px-3 py-2 text-label"
          >
            ⚙ Ajustes
          </Link>
        )}
      </header>

      {!ajustes && (
        <p className="mb-4 rounded-[--radius-card] bg-surface p-4 text-label text-muted">
          El agente aún no está configurado.{' '}
          {membresia.role === 'owner' ? (
            <Link href="/agente/ajustes" className="text-accent underline underline-offset-4">
              Configúralo aquí
            </Link>
          ) : (
            'Pídele a la dueña que lo configure.'
          )}
        </p>
      )}

      <AgenteBandeja pendientes={pendientes} recientes={recientes} />
    </main>
  );
}
