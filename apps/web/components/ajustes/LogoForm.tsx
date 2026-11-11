'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/Toast';
import { actualizarTienda } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/client';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Logo de la tienda: el que ve el cliente en su formulario de registro y
 * el que sale en el rótulo del paquete. Cada tienda tiene el suyo.
 */
export function LogoForm({
  storeId,
  nombreTienda,
  logoUrlInicial,
  oscuroInicial,
  puedeEditar,
}: {
  storeId: string;
  nombreTienda: string;
  logoUrlInicial: string | null;
  oscuroInicial: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { mostrar } = useToast();

  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [oscuro, setOscuro] = useState(oscuroInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La vista previa de un archivo recién elegido es una URL temporal del
  // navegador: hay que soltarla para no dejar memoria colgada.
  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  const mostrado = vista ?? logoUrlInicial;
  const hayCambios = archivo !== null || oscuro !== oscuroInicial;

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!TIPOS.includes(f.type) || f.size > MAX_BYTES) {
      setError('El logo debe ser una imagen JPG, PNG o WebP de hasta 2 MB.');
      return;
    }
    setError(null);
    setArchivo(f);
    setVista(URL.createObjectURL(f));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const supabase = createClient();

    let logoPath: string | undefined;
    if (archivo) {
      // Nombre nuevo cada vez: así el logo anterior no queda en la memoria
      // del navegador de quien ya abrió el link.
      logoPath = `${storeId}/logo-${Date.now()}.${EXTENSION[archivo.type]}`;
      const { error: errorSubida } = await supabase.storage
        .from('store-logos')
        .upload(logoPath, archivo, { contentType: archivo.type });
      if (errorSubida) {
        setError(errorSubida.message);
        setGuardando(false);
        return;
      }
    }

    // Un logo nuevo reemplaza también la variante de impresión que hubiera.
    const { error: errorGuardado } = await actualizarTienda(supabase, storeId, {
      logoDark: oscuro,
      ...(logoPath ? { logoPath, rotuloLogoPath: null } : {}),
    });

    setGuardando(false);
    if (errorGuardado) {
      setError(errorGuardado);
      return;
    }

    setArchivo(null);
    setVista(null);
    mostrar('Logo guardado');
    router.refresh();
  }

  async function quitar() {
    setGuardando(true);
    const { error: errorQuitar } = await actualizarTienda(createClient(), storeId, {
      logoPath: null,
      rotuloLogoPath: null,
    });
    setGuardando(false);
    if (errorQuitar) {
      setError(errorQuitar);
      return;
    }
    mostrar('Logo quitado');
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-8">
      <div
        className={`flex min-h-36 items-center justify-center rounded-[--radius-card] px-6 py-8 ${
          oscuro ? 'bg-black' : 'border border-line bg-surface'
        }`}
      >
        {mostrado ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mostrado} alt={`Logo de ${nombreTienda}`} className="h-auto max-h-40 w-full max-w-64 object-contain" />
        ) : (
          <p className="text-title font-bold">{nombreTienda}</p>
        )}
      </div>
      <p className="-mt-3 text-caption text-muted">
        {mostrado
          ? 'Así lo ve tu cliente arriba de su formulario de registro.'
          : 'Todavía no subiste un logo: tus clientes ven solo el nombre de tu tienda.'}
      </p>

      {puedeEditar ? (
        <>
          <div>
            <label className="tap flex w-full cursor-pointer items-center justify-center rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-label font-medium">
              {mostrado ? 'Cambiar logo' : 'Subir logo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={elegir} />
            </label>
            <p className="mt-2 text-caption text-muted">JPG, PNG o WebP, hasta 2 MB.</p>
          </div>

          <label className="flex items-start gap-3 text-label">
            <input
              type="checkbox"
              checked={oscuro}
              onChange={(e) => setOscuro(e.target.checked)}
              className="mt-1 size-5"
            />
            <span>
              Mi logo es de letras claras sobre fondo negro
              <span className="mt-1 block text-caption text-muted">
                Con esto se le pone fondo negro en el formulario y se invierte al imprimir el rótulo.
              </span>
            </span>
          </label>

          {error && (
            <p role="alert" className="text-label text-status-sold">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || !hayCambios}
            className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>

          {logoUrlInicial && (
            <button
              type="button"
              onClick={() => void quitar()}
              disabled={guardando}
              className="tap w-full text-label text-muted underline disabled:opacity-40"
            >
              Quitar logo
            </button>
          )}
        </>
      ) : (
        <p className="text-caption text-muted">Solo el dueño puede cambiar el logo.</p>
      )}
    </div>
  );
}
