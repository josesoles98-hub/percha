// Función Edge: lo que pasa cuando la dueña toca un botón en /agente.
//
//   enviar   → manda la respuesta (tal cual o corregida) por WhatsApp vía
//              HighLevel. Si la corrigió, guarda la corrección para que el
//              agente aprenda.
//   descartar → el borrador se archiva sin enviar nada.
//   accion   → ejecuta la acción sugerida en HighLevel:
//              reservar   → oportunidad a "Reservó (S/10)" + prenda, saldo y
//                           vencimiento (hoy + 5 días). Eso dispara el flujo
//                           "Reservas 5 días" que ya existe en HighLevel.
//              acumula    → etiqueta `acumula` (dispara "ACUMULA envío gratis").
//              pago_saldo → oportunidad a "Pagó saldo".
//
// La llama la app con la sesión de la usuaria; aquí se comprueba que sea
// miembro de la tienda dueña del borrador antes de tocar nada.

import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  agregarEtiquetas,
  enviarWhatsApp,
  llenarCampos,
  mensajesDelChat,
  moverOportunidad,
} from '../_shared/highlevel.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface Peticion {
  draftId: string;
  tipo: 'enviar' | 'descartar' | 'accion';
  texto?: string;
  // Para "reservar", la dueña puede corregir lo que dedujo el agente.
  prenda?: string;
  saldo?: number;
  /** Prenda de Percha que se marca como reservada o vendida. null = ninguna. */
  itemId?: string | null;
  /** Precio de venta en soles, si la dueña lo corrigió. */
  precio?: number;
  /**
   * La dueña elige la acción aunque el agente no la haya sugerido
   * (p. ej. reconoció la prenda pero el cliente aún no mandó comprobante).
   */
  accion?: 'reservar' | 'pago_saldo';
  /** Varias prendas a la vez (un cliente que separa o paga 2 o más). Manda sobre itemId/precio. */
  prendas?: Array<{ itemId: string; precio?: number }>;
}

function ultimos9(telefono: string | null | undefined) {
  return (telefono ?? '').replace(/\D/g, '').slice(-9);
}

/**
 * Deja la prenda de Percha en el estado que corresponde, para que el
 * inventario se mantenga solo: reservar → reservada a nombre del cliente;
 * pago del saldo → vendida. En el pago del saldo, si la dueña no eligió
 * prenda, se usa la que ya estaba reservada a ese mismo teléfono.
 */
async function marcarEnPercha(
  storeId: string,
  accion: 'reservar' | 'pago_saldo',
  itemId: string | null | undefined,
  cliente: { nombre: string; telefono: string | null },
  /** Precio que vio/pagó el cliente (de la captura). Manda sobre el de Percha. */
  precioCentavos: number | null,
) {
  let id = itemId ?? null;

  if (!id && accion === 'pago_saldo' && ultimos9(cliente.telefono)) {
    const { data: reservadas } = await admin
      .from('items')
      .select('id, reserved_for_phone')
      .eq('store_id', storeId)
      .eq('status', 'reserved')
      .is('deleted_at', null);
    const suyas = (reservadas ?? []).filter(
      (r) => ultimos9(r.reserved_for_phone) === ultimos9(cliente.telefono),
    );
    if (suyas.length === 1) id = suyas[0].id;
  }
  if (!id) return null;

  const cambios =
    accion === 'reservar'
      ? {
          status: 'reserved',
          reserved_for_name: cliente.nombre,
          reserved_for_phone: cliente.telefono,
          reserved_deposit_cents: 1000,
          // El precio acordado con el cliente queda en la prenda: cuando
          // pague el saldo, la venta se registra a ese precio.
          ...(precioCentavos ? { price_cents: precioCentavos } : {}),
        }
      : {
          status: 'sold',
          // La venta se registra al precio real del día, no al que quedó en
          // Percha: así Ganancias cuadra aunque el precio haya cambiado.
          ...(precioCentavos ? { sold_price_cents: precioCentavos } : {}),
        };

  const { data, error } = await admin
    .from('items')
    .update(cambios)
    .eq('id', id)
    .eq('store_id', storeId) // nunca tocar prendas de otra tienda
    .select('code')
    .maybeSingle();
  if (error) throw new Error(`Percha: ${error.message}`);
  return data?.code ?? null;
}

