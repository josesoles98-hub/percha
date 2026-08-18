import { redirect } from 'next/navigation';

import { AlertasList } from '@/components/AlertasList';
import { getMembresia } from '@/lib/data/inventory';
import { listarNotificaciones } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AlertasPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const notificaciones = await listarNotificaciones(supabase, membresia.storeId);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="py-4">
        <h1 className="text-title">Alertas</h1>
      </header>

      <AlertasList notificaciones={notificaciones} storeId={membresia.storeId} />
    </main>
  );
}
