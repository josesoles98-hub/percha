import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AgenteAjustes } from '@/components/agente/AgenteAjustes';
import { CEREBRO_INICIAL, HIGHLEVEL_AV_CLUB } from '@/lib/agente/cerebro-inicial';
import { getAjustesAgente, type AjustesAgente } from '@/lib/data/agente';
import { getMembresia } from '@/lib/data/tienda-activa';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AgenteAjustesPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');
  if (membresia.role !== 'owner') redirect('/agente');

  const guardados = await getAjustesAgente(supabase, membresia.storeId);
  const esAvClub = /vintage|av club/i.test(membresia.store.name);

  const iniciales: AjustesAgente = guardados ?? {
    enabled: false,
    cerebro: CEREBRO_INICIAL,
    model: 'claude-haiku-5-5',
    ...(esAvClub
      ? HIGHLEVEL_AV_CLUB
      : { hlLocationId: '', hlPipelineId: '', hlStageReservo: '', hlStagePagoSaldo: '' }),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe pb-24">
      <header className="flex items-center gap-3 py-4">
        <Link href="/agente" className="tap text-label text-muted">
          ‹ Agente
        </Link>
        <h1 className="text-title">Ajustes del agente</h1>
      </header>

      <AgenteAjustes storeId={membresia.storeId} iniciales={iniciales} />
    </main>
  );
}
