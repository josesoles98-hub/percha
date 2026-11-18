import { redirect } from 'next/navigation';

import { BottomNav } from '@/components/BottomNav';
import { Fab } from '@/components/Fab';
import { SelectorTiendas, type TiendaDelSelector } from '@/components/SelectorTiendas';
import { ToastProvider } from '@/components/Toast';
import { getMembresia, listarMembresias } from '@/lib/data/tienda-activa';
import { urlPublicaLogo } from '@/lib/data/settings';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

import ConfigurarPage from '../configurar/page';

/**
 * Marco de la app: barra inferior, botón flotante y avisos.
 *
 * El alta rápida (/nueva) queda FUERA de este grupo a propósito: es una hoja
 * a pantalla completa y la navegación distraería del único objetivo de esa
 * pantalla, que es terminar en 20 segundos.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <ConfigurarPage />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [activa, membresias] = await Promise.all([
    getMembresia(supabase),
    listarMembresias(supabase),
  ]);

  let count = 0;
  if (activa) {
    const { count: sinLeer } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', activa.storeId)
      .is('read_at', null);
    count = sinLeer ?? 0;
  }

  let tiendas: TiendaDelSelector[] = [];
  if (membresias.length > 1) {
    const { data: logos } = await supabase
      .from('stores')
      .select('id, logo_path, logo_dark')
      .in(
        'id',
        membresias.map((m) => m.storeId),
      );
    tiendas = membresias.map((m) => {
      const logo = logos?.find((l) => l.id === m.storeId);
      return {
        id: m.storeId,
        nombre: m.store.name,
        logoUrl: urlPublicaLogo(supabase, logo?.logo_path as string | null),
        logoOscuro: Boolean(logo?.logo_dark),
      };
    });
  }

  return (
    <ToastProvider>
      {/* Con más de una tienda: sus logos arriba para pasar de una a otra */}
      {activa && tiendas.length > 1 && (
        <SelectorTiendas tiendas={tiendas} activaId={activa.storeId} />
      )}
      {/* El padding inferior reserva el sitio de la barra fija */}
      <div className="min-h-dvh pb-24">{children}</div>
      <Fab />
      <BottomNav alertas={count} />
    </ToastProvider>
  );
}
