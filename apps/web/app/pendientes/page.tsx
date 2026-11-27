import { redirect } from 'next/navigation';

import { PendientesForm } from '@/components/PendientesForm';
import { ToastProvider } from '@/components/Toast';
import { getCatalogos } from '@/lib/data/inventory';
import { getMembresia } from '@/lib/data/tienda-activa';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Poner precio, talla y marca a las prendas que entraron sin ellos.
 * Pantalla completa, una prenda a la vez, igual que la carga rápida.
 */
export default async function PendientesPage() {
  if (!isSupabaseConfigured) redirect('/configurar');

  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const catalogos = await getCatalogos(supabase, membresia.storeId);

  return (
    <ToastProvider>
      <PendientesForm
        storeId={membresia.storeId}
        simbolo={membresia.store.currencySymbol}
        catalogos={catalogos}
      />
    </ToastProvider>
  );
}
