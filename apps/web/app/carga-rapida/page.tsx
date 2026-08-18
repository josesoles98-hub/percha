import { redirect } from 'next/navigation';

import { CargaRapidaForm } from '@/components/CargaRapidaForm';
import { ToastProvider } from '@/components/Toast';
import { getCatalogos, getMembresia } from '@/lib/data/inventory';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Carga rápida por lotes: para cuando llega mercadería nueva y hay muchas
 * prendas seguidas que subir. Se eligen todas las fotos de una vez y la
 * pantalla las agrupa por prenda; solo queda poner marca, talla y precio
 * a cada una.
 */
export default async function CargaRapidaPage() {
  if (!isSupabaseConfigured) redirect('/configurar');

  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const catalogos = await getCatalogos(supabase, membresia.storeId);

  return (
    <ToastProvider>
      <CargaRapidaForm
        storeId={membresia.storeId}
        simbolo={membresia.store.currencySymbol}
        catalogos={catalogos}
      />
    </ToastProvider>
  );
}
