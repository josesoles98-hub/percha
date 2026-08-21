import { redirect } from 'next/navigation';

import { RotulosBatch } from '@/components/envios/RotulosBatch';
import { getMembresia } from '@/lib/data/inventory';
import { listarEnviosPendientes } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Todos los rótulos pendientes en una tira, para imprimir de corrido.
 * Vive fuera del grupo (app) para que la barra de navegación no se cuele
 * al imprimir, igual que /pedidos/[code]/rotulo.
 */
export default async function RotulosBatchPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const envios = await listarEnviosPendientes(supabase, membresia.storeId);

  return <RotulosBatch envios={envios} />;
}
