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
  code: string;
  name: string | null;
  brand_name: string | null;
  size_label: string | null;
  price_cents: number;
  effective_status: string;
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
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
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
  return { ok: true };
}
