import { notFound, redirect } from 'next/navigation';

import { FichaPedido } from '@/components/envios/FichaPedido';
import { getMembresia } from '@/lib/data/inventory';
import { getPedido, listarFotosPedido, obtenerUrlBoleta } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PedidoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();

  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const pedido = await getPedido(supabase, membresia.storeId, code);
  if (!pedido) notFound();

  // En paralelo: ninguna de las dos depende de la otra, y una tras otra
  // era una vuelta de red de más antes de poder pintar la pantalla.
  const [fotosCliente, boletaUrl] = await Promise.all([
    pedido.customerDataSubmittedAt
      ? listarFotosPedido(supabase, membresia.storeId, pedido.id)
      : Promise.resolve([]),
    pedido.envio ? obtenerUrlBoleta(supabase, membresia.storeId, pedido.envio.id) : Promise.resolve(null),
  ]);

  return (
    <FichaPedido pedido={pedido} store={membresia.store} fotosCliente={fotosCliente} boletaUrl={boletaUrl} />
  );
}
