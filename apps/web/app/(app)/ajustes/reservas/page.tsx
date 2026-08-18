import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ReservasForm } from '@/components/ajustes/ReservasForm';
import { getMembresia } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AjustesReservasPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  return (
    <main className="mx-auto max-w-md px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/ajustes" className="tap text-label text-muted">
          ‹ Ajustes
        </Link>
        <h1 className="text-title">Reservas</h1>
      </header>

      <ReservasForm
        storeId={membresia.storeId}
        diasActuales={membresia.store.reserveDays}
        puedeEditar={membresia.role === 'owner'}
      />
    </main>
  );
}
