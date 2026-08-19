import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fotos base de modelos para el try-on automático. Es una librería
 * compartida (no por tienda): cualquier dueña la arma y todas la usan
 * a la hora de generar la 3ra foto de una prenda.
 */

export type GeneroModelo = 'dama' | 'varon';

export interface ModeloFoto {
  path: string;
  url: string;
}

export function rutaModelo(genero: GeneroModelo): string {
  return `${genero}/${crypto.randomUUID()}.jpg`;
}

export async function listarModelos(
  supabase: SupabaseClient,
  genero: GeneroModelo,
): Promise<ModeloFoto[]> {
  const { data, error } = await supabase.storage.from('tryon-models').list(genero, {
    limit: 1000,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error || !data) return [];

  const paths = data
    .filter((f) => f.id) // descarta el placeholder de carpeta vacía
    .map((f) => `${genero}/${f.name}`);
  if (paths.length === 0) return [];

  const { data: firmadas } = await supabase.storage
    .from('tryon-models')
    .createSignedUrls(paths, 3600);

  return (firmadas ?? [])
    .filter((u) => !!u.signedUrl && !!u.path)
    .map((u) => ({ path: u.path as string, url: u.signedUrl as string }));
}

export async function borrarModelo(supabase: SupabaseClient, path: string) {
  return supabase.storage.from('tryon-models').remove([path]);
}

/**
 * Dispara la generación de la 3ra foto (try-on) sin esperar el resultado.
 * Tarda 10-30s, así que no debe frenar el guardado de la prenda: si falla
 * o no aplica (sin fotos de modelos, categoría no soportada, etc.) la
 * prenda queda igual que antes, con sus fotos manuales.
 */
export function dispararGeneracionTryon(supabase: SupabaseClient, itemId: string) {
  void supabase.functions.invoke('generar-tryon', { body: { itemId } });
}
