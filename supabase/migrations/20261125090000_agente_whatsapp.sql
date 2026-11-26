-- ═══════════════════════════════════════════════════════════════════════
-- Agente IA de WhatsApp
--
-- Cada minuto, la Función Edge `agente-whatsapp` revisa en HighLevel los
-- chats cuyo último mensaje es del cliente. Por cada uno le pide a Claude
-- una respuesta siguiendo el "cerebro" de la tienda y la guarda aquí como
-- BORRADOR. La dueña la ve en la página /agente y decide: enviar (tal cual
-- o corregida), descartar, o aprobar la acción sugerida (marcar reserva,
-- acumula, pagó saldo).
--
-- Nada sale al cliente sin que una persona toque "Enviar". Las claves
-- (HighLevel y Claude) viven como secretos de las Funciones Edge, nunca en
-- estas tablas.
--
-- Las tablas solo se LEEN desde la app (RLS por tienda). Los cambios de
-- estado de los borradores pasan por la Función Edge `agente-accion`, que
-- es la única que puede hablar con HighLevel.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- Ajustes del agente: uno por tienda.
-- ───────────────────────────────────────────────────────────────────────
create table public.agent_settings (
  store_id             uuid primary key references public.stores(id) on delete cascade,
  enabled              boolean not null default false,
  cerebro              text not null default '',
  model                text not null default 'claude-haiku-5-5',
  -- HighLevel: sub-cuenta y embudo de reservas de esta tienda.
  hl_location_id       text,
  hl_pipeline_id       text,
  hl_stage_reservo     text,
  hl_stage_pago_saldo  text,
  updated_at           timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────
-- Borradores: una fila por "último mensaje del cliente" en un chat.
-- Si el cliente escribe otra vez antes de que se responda, el borrador
-- anterior queda 'superseded' y se crea uno nuevo con todo el contexto.
-- ───────────────────────────────────────────────────────────────────────
create table public.agent_drafts (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  store_id              uuid not null references public.stores(id) on delete cascade,
  hl_conversation_id    text not null,
  hl_contact_id         text not null,
  hl_last_message_id    text not null,
  contact_name          text,
  phone                 text,
  last_inbound_at       timestamptz not null,
  -- Los últimos mensajes del chat tal como los vio el agente (para mostrar).
  transcript            jsonb not null default '[]'::jsonb,

  proposed_reply        text,
  needs_human           boolean not null default false,
  human_note            text,
  suggested_action      text not null default 'none'
    check (suggested_action in ('none', 'reservar', 'acumula', 'pago_saldo')),
  action_data           jsonb not null default '{}'::jsonb,
  -- Prendas de Percha que podrían ser la que el cliente mandó en captura.
  item_matches          jsonb not null default '[]'::jsonb,

  status                text not null default 'pending'
    check (status in ('pending', 'sent', 'discarded', 'superseded', 'error')),
  action_status         text not null default 'none'
    check (action_status in ('none', 'done', 'error')),
  final_reply           text,
  error                 text,
  created_at            timestamptz not null default now(),
  decided_at            timestamptz,

  unique (store_id, hl_last_message_id)
);

create index agent_drafts_pending_idx
  on public.agent_drafts (store_id, status, last_inbound_at desc);
create index agent_drafts_conversation_idx
  on public.agent_drafts (store_id, hl_conversation_id, status);

-- ───────────────────────────────────────────────────────────────────────
-- Correcciones: cada vez que la dueña cambia la respuesta antes de
-- enviarla. Las más recientes se le muestran al agente como ejemplos, así
-- aprende el tono sin que nadie edite el cerebro a mano.
-- ───────────────────────────────────────────────────────────────────────
create table public.agent_corrections (
  id               uuid primary key default extensions.uuid_generate_v4(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  draft_id         uuid references public.agent_drafts(id) on delete set null,
  customer_message text not null,
  proposed_reply   text not null,
  final_reply      text not null,
  created_at       timestamptz not null default now()
);

create index agent_corrections_store_idx on public.agent_corrections (store_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════
alter table public.agent_settings    enable row level security;
alter table public.agent_drafts      enable row level security;
alter table public.agent_corrections enable row level security;

create policy agent_settings_select on public.agent_settings
  for select using (public.is_store_member(store_id));
-- Solo la dueña configura el agente (cerebro, activar/desactivar).
create policy agent_settings_insert on public.agent_settings
  for insert with check (public.is_store_owner(store_id));
create policy agent_settings_update on public.agent_settings
  for update using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy agent_drafts_select on public.agent_drafts
  for select using (public.is_store_member(store_id));

create policy agent_corrections_select on public.agent_corrections
  for select using (public.is_store_member(store_id));

-- ═══════════════════════════════════════════════════════════════════════
-- Cron: cada minuto despierta al agente. Igual que la cola de
-- publicación: si pg_net no está disponible no rompe nada.
-- ═══════════════════════════════════════════════════════════════════════
do $$
begin
  create extension if not exists pg_net;

  perform cron.unschedule('agente-whatsapp')
  where exists (select 1 from cron.job where jobname = 'agente-whatsapp');

  perform cron.schedule(
    'agente-whatsapp',
    '* * * * *',
    $cron$
      select net.http_post(
        url     := 'https://kygwgushdpishqrceygu.supabase.co/functions/v1/agente-whatsapp',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := '{}'::jsonb
      )
    $cron$
  );
exception when others then
  raise notice 'pg_cron/pg_net no disponible (%). El agente no se va a mover solo hasta que se programe a mano.', sqlerrm;
end $$;
