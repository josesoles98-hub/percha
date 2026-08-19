// Función Edge: el cliente completa sus propios datos de envío por un
// link (GET para precargar el formulario, POST para guardarlo), sin
// necesitar cuenta ni pertenecer a la tienda. Por eso usa la service
// role key: es la única forma de escribir en customers/shipments/orders
// sin sesión.
//
// El link usa directamente el id del pedido (un UUID v4, tan impredecible
// como un token aparte) — no hace falta una columna nueva para eso.
//
// La validación fuerte (documento bien formado, teléfono completo, etc.)
// ya vive en @percha/core y se vuelve a correr en la app antes de
// exportar a Shalom — acá solo se pide lo mínimo para no guardar campos
// vacíos, la dueña revisa antes de generar el archivo.
//
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_* los inyecta Supabase o
// ya están configurados desde la función publicar-cola.

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

async function cargarPedido(orderId: string) {
  const { data } = await supabase
    .from('orders')
    .select(
      `id, code, status, store_id, customer_id, customer_data_submitted_at,
       customers ( full_name, doc_type, doc_number, phone ),
       shipments ( destiny_agency_id, package_type, packages_count ),
       stores ( name )`,
    )
    .eq('id', orderId)
    .maybeSingle();
  return data;
}

async function manejarGet(orderId: string | null) {
  if (!orderId) return json({ error: 'Falta id' }, 400);

  const pedido = await cargarPedido(orderId);
  if (!pedido) return json({ error: 'No encontramos ese pedido' }, 404);

  const cliente = pedido.customers as {
    full_name: string;
    doc_type: string;
    doc_number: string | null;
    phone: string | null;
  } | null;
  const envio = ((pedido.shipments as unknown[]) ?? [])[0] as {
    destiny_agency_id: number | null;
    package_type: string;
    packages_count: number;
  } | undefined;
  const tienda = pedido.stores as { name: string } | null;

  // El cliente no tiene sesión, así que no puede consultar shalom_agencies
  // directamente (esa tabla exige `authenticated`): se la mandamos ya
  // resuelta acá, junto con el resto del formulario.
  const { data: agencias } = await supabase
    .from('shalom_agencies')
    .select('id, name')
    .eq('is_destiny', true)
    .order('name');

  return json({
    code: pedido.code,
    agencias: agencias ?? [],
    storeName: tienda?.name ?? 'la tienda',
    cancelado: pedido.status === 'cancelled',
    yaCompletado: Boolean(pedido.customer_data_submitted_at),
    customerName: cliente?.full_name ?? '',
    docType: cliente?.doc_type ?? 'DNI',
    docNumber: cliente?.doc_number ?? '',
    phone: cliente?.phone ?? '',
    destinyAgencyId: envio?.destiny_agency_id ?? null,
    packageType: envio?.package_type ?? 'PAQUETE XS',
    packagesCount: envio?.packages_count ?? 1,
  });
}

async function manejarPost(req: Request) {
  const form = await req.formData();
  const orderId = form.get('orderId')?.toString();
  if (!orderId) return json({ error: 'Falta orderId' }, 400);

  const pedido = await cargarPedido(orderId);
  if (!pedido) return json({ error: 'No encontramos ese pedido' }, 404);
  if (pedido.status === 'cancelled') return json({ error: 'Este pedido fue cancelado' }, 400);

  const docType = form.get('docType')?.toString() || 'DNI';
  const docNumber = form.get('docNumber')?.toString().trim() || null;
  const phone = form.get('phone')?.toString().trim() || null;
  const destinyAgencyId = Number(form.get('destinyAgencyId')?.toString() || 0) || null;
  const packageTypeRaw = form.get('packageType')?.toString();
  const packageType = packageTypeRaw && PACKAGE_TYPES.includes(packageTypeRaw) ? packageTypeRaw : null;
  const packagesCountRaw = Number(form.get('packagesCount')?.toString() || 1);
  const packagesCount = Number.isInteger(packagesCountRaw) && packagesCountRaw > 0 ? packagesCountRaw : 1;

  if (!docNumber || !phone || !destinyAgencyId || !packageType) {
    return json({ error: 'Faltan datos: documento, teléfono, agencia y tipo de paquete.' }, 400);
  }

  const { error: clienteError } = await supabase
    .from('customers')
    .update({ doc_type: docType, doc_number: docNumber, phone })
    .eq('id', pedido.customer_id);
  if (clienteError) return json({ error: 'No se pudieron guardar tus datos' }, 500);

  const { error: envioError } = await supabase
    .from('shipments')
    .update({ destiny_agency_id: destinyAgencyId, package_type: packageType, packages_count: packagesCount })
    .eq('order_id', orderId);
  if (envioError) return json({ error: 'No se pudo guardar la agencia de envío' }, 500);

  // Varias fotos, no solo una: hay ventas de prendas que todavía no están
  // en el catálogo, y una sola foto no alcanza para reconocerlas todas al
  // empacar. Ruta: {store_id}/{order_id}/{posición}.jpg
  const fotos = form.getAll('fotos').filter((f): f is File => f instanceof File && f.size > 0);
  await Promise.all(
    fotos.map((foto, indice) =>
      supabase.storage
        .from('order-photos')
        .upload(`${pedido.store_id}/${orderId}/${indice + 1}.jpg`, foto, {
          contentType: 'image/jpeg',
          upsert: true,
        }),
    ),
  );

  await supabase
    .from('orders')
    .update({ customer_data_submitted_at: new Date().toISOString() })
    .eq('id', orderId);

  await avisarATienda(pedido.store_id, pedido.code);

  return json({ ok: true });
}

/**
 * Reusa el mismo canal de push que ya arma la cola de publicación: es
 * como "aparece" el aviso, sin que tenga que estar mirando la app.
 */
async function avisarATienda(storeId: string, orderCode: string) {
  if (!VAPID_PRIVATE_KEY) return;

  const { data: suscripciones } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('store_id', storeId);
  if (!suscripciones || suscripciones.length === 0) return;

  const payload = JSON.stringify({
    titulo: `${orderCode}: el cliente completó sus datos`,
    cuerpo: 'Toca para ver el pedido y empacarlo.',
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

  if (req.method === 'GET') return manejarGet(url.searchParams.get('id'));
  if (req.method === 'POST') return manejarPost(req);

  return json({ error: 'Método no permitido' }, 405);
});
