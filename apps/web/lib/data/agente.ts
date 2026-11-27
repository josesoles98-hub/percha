import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Agente IA de WhatsApp.
 *
 * La Función Edge `agente-whatsapp` lee los chats de HighLevel cada minuto
 * y deja borradores en `agent_drafts`. Aquí solo se LEEN; enviar, descartar
 * y las acciones en HighLevel pasan por la Función Edge `agente-accion`
 * (es la única que tiene la llave de HighLevel).
 */

export type AccionSugerida = 'none' | 'reservar' | 'acumula' | 'pago_saldo';

export interface MensajeChat {
  de: 'cliente' | 'tienda';
  texto: string;
  adjuntos: string[];
  fecha: string;
}

export interface PrendaCoincidente {
  /** Puede faltar en borradores creados antes de la búsqueda por foto. */
  id?: string;
  code: string;
  name: string | null;
  brand_name: string | null;
  size_label: string | null;
  price_cents: number;
  effective_status: string;
  /** Primera foto de la prenda (enlace firmado por 7 días). */
  foto?: string | null;
  /** true = el agente la reconoció comparando la foto del cliente. */
  elegida?: boolean;
}

export interface Borrador {
  id: string;
  contactName: string | null;
  phone: string | null;
  lastInboundAt: string;
  transcript: MensajeChat[];
  proposedReply: string | null;
  needsHuman: boolean;
  humanNote: string | null;
  suggestedAction: AccionSugerida;
  actionData: {
    marca?: string;
    talla?: string;
    tipo?: string;
    precio_soles?: number;
    saldo_soles?: number;
  };
  actionStatus: 'none' | 'done' | 'error';
  itemMatches: PrendaCoincidente[];
  /** 'promo' = mensaje que propone la tienda (no responde a un mensaje del cliente). */
  kind: 'reply' | 'promo';
  status: 'pending' | 'sent' | 'discarded' | 'superseded' | 'error';
  finalReply: string | null;
  error: string | null;
}

export interface AjustesAgente {
  enabled: boolean;
  cerebro: string;
  model: string;
  hlLocationId: string;
  hlPipelineId: string;
  hlStageReservo: string;
  hlStagePagoSaldo: string;
  /** Resumen de la mañana (8:00) en Alertas y como notificación. */
  dailySummary: boolean;
  /** Promo de acumulados: al día N con "acumula", 1 prenda más de S/X+ en 24 h = envío gratis. */
  promoEnabled: boolean;
  promoDay: number;
  promoMinSoles: number;
}

export interface AjustesCatalogo {
  enabled: boolean;
  slug: string;
  /** 0 = opción A (todo a la vez) · 24 = opción B (los grupos primero). */
  delayHours: number;
}

export async function getAjustesCatalogo(
  supabase: SupabaseClient,
  storeId: string,
): Promise<AjustesCatalogo> {
  const { data } = await supabase
    .from('stores')
    .select('catalog_enabled, catalog_slug, catalog_delay_hours')
    .eq('id', storeId)
    .maybeSingle();
  return {
    enabled: data?.catalog_enabled ?? false,
    slug: data?.catalog_slug ?? '',
    delayHours: data?.catalog_delay_hours ?? 0,
  };
}

/** Convierte un texto en un link válido: "AV Club" → "av-club". */
export function aSlug(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function guardarAjustesCatalogo(
  supabase: SupabaseClient,
  storeId: string,
  a: AjustesCatalogo,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const slug = aSlug(a.slug);
  if (a.enabled && slug.length < 3) return { ok: false, error: 'Elige un nombre para el link (mínimo 3 letras).' };
  const { error } = await supabase
    .from('stores')
    .update({ catalog_enabled: a.enabled, catalog_slug: slug || null, catalog_delay_hours: a.delayHours })
    .eq('id', storeId);
  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? 'Ese link ya lo usa otra tienda. Prueba con otro nombre.' : error.message,
    };
  }
  return { ok: true };
}

