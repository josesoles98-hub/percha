import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CerrarSesion } from '@/components/ajustes/CerrarSesion';
import { ExportarCsv } from '@/components/ajustes/ExportarCsv';
import { InstalarApp } from '@/components/ajustes/InstalarApp';
import { getMembresia } from '@/lib/data/inventory';
import { getAgencia } from '@/lib/data/orders';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AjustesPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { store, role, storeId } = membresia;
  const esDueno = role === 'owner';

  const [{ count: enPapelera }, { data: tienda }] = await Promise.all([
    supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .not('deleted_at', 'is', null),
    supabase
      .from('stores')
      .select('shalom_origin_agency_id')
      .eq('id', storeId)
      .maybeSingle(),
  ]);

  const origenId = tienda?.shalom_origin_agency_id as number | null;
  const agenciaOrigen = origenId ? (await getAgencia(supabase, origenId))?.name ?? null : null;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="py-4">
        <h1 className="text-title">Ajustes</h1>
        {!esDueno && (
          <p className="mt-1 text-caption text-muted">
            Algunos ajustes solo puede cambiarlos el dueño de la tienda.
          </p>
        )}
      </header>

      <Seccion titulo="Tienda">
        <Fila href="/ajustes/tienda" icono="🏪" etiqueta="Datos de la tienda" valor={store.name} />
        <Fila
          href="/ajustes/reservas"
          icono="⏱"
          etiqueta="Días de reserva"
          valor={`${store.reserveDays} ${store.reserveDays === 1 ? 'día' : 'días'}`}
        />
        <Fila href="/ajustes/compartir" icono="💬" etiqueta="Mensaje para compartir" />
      </Seccion>

      <Seccion titulo="Envíos">
        <Fila
          href="/ajustes/envios"
          icono="📦"
          etiqueta="Shalom"
          valor={agenciaOrigen ?? 'sin configurar'}
        />
      </Seccion>

      <Seccion titulo="Catálogos">
        <Fila href="/ajustes/catalogo/marcas" icono="👟" etiqueta="Marcas" />
        <Fila href="/ajustes/catalogo/categorias" icono="🏷" etiqueta="Categorías" />
        <Fila href="/ajustes/catalogo/tallas" icono="📏" etiqueta="Tallas" />
        <Fila href="/ajustes/catalogo/colores" icono="🎨" etiqueta="Colores" />
      </Seccion>

      <Seccion titulo="Datos">
        <Fila
          href="/ajustes/papelera"
          icono="🗑"
          etiqueta="Papelera"
          valor={enPapelera ? String(enPapelera) : undefined}
        />
      </Seccion>

      <div className="mt-3">
        <ExportarCsv storeId={storeId} store={store} />
      </div>

      <InstalarApp />

      <p className="mt-6 px-1 text-caption text-muted">
        El equipo y las invitaciones llegan más adelante.
      </p>

      <div className="mt-8 border-t border-line pt-2 pb-8">
        <CerrarSesion />
        <p className="pb-2 text-center text-caption text-muted">Percha v0.1</p>
      </div>
    </main>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <p className="mb-2 px-1 text-caption font-medium uppercase tracking-wide text-muted">
        {titulo}
      </p>
      <div className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

function Fila({
  href,
  icono,
  etiqueta,
  valor,
}: {
  href: string;
  icono: string;
  etiqueta: string;
  valor?: string;
}) {
  return (
    <Link href={href} className="tap flex items-center gap-3 px-4 py-3">
      <span aria-hidden>{icono}</span>
      <span className="flex-1">{etiqueta}</span>
      {valor && <span className="max-w-[40%] truncate text-label text-muted">{valor}</span>}
      <span className="text-muted" aria-hidden>
        ›
      </span>
    </Link>
  );
}
