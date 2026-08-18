import { redirect } from 'next/navigation';

import { PrendaForm, type PrendaFormProps } from '@/components/PrendaForm';
import { ToastProvider } from '@/components/Toast';
import { getCatalogos, getMembresia, getPrendaPorCodigo } from '@/lib/data/inventory';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Alta rápida, a pantalla completa y sin barra de navegación: una sola
 * pantalla con un solo objetivo.
 *
 * Con `?duplicar=PR-000128` precarga los campos de esa prenda (sin las
 * fotos: cada prenda es pieza única y su foto es suya).
 */
export default async function NuevaPrendaPage({
  searchParams,
}: {
  searchParams: Promise<{ duplicar?: string }>;
}) {
  if (!isSupabaseConfigured) redirect('/configurar');

  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const [{ duplicar }, catalogos] = await Promise.all([
    searchParams,
    getCatalogos(supabase, membresia.storeId),
  ]);

  let inicial: PrendaFormProps['inicial'];
  if (duplicar) {
    const original = await getPrendaPorCodigo(supabase, membresia.storeId, duplicar);
    if (original) {
      inicial = {
        precio: String(original.priceCents / 100),
        sizeId: original.sizeId,
        brandId: original.brandId,
        categoryId: original.categoryId,
        colorId: original.colorId,
        gender: original.gender,
        nombre: original.name ?? '',
        descripcion: original.description ?? '',
      };
    }
  }

  return (
    <ToastProvider>
      <PrendaForm
        storeId={membresia.storeId}
        simbolo={membresia.store.currencySymbol}
        catalogos={catalogos}
        inicial={inicial}
      />
    </ToastProvider>
  );
}