function aBorrador(fila: Record<string, unknown>): Borrador {
  return {
    id: fila.id as string,
    contactName: (fila.contact_name as string | null) ?? null,
    phone: (fila.phone as string | null) ?? null,
    lastInboundAt: fila.last_inbound_at as string,
    transcript: (fila.transcript as MensajeChat[]) ?? [],
    proposedReply: (fila.proposed_reply as string | null) ?? null,
    needsHuman: Boolean(fila.needs_human),
    humanNote: (fila.human_note as string | null) ?? null,
    suggestedAction: (fila.suggested_action as AccionSugerida) ?? 'none',
    actionData: (fila.action_data as Borrador['actionData']) ?? {},
    kind: (fila.kind as Borrador['kind']) ?? 'reply',
    actionStatus: (fila.action_status as Borrador['actionStatus']) ?? 'none',
    itemMatches: (fila.item_matches as PrendaCoincidente[]) ?? [],
    status: fila.status as Borrador['status'],
    finalReply: (fila.final_reply as string | null) ?? null,
    error: (fila.error as string | null) ?? null,
  };
}

/** Borradores esperando decisión, más nuevos primero. */
export async function listarPendientes(supabase: SupabaseClient, storeId: string) {
  const { data } = await supabase
    .from('agent_drafts')
    .select('*')
    .eq('store_id', storeId)
    .in('status', ['pending', 'error'])
    .order('last_inbound_at', { ascending: false })
    .limit(50);
  return (data ?? []).map(aBorrador);
}

/** Lo último que ya se resolvió (para revisar qué hizo el agente). */
export async function listarRecientes(supabase: SupabaseClient, storeId: string) {
  const { data } = await supabase
    .from('agent_drafts')
    .select('*')
    .eq('store_id', storeId)
    .in('status', ['sent', 'discarded'])
    .order('decided_at', { ascending: false })
    .limit(15);
  return (data ?? []).map(aBorrador);
}

export async function getAjustesAgente(
  supabase: SupabaseClient,
  storeId: string,
): Promise<AjustesAgente | null> {
  const { data } = await supabase
    .from('agent_settings')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();
  if (!data) return null;
  return {
    enabled: data.enabled,
    cerebro: data.cerebro,
    model: data.model,
    hlLocationId: data.hl_location_id ?? '',
    hlPipelineId: data.hl_pipeline_id ?? '',
    hlStageReservo: data.hl_stage_reservo ?? '',
    hlStagePagoSaldo: data.hl_stage_pago_saldo ?? '',
    dailySummary: data.daily_summary ?? true,
    promoEnabled: data.promo_enabled ?? false,
    promoDay: data.promo_day ?? 10,
    promoMinSoles: data.promo_min_soles ?? 25,
  };
}

export async function guardarAjustesAgente(
  supabase: SupabaseClient,
  storeId: string,
  ajustes: AjustesAgente,
) {
  const limpio = (v: string) => v.trim() || null;
  const { error } = await supabase.from('agent_settings').upsert({
    store_id: storeId,
    enabled: ajustes.enabled,
    cerebro: ajustes.cerebro,
    model: ajustes.model,
    hl_location_id: limpio(ajustes.hlLocationId),
    hl_pipeline_id: limpio(ajustes.hlPipelineId),
    hl_stage_reservo: limpio(ajustes.hlStageReservo),
    hl_stage_pago_saldo: limpio(ajustes.hlStagePagoSaldo),
    daily_summary: ajustes.dailySummary,
    promo_enabled: ajustes.promoEnabled,
    promo_day: Math.min(60, Math.max(1, Math.round(ajustes.promoDay) || 10)),
    promo_min_soles: Math.max(0, Math.round(ajustes.promoMinSoles) || 0),
    updated_at: new Date().toISOString(),
  });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** Llama a la Función Edge que envía, descarta o ejecuta la acción. */
export async function accionAgente(
  supabase: SupabaseClient,
  peticion: {
    draftId: string;
    tipo: 'enviar' | 'descartar' | 'accion';
    texto?: string;
    prenda?: string;
    saldo?: number;
    itemId?: string | null;
    precio?: number;
    /** Acción elegida por la dueña cuando el agente no sugirió ninguna. */
    accion?: 'reservar' | 'pago_saldo';
    /** Varias prendas a la vez, cada una con su precio. */
    prendas?: Array<{ itemId: string; precio?: number }>;
  },
): Promise<{ ok: true; prenda: string | null } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('agente-accion', { body: peticion });
  if (error) {
    // En errores HTTP el cuerpo trae el mensaje en español de la función.
    const contexto = (error as { context?: Response }).context;
    try {
      const cuerpo = contexto ? await contexto.json() : null;
      if (cuerpo?.error) return { ok: false, error: cuerpo.error as string };
    } catch {
      // sin cuerpo legible
    }
    return { ok: false, error: 'No se pudo conectar con el agente. Intenta otra vez.' };
  }
  if (data?.error) return { ok: false, error: data.error as string };
  return { ok: true, prenda: (data?.prenda as string | null) ?? null };
}

