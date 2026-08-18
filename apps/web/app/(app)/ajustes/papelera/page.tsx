import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PapeleraList } from '@/components/ajustes/PapeleraList';
import { getMembresia } from '@/lib/data/inventory';
import { listarPapelera } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AjustesPapeleraPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const prendas = await listarPapelera(supabase, membresia.storeId);

  return (
    <main className="mx-auto max-w-md px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/ajustes" className="tap text-label text-muted">
          ‹ Ajustes
        </Link>
        <h1 className="text-title">Papelera</h1>
      </header>

      {prendas.length > 0 && (
        <p className="pb-3 text-caption text-muted">
          Restaurar devuelve la prenda al inventario.
          {membresia.role === 'owner'
            ? ' Borrar definitivamente elimina también fotos e historial.'
            : ' Solo el dueño puede borrar definitivamente.'}
        </p>
      )}

      <PapeleraList
        prendas={prendas}
        simbolo={membresia.store.currencySymbol}
        esDueno={membresia.role === 'owner'}
      />
    </main>
  );
}
