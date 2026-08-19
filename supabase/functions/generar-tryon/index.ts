// Función Edge: genera la 3ra foto de una prenda ("puesta" sobre un
// modelo) llamando al backend de Probador Virtual.
//
// La invoca el cliente justo después de crear la prenda, sin esperar el
// resultado (fire-and-forget): la generación tarda 10-30s y no debe
// frenar el alta, que hoy es casi instantánea. Si algo falla acá, la
// prenda queda igual que antes de este cambio — con sus fotos manuales,
// nada más.
//
// Variables de entorno (se configuran con `supabase secrets set`, nunca
// viven en este repo):
//   TRYON_API_URL       → backend de Probador Virtual (Render.com)
//   TRYON_APP_PASSWORD  → misma contraseña que exige ese backend
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TRYON_API_URL = Deno.env.get('TRYON_API_URL');
const TRYON_APP_PASSWORD = Deno.env.get('TRYON_APP_PASSWORD');

// La llama el navegador (supabase.functions.invoke desde PrendaForm /
// CargaRapidaForm), que corre en otro origen que el de la Función Edge:
// sin estos headers el navegador bloquea la respuesta antes de que el
// código de la app la vea.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

type Genero = 'dama' | 'varon';
type Categoria = 'upper_body' | 'lower_body' | 'dresses';

/**
 * Las categorías de prenda son texto libre por tienda (p.ej. "Casacas",
 * "Jeans"), así que no hay un mapeo exacto a las 3 categorías que exige
 * el modelo de try-on. Esta es una heurística por palabras clave sobre
 * el set de categorías por defecto y sus variantes comunes en español;
 * ante la duda, cae en "upper_body" salvo que el nombre indique lo
 * contrario. El calzado y los accesorios se descartan antes de llegar
 * acá (no tiene sentido "probárselos" con este tipo de composición).
 */
function categoriaDePrenda(nombreCategoria: string | null): Categoria {
  const n = (nombreCategoria ?? '').toLowerCase();
  if (/vestido|enterizo|mono\b/.test(n)) return 'dresses';
  if (/pantal|jean|short|falda|bermuda/.test(n)) return 'lower_body';
  return 'upper_body';
}

function esCalzadoOAccesorio(groupName: string | null, nombreCategoria: string | null): boolean {
  if (groupName === 'calzado') return true;
  const n = (nombreCategoria ?? '').toLowerCase();
  return /zapat|zapatilla|calzado|accesor|gorra|cartera|bolso|correa|lente/.test(n);
}

async function elegirModeloAleatorio(genero: Genero): Promise<string | null> {
  for (const g of genero === 'dama' ? (['dama', 'varon'] as const) : (['varon', 'dama'] as const)) {
    const { data } = await supabase.storage.from('tryon-models').list(g, { limit: 1000 });
    const archivos = (data ?? []).filter((f) => f.id);
    if (archivos.length > 0) {
      const elegido = archivos[Math.floor(Math.random() * archivos.length)];
      return `${g}/${elegido.name}`;
    }
  }
  return null;
}

function dataUriABytes(dataUri: string): Uint8Array {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  if (!TRYON_API_URL || !TRYON_APP_PASSWORD) {
    return json({ generado: false, motivo: 'Probador Virtual no está configurado (faltan secrets)' });
  }

  const { itemId } = await req.json();
  if (!itemId) return json({ error: 'Falta itemId' }, 400);

  const { data: item } = await supabase
    .from('items')
    .select(
      'id, store_id, gender, category_id, size_id, brand_id, categories(name), sizes(group_name), brands(name)',
    )
    .eq('id', itemId)
    .maybeSingle();

  if (!item) return json({ generado: false, motivo: 'prenda no existe' });

  const nombreCategoria = (item.categories as { name: string } | null)?.name ?? null;
  const grupoTalla = (item.sizes as { group_name: string } | null)?.group_name ?? null;

  if (esCalzadoOAccesorio(grupoTalla, nombreCategoria)) {
    return json({ generado: false, motivo: 'categoría no aplica a try-on' });
  }

  const { data: existente } = await supabase
    .from('item_photos')
    .select('position')
    .eq('item_id', itemId)
    .in('position', [1, 3]);

  const tienePosicion1 = existente?.some((f) => f.position === 1);
  const tienePosicion3 = existente?.some((f) => f.position === 3);

  if (!tienePosicion1) return json({ generado: false, motivo: 'la prenda no tiene foto' });
  if (tienePosicion3) return json({ generado: false, motivo: 'ya tiene 3ra foto' });

  const { data: foto1 } = await supabase
    .from('item_photos')
    .select('storage_path')
    .eq('item_id', itemId)
    .eq('position', 1)
    .single();

  const genero: Genero = item.gender === 'varon' ? 'varon' : item.gender === 'dama' ? 'dama' : Math.random() < 0.5 ? 'dama' : 'varon';

  const rutaModelo = await elegirModeloAleatorio(genero);
  if (!rutaModelo) return json({ generado: false, motivo: 'sin fotos de modelos cargadas' });

  const [modeloDescarga, garmentDescarga] = await Promise.all([
    supabase.storage.from('tryon-models').download(rutaModelo),
    supabase.storage.from('item-photos').download(foto1!.storage_path),
  ]);

  if (!modeloDescarga.data || !garmentDescarga.data) {
    return json({ generado: false, motivo: 'no se pudo leer alguna de las fotos' });
  }

  const form = new FormData();
  form.set('model_image', modeloDescarga.data, 'modelo.jpg');
  form.set('garment_1', garmentDescarga.data, 'prenda.jpg');
  form.set('category_1', categoriaDePrenda(nombreCategoria));
  const marca = (item.brands as { name: string } | null)?.name;
  form.set('description_1', [nombreCategoria, marca].filter(Boolean).join(' '));

  const controlador = new AbortController();
  const tiempoFuera = setTimeout(() => controlador.abort(), 90_000);

  let resultado: { result_image: string };
  try {
    const respuesta = await fetch(`${TRYON_API_URL}/api/tryon`, {
      method: 'POST',
      headers: { 'X-App-Password': TRYON_APP_PASSWORD },
      body: form,
      signal: controlador.signal,
    });
    if (!respuesta.ok) {
      return json({ generado: false, motivo: `backend respondió ${respuesta.status}` });
    }
    resultado = await respuesta.json();
  } catch (error) {
    return json({
      generado: false,
      motivo: error instanceof Error ? error.message : 'fallo al llamar al backend',
    });
  } finally {
    clearTimeout(tiempoFuera);
  }

  const bytes = dataUriABytes(resultado.result_image);
  const path = `${item.store_id}/${itemId}/3.jpg`;

  const { error: subidaError } = await supabase.storage
    .from('item-photos')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (subidaError) {
    return json({ generado: false, motivo: `no se pudo guardar: ${subidaError.message}` });
  }

  const { error: filaError } = await supabase.from('item_photos').insert({
    item_id: itemId,
    store_id: item.store_id,
    storage_path: path,
    position: 3,
    bytes: bytes.byteLength,
    status: 'ready',
  });
  if (filaError) {
    return json({ generado: false, motivo: `no se pudo registrar: ${filaError.message}` });
  }

  return json({ generado: true });
});
