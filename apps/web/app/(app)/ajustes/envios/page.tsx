import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { PackageType } from '@percha/core';

import { EnviosForm } from '@/components/ajustes/EnviosForm';
import { getMembresia } from '@/lib/data/inventory';
import { getAgencia } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AjustesEnviosPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { data: tienda } = await supabase
    .from('stores')
    .select('shalom_origin_agency_id, default_package_type')
    .eq('id', membresia.storeId)
    .maybeSingle();

  const origenId = tienda?.shalom_origin_agency_id as number | null;
  const origen = origenId ? await getAgencia(supabase, origenId) : null;

  return (
    <main className="mx-auto max-w-md px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/ajustes" className="tap text-label text-muted">
          ‹ Ajustes
        </Link>
        <h1 className="text-title">Envíos</h1>
      </header>

      <EnviosForm
        storeId={membresia.storeId}
        origenInicial={origen}
        paqueteInicial={(tienda?.default_package_type as PackageType) ?? 'PAQUETE XS'}
        puedeEditar={membresia.role === 'owner'}
      />
    </main>
  );
}
