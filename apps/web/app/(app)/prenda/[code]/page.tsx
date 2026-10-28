import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { ItemDetail } from '@/components/ItemDetail';
import { firmarFotos, getMembresia, getPrendaPorCodigo } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PrendaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const item = await getPrendaPorCodigo(supabase, membresia.storeId, code);
  if (!item) notFound();

  const [firmadas, { data: filasHd }, eventos] = await Promise.all([
    firmarFotos(
      supabase,
      item.photos.map((f) => f.path),
    ),
    // La copia HD no viene en items_view: se pide aparte.
    supabase
      .from('item_photos')
      .select('position, hd_path, hd_width, hd_height')
      .eq('item_id', item.id),
    supabase
      .from('item_events')
      .select('id, type, created_at, payload')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Mantiene el orden de las fotos (1, 2, 3), no el que devuelva el firmado.
  const conUrl = item.photos.filter((foto) => firmadas.has(foto.path));
  const fotoUrls = conUrl.map((foto) => firmadas.get(foto.path) as string);

  // En el mismo orden que fotoUrls: la HD de cada foto, si la tiene.
  const hdPorPosicion = new Map((filasHd ?? []).map((f) => [f.position as number, f]));
  const fotosHd = conUrl.map((foto) => {
    const hd = hdPorPosicion.get(foto.position);
    return {
      hdPath: (hd?.hd_path as string | null) ?? null,
      hdWidth: (hd?.hd_width as number | null) ?? null,
      hdHeight: (hd?.hd_height as number | null) ?? null,
    };
  });

  return (
    <Suspense>
      <ItemDetail
        item={item}
        store={membresia.store}
        fotoUrls={fotoUrls}
        fotosHd={fotosHd}
        historial={eventos.data ?? []}
      />
    </Suspense>
  );
}
