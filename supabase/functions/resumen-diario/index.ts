// Función Edge: el resumen de la mañana.
//
// La llama pg_cron todos los días a las 8:00 de Lima (migración
// 20261126090000). Por cada tienda que tiene el resumen activado arma un
// resumen corto, lo guarda en Alertas y lo manda como notificación push:
//   · cuánto se vendió ayer (Percha) y cuánto se gastó (Gastos)
//   · reservas de HighLevel que vencen hoy o mañana, y el total por cobrar
//   · reservas de Percha que vencen hoy
//   · chats esperando aprobación en el agente
//   · prendas cargadas ayer y prendas disponibles
//
// No usa IA: son cuentas, así que es gratis y no se equivoca.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

import { oportunidadesEnEtapa, type Oportunidad } from '../_shared/highlevel.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const DIAS_RESERVA = 5;
const DIA_MS = 86_400_000;

/** AAAA-MM-DD en Lima, con desplazamiento en días. */
function fechaLima(desplazamientoDias = 0) {
  return new Date(Date.now() + desplazamientoDias * DIA_MS).toLocaleDateString('en-CA', {
    timeZone: 'America/Lima',
  });
}

/** Inicio de un día de Lima (UTC-5, sin horario de verano) como ISO. */
function inicioDiaLima(fecha: string) {
  return new Date(`${fecha}T00:00:00-05:00`).toISOString();
}

