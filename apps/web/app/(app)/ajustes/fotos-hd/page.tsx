import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CalidadHdForm } from '@/components/ajustes/CalidadHdForm';
import { FotosHdPanel, type FiltroHd } from '@/components/ajustes/FotosHdPanel';
import { ToastProvider } from '@/components/Toast';
import { listarCalidadFotos, resumirCalidad } from '@/lib/data/fotos-hd';
import { getMembresia } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const FILTROS_VALIDOS: FiltroHd[] = ['sin-hd', 'hd', 'todas'];

export default async function AjustesFotosHdPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { ver } = await searchParams;
  const filtro = FILTROS_VALIDOS.find((f) => f === ver) ?? 'sin-hd';

  const [prendas, { data: tienda }] = await Promise.all([
    listarCalidadFotos(supabase, membresia.storeId),
    supabase.from('stores').select('hd_max_side').eq('id', membresia.storeId).maybeSingle(),
  ]);

  return (
    <main className="mx-auto max-w-md px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/ajustes" className="tap text-label text-muted">
          ‹ Ajustes
        </Link>
        <h1 className="text-title">Fotos en HD</h1>
      </header>

      <ToastProvider>
        <div className="mb-5">
          <CalidadHdForm
            storeId={membresia.storeId}
            inicial={tienda?.hd_max_side === 4000 ? 4000 : 2048}
            puedeEditar={membresia.role === 'owner'}
          />
        </div>
      </ToastProvider>

      <FotosHdPanel prendas={prendas} resumen={resumirCalidad(prendas)} filtro={filtro} />
    </main>
  );
}
