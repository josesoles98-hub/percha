import { redirect } from 'next/navigation';

import { ColaPublicacion } from '@/components/ColaPublicacion';
import { getMembresia } from '@/lib/data/inventory';
import { getEstadoCola } from '@/lib/data/publish';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Publicar: arma una cola de prendas y el celular avisa sola, cada N
 * minutos, cuál toca compartir — con la foto y el texto ya listos.
 */
export default async function PublicarPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const estado = await getEstadoCola(supabase, membresia.storeId);

  return (
    <main className="mx-auto max-w-2xl px-4 pt-safe pb-8">
      <header className="py-4">
        <h1 className="text-title">Publicar</h1>
        <p className="text-label text-muted">
          Elige qué prendas mandar y cada cuánto. El celular te avisa cuando toca la siguiente.
        </p>
      </header>

      <ColaPublicacion
        storeId={membresia.storeId}
        simbolo={membresia.store.currencySymbol}
        estadoInicial={estado}
      />
    </main>
  );
}
