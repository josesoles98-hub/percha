import { redirect } from 'next/navigation';

import { VentaRapida } from '@/components/reservas/VentaRapida';
import { ToastProvider } from '@/components/Toast';
import { getMembresia } from '@/lib/data/inventory';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Venta rápida: buscar y marcar vendida, una tras otra, sin entrar a la
 * ficha de cada prenda.
 *
 * Pensada para cuando vendes por WhatsApp: el cliente ya eligió, tú solo
 * necesitas encontrar la prenda (por nombre, código o marca) y confirmarla
 * — no leer ni editar nada más. Por eso no hay ficha completa aquí, solo
 * una foto para reconocerla, el precio y un toque.
 */
export default async function VenderPage() {
  if (!isSupabaseConfigured) redirect('/configurar');

  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  return (
    <ToastProvider>
      <VentaRapida storeId={membresia.storeId} store={membresia.store} />
    </ToastProvider>
  );
}
