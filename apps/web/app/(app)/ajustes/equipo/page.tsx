import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EquipoPanel } from '@/components/ajustes/EquipoPanel';
import { listarInvitaciones, listarMiembros } from '@/lib/data/equipo';
import { getMembresia } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Miembros e invitaciones. Solo la dueña: sumar gente al equipo es una
 * decisión suya, igual que ver los ajustes de la tienda.
 */
export default async function EquipoPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');
  if (membresia.role !== 'owner') redirect('/ajustes');

  const { storeId, store } = membresia;

  const [miembros, invitaciones] = await Promise.all([
    listarMiembros(supabase, storeId),
    listarInvitaciones(supabase, storeId),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/ajustes" className="tap text-label text-muted">
          ‹ Ajustes
        </Link>
        <h1 className="text-title">Equipo</h1>
      </header>

      <EquipoPanel
        storeId={storeId}
        storeName={store.name}
        miembrosIniciales={miembros}
        invitacionesIniciales={invitaciones}
      />
    </main>
  );
}
