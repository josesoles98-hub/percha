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

  const [firmadas, eventos] = await Promise.all([
    firmarFotos(
      supabase,
      item.photos.map((f) => f.path),
    ),
    supabase
      .from('item_events')
      .select('id, type, created_at, payload')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Mantiene el orden de las fotos (1, 2, 3), no el que devuelva el firmado.
  const fotoUrls = item.photos
    .map((foto) => firmadas.get(foto.path))
    .filter((url): url is string => Boolean(url));

  return (
    <Suspense>
      <ItemDetail
        item={item}
        store={membresia.store}
        fotoUrls={fotoUrls}
        historial={eventos.data ?? []}
      />
    </Suspense>
  );
}
