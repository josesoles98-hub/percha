import { notFound, redirect } from 'next/navigation';

import { PrendaForm } from '@/components/PrendaForm';
import { ToastProvider } from '@/components/Toast';
import { firmarFotos, getCatalogos, getMembresia, getPrendaPorCodigo } from '@/lib/data/inventory';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Edición de prenda: el mismo formulario del alta, precargado.
 *
 * Vive fuera del grupo (app) igual que /nueva: es una hoja a pantalla
 * completa y la barra de navegación solo estorbaría.
 */
export default async function EditarPrendaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  if (!isSupabaseConfigured) redirect('/configurar');

  const { code } = await params;
  const supabase = await createClient();

  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const item = await getPrendaPorCodigo(supabase, membresia.storeId, code);
  if (!item) notFound();

  const [catalogos, firmadas] = await Promise.all([
    getCatalogos(supabase, membresia.storeId),
    firmarFotos(
      supabase,
      item.photos.map((f) => f.path),
    ),
  ]);

  const fotosIniciales = item.photos
    .map((foto) => ({
      position: foto.position,
      path: foto.path,
      previewUrl: firmadas.get(foto.path) ?? '',
    }))
    .filter((f) => f.previewUrl !== '');

  return (
    <ToastProvider>
      <PrendaForm
        modo="editar"
        storeId={membresia.storeId}
        simbolo={membresia.store.currencySymbol}
        catalogos={catalogos}
        itemId={item.id}
        codigo={item.code}
        inicial={{
          precio: String(item.priceCents / 100),
          sizeId: item.sizeId,
          brandId: item.brandId,
          categoryId: item.categoryId,
          colorId: item.colorId,
          gender: item.gender,
          nombre: item.name ?? '',
          descripcion: item.description ?? '',
        }}
        fotosIniciales={fotosIniciales}
      />
    </ToastProvider>
  );
}
