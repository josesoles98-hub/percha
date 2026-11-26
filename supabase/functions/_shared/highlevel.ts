// Cliente mínimo de la API de HighLevel (LeadConnector) para el agente.
//
// El token es una "Integración privada" de la sub-cuenta (Ajustes →
// Integraciones privadas) y vive como secreto de las Funciones Edge:
// HIGHLEVEL_TOKEN. Nunca se guarda en la base de datos ni en el repo.

const BASE = 'https://services.leadconnectorhq.com';

export class HighLevelError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function hl<T>(
  path: string,
  init: { method?: string; body?: unknown; version?: string } = {},
): Promise<T> {
  const token = Deno.env.get('HIGHLEVEL_TOKEN');
  if (!token) throw new HighLevelError('Falta el secreto HIGHLEVEL_TOKEN', 500);

  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: init.version ?? '2021-07-28',
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new HighLevelError(`HighLevel ${res.status} en ${path}: ${texto.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

// ── Conversaciones ─────────────────────────────────────────────────────

export interface Conversacion {
  id: string;
  contactId: string;
  contactName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  lastMessageDate: number;
  lastMessageDirection?: string;
  lastMessageType?: string;
}

export interface Mensaje {
  id: string;
  direction: 'inbound' | 'outbound';
  body?: string;
  attachments?: string[];
  dateAdded: string;
  messageType?: string;
  source?: string;
}

/** Chats de WhatsApp cuyo último mensaje lo escribió el cliente. */
export async function chatsEsperandoRespuesta(locationId: string, limite = 20) {
  const q = new URLSearchParams({
    locationId,
    lastMessageDirection: 'inbound',
    lastMessageType: 'TYPE_WHATSAPP',
    sortBy: 'last_message_date',
    sort: 'desc',
    limit: String(limite),
  });
  const data = await hl<{ conversations: Conversacion[] }>(`/conversations/search?${q}`, {
    version: '2021-04-15',
  });
  return data.conversations ?? [];
}

/** Últimos mensajes de WhatsApp de un chat, del más viejo al más nuevo. */
export async function mensajesDelChat(conversationId: string, limite = 20): Promise<Mensaje[]> {
  const q = new URLSearchParams({ limit: String(limite), type: 'TYPE_WHATSAPP' });
  const data = await hl<{ messages: { messages: Mensaje[] } }>(
    `/conversations/${conversationId}/messages?${q}`,
    { version: '2021-04-15' },
  );
  return [...(data.messages?.messages ?? [])].sort(
    (a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime(),
  );
}

export async function enviarWhatsApp(contactId: string, mensaje: string) {
  return hl<{ messageId?: string; conversationId?: string }>('/conversations/messages', {
    method: 'POST',
    version: '2021-04-15',
    body: { type: 'WhatsApp', contactId, message: mensaje },
  });
}

// ── Contactos y oportunidades ──────────────────────────────────────────

export async function agregarEtiquetas(contactId: string, tags: string[]) {
  return hl(`/contacts/${contactId}/tags`, { method: 'POST', body: { tags } });
}

interface CampoPersonalizado {
  id: string;
  fieldKey: string;
}

/**
 * Llena campos personalizados del contacto buscándolos por su clave
 * (p. ej. "contact.prenda_reservada"). Los que no existan se ignoran.
 */
export async function llenarCampos(
  locationId: string,
  contactId: string,
  valores: Record<string, string | number>,
) {
  const data = await hl<{ customFields: CampoPersonalizado[] }>(
    `/locations/${locationId}/customFields?model=contact`,
  );
  const porClave = new Map((data.customFields ?? []).map((c) => [c.fieldKey, c.id]));
  const customFields = Object.entries(valores)
    .filter(([clave]) => porClave.has(clave))
    .map(([clave, valor]) => ({ id: porClave.get(clave)!, field_value: valor }));
  if (customFields.length === 0) return;
  await hl(`/contacts/${contactId}`, { method: 'PUT', body: { customFields } });
}

/** Mueve (o crea) la oportunidad del contacto a una etapa del embudo. */
export async function moverOportunidad(params: {
  locationId: string;
  pipelineId: string;
  stageId: string;
  contactId: string;
  nombre: string;
  monto?: number;
}) {
  return hl('/opportunities/upsert', {
    method: 'POST',
    body: {
      locationId: params.locationId,
      pipelineId: params.pipelineId,
      pipelineStageId: params.stageId,
      contactId: params.contactId,
      name: params.nombre,
      status: 'open',
      ...(params.monto != null ? { monetaryValue: params.monto } : {}),
    },
  });
}

// ── Oportunidades de una etapa (para el resumen diario) ───────────────

export interface Oportunidad {
  id: string;
  name: string;
  monetaryValue?: number;
  lastStageChangeAt?: string;
  createdAt?: string;
  contact?: { name?: string; phone?: string };
}

/** Oportunidades abiertas en una etapa del embudo (máx. 100). */
export async function oportunidadesEnEtapa(locationId: string, pipelineId: string, stageId: string) {
  const q = new URLSearchParams({
    location_id: locationId,
    pipeline_id: pipelineId,
    pipeline_stage_id: stageId,
    status: 'open',
    limit: '100',
  });
  const r = await hl<{ opportunities?: Oportunidad[] }>(`/opportunities/search?${q}`);
  return r.opportunities ?? [];
}

// ── Contactos con una etiqueta (para la promo de acumulados) ──────────

export interface ContactoHL {
  id: string;
  firstName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  tags?: string[];
}

/** Contactos que tienen una etiqueta (hasta 500, de 100 en 100). */
export async function contactosConEtiqueta(locationId: string, etiqueta: string) {
  const todos: ContactoHL[] = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const r = await hl<{ contacts?: ContactoHL[] }>('/contacts/search', {
      method: 'POST',
      body: {
        locationId,
        page: pagina,
        pageLimit: 100,
        filters: [{ field: 'tags', operator: 'eq', value: etiqueta }],
      },
    });
    const lote = r.contacts ?? [];
    todos.push(...lote);
    if (lote.length < 100) break;
  }
  // Por si el filtro de la API es aproximado: confirmar la etiqueta.
  return todos.filter((c) => (c.tags ?? []).some((t) => t.toLowerCase() === etiqueta.toLowerCase()));
}

/** Id del chat de un contacto (el más reciente), o null. */
export async function conversacionDeContacto(locationId: string, contactId: string) {
  const q = new URLSearchParams({ locationId, contactId, limit: '1' });
  const r = await hl<{ conversations?: Array<{ id: string; lastMessageDate?: number }> }>(
    `/conversations/search?${q}`,
    { version: '2021-04-15' },
  );
  return r.conversations?.[0] ?? null;
}