function soles(centavos: number) {
  return `S/${Math.round(centavos / 100).toLocaleString('es-PE')}`;
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

interface Tienda {
  store_id: string;
  hl_location_id: string | null;
  hl_pipeline_id: string | null;
  hl_stage_reservo: string | null;
}

async function reservasHighLevel(t: Tienda) {
  if (!t.hl_location_id || !t.hl_pipeline_id || !t.hl_stage_reservo) return null;
  if (!Deno.env.get('HIGHLEVEL_TOKEN')) return null;
  try {
    const ops = await oportunidadesEnEtapa(t.hl_location_id, t.hl_pipeline_id, t.hl_stage_reservo);
    const hoy = fechaLima(0);
    const manana = fechaLima(1);
    const venceEl = (o: Oportunidad) => {
      const desde = Date.parse(o.lastStageChangeAt ?? o.createdAt ?? '');
      return Number.isNaN(desde)
        ? null
        : new Date(desde + DIAS_RESERVA * DIA_MS).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    };
    const nombre = (o: Oportunidad) => o.contact?.name || o.name || 'Cliente';
    return {
      total: ops.length,
      porCobrar: ops.reduce((s, o) => s + Math.max(0, (o.monetaryValue ?? 0) - 10), 0),
      vencenHoy: ops.filter((o) => venceEl(o) === hoy).map(nombre),
      vencenManana: ops.filter((o) => venceEl(o) === manana).map(nombre),
      vencidas: ops.filter((o) => {
        const v = venceEl(o);
        return v !== null && v < hoy;
      }).length,
    };
  } catch (e) {
    console.error('HighLevel', e);
    return null;
  }
}

function lista(nombres: string[]) {
  const max = 4;
  return nombres.length <= max
    ? nombres.join(', ')
    : `${nombres.slice(0, max).join(', ')} y ${nombres.length - max} más`;
}

async function armarResumen(t: Tienda) {
  const ayer = fechaLima(-1);
  const hoy = fechaLima(0);
  const desde = inicioDiaLima(ayer);
  const hasta = inicioDiaLima(hoy);
  const finHoy = inicioDiaLima(fechaLima(1));

  const [vendidas, gastos, cargadas, disponibles, reservasPercha, chats, hl] = await Promise.all([
    supabase
      .from('items')
      .select('sold_price_cents')
      .eq('store_id', t.store_id)
      .eq('status', 'sold')
      .is('deleted_at', null)
      .gte('sold_at', desde)
      .lt('sold_at', hasta),
    supabase.from('expenses').select('amount_cents').eq('store_id', t.store_id).eq('occurred_on', ayer),
    supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', t.store_id)
      .is('deleted_at', null)
      .gte('created_at', desde)
      .lt('created_at', hasta),
    supabase
      .from('items_view')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', t.store_id)
      .eq('effective_status', 'available'),
    supabase
      .from('items')
      .select('code, reserved_for_name')
      .eq('store_id', t.store_id)
      .eq('status', 'reserved')
      .is('deleted_at', null)
      .gt('reserve_expires_at', new Date().toISOString())
      .lt('reserve_expires_at', finHoy),
    supabase
      .from('agent_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', t.store_id)
      .eq('status', 'pending'),
    reservasHighLevel(t),
  ]);

  const ventas = vendidas.data ?? [];
  const totalVentas = ventas.reduce((s, v) => s + (v.sold_price_cents ?? 0), 0);
  const totalGastos = (gastos.data ?? []).reduce((s, g) => s + g.amount_cents, 0);

  const lineas: string[] = [];
  lineas.push(
    ventas.length
      ? `💰 Ayer vendiste ${soles(totalVentas)} (${plural(ventas.length, 'prenda', 'prendas')})${totalGastos ? ` y gastaste ${soles(totalGastos)}` : ''}.`
      : `💰 Ayer no se marcó ninguna venta en Percha${totalGastos ? ` (gastos: ${soles(totalGastos)})` : ''}.`,
  );

  if (hl) {
    if (hl.vencenHoy.length) lineas.push(`⏰ Vencen HOY: ${lista(hl.vencenHoy)}.`);
    if (hl.vencenManana.length) lineas.push(`🟠 Vencen mañana: ${lista(hl.vencenManana)}.`);
    if (hl.vencidas) lineas.push(`⚠️ ${plural(hl.vencidas, 'reserva ya venció', 'reservas ya vencieron')} y sigue en "Reservó".`);
    if (hl.total) {
      lineas.push(
        `📋 ${plural(hl.total, 'reserva abierta', 'reservas abiertas')}${hl.porCobrar ? `, unos S/${Math.round(hl.porCobrar)} por cobrar` : ''}.`,
      );
    }
  }

  const rp = reservasPercha.data ?? [];
  if (rp.length) {
    lineas.push(
      `🏷️ En Percha vencen hoy: ${lista(rp.map((r) => `${r.code}${r.reserved_for_name ? ` (${r.reserved_for_name})` : ''}`))}.`,
    );
  }

  if (chats.count) lineas.push(`💬 ${plural(chats.count, 'chat espera', 'chats esperan')} tu aprobación en el agente.`);

  lineas.push(
    `📦 ${plural(disponibles.count ?? 0, 'prenda disponible', 'prendas disponibles')}${cargadas.count ? ` (${cargadas.count} nuevas ayer)` : ''}.`,
  );

  // Lo más urgente primero en la notificación (que se corta a 2–3 líneas).
  const corto = [
    hl?.vencenHoy.length ? `⏰ ${plural(hl.vencenHoy.length, 'reserva vence', 'reservas vencen')} hoy` : '',
    chats.count ? `💬 ${chats.count} por aprobar` : '',
    ventas.length ? `💰 ayer ${soles(totalVentas)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return { cuerpo: lineas.join('\n'), corto: corto || lineas[0] };
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
          JSON.stringify({ titulo, cuerpo, url: '/alertas' }),
        );
      } catch (e) {
        const codigo = (e as { statusCode?: number })?.statusCode;
        if (codigo === 404 || codigo === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }),
  );
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

  // ?prueba=1 arma el resumen y lo devuelve sin guardarlo ni avisar.
  const prueba = new URL(req.url).searchParams.get('prueba') === '1';

  const { data: tiendas } = await supabase
    .from('agent_settings')
    .select('store_id, hl_location_id, hl_pipeline_id, hl_stage_reservo')
    .eq('daily_summary', true);

  const resultados = [];
  for (const t of (tiendas ?? []) as Tienda[]) {
    try {
      const { cuerpo, corto } = await armarResumen(t);
      if (!prueba) {
        await supabase.from('notifications').insert({
          store_id: t.store_id,
          type: 'resumen_diario',
          title: `☀️ Resumen del ${new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' })}`,
          body: cuerpo,
        });
        await avisar(t.store_id, '☀️ Tu resumen de hoy', corto);
      }
      resultados.push({ tienda: t.store_id, ok: true, ...(prueba ? { cuerpo } : {}) });
    } catch (e) {
      resultados.push({ tienda: t.store_id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return new Response(JSON.stringify({ tiendas: resultados.length, resultados }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
