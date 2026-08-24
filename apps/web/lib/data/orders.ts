import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocType, EnvioParaExportar, PackageType } from '@percha/core';

import { getSiteUrl } from '../env';
import { firmarFotos } from './inventory';
import type { Resultado } from './mutations';

/**
 * Clientes, pedidos y envíos.
 *
 * El flujo real es reserva → pedido → envío, y cada paso reutiliza lo que
 * ya se capturó en el anterior: al convertir una prenda reservada en pedido
 * el nombre y el teléfono ya están, y lo único nuevo que se pide es el
 * documento y la agencia de destino.
 */

// ── Clientes ──────────────────────────────────────────────────────────

export interface Cliente {
  id: string;
  fullName: string;
  docType: DocType;
  docNumber: string | null;
  phone: string | null;
  defaultAgencyId: number | null;
  defaultAgencyName: string | null;
  ordersCount: number;
  totalSpentCents: number;
}

const COLUMNAS_CLIENTE = `
  id, full_name, doc_type, doc_number, phone, default_agency_id,
  orders_count, total_spent_cents,
  shalom_agencies:default_agency_id (name)
`;

function mapCliente(fila: Record<string, unknown>): Cliente {
  const agencia = fila.shalom_agencies as { name: string } | null;
  return {
    id: fila.id as string,
    fullName: fila.full_name as string,
    docType: fila.doc_type as DocType,
    docNumber: (fila.doc_number as string) ?? null,
    phone: (fila.phone as string) ?? null,
    defaultAgencyId: (fila.default_agency_id as number) ?? null,
    defaultAgencyName: agencia?.name ?? null,
    ordersCount: (fila.orders_count as number) ?? 0,
    totalSpentCents: (fila.total_spent_cents as number) ?? 0,
  };
}

/** Busca por nombre, documento o teléfono a la vez. */
export async function buscarClientes(
  supabase: SupabaseClient,
  storeId: string,
  termino: string,
  limite = 20,
): Promise<Cliente[]> {
  let query = supabase
    .from('customers')
    .select(COLUMNAS_CLIENTE)
    .eq('store_id', storeId)
    .order('orders_count', { ascending: false })
    .limit(limite);

  const limpio = termino.trim().replace(/[,()"\\*]/g, ' ').trim();
  if (limpio) {
    query = query.or(
      `full_name.ilike.*${limpio}*,doc_number.ilike.*${limpio}*,phone.ilike.*${limpio}*`,
    );
  }

  const { data } = await query;
  return (data ?? []).map((f) => mapCliente(f as Record<string, unknown>));
}

export async function getCliente(
  supabase: SupabaseClient,
  id: string,
): Promise<Cliente | null> {
  const { data } = await supabase.from('customers').select(COLUMNAS_CLIENTE).eq('id', id).maybeSingle();
  return data ? mapCliente(data as Record<string, unknown>) : null;
}

export interface DatosCliente {
  fullName: string;
  docType: DocType;
  docNumber: string | null;
  phone: string | null;
  defaultAgencyId: number | null;
}

export async function crearCliente(
  supabase: SupabaseClient,
  storeId: string,
  datos: DatosCliente,
): Promise<Resultado<Cliente>> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      store_id: storeId,
      full_name: datos.fullName.trim(),
      doc_type: datos.docType,
      doc_number: datos.docNumber?.trim() || null,
      phone: datos.phone?.trim() || null,
      default_agency_id: datos.defaultAgencyId,
    })
    .select(COLUMNAS_CLIENTE)
    .single();

  if (error) {
    // El índice único de documento por tienda: mensaje entendible en vez
    // del error crudo de Postgres.
    const mensaje = error.code === '23505'
      ? 'Ya tienes un cliente con ese documento.'
      : error.message;
    return { data: null, error: mensaje };
  }

  return { data: mapCliente(data as Record<string, unknown>), error: null };
}

