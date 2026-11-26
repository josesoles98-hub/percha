// Función Edge: promo para los clientes que están acumulando.
//
// La llama pg_cron una vez al día (10:00 de Lima, migración
// 20261126100000). Por cada tienda con la promo activada:
//   1. Trae de HighLevel los contactos con la etiqueta "acumula".
//   2. Anota desde cuándo los ve acumulando (agent_promos.first_seen_at).
//   3. Al cumplirse el día configurado (10 por defecto), y si nunca
//      recibieron la promo, deja un BORRADOR en la bandeja del agente:
//      "una prenda más de S/25 o más en 24 h y el envío sale gratis",
//      con el link del catálogo. La dueña lo aprueba; nunca se envía solo.
//
// Sin IA: el mensaje es una plantilla, así que no cuesta nada.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

import { contactosConEtiqueta, conversacionDeContacto } from '../_shared/highlevel.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

/** Dominio de la app, para armar el link del catálogo. */
const APP_URL = (Deno.env.get('PERCHA_URL') ?? 'https://tienda-app-omega.vercel.app').replace(/\/$/, '');
const DIA_MS = 86_400_000;

interface Tienda {
  store_id: string;
  hl_location_id: string;
  promo_day: number;
  promo_min_soles: number;
}

function primerNombre(c: { firstName?: string | null; contactName?: string | null }) {
  const n = (c.firstName || c.contactName || '').trim().split(/\s+/)[0] ?? '';
  // "WhatsApp User", números, etc.: mejor sin nombre.
  return /^[a-záéíóúñ]{2,}$/i.test(n) && !/whatsapp/i.test(n)
    ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
    : '';
}

function mensajePromo(nombre: string, minimo: number, linkCatalogo: string | null) {
  return [
    `¡Hola${nombre ? ` ${nombre}` : ''}! 🤍 Como llevas unos días acumulando, te tenemos un regalo:`,
    `si eliges *una prenda más de S/${minimo} o más* en las próximas *24 horas*, tu envío te sale *GRATIS* 📦✨`,
    '',
    linkCatalogo ? `Mira todas las prendas aquí 👉 ${linkCatalogo}` : 'Escríbenos y te mostramos lo nuevo ☺️',
    '',
    '¿Te animas?',
  ].join('\n');
}

async function avisar(storeId: string, titulo: string, cuerpo: string) {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('store_id', storeId);
  await Promise.allSettled(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ titulo, cuerpo, url: '/agente' }),
        );
      } catch (e) {
        const codigo = (e as { statusCode?: number })?.statusCode;
        if (codigo === 404 || codigo === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id);
      }
    }),
  );
}

async function revisarTienda(t: Tienda) {
  const { data: tienda } = await supabase
    .from('stores')
    .select('catalog_enabled, catalog_slug')
    .eq('id', t.store_id)
    .maybeSingle();
  const linkCatalogo =
    tienda?.catalog_enabled && tienda.catalog_slug ? `${APP_URL}/c/${tienda.catalog_slug}` : null;

  const contactos = await contactosConEtiqueta(t.hl_location_id, 'acumula');
  if (!contactos.length) return { tienda: t.store_id, acumulando: 0, promos: 0 };

  // Registrar a los que aparecen por primera vez (la cuenta empieza hoy).
  await supabase.from('agent_promos').upsert(
    contactos.map((c) => ({ store_id: t.store_id, hl_contact_id: c.id })),
    { onConflict: 'store_id,hl_contact_id', ignoreDuplicates: true },
  );

  const { data: seguimiento } = await supabase
    .from('agent_promos')
    .select('hl_contact_id, first_seen_at, offered_at')
    .eq('store_id', t.store_id)
    .in(
      'hl_contact_id',
      contactos.map((c) => c.id),
    );

  const limite = Date.now() - t.promo_day * DIA_MS;
  const toca = (seguimiento ?? []).filter((s) => !s.offered_at && Date.parse(s.first_seen_at) <= limite);

  let promos = 0;
  for (const s of toca) {
    const c = contactos.find((x) => x.id === s.hl_contact_id);
    if (!c) continue;
    const conv = await conversacionDeContacto(t.hl_location_id, c.id).catch(() => null);
    if (!conv) continue;

    const ahora = new Date().toISOString();
    const { data: draft, error } = await supabase
      .from('agent_drafts')
      .insert({
        store_id: t.store_id,
        kind: 'promo',
        hl_conversation_id: conv.id,
        hl_contact_id: c.id,
        // Único por cliente: la promo se ofrece una sola vez.
        hl_last_message_id: `promo:${c.id}`,
        contact_name: c.contactName || c.firstName || null,
        phone: c.phone ?? null,
        last_inbound_at: conv.lastMessageDate ? new Date(conv.lastMessageDate).toISOString() : ahora,
        proposed_reply: mensajePromo(primerNombre(c), t.promo_min_soles, linkCatalogo),
        human_note: `🎁 Promo de acumulado: lleva ${t.promo_day} días o más acumulando. Si elige una prenda de S/${t.promo_min_soles} o más en 24 h, su envío va gratis.`,
      })
      .select('id')
      .maybeSingle();
    if (error && error.code !== '23505') continue; // 23505 = ya tenía su promo
    await supabase
      .from('agent_promos')
      .update({ offered_at: ahora, draft_id: draft?.id ?? null })
      .eq('store_id', t.store_id)
      .eq('hl_contact_id', c.id);
    if (draft) promos++;
  }

  if (promos) {
    await avisar(
      t.store_id,
      `🎁 ${promos} ${promos === 1 ? 'promo lista' : 'promos listas'} para aprobar`,
      'Clientes que llevan días acumulando: envío gratis si suman una prenda.',
    );
  }
  return { tienda: t.store_id, acumulando: contactos.length, promos };
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

  const { data: tiendas } = await supabase
    .from('agent_settings')
    .select('store_id, hl_location_id, promo_day, promo_min_soles')
    .eq('promo_enabled', true)
    .not('hl_location_id', 'is', null);

  const resultados = [];
  for (const t of (tiendas ?? []) as Tienda[]) {
    try {
      resultados.push(await revisarTienda(t));
    } catch (e) {
      resultados.push({ tienda: t.store_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ tiendas: resultados.length, resultados });
});
