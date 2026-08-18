import { redirect } from 'next/navigation';

import { BottomNav } from '@/components/BottomNav';
import { Fab } from '@/components/Fab';
import { ToastProvider } from '@/components/Toast';
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

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  return (
    <ToastProvider>
      {/* El padding inferior reserva el sitio de la barra fija */}
      <div className="min-h-dvh pb-24">{children}</div>
      <Fab />
      <BottomNav alertas={count ?? 0} />
    </ToastProvider>
  );
}
