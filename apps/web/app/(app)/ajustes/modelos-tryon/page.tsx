import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ModelosTryonPanel } from '@/components/ajustes/ModelosTryonPanel';
import { getMembresia } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ModelosTryonPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  return (
    <main className="mx-auto max-w-md px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/ajustes" className="tap text-label text-muted">
          ‹ Ajustes
        </Link>
        <h1 className="text-title">Fotos de modelos</h1>
      </header>

      <p className="mb-4 text-label text-muted">
        Se usan para generar automáticamente la foto de &quot;puesta&quot; de cada prenda nueva.
        Es una librería compartida, no por tienda.
      </p>

      <ModelosTryonPanel />
    </main>
  );
}
