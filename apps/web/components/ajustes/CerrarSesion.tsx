'use client';

import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

export function CerrarSesion() {
  const router = useRouter();

  async function salir() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void salir()}
      className="tap w-full py-3 text-center text-label text-status-sold"
    >
      Cerrar sesión
    </button>
  );
}