function fechaLimaMasDias(dias: number) {
  const d = new Date(Date.now() + dias * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // AAAA-MM-DD
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── ¿Quién llama? ────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: usuario } = await admin.auth.getUser(token);
  if (!usuario?.user) return responder({ error: 'Inicia sesión otra vez' }, 401);

  const peticion = (await req.json()) as Peticion;
  const { data: draft } = await admin
    .from('agent_drafts')
    .select('*')
    .eq('id', peticion.draftId)
    .maybeSingle();
  if (!draft) return responder({ error: 'Ese borrador ya no existe' }, 404);

  const { data: miembro } = await admin
    .from('store_members')
    .select('role')
    .eq('store_id', draft.store_id)
    .eq('user_id', usuario.user.id)
    .maybeSingle();
  if (!miembro) return responder({ error: 'No tienes acceso a esta tienda' }, 403);

  const ahora = new Date().toISOString();

  try {
    // ── Descartar ──────────────────────────────────────────────────────
    if (peticion.tipo === 'descartar') {
      await admin
        .from('agent_drafts')
        .update({ status: 'discarded', decided_at: ahora })
        .eq('id', draft.id);
      return responder({ ok: true });
    }

    // ── Enviar ─────────────────────────────────────────────────────────
    if (peticion.tipo === 'enviar') {
      if (draft.status !== 'pending') {
        return responder({ error: 'Este borrador ya se envió o se descartó' }, 409);
      }
      const texto = (peticion.texto ?? draft.proposed_reply ?? '').trim();
      if (!texto) return responder({ error: 'El mensaje está vacío' }, 400);

      // ¿Alguien respondió desde el celular o el cliente volvió a escribir?
      // (Una promo no responde a ningún mensaje: no se comprueba.)
      const esPromo = draft.kind === 'promo';
      const mensajes = esPromo ? [] : await mensajesDelChat(draft.hl_conversation_id, 5);
      const ultimo = mensajes.at(-1);
      if (!esPromo && ultimo && ultimo.id !== draft.hl_last_message_id) {
        await admin
          .from('agent_drafts')
          .update({ status: 'superseded', decided_at: ahora })
          .eq('id', draft.id);
        return responder(
          {
            error:
              ultimo.direction === 'outbound'
                ? 'Ya respondiste este chat desde el celular. No envié nada.'
                : 'El cliente escribió algo nuevo. El agente va a preparar otra respuesta.',
          },
          409,
        );
      }

      try {
        await enviarWhatsApp(draft.hl_contact_id, texto);
      } catch (e) {
        // WhatsApp no deja escribir libre si el cliente no habló en 24 h.
        if (esPromo) {
          return responder(
            {
              error:
                'WhatsApp no dejó enviarlo porque el cliente no escribe hace más de 24 horas. Usa "Abrir en mi WhatsApp" para mandarlo desde tu celular.',
            },
            409,
          );
        }
        throw e;
      }
      await admin
        .from('agent_drafts')
        .update({ status: 'sent', final_reply: texto, decided_at: ahora })
        .eq('id', draft.id);

      if (!esPromo && draft.proposed_reply && texto !== draft.proposed_reply.trim()) {
        const delCliente = (draft.transcript as Array<{ de: string; texto: string }>)
          .filter((m) => m.de === 'cliente')
          .slice(-3)
          .map((m) => m.texto || '[foto]')
          .join(' / ');
        await admin.from('agent_corrections').insert({
          store_id: draft.store_id,
          draft_id: draft.id,
          customer_message: delCliente || '[foto]',
          proposed_reply: draft.proposed_reply,
          final_reply: texto,
        });
      }
      return responder({ ok: true });
    }

    // ── Acción en HighLevel ────────────────────────────────────────────
    if (peticion.tipo === 'accion') {
      const accion: string =
        peticion.accion === 'reservar' || peticion.accion === 'pago_saldo' ? peticion.accion : draft.suggested_action;
      const { data: ajustes } = await admin
        .from('agent_settings')
        .select('hl_location_id, hl_pipeline_id, hl_stage_reservo, hl_stage_pago_saldo')
        .eq('store_id', draft.store_id)
        .maybeSingle();
      if (!ajustes?.hl_location_id) {
        return responder({ error: 'Falta configurar HighLevel en Ajustes del agente' }, 400);
      }

      const nombre = draft.contact_name ?? 'Cliente';
      const datos = (draft.action_data ?? {}) as {
        marca?: string;
        talla?: string;
        tipo?: string;
        precio_soles?: number;
        saldo_soles?: number;
      };

      if (accion === 'acumula') {
        await agregarEtiquetas(draft.hl_contact_id, ['acumula']);
        // La cuenta de días para la promo de acumulados empieza hoy.
        await admin
          .from('agent_promos')
          .upsert(
            { store_id: draft.store_id, hl_contact_id: draft.hl_contact_id },
            { onConflict: 'store_id,hl_contact_id', ignoreDuplicates: true },
          );
      } else if (accion === 'reservar') {
        if (!ajustes.hl_pipeline_id || !ajustes.hl_stage_reservo) {
          return responder({ error: 'Falta la etapa "Reservó" en Ajustes del agente' }, 400);
        }
        const prenda =
          peticion.prenda?.trim() ||
          [datos.tipo, datos.marca, datos.talla ? `talla ${datos.talla}` : ''].filter(Boolean).join(' ') ||
          'Prenda reservada';
        const saldo = peticion.saldo ?? datos.saldo_soles ?? 0;

        await moverOportunidad({
          locationId: ajustes.hl_location_id,
          pipelineId: ajustes.hl_pipeline_id,
          stageId: ajustes.hl_stage_reservo,
          contactId: draft.hl_contact_id,
          nombre,
          monto: datos.precio_soles || undefined,
        });
        await llenarCampos(ajustes.hl_location_id, draft.hl_contact_id, {
          'contact.prenda_reservada': prenda,
          'contact.saldo_pendiente': saldo,
          'contact.vence_reserva': fechaLimaMasDias(5),
        });
      } else if (accion === 'pago_saldo') {
        if (!ajustes.hl_pipeline_id || !ajustes.hl_stage_pago_saldo) {
          return responder({ error: 'Falta la etapa "Pagó saldo" en Ajustes del agente' }, 400);
        }
        await moverOportunidad({
          locationId: ajustes.hl_location_id,
          pipelineId: ajustes.hl_pipeline_id,
          stageId: ajustes.hl_stage_pago_saldo,
          contactId: draft.hl_contact_id,
          nombre,
        });
      } else {
        return responder({ error: 'Este borrador no tiene ninguna acción' }, 400);
      }

      let codigo: string | null = null;
      if (accion === 'reservar' || accion === 'pago_saldo') {
        const cliente = { nombre, telefono: draft.phone };
        if (peticion.prendas?.length) {
          const codigos: string[] = [];
          for (const p of peticion.prendas.slice(0, 10)) {
            const c = await marcarEnPercha(
              draft.store_id,
              accion,
              p.itemId,
              cliente,
              p.precio && p.precio > 0 ? Math.round(p.precio * 100) : null,
            );
            if (c) codigos.push(c);
          }
          codigo = codigos.join(', ') || null;
        } else {
          const precio = peticion.precio ?? datos.precio_soles ?? 0;
          codigo = await marcarEnPercha(
            draft.store_id,
            accion,
            peticion.itemId,
            cliente,
            precio > 0 ? Math.round(precio * 100) : null,
          );
        }
      }

      await admin.from('agent_drafts').update({ action_status: 'done' }).eq('id', draft.id);
      return responder({ ok: true, prenda: codigo });
    }

    return responder({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    if (peticion.tipo === 'accion') {
      await admin
        .from('agent_drafts')
        .update({ action_status: 'error', error: mensaje.slice(0, 500) })
        .eq('id', draft.id);
    }
    return responder({ error: `No se pudo completar: ${mensaje.slice(0, 200)}` }, 502);
  }
});
