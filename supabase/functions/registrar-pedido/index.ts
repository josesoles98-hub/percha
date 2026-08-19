// Función Edge: link único y fijo (uno por tienda) donde un cliente
// registra su propia compra de punta a punta, sin que la dueña tenga que
// crear el pedido primero. Pensado sobre todo para ventas de prendas que
// todavía no están en el catálogo — el cliente pone sus datos, describe
// qué compró y sube una foto; acá se arma el cliente + pedido + envío, y
// se avisa por push, igual que completar-pedido.
//
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_* los inyecta Supabase o
// ya están configurados desde publicar-cola.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
if (VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const PACKAGE_TYPES = ['SOBRE', 'PAQUETE XXS', 'PAQUETE XS', 'PAQUETE S', 'PAQUETE M', 'PAQUETE L'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

async function manejarGet(storeId: string | null) {
  if (!storeId) return json({ error: 'Falta storeId' }, 400);

  const { data: tienda } = await supabase
    .from('stores')
    .select('name, shalom_origin_agency_id, default_package_type')
    .eq('id', storeId)
    .maybeSingle();
  if (!tienda) return json({ error: 'No encontramos esa tienda' }, 404);
  if (!tienda.shalom_origin_agency_id) {
    return json({ error: 'La tienda todavía no configuró su agencia de origen' }, 400);
  }

  const { data: agencias } = await supabase
    .from('shalom_agencies')
    .select('id, name')
    .eq('is_destiny', true)
    .order('name');

  return json({
    storeName: tienda.name,
    defaultPackageType: tienda.default_package_type,
    agencias: agencias ?? [],
  });
}

async function manejarPost(req: Request) {
  const form = await req.formData();
  const storeId = form.get('storeId')?.toString();
  if (!storeId) return json({ error: 'Falta storeId' }, 400);

  const { data: tienda } = await supabase
    .from('stores')
    .select('shalom_origin_agency_id')
    .eq('id', storeId)
    .maybeSingle();
  if (!tienda?.shalom_origin_agency_id) {
    return json({ error: 'La tienda todavía no configuró su agencia de origen' }, 400);
  }

  const fullName = form.get('fullName')?.toString().trim();
  const docType = form.get('docType')?.toString() || 'DNI';
  const docNumber = form.get('docNumber')?.toString().trim() || null;
  const phone = form.get('phone')?.toString().trim() || null;
  const destinyAgencyId = Number(form.get('destinyAgencyId')?.toString() || 0) || null;
  const packageTypeRaw = form.get('packageType')?.toString();
  const packageType = packageTypeRaw && PACKAGE_TYPES.includes(packageTypeRaw) ? packageTypeRaw : null;
  const packagesCountRaw = Number(form.get('packagesCount')?.toString() || 1);
  const packagesCount = Number.isInteger(packagesCountRaw) && packagesCountRaw > 0 ? packagesCountRaw : 1;
  const nota = form.get('nota')?.toString().trim() || null;

  if (!fullName || !docNumber || !phone || !destinyAgencyId || !packageType) {
    return json({ error: 'Faltan datos: nombre, documento, teléfono, agencia y tipo de paquete.' }, 400);
  }

  // Reusa el cliente si ya compró antes con el mismo documento; si no,
  // crea uno nuevo. Evita duplicar clientes cuando alguien usa el link
  // más de una vez.
  const { data: clienteExistente } = await supabase
    .from('customers')
    .select('id')
    .eq('store_id', storeId)
    .eq('doc_type', docType)
    .eq('doc_number', docNumber)
    .maybeSingle();

  let customerId = clienteExistente?.id as string | undefined;

  if (!customerId) {
    const { data: nuevoCliente, error: clienteError } = await supabase
      .from('customers')
      .insert({ store_id: storeId, full_name: fullName, doc_type: docType, doc_number: docNumber, phone })
      .select('id')
      .single();
    if (clienteError || !nuevoCliente) {
      return json({ error: 'No se pudo registrar el cliente' }, 500);
    }
    customerId = nuevoCliente.id;
  } else {
    await supabase.from('customers').update({ phone }).eq('id', customerId);
  }

  const ahora = new Date().toISOString();
  const { data: pedido, error: pedidoError } = await supabase
    .from('orders')
    .insert({
      store_id: storeId,
      customer_id: customerId,
      status: 'draft',
      notes: nota,
      customer_data_submitted_at: ahora,
    })
    .select('id, code')
    .single();
  if (pedidoError || !pedido) {
    return json({ error: 'No se pudo crear el pedido' }, 500);
  }

  const { error: envioError } = await supabase.from('shipments').insert({
    store_id: storeId,
    order_id: pedido.id,
    origin_agency_id: tienda.shalom_origin_agency_id,
    destiny_agency_id: destinyAgencyId,
    package_type: packageType,
    packages_count: packagesCount,
  });
  if (envioError) {
    await supabase.from('orders').delete().eq('id', pedido.id);
    return json({ error: 'No se pudo registrar el envío' }, 500);
  }

  const fotos = form.getAll('fotos').filter((f): f is File => f instanceof File && f.size > 0);
  await Promise.all(
    fotos.map((foto, indice) =>
      supabase.storage
        .from('order-photos')
        .upload(`${storeId}/${pedido.id}/${indice + 1}.jpg`, foto, {
          contentType: 'image/jpeg',
          upsert: true,
        }),
    ),
  );

  await avisarATienda(storeId, pedido.code, fullName);

  return json({ ok: true, code: pedido.code });
}

async function avisarATienda(storeId: string, orderCode: string, nombreCliente: string) {
  if (!VAPID_PRIVATE_KEY) return;

  const { data: suscripciones } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('store_id', storeId);
  if (!suscripciones || suscripciones.length === 0) return;

  const payload = JSON.stringify({
    titulo: `Nuevo registro: ${nombreCliente}`,
    cuerpo: `${orderCode} — toca para verlo y empacarlo.`,
    url: `/pedidos/${orderCode}`,
  });

  const resultados = await Promise.allSettled(
    suscripciones.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload),
    ),
  );

  await Promise.all(
    resultados.map(async (resultado, indice) => {
      if (resultado.status !== 'rejected') return;
      const codigo = (resultado.reason as { statusCode?: number })?.statusCode;
      if (codigo === 404 || codigo === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', suscripciones[indice].id);
      }
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  if (req.method === 'GET') return manejarGet(url.searchParams.get('storeId'));
  if (req.method === 'POST') return manejarPost(req);

  return json({ error: 'Método no permitido' }, 405);
});
