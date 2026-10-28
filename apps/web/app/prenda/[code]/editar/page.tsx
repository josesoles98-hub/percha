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

  const [catalogos, firmadas, { data: filasHd }] = await Promise.all([
    getCatalogos(supabase, membresia.storeId),
    firmarFotos(
      supabase,
      item.photos.map((f) => f.path),
    ),
    // La copia HD no viene en items_view: se pide aparte para que, al
    // guardar la edición, las fotos que no se tocan conserven su HD.
    supabase
      .from('item_photos')
      .select('position, hd_path, hd_width, hd_height, hd_bytes')
      .eq('item_id', item.id),
  ]);
  const hdPorPosicion = new Map((filasHd ?? []).map((f) => [f.position as number, f]));

  const fotosIniciales = item.photos
    .map((foto) => {
      const hd = hdPorPosicion.get(foto.position);
      return {
        position: foto.position,
        path: foto.path,
        previewUrl: firmadas.get(foto.path) ?? '',
        hdPath: (hd?.hd_path as string | null) ?? null,
        hdWidth: (hd?.hd_width as number | null) ?? null,
        hdHeight: (hd?.hd_height as number | null) ?? null,
        hdBytes: (hd?.hd_bytes as number | null) ?? null,
      };
    })
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
        puedeVerCosto={membresia.role === 'owner'}
        inicial={{
          precio: String(item.priceCents / 100),
          costo: item.costCents !== null ? String(item.costCents / 100) : '',
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
