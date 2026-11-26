-- ═══════════════════════════════════════════════════════════════════════
-- Catálogo para clientes + promo de acumulados
--
-- 1) Catálogo público: una página por tienda (percha…/c/<slug>) con las
--    prendas DISPONIBLES y con precio. Se mantiene sola: al reservar o
--    vender una prenda (a mano o aprobando en el agente) deja de salir.
--    La lee la función Edge `catalogo-publico` (con la clave de servicio,
--    porque las fotos están en un bucket privado y hay que firmarlas).
--
--    catalog_delay_hours: 0 = las prendas nuevas salen en el catálogo de
--    inmediato (opción A); 24 = salen al día siguiente, para que los grupos
--    de WhatsApp las vean primero (opción B).
--
-- 2) Promo de acumulados: al día N (10 por defecto) de tener la etiqueta
--    "acumula" en HighLevel, el agente deja un mensaje listo para aprobar:
--    una prenda más de S/X o más en 24 h → envío gratis. Una vez por cliente.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.stores
  add column if not exists catalog_slug text,
  add column if not exists catalog_enabled boolean not null default false,
  add column if not exists catalog_delay_hours integer not null default 0
    check (catalog_delay_hours between 0 and 168);

-- Slug: minúsculas, números y guiones; único entre tiendas.
alter table public.stores
  drop constraint if exists stores_catalog_slug_formato;
alter table public.stores
  add constraint stores_catalog_slug_formato
    check (catalog_slug is null or catalog_slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$');
create unique index if not exists stores_catalog_slug_unico on public.stores (catalog_slug);

alter table public.agent_settings
  add column if not exists promo_enabled boolean not null default false,
  add column if not exists promo_day integer not null default 10 check (promo_day between 1 and 60),
  add column if not exists promo_min_soles integer not null default 25 check (promo_min_soles >= 0);

-- Borradores de promo: no responden a un mensaje del cliente, así que al
-- enviarlos no se exige que el chat siga igual.
alter table public.agent_drafts
  add column if not exists kind text not null default 'reply' check (kind in ('reply', 'promo'));

-- Seguimiento de quién está acumulando y si ya recibió la promo.
create table if not exists public.agent_promos (
  store_id       uuid not null references public.stores(id) on delete cascade,
  hl_contact_id  text not null,
  -- Primera vez que se vio con la etiqueta "acumula" (o cuando el agente se
  -- la puso). De aquí se cuentan los días.
  first_seen_at  timestamptz not null default now(),
  offered_at     timestamptz,
  draft_id       uuid references public.agent_drafts(id) on delete set null,
  primary key (store_id, hl_contact_id)
);

alter table public.agent_promos enable row level security;

drop policy if exists agent_promos_select on public.agent_promos;
create policy agent_promos_select on public.agent_promos
  for select using (public.is_store_member(store_id));

-- Cuando el agente pone la etiqueta "acumula", la cuenta arranca ese día.
-- (agente-accion lo registra; para etiquetas puestas a mano, cuenta desde
-- que el cron diario las ve por primera vez.)

-- La promo se revisa una vez al día, a las 10:00 de Lima (15:00 UTC).
do $$
begin
  perform cron.unschedule('promo-acumulados')
  where exists (select 1 from cron.job where jobname = 'promo-acumulados');

  perform cron.schedule(
    'promo-acumulados',
    '0 15 * * *',
    $cron$
      select net.http_post(
        url     := 'https://kygwgushdpishqrceygu.supabase.co/functions/v1/promo-acumulados',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := '{}'::jsonb
      )
    $cron$
  );
exception when others then
  raise notice 'pg_cron/pg_net no disponible (%). La promo no se revisará sola.', sqlerrm;
end $$;
