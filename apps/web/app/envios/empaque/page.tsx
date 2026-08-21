import { redirect } from 'next/navigation';

import { EmpaqueBatch } from '@/components/envios/EmpaqueBatch';
import { getMembresia } from '@/lib/data/inventory';
import { listarPedidosParaEmpacar } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Lista de empaque con fotos, para imprimir. Vive fuera del grupo (app)
 * igual que /envios/rotulos, para que la barra de navegación no se cuele
 * al imprimir.
 */
export default async function EmpaqueBatchPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const pedidos = await listarPedidosParaEmpacar(supabase, membresia.storeId);

  return <EmpaqueBatch pedidos={pedidos} storeName={membresia.store.name} />;
}