// ── Buscador de prendas (bandeja del agente) ────────────────────────────

/** Tipos que la IA le pone a cada prenda mirando su foto (items.ai_tipo). */
export const TIPOS_PRENDA = [
  { tipo: 'polera', etiqueta: 'Poleras', emoji: '🧥' },
  { tipo: 'casaca', etiqueta: 'Casacas', emoji: '🧥' },
  { tipo: 'polo', etiqueta: 'Polos', emoji: '👕' },
  { tipo: 'camisa', etiqueta: 'Camisas', emoji: '👔' },
  { tipo: 'short', etiqueta: 'Shorts', emoji: '🩳' },
  { tipo: 'jean', etiqueta: 'Jeans', emoji: '👖' },
  { tipo: 'pantalon', etiqueta: 'Pantalones', emoji: '👖' },
  { tipo: 'vestido', etiqueta: 'Vestidos', emoji: '👗' },
  { tipo: 'falda', etiqueta: 'Faldas', emoji: '👗' },
  { tipo: 'zapatilla', etiqueta: 'Zapatillas', emoji: '👟' },
  { tipo: 'accesorio', etiqueta: 'Accesorios', emoji: '🧢' },
] as const;

export interface PrendaEncontrada extends PrendaCoincidente {
  id: string;
  ai_desc: string | null;
}

/**
 * Busca prendas por palabras ("casaca negra", "PR-000737", "nike") y/o tipo.
 * Cada palabra tiene que aparecer en el código, marca, talla o en la
 * descripción que la IA sacó de la foto.
 */
export async function buscarPrendasAgente(
  supabase: SupabaseClient,
  storeId: string,
  { texto, tipo, soloDisponibles }: { texto: string; tipo: string | null; soloDisponibles: boolean },
): Promise<PrendaEncontrada[]> {
  const { data, error } = await supabase.rpc('buscar_prendas', {
    p_store_id: storeId,
    p_texto: texto,
    p_tipo: tipo,
    p_estado: soloDisponibles ? 'available' : null,
  });
  if (error || !data) return [];
  const filas = data as Array<{
    id: string;
    code: string;
    brand_name: string | null;
    size_label: string | null;
    price_cents: number;
    effective_status: string;
    ai_tipo: string | null;
    ai_desc: string | null;
    /** Miniatura de la primera foto (~15 KB), o la foto entera si aún no tiene. */
    foto: string | null;
  }>;
  const rutas = filas.map((f) => f.foto);
  // Todas las firmas en UNA sola consulta (firmar de a una tardaba ~12 s).
  const validas = rutas.filter((r): r is string => !!r);
  const { data: firmadas } = validas.length
    ? await supabase.storage.from('item-photos').createSignedUrls(validas, 60 * 60)
    : { data: [] };
  const urlDe = new Map((firmadas ?? []).map((x) => [x.path, x.signedUrl]));
  const fotos = rutas.map((r) => (r ? (urlDe.get(r) ?? null) : null));
  return filas.map((f, i) => ({
    id: f.id,
    code: f.code,
    name: f.ai_tipo ? f.ai_tipo.charAt(0).toUpperCase() + f.ai_tipo.slice(1) : null,
    brand_name: f.brand_name,
    size_label: f.size_label,
    price_cents: f.price_cents,
    effective_status: f.effective_status,
    foto: fotos[i],
    ai_desc: f.ai_desc,
  }));
}
