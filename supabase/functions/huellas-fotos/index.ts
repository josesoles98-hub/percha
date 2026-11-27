// Función Edge: saca la "huella" de las fotos de Percha que aún no la tienen.
//
// La llama pg_cron cada 2 minutos (migración 20261127100000). Cada vuelta
// procesa un lote; las fotos viejas se completan en las primeras horas y
// después solo quedan las nuevas que vas subiendo. El agente usa la huella
// para reconocer la prenda cuando un cliente reenvía la foto del grupo.
// Sin IA: no cuesta nada.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { huellaDeJpeg } from '../_shared/huella.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const LOTE = 60;
const EN_PARALELO = 6;
const BUCKET = 'item-photos';

/**
 * Baja una MINIATURA de la foto: decodificar la foto entera tarda ~0,5 s de
 * CPU y una Función Edge tiene 2 s por llamada; la miniatura, milisegundos.
 */
async function bajar(ruta: string): Promise<Uint8Array | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .download(ruta, { transform: { width: 256, quality: 70, format: 'origin' } });
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

function esClaveDeAdministracion(cabecera: string) {
  const token = cabecera.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true;
  try {
    const carga = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return carga?.role === 'service_role';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!esClaveDeAdministracion(req.headers.get('Authorization') ?? '')) {
    return new Response('No autorizado', { status: 401 });
  }

  // Las más nuevas primero: son las que los clientes están pidiendo.
  const cuerpo = await req.json().catch(() => ({}));
  const lote = Math.min(LOTE, Math.max(1, Number(cuerpo?.lote) || LOTE));
  const { data: fotos, error } = await supabase
    .from('item_photos')
    .select('id, storage_path')
    .is('huella', null)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(lote);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let listas = 0;
  let fallidas = 0;
  let sinMiniatura = 0;
  const cola = [...(fotos ?? [])];
  await Promise.all(
    Array.from({ length: EN_PARALELO }, async () => {
      for (let f = cola.shift(); f; f = cola.shift()) {
        const bytes = await bajar(f.storage_path).catch(() => null);
        // Sin miniatura (falla pasajera o el plan no la da): se reintenta en la próxima vuelta.
        if (!bytes) {
          sinMiniatura++;
          continue;
        }
        // "x" = se bajó pero no se pudo leer: así no se reintenta para siempre.
        const huella = huellaDeJpeg(bytes) || 'x';
        await supabase.from('item_photos').update({ huella }).eq('id', f.id);
        if (huella === 'x') fallidas++;
        else listas++;
      }
    }),
  );

  const { count } = await supabase
    .from('item_photos')
    .select('id', { count: 'exact', head: true })
    .is('huella', null)
    .eq('status', 'ready');
  return Response.json({ listas, fallidas, sinMiniatura, faltan: count ?? null });
});
