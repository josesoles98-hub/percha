// Función Edge: revisa qué tiendas tienen la cola de publicación activa y,
// a la que le toque, le manda la notificación push de la siguiente prenda.
//
// La llama pg_cron cada minuto (ver la migración 0011). El intervalo real
// (cada 5, 6 o 7 minutos) lo decide esta función comparando `sent_at`
// contra `publish_interval_minutes` de cada tienda — así el cron de
// Postgres no tiene que reprogramarse si el intervalo cambia.
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo en
// cada función: no viven en ningún archivo de este repo.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

interface Suscripcion {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function siguienteTiendaConTurno(storeId: string, intervaloMinutos: number) {
  const { data: ultimoEnviado } = await supabase
    .from('publish_queue')
    .select('sent_at')
    .eq('store_id', storeId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ultimoEnviado?.sent_at) {
    const pasaron = Date.now() - new Date(ultimoEnviado.sent_at).getTime();
    if (pasaron < intervaloMinutos * 60_000) return false;
  }

  return true;
}

async function avisarPrenda(storeId: string) {
  const { data: pendiente } = await supabase
    .from('publish_queue')
    .select('id, item_id')
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pendiente) {
    // No queda nada por avisar: se apaga sola.
    await supabase.from('stores').update({ publish_active: false }).eq('id', storeId);
    return { storeId, enviado: false, motivo: 'cola vacía' };
  }

  const { data: prenda } = await supabase
    .from('items_view')
    .select('code, name, price_cents, size_label, brand_name, photos')
    .eq('id', pendiente.item_id)
    .maybeSingle();

  if (!prenda) {
    // La prenda ya no existe (se borró): se salta y sigue con la próxima vez.
    await supabase.from('publish_queue').update({ status: 'skipped' }).eq('id', pendiente.id);
    return { storeId, enviado: false, motivo: 'prenda ya no existe' };
  }

  const { data: suscripciones } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('store_id', storeId);

  if (!suscripciones || suscripciones.length === 0) {
    return { storeId, enviado: false, motivo: 'sin suscripciones' };
  }

  const foto = (prenda.photos as Array<{ path: string; position: number }> | null)?.find(
    (f) => f.position === 1,
  );
  let fotoUrl: string | undefined;
  if (foto) {
    const { data: firmada } = await supabase.storage
      .from('item-photos')
      .createSignedUrl(foto.path, 3600);
    fotoUrl = firmada?.signedUrl;
  }

  const precio = (prenda.price_cents / 100).toFixed(0);
  const detalle = [prenda.brand_name, prenda.size_label ? `Talla ${prenda.size_label}` : null]
    .filter(Boolean)
    .join(' · ');

  const payload = JSON.stringify({
    titulo: `Toca para publicar: ${prenda.name ?? prenda.code}`,
    cuerpo: [detalle, `S/${precio}`].filter(Boolean).join(' — '),
    url: `/prenda/${prenda.code}?compartir=1`,
    icono: fotoUrl,
  });

  const resultados = await Promise.allSettled(
    (suscripciones as Suscripcion[]).map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      ),
    ),
  );

  // Un 404/410 significa que ese navegador ya no existe (se desinstaló la
  // app, cambió de celular): se borra para no seguir intentando en vano.
  await Promise.all(
    resultados.map(async (resultado, indice) => {
      if (resultado.status !== 'rejected') return;
      const codigo = (resultado.reason as { statusCode?: number })?.statusCode;
      if (codigo === 404 || codigo === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', suscripciones[indice].id);
      }
    }),
  );

  await supabase
    .from('publish_queue')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', pendiente.id);

  return { storeId, enviado: true, prenda: prenda.code };
}

Deno.serve(async () => {
  const { data: tiendas } = await supabase
    .from('stores')
    .select('id, publish_interval_minutes')
    .eq('publish_active', true);

  const resultados = [];
  for (const tienda of tiendas ?? []) {
    const leToca = await siguienteTiendaConTurno(tienda.id, tienda.publish_interval_minutes);
    if (leToca) resultados.push(await avisarPrenda(tienda.id));
  }

  return new Response(JSON.stringify({ revisadas: tiendas?.length ?? 0, resultados }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
