import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LogoForm } from '@/components/ajustes/LogoForm';
import { getMembresia } from '@/lib/data/inventory';
import { urlPublicaLogo } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AjustesLogoPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { data: tienda } = await supabase
    .from('stores')
    .select('logo_path, logo_dark')
    .eq('id', membresia.storeId)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-md px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/ajustes" className="tap text-label text-muted">
          ‹ Ajustes
        </Link>
        <h1 className="text-title">Logo</h1>
      </header>

      <LogoForm
        storeId={membresia.storeId}
        nombreTienda={membresia.store.name}
        logoUrlInicial={urlPublicaLogo(supabase, tienda?.logo_path as string | null)}
        oscuroInicial={Boolean(tienda?.logo_dark)}
        puedeEditar={membresia.role === 'owner'}
      />
    </main>
  );
}
