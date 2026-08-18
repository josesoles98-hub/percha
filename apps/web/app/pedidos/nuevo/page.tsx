import { notFound, redirect } from 'next/navigation';
import type { PackageType } from '@percha/core';

import { NuevoPedidoForm } from '@/components/envios/NuevoPedidoForm';
import { ToastProvider } from '@/components/Toast';
import { firmarFotos, getMembresia, getPrendaPorCodigo } from '@/lib/data/inventory';
import { getAgencia } from '@/lib/data/orders';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Alta de pedido a partir de una prenda: /pedidos/nuevo?prenda=PR-000128
 *
 * Fuera del grupo (app), como el alta de prenda: es una hoja a pantalla
 * completa con un solo objetivo.
 */
export default async function NuevoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ prenda?: string }>;
}) {
  if (!isSupabaseConfigured) redirect('/configurar');

  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { prenda } = await searchParams;
  if (!prenda) redirect('/');

  const item = await getPrendaPorCodigo(supabase, membresia.storeId, prenda);
  if (!item) notFound();

  const rutaFoto = item.photos.find((f) => f.position === 1)?.path;
  const fotoUrlInicial = rutaFoto ? ((await firmarFotos(supabase, [rutaFoto])).get(rutaFoto) ?? null) : null;

  const { data: tienda } = await supabase
    .from('stores')
    .select('shalom_origin_agency_id, default_package_type')
    .eq('id', membresia.storeId)
    .maybeSingle();

  const origenId = (tienda?.shalom_origin_agency_id as number | null) ?? null;
  const origen = origenId ? await getAgencia(supabase, origenId) : null;

  return (
    <ToastProvider>
      <NuevoPedidoForm
        storeId={membresia.storeId}
        item={item}
        fotoUrlInicial={fotoUrlInicial}
        simbolo={membresia.store.currencySymbol}
        origenId={origenId}
        origenNombre={origen?.name ?? null}
        paquetePorDefecto={(tienda?.default_package_type as PackageType) ?? 'PAQUETE XS'}
      />
    </ToastProvider>
  );
}
