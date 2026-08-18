import { notFound, redirect } from 'next/navigation';

import { ReservarVariasForm } from '@/components/reservas/ReservarVariasForm';
import { ToastProvider } from '@/components/Toast';
import { firmarFotos, getMembresia, getPrendaPorCodigo } from '@/lib/data/inventory';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Reserva de varias prendas a la vez: /reservar/nuevo?prenda=PR-000128
 *
 * Fuera del grupo (app), a pantalla completa, igual que /pedidos/nuevo.
 */
export default async function ReservarNuevoPage({
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

  // Solo tiene sentido arrancar una reserva desde una prenda disponible:
  // si ya está reservada o vendida, cambiarle el estado aquí la dejaría en
  // un estado incoherente.
  if (item.effectiveStatus !== 'available') redirect(`/prenda/${item.code}`);

  const rutaFoto = item.photos.find((f) => f.position === 1)?.path;
  const fotoUrlInicial = rutaFoto ? ((await firmarFotos(supabase, [rutaFoto])).get(rutaFoto) ?? null) : null;

  return (
    <ToastProvider>
      <ReservarVariasForm
        storeId={membresia.storeId}
        store={membresia.store}
        item={item}
        fotoUrlInicial={fotoUrlInicial}
      />
    </ToastProvider>
  );
}
