import { notFound, redirect } from 'next/navigation';

import { RotuloPedido } from '@/components/envios/RotuloPedido';
import { getMembresia } from '@/lib/data/inventory';
import { getPedido } from '@/lib/data/orders';
import { logoDeRotulo } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Rótulo del pedido para imprimir y pegar en el paquete.
 *
 * Vive fuera del grupo (app), igual que /nueva: es una hoja a pantalla
 * completa, y aquí además importa que la barra de navegación no se cuele
 * en el papel al imprimir.
 */
export default async function RotuloPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();

  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const pedido = await getPedido(supabase, membresia.storeId, code);
  // Sin envío no hay agencia de destino ni nada que pegar en un paquete.
  if (!pedido || !pedido.envio) notFound();

  const logo = await logoDeRotulo(supabase, membresia.storeId);

  return <RotuloPedido pedido={pedido} store={membresia.store} logo={logo} />;
}
