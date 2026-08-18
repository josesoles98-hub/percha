import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { EditorCatalogo } from '@/components/ajustes/EditorCatalogo';
import { CATALOGOS, listarCatalogo, type TipoCatalogo } from '@/lib/data/catalogos';
import { getMembresia } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Una sola ruta para los cuatro catálogos: /ajustes/catalogo/marcas,
 * /categorias, /tallas y /colores.
 */
export default async function CatalogoPage({
  params,
}: {
  params: Promise<{ tipo: string }>;
}) {
  const { tipo } = await params;
  if (!(tipo in CATALOGOS)) notFound();

  const catalogo = tipo as TipoCatalogo;
  const supabase = await createClient();

  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const entradas = await listarCatalogo(supabase, membresia.storeId, catalogo);

  return (
    <main className="mx-auto max-w-md px-4 pt-safe">
      <header className="flex items-center gap-3 py-4">
        <Link href="/ajustes" className="tap text-label text-muted">
          ‹ Ajustes
        </Link>
        <h1 className="text-title">{CATALOGOS[catalogo].plural}</h1>
      </header>

      <EditorCatalogo
        tipo={catalogo}
        entradas={entradas}
        storeId={membresia.storeId}
        // Borrar de verdad es irreversible: solo el dueño.
        puedeBorrar={membresia.role === 'owner'}
      />
    </main>
  );
}
