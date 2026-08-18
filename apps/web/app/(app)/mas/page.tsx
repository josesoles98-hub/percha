import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getMembresia } from '@/lib/data/inventory';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * «Más»: lo que no cabe en la barra de cinco pestañas.
 *
 * Alertas y Ajustes se agrupan aquí para que las tres pestañas del trabajo
 * diario —inventario, pedidos y envíos— tengan sitio propio.
 */
export default async function MasPage() {
  const supabase = await createClient();
  const membresia = await getMembresia(supabase);
  if (!membresia) redirect('/bienvenida');

  const { count: sinLeer } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe">
      <header className="py-4">
        <h1 className="text-title">Más</h1>
      </header>

      <div className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
        <Fila
          href="/alertas"
          icono="🔔"
          etiqueta="Alertas"
          valor={sinLeer ? `${sinLeer} sin leer` : undefined}
        />
        <Fila href="/clientes" icono="👥" etiqueta="Clientes" />
        <Fila href="/carga-rapida" icono="📦" etiqueta="Carga rápida (varias prendas)" />
        <Fila href="/publicar" icono="📣" etiqueta="Publicar" />
        <Fila href="/ajustes" icono="⚙" etiqueta="Ajustes" />
      </div>

      <p className="mt-6 px-1 text-caption text-muted">{membresia.store.name}</p>
    </main>
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
    <Link href={href} className="tap flex items-center gap-3 px-4 py-3.5">
      <span aria-hidden>{icono}</span>
      <span className="flex-1">{etiqueta}</span>
      {valor && <span className="text-label text-muted">{valor}</span>}
      <span className="text-muted" aria-hidden>
        ›
      </span>
    </Link>
  );
}
