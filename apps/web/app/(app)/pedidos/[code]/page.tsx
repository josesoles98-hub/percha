import { notFound, redirect } from 'next/navigation';

import { FichaPedido } from '@/components/envios/FichaPedido';
import { getMembresia } from '@/lib/data/inventory';
import { getPedido } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PedidoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();

  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const pedido = await getPedido(supabase, membresia.storeId, code);
  if (!pedido) notFound();

  return <FichaPedido pedido={pedido} store={membresia.store} />;
}
