// Función Edge: datos del catálogo público de una tienda.
//
// GET ?tienda=<slug> → tienda (nombre, logo, WhatsApp) + prendas DISPONIBLES
// con precio, cada una con sus fotos firmadas. Es pública (se despliega con
// --no-verify-jwt) porque la abren los clientes sin cuenta; por eso solo
// devuelve lo que ya se ve en los grupos: nada de costos, clientes ni
// reservas.
//
// El catálogo se mantiene solo: una prenda reservada o vendida (a mano o al
// aprobar en el agente) deja de salir en la siguiente carga.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Las fotos firmadas duran 1 día; la página se regenera mucho antes. */
const FIRMA_SEGUNDOS = 60 * 60 * 24;
const MAX_PRENDAS = 1500;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { ...CORS, 'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store' },
  });
}

interface Foto {
  path: string;
  position: number;
  status?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const slug = (new URL(req.url).searchParams.get('tienda') ?? '').toLowerCase().trim();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return json({ error: 'Catálogo no encontrado' }, 404);

  const { data: tienda } = await supabase
    .from('stores')
    .select('id, name, logo_path, whatsapp_number, currency_symbol, catalog_enabled, catalog_delay_hours')
    .eq('catalog_slug', slug)
    .maybeSingle();
  if (!tienda || !tienda.catalog_enabled) return json({ error: 'Catálogo no encontrado' }, 404);

  // Opción B: las prendas nuevas esperan unas horas (los grupos las ven primero).
  const hasta = new Date(Date.now() - (tienda.catalog_delay_hours ?? 0) * 3_600_000).toISOString();

  const { data: filas, error } = await supabase
    .from('items_view')
    .select('code, name, brand_name, size_label, category_name, category_emoji, gender, price_cents, photos, created_at')
    .eq('store_id', tienda.id)
    .eq('effective_status', 'available')
    .gt('price_cents', 0)
    .lte('created_at', hasta)
    .order('created_at', { ascending: false })
    .limit(MAX_PRENDAS);
  if (error) return json({ error: 'No se pudo cargar el catálogo' }, 500);

  // El catálogo es solo ropa: fuera las gorras (lo que la IA vio en la foto).
  const { data: gorras } = await supabase
    .from('items')
    .select('code')
    .eq('store_id', tienda.id)
    .eq('status', 'available')
    .or('ai_desc.ilike.%gorra%,ai_desc.ilike.%jockey%,ai_desc.ilike.cap %,ai_desc.ilike.% cap %');
  const sinGorras = new Set((gorras ?? []).map((g) => g.code));

  const prendas = (filas ?? []).filter((f) => !sinGorras.has(f.code)).map((f) => ({
    ...f,
    rutas: ((f.photos ?? []) as Foto[])
      .filter((p) => p.status !== 'failed')
      .sort((a, b) => a.position - b.position)
      .map((p) => p.path),
  }));

  // Firmar todas las fotos de un tirón (en lotes, por si son muchas).
  const todas = prendas.flatMap((p) => p.rutas);
  const firmadas = new Map<string, string>();
  for (let i = 0; i < todas.length; i += 500) {
    const { data } = await supabase.storage
      .from('item-photos')
      .createSignedUrls(todas.slice(i, i + 500), FIRMA_SEGUNDOS);
    for (const d of data ?? []) if (d.path && d.signedUrl) firmadas.set(d.path, d.signedUrl);
  }

  const logo = tienda.logo_path
    ? supabase.storage.from('store-logos').getPublicUrl(tienda.logo_path).data.publicUrl
    : null;

  return json({
    tienda: {
      nombre: tienda.name,
      logo,
      whatsapp: tienda.whatsapp_number,
      simbolo: tienda.currency_symbol ?? 'S/',
    },
    prendas: prendas
      .map((p) => ({
        codigo: p.code,
        nombre: p.name,
        marca: p.brand_name,
        talla: p.size_label,
        categoria: p.category_name,
        emoji: p.category_emoji,
        genero: p.gender,
        precio: p.price_cents / 100,
        fotos: p.rutas.map((r) => firmadas.get(r)).filter(Boolean),
        nueva: Date.now() - Date.parse(p.created_at) < 3 * 86_400_000,
      }))
      .filter((p) => p.fotos.length > 0),
  });
});