export async function actualizarCliente(
  supabase: SupabaseClient,
  id: string,
  datos: Partial<DatosCliente>,
): Promise<Resultado<null>> {
  const payload: Record<string, unknown> = {};
  if (datos.fullName !== undefined) payload.full_name = datos.fullName.trim();
  if (datos.docType !== undefined) payload.doc_type = datos.docType;
  if (datos.docNumber !== undefined) payload.doc_number = datos.docNumber?.trim() || null;
  if (datos.phone !== undefined) payload.phone = datos.phone?.trim() || null;
  if (datos.defaultAgencyId !== undefined) payload.default_agency_id = datos.defaultAgencyId;

  const { error } = await supabase.from('customers').update(payload).eq('id', id);
  return { data: null, error: error?.message ?? null };
}

// ── Agencias ──────────────────────────────────────────────────────────

export interface Agencia {
  id: number;
  name: string;
}

/**
 * Busca agencias de destino. Solo devuelve las del catálogo oficial, así
 * que es imposible elegir un nombre que Shalom rechace.
 */
export async function buscarAgencias(
  supabase: SupabaseClient,
  termino: string,
  limite = 30,
): Promise<Agencia[]> {
  let query = supabase
    .from('shalom_agencies')
    .select('id, name')
    .eq('is_destiny', true)
    .order('name')
    .limit(limite);

  const limpio = termino.trim().replace(/[,()"\\*]/g, ' ').trim();
  // search_key ya viene sin tildes y en minúsculas, así que «jaen»
  // encuentra «JAÉN».
  if (limpio) query = query.ilike('search_key', `%${limpio.toLowerCase()}%`);

  const { data } = await query;
  return data ?? [];
}

export async function getAgencia(
  supabase: SupabaseClient,
  id: number,
): Promise<Agencia | null> {
  const { data } = await supabase.from('shalom_agencies').select('id, name').eq('id', id).maybeSingle();
  return data ?? null;
}

// ── Pedidos ───────────────────────────────────────────────────────────

export type EstadoPedido = 'draft' | 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';

export interface PedidoResumen {
  id: string;
  code: string;
  status: EstadoPedido;
  totalCents: number;
  createdAt: string;
  customerName: string;
  prendas: number;
  destinyAgencyName: string | null;
  shipmentStatus: string | null;
  /** Tache aparte de "empacado": no toca el status real del pedido. */
  packedAt: string | null;
}

export interface Pedido extends PedidoResumen {
  customerId: string;
  customer: Cliente | null;
  subtotalCents: number;
  shippingCents: number;
  paidCents: number;
  notes: string | null;
  items: Array<{ itemId: string; code: string; name: string | null; priceCents: number }>;
  envio: Envio | null;
  customerDataSubmittedAt: string | null;
}

export interface Envio {
  id: string;
  originAgencyId: number;
  originAgencyName: string | null;
  destinyAgencyId: number | null;
  destinyAgencyName: string | null;
  packageType: PackageType;
  packagesCount: number;
  status: string;
  trackingCode: string | null;
  exportBatchId: string | null;
}

const COLUMNAS_PEDIDO = `
  id, code, status, subtotal_cents, shipping_cents, total_cents, paid_cents,
  notes, created_at, customer_id, customer_data_submitted_at, packed_at,
  customers ( id, full_name, doc_type, doc_number, phone, default_agency_id,
              orders_count, total_spent_cents ),
  order_items ( item_id, price_cents, items ( code, name ) ),
  shipments ( id, origin_agency_id, destiny_agency_id, package_type,
              packages_count, status, tracking_code, export_batch_id )
`;

function mapPedido(fila: Record<string, unknown>, agencias: Map<number, string>): Pedido {
  const cliente = fila.customers as Record<string, unknown> | null;
  const lineas = (fila.order_items ?? []) as Array<Record<string, unknown>>;
  const envios = (fila.shipments ?? []) as Array<Record<string, unknown>>;
  const envioCrudo = envios[0] ?? null;

  const envio: Envio | null = envioCrudo
    ? {
        id: envioCrudo.id as string,
        originAgencyId: envioCrudo.origin_agency_id as number,
        originAgencyName: agencias.get(envioCrudo.origin_agency_id as number) ?? null,
        destinyAgencyId: (envioCrudo.destiny_agency_id as number | null) ?? null,
        destinyAgencyName: envioCrudo.destiny_agency_id
          ? agencias.get(envioCrudo.destiny_agency_id as number) ?? null
          : null,
        packageType: envioCrudo.package_type as PackageType,
        packagesCount: envioCrudo.packages_count as number,
        status: envioCrudo.status as string,
        trackingCode: (envioCrudo.tracking_code as string) ?? null,
        exportBatchId: (envioCrudo.export_batch_id as string) ?? null,
      }
    : null;

  return {
    id: fila.id as string,
    code: fila.code as string,
    status: fila.status as EstadoPedido,
    subtotalCents: fila.subtotal_cents as number,
    shippingCents: fila.shipping_cents as number,
    totalCents: fila.total_cents as number,
    paidCents: fila.paid_cents as number,
    notes: (fila.notes as string) ?? null,
    createdAt: fila.created_at as string,
    customerId: fila.customer_id as string,
    customerName: (cliente?.full_name as string) ?? 'Sin cliente',
    customer: cliente
      ? mapCliente({ ...cliente, shalom_agencies: null })
      : null,
    prendas: lineas.length,
    items: lineas.map((l) => {
      const prenda = l.items as { code: string; name: string | null } | null;
      return {
        itemId: l.item_id as string,
        code: prenda?.code ?? '',
        name: prenda?.name ?? null,
        priceCents: l.price_cents as number,
      };
    }),
    envio,
    customerDataSubmittedAt: (fila.customer_data_submitted_at as string) ?? null,
    destinyAgencyName: envio?.destinyAgencyName ?? null,
    shipmentStatus: envio?.status ?? null,
    packedAt: (fila.packed_at as string) ?? null,
  };
}

/** Las agencias que aparecen en un conjunto de envíos, en una consulta. */
async function nombresDeAgencias(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Map<number, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return new Map();

  const { data } = await supabase.from('shalom_agencies').select('id, name').in('id', unicos);
  return new Map((data ?? []).map((a) => [a.id as number, a.name as string]));
}

export async function listarPedidos(
  supabase: SupabaseClient,
  storeId: string,
  estado?: EstadoPedido | 'all',
): Promise<PedidoResumen[]> {
  let query = supabase
    .from('orders')
    .select(COLUMNAS_PEDIDO)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    // No es un límite de negocio, solo una cota de seguridad para que una
    // tienda con miles de pedidos no tumbe la página de un tirón.
    .limit(2000);

  if (estado && estado !== 'all') query = query.eq('status', estado);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron cargar los pedidos: ${error.message}`);

  const filas = (data ?? []) as Array<Record<string, unknown>>;
  const idsAgencias = filas.flatMap((f) =>
    ((f.shipments ?? []) as Array<Record<string, unknown>>).flatMap((e) => [
      e.origin_agency_id as number,
      e.destiny_agency_id as number,
    ]),
  );

  const agencias = await nombresDeAgencias(supabase, idsAgencias);
  return filas.map((f) => mapPedido(f, agencias));
}

const POR_PAGINA_EXPORTAR = 500;

/**
 * Todos los pedidos, sin el límite de 100 de listarPedidos: es para la
 * descarga completa, así que no puede quedarse corta con una tienda que
 * ya acumuló cientos de pedidos.
 */
export async function listarTodosLosPedidos(
  supabase: SupabaseClient,
  storeId: string,
): Promise<PedidoResumen[]> {
  const todos: PedidoResumen[] = [];
  let desde = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('orders')
      .select(COLUMNAS_PEDIDO)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(desde, desde + POR_PAGINA_EXPORTAR - 1);

    if (error) throw new Error(`No se pudieron cargar los pedidos: ${error.message}`);

    const filas = (data ?? []) as Array<Record<string, unknown>>;
    const idsAgencias = filas.flatMap((f) =>
      ((f.shipments ?? []) as Array<Record<string, unknown>>).flatMap((e) => [
        e.origin_agency_id as number,
        e.destiny_agency_id as number,
      ]),
    );
    const agencias = await nombresDeAgencias(supabase, idsAgencias);
    todos.push(...filas.map((f) => mapPedido(f, agencias)));

    if (filas.length < POR_PAGINA_EXPORTAR) break;
    desde += POR_PAGINA_EXPORTAR;
  }

  return todos;
}

export async function getPedido(
  supabase: SupabaseClient,
  storeId: string,
  code: string,
): Promise<Pedido | null> {
  const { data } = await supabase
    .from('orders')
    .select(COLUMNAS_PEDIDO)
    .eq('store_id', storeId)
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (!data) return null;

  const fila = data as Record<string, unknown>;
  const envios = (fila.shipments ?? []) as Array<Record<string, unknown>>;
  const agencias = await nombresDeAgencias(
    supabase,
    envios.flatMap((e) => [e.origin_agency_id as number, e.destiny_agency_id as number]),
  );

  return mapPedido(fila, agencias);
}

export interface PrendaDisponible {
  id: string;
  code: string;
  name: string | null;
  sizeLabel: string | null;
  priceCents: number;
  photoUrl: string | null;
}

/**
 * Prendas 'available' para añadir a un pedido o a una reserva conjunta.
 *
 * Con el término vacío devuelve las más recientes, igual que
 * `buscarAgencias`: sirve para explorar el inventario sin tener que
 * escribir, que es lo normal cuando la tienda tiene pocas prendas.
 *
 * Solo busca entre las 'available': una ya reservada o vendida no tiene
 * sentido añadirla aquí (la reservada se convierte desde su propia ficha,
 * que es como llega el nombre y el teléfono ya rellenos).
 *
 * Trae la foto principal ya firmada: con varias prendas de tallas y
 * colores parecidos, el código y el nombre solos no bastan para
 * reconocerlas a golpe de vista.
 */
export async function buscarPrendasDisponibles(
  supabase: SupabaseClient,
  storeId: string,
  termino: string,
  limite = 8,
): Promise<PrendaDisponible[]> {
  let query = supabase
    .from('items_view')
    .select('id, code, name, size_label, price_cents, photos')
    .eq('store_id', storeId)
    .eq('effective_status', 'available')
    .order('created_at', { ascending: false })
    .limit(limite);

  const limpio = termino.trim().replace(/[,()"\\*]/g, ' ').trim();
  if (limpio) {
    query = query.or(
      `name.ilike.*${limpio}*,code.ilike.*${limpio}*,brand_name.ilike.*${limpio}*`,
    );
  }

  const { data } = await query;
  const filas = (data ?? []) as Array<Record<string, unknown>>;

  const rutas = filas
    .map((f) => (f.photos as Array<{ path: string; position: number }> | null)?.find((p) => p.position === 1)?.path)
    .filter((p): p is string => Boolean(p));
  const firmadas = await firmarFotos(supabase, rutas);

  return filas.map((f) => {
    const foto = (f.photos as Array<{ path: string; position: number }> | null)?.find((p) => p.position === 1);
    return {
      id: f.id as string,
      code: f.code as string,
      name: (f.name as string) ?? null,
      sizeLabel: (f.size_label as string) ?? null,
      priceCents: f.price_cents as number,
      photoUrl: foto ? (firmadas.get(foto.path) ?? null) : null,
    };
  });
}

export interface NuevoPedido {
  storeId: string;
  customerId: string;
  itemIds: string[];
  /** Precio de cada prenda, congelado al crear el pedido. */
  precios: Record<string, number>;
  shippingCents?: number;
  paidCents?: number;
  notes?: string | null;
  envio: {
    originAgencyId: number;
    /** Puede faltar todavía si el cliente la va a elegir por su link. */
    destinyAgencyId: number | null;
    packageType: PackageType;
    packagesCount: number;
  };
}

/** Link para que el cliente complete sus datos de envío (ver migración 0013). */
export function linkCompletarPedido(orderId: string): string {
  return `${getSiteUrl()}/completar/${orderId}`;
}

/**
 * Link único y fijo por tienda: el cliente registra su compra de punta a
 * punta (nombre, datos, foto) sin que haya que crear el pedido antes.
 */
export function linkRegistrarPedido(storeId: string): string {
  return `${getSiteUrl()}/registrar/${storeId}`;
}

/**
 * Fotos de referencia que subió el cliente por su link, para reconocer el
 * pedido al empacarlo — sobre todo útil con prendas que se vendieron
 * antes de subirlas al catálogo.
 */
export async function listarFotosPedido(
  supabase: SupabaseClient,
  storeId: string,
  orderId: string,
): Promise<string[]> {
  const { data } = await supabase.storage.from('order-photos').list(`${storeId}/${orderId}`, {
    sortBy: { column: 'name', order: 'asc' },
  });
  const rutas = (data ?? []).filter((f) => f.id).map((f) => `${storeId}/${orderId}/${f.name}`);
  if (rutas.length === 0) return [];

  const { data: firmadas } = await supabase.storage.from('order-photos').createSignedUrls(rutas, 3600);
  return (firmadas ?? []).filter((u) => u.signedUrl).map((u) => u.signedUrl as string);
}

/**
 * Crea el pedido con sus prendas y su envío.
 *
 * Si algo falla a mitad, se borra el pedido: es preferible no dejar un
 * pedido a medias que el usuario tendría que limpiar a mano. Un pedido
 * huérfano sin prendas no le sirve a nadie.
 */
export async function crearPedido(
  supabase: SupabaseClient,
  datos: NuevoPedido,
): Promise<Resultado<{ id: string; code: string }>> {
  const { data: pedido, error } = await supabase
    .from('orders')
    .insert({
      store_id: datos.storeId,
      customer_id: datos.customerId,
      status: 'draft',
      shipping_cents: datos.shippingCents ?? 0,
      paid_cents: datos.paidCents ?? 0,
      notes: datos.notes ?? null,
    })
    .select('id, code')
    .single();

  if (error || !pedido) return { data: null, error: error?.message ?? 'No se pudo crear el pedido' };

  const deshacer = async (mensaje: string): Promise<Resultado<{ id: string; code: string }>> => {
    await supabase.from('orders').delete().eq('id', pedido.id);
    return { data: null, error: mensaje };
  };

  const { error: errorLineas } = await supabase.from('order_items').insert(
    datos.itemIds.map((itemId) => ({
      order_id: pedido.id,
      item_id: itemId,
      price_cents: datos.precios[itemId] ?? 0,
    })),
  );

  if (errorLineas) {
    return deshacer(
      errorLineas.message.includes('ya está en el pedido')
        ? errorLineas.message
        : `No se pudieron añadir las prendas: ${errorLineas.message}`,
    );
  }

  const { error: errorEnvio } = await supabase.from('shipments').insert({
    store_id: datos.storeId,
    order_id: pedido.id,
    origin_agency_id: datos.envio.originAgencyId,
    destiny_agency_id: datos.envio.destinyAgencyId,
    package_type: datos.envio.packageType,
    packages_count: datos.envio.packagesCount,
  });

  if (errorEnvio) return deshacer(`No se pudo crear el envío: ${errorEnvio.message}`);

  return { data: pedido, error: null };
}

export async function cambiarEstadoPedido(
  supabase: SupabaseClient,
  id: string,
  status: EstadoPedido,
): Promise<Resultado<null>> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  return { data: null, error: error?.message ?? null };
}

/**
 * Marca/desmarca "empacado". Es independiente del status del pedido a
 * propósito: no toca prendas ni estadísticas del cliente, así que se
 * puede usar en cualquier pedido sin importar en qué paso del flujo real
 * de venta esté.
 */
export async function marcarEmpacado(
  supabase: SupabaseClient,
  id: string,
): Promise<Resultado<null>> {
  const { error } = await supabase
    .from('orders')
    .update({ packed_at: new Date().toISOString() })
    .eq('id', id);
  return { data: null, error: error?.message ?? null };
}

export async function desmarcarEmpacado(
  supabase: SupabaseClient,
  id: string,
): Promise<Resultado<null>> {
  const { error } = await supabase.from('orders').update({ packed_at: null }).eq('id', id);
  return { data: null, error: error?.message ?? null };
}

/**
 * Borra un pedido de prueba. Solo tiene sentido para pedidos que nunca se
 * confirmaron ('draft' o 'cancelled'): uno confirmado ya movió prendas a
 * vendidas y estadísticas del cliente, y borrarlo dejaría esos datos
 * descuadrados. Envíos y prendas del pedido se borran solos en cascada.
 */
export async function borrarPedido(
  supabase: SupabaseClient,
  id: string,
): Promise<Resultado<null>> {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  return { data: null, error: error?.message ?? null };
}

// ── Envíos pendientes de exportar ─────────────────────────────────────

export interface EnvioPendiente extends EnvioParaExportar {
  shipmentId: string;
  orderId: string;
  labelPrintedAt: string | null;
}

/**
 * Los envíos que todavía no se han subido a Shalom Pro, con todo lo que
 * hace falta para validarlos y generar el archivo.
 */
export async function listarEnviosPendientes(
  supabase: SupabaseClient,
  storeId: string,
): Promise<EnvioPendiente[]> {
  const { data, error } = await supabase
    .from('shipments')
    .select(`
      id, order_id, origin_agency_id, destiny_agency_id, package_type,
      height_cm, width_cm, length_cm, weight_kg, packages_count,
      contact_doc, contact_phone, grr_number, label_printed_at,
      orders!inner ( code, customers ( full_name, doc_type, doc_number, phone ) )
    `)
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`No se pudieron cargar los envíos: ${error.message}`);

  const filas = (data ?? []) as Array<Record<string, unknown>>;
  const agencias = await nombresDeAgencias(
    supabase,
    filas.flatMap((f) => [f.origin_agency_id as number, f.destiny_agency_id as number]),
  );

  return filas.map((f) => {
    const pedido = f.orders as Record<string, unknown>;
    const cliente = pedido.customers as Record<string, unknown> | null;

    return {
      id: f.id as string,
      shipmentId: f.id as string,
      orderId: f.order_id as string,
      orderCode: pedido.code as string,
      customerName: (cliente?.full_name as string) ?? '',
      docType: (cliente?.doc_type as DocType) ?? 'DNI',
      docNumber: (cliente?.doc_number as string) ?? null,
      phone: (cliente?.phone as string) ?? null,
      originAgency: agencias.get(f.origin_agency_id as number) ?? null,
      destinyAgency: agencias.get(f.destiny_agency_id as number) ?? null,
      packageType: f.package_type as PackageType,
      heightCm: Number(f.height_cm ?? 0),
      widthCm: Number(f.width_cm ?? 0),
      lengthCm: Number(f.length_cm ?? 0),
      weightKg: Number(f.weight_kg ?? 0),
      packagesCount: (f.packages_count as number) ?? 1,
      contactDoc: (f.contact_doc as string) ?? null,
      contactPhone: (f.contact_phone as string) ?? null,
      grrNumber: (f.grr_number as string) ?? null,
      labelPrintedAt: (f.label_printed_at as string) ?? null,
    };
  });
}

/** Marca uno o varios envíos como "rótulo ya impreso". */
export async function marcarRotuloImpreso(
  supabase: SupabaseClient,
  shipmentIds: string[],
): Promise<Resultado<null>> {
  if (shipmentIds.length === 0) return { data: null, error: null };

  const { error } = await supabase
    .from('shipments')
    .update({ label_printed_at: new Date().toISOString() })
    .in('id', shipmentIds);

  return { data: null, error: error?.message ?? null };
}

/** Deshace la marca de "ya impreso", para cuando se tocó por error. */
export async function desmarcarRotuloImpreso(
  supabase: SupabaseClient,
  shipmentId: string,
): Promise<Resultado<null>> {
  const { error } = await supabase
    .from('shipments')
    .update({ label_printed_at: null })
    .eq('id', shipmentId);

  return { data: null, error: error?.message ?? null };
}

/**
 * Deja constancia del lote generado y marca sus envíos como exportados.
 *
 * El lote se registra ANTES de marcar los envíos: si algo se corta en
 * medio, quedan envíos pendientes que se pueden volver a exportar, que es
 * mucho mejor que envíos marcados como exportados sin archivo que los
 * respalde.
 */
export async function registrarLote(
  supabase: SupabaseClient,
  storeId: string,
  fileName: string,
  shipmentIds: string[],
): Promise<Resultado<{ id: string }>> {
  const { data: lote, error } = await supabase
    .from('export_batches')
    .insert({ store_id: storeId, file_name: fileName, rows_count: shipmentIds.length })
    .select('id')
    .single();

  if (error || !lote) return { data: null, error: error?.message ?? 'No se pudo registrar el lote' };

  const { error: errorEnvios } = await supabase
    .from('shipments')
    .update({ status: 'exported', export_batch_id: lote.id })
    .in('id', shipmentIds);

  if (errorEnvios) return { data: lote, error: `El archivo se generó, pero no se marcaron los envíos: ${errorEnvios.message}` };

  return { data: lote, error: null };
}

export interface Lote {
  id: string;
  fileName: string;
  rowsCount: number;
  createdAt: string;
  registeredAt: string | null;
}

export async function listarLotes(supabase: SupabaseClient, storeId: string): Promise<Lote[]> {
  const { data } = await supabase
    .from('export_batches')
    .select('id, file_name, rows_count, created_at, registered_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(20);

  return (data ?? []).map((l) => ({
    id: l.id as string,
    fileName: l.file_name as string,
    rowsCount: l.rows_count as number,
    createdAt: l.created_at as string,
    registeredAt: (l.registered_at as string) ?? null,
  }));
}

/** Confirma que el lote se subió a Shalom Pro. */
export async function marcarLoteRegistrado(
  supabase: SupabaseClient,
  loteId: string,
): Promise<Resultado<null>> {
  const ahora = new Date().toISOString();

  const { error } = await supabase
    .from('export_batches')
    .update({ registered_at: ahora })
    .eq('id', loteId);

  if (error) return { data: null, error: error.message };

  const { error: errorEnvios } = await supabase
    .from('shipments')
    .update({ status: 'registered', registered_at: ahora })
    .eq('export_batch_id', loteId);

  return { data: null, error: errorEnvios?.message ?? null };
}

// ── Lista de empaque ────────────────────────────────────────────────────

export interface PrendaEmpaque {
  code: string;
  name: string | null;
  sizeLabel: string | null;
  photoUrl: string | null;
}

export interface PedidoEmpaque {
  orderId: string;
  orderCode: string;
  customerName: string;
  prendas: PrendaEmpaque[];
}

/**
 * Pedidos pendientes de envío con la foto y el nombre de cada prenda, para
 * reconocerlas rápido al empacar — sobre todo útil cuando hay varios
 * pedidos abiertos con prendas parecidas.
 */
export async function listarPedidosParaEmpacar(
  supabase: SupabaseClient,
  storeId: string,
): Promise<PedidoEmpaque[]> {
  const { data, error } = await supabase
    .from('shipments')
    .select(`
      order_id,
      orders!inner (
        code,
        customers ( full_name ),
        order_items (
          items (
            code, name,
            sizes ( label ),
            item_photos ( storage_path, position )
          )
        )
      )
    `)
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`No se pudieron cargar los pedidos: ${error.message}`);

  const filas = (data ?? []) as Array<Record<string, unknown>>;

  // Firmar todas las fotos de una sola vez, no una llamada por prenda.
  const rutas: string[] = [];
  for (const fila of filas) {
    const pedido = fila.orders as Record<string, unknown>;
    const lineas = (pedido.order_items ?? []) as Array<Record<string, unknown>>;
    for (const linea of lineas) {
      const prenda = linea.items as Record<string, unknown> | null;
      const fotos = (prenda?.item_photos ?? []) as Array<{ storage_path: string; position: number }>;
      const foto1 = fotos.find((f) => f.position === 1);
      if (foto1) rutas.push(foto1.storage_path);
    }
  }
  const firmadas = await firmarFotos(supabase, rutas);

  return filas.map((fila) => {
    const pedido = fila.orders as Record<string, unknown>;
    const cliente = pedido.customers as { full_name: string } | null;
    const lineas = (pedido.order_items ?? []) as Array<Record<string, unknown>>;

    return {
      orderId: fila.order_id as string,
      orderCode: pedido.code as string,
      customerName: cliente?.full_name ?? '',
      prendas: lineas.map((linea) => {
        const prenda = linea.items as Record<string, unknown> | null;
        const talla = prenda?.sizes as { label: string } | null;
        const fotos = (prenda?.item_photos ?? []) as Array<{ storage_path: string; position: number }>;
        const foto1 = fotos.find((f) => f.position === 1);

        return {
          code: (prenda?.code as string) ?? '',
          name: (prenda?.name as string) ?? null,
          sizeLabel: talla?.label ?? null,
          photoUrl: foto1 ? firmadas.get(foto1.storage_path) ?? null : null,
        };
      }),
    };
  });
}

// ── Importar boletas de Shalom ──────────────────────────────────────────

export interface ResultadoImportarBoleta {
  ok: boolean;
  motivo?: string;
  orderCode?: string;
  customerName?: string;
  shipmentId?: string;
}

/**
 * Busca al cliente por DNI y le guarda el código de seguimiento en su
 * envío más antiguo que todavía no tenga uno — así no hay que reconocer
 * a mano cuál boleta es de quién.
 */
export async function importarTrackingPorDni(
  supabase: SupabaseClient,
  storeId: string,
  dni: string,
  trackingCode: string,
): Promise<ResultadoImportarBoleta> {
  const { data: cliente } = await supabase
    .from('customers')
    .select('id, full_name')
    .eq('store_id', storeId)
    .eq('doc_number', dni)
    .maybeSingle();

  if (!cliente) return { ok: false, motivo: `Ningún cliente tiene el DNI ${dni}` };

  const { data: pedido } = await supabase
    .from('orders')
    .select('id, code, shipments!inner(id)')
    .eq('store_id', storeId)
    .eq('customer_id', cliente.id)
    .is('shipments.tracking_code', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pedido) {
    return {
      ok: false,
      motivo: `${cliente.full_name} no tiene ningún envío pendiente de código`,
      customerName: cliente.full_name as string,
    };
  }

  const envios = pedido.shipments as Array<{ id: string }>;
  const envioId = envios[0]?.id;
  if (!envioId) return { ok: false, motivo: 'No se encontró el envío' };

  const { error } = await supabase
    .from('shipments')
    .update({ tracking_code: trackingCode })
    .eq('id', envioId);

  if (error) return { ok: false, motivo: error.message };

  return {
    ok: true,
    orderCode: pedido.code as string,
    customerName: cliente.full_name as string,
    shipmentId: envioId,
  };
}

/** La boleta en PDF del envío, si se subió una (ver migración 0016). */
export async function obtenerUrlBoleta(
  supabase: SupabaseClient,
  storeId: string,
  shipmentId: string,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from('boletas-shalom')
    .createSignedUrl(`${storeId}/${shipmentId}.pdf`, 3600);
  return data?.signedUrl ?? null;
}
