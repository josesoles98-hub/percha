import { redirect } from 'next/navigation';

import { PanelEnvios } from '@/components/envios/PanelEnvios';
import { getMembresia } from '@/lib/data/inventory';
import { getAgencia, listarEnviosPendientes, listarLotes } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function EnviosPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { storeId } = membresia;

  const { data: tienda } = await supabase
    .from('stores')
    .select('shalom_origin_agency_id')
    .eq('id', storeId)
    .maybeSingle();

  const origenId = tienda?.shalom_origin_agency_id as number | null;

  const [pendientes, lotes, agenciaOrigen] = await Promise.all([
    listarEnviosPendientes(supabase, storeId),
    listarLotes(supabase, storeId),
    origenId ? getAgencia(supabase, origenId) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="py-4">
        <h1 className="text-title">Envíos</h1>
      </header>

      <PanelEnvios
        storeId={storeId}
        pendientes={pendientes}
        lotes={lotes}
        agenciaOrigen={agenciaOrigen?.name ?? null}
      />
    </main>
  );
}
