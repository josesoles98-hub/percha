-- ═══════════════════════════════════════════════════════════════════════
-- 0011 · Cola de publicación automática (notificaciones push)
--
-- Objetivo: elegir varias prendas y que el celular avise sola, cada N
-- minutos, "toca para publicar esta" — con la foto y el texto ya listos.
-- La usuaria sigue tocando "enviar" en WhatsApp (nadie publica en su
-- nombre), así que no hay riesgo de que WhatsApp bloquee el número: sigue
-- siendo un humano el que manda cada mensaje, solo que ya no tiene que
-- pensar ni preparar nada.
--
-- La parte que "despierta" cada minuto vive en Postgres (pg_cron, que ya
-- se usa para vencer reservas). Lo que hace al despertar es avisarle a una
-- Función Edge de Supabase (supabase/functions/publicar-cola), que es la
-- que sabe firmar y mandar la notificación push de verdad — eso no se
-- puede hacer en SQL. La función Edge recibe la clave de administración
-- de la base de datos automáticamente de parte de Supabase: no vive en
-- ningún archivo de este repo.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- Suscripciones push: un celular puede tener más de una (varios
-- vendedores, o el mismo celular reinstaló la app).
-- ───────────────────────────────────────────────────────────────────────
create table public.push_subscriptions (
  id         uuid primary key default extensions.uuid_generate_v4(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_store_idx on public.push_subscriptions (store_id);

-- ───────────────────────────────────────────────────────────────────────
-- Cola: el orden en que se van a ir avisando las prendas.
-- ───────────────────────────────────────────────────────────────────────
create table public.publish_queue (
  id         uuid primary key default extensions.uuid_generate_v4(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  item_id    uuid not null references public.items(id) on delete cascade,
  position   integer not null,
  status     text not null default 'pending' check (status in ('pending', 'sent', 'skipped')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

create index publish_queue_store_idx on public.publish_queue (store_id, status, position);

-- Una tienda tiene una sola cola activa a la vez: se reutiliza el mismo
-- ajuste de tienda en vez de una tabla de "sesiones" aparte.
alter table public.stores
  add column publish_active boolean not null default false,
  add column publish_interval_minutes integer not null default 6
    check (publish_interval_minutes between 1 and 120);

-- ═══════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════
alter table public.push_subscriptions enable row level security;
alter table public.publish_queue      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'publish_queue'] loop
    execute format($f$
      create policy %1$s_select on public.%1$s
        for select using (public.is_store_member(store_id));
      create policy %1$s_insert on public.%1$s
        for insert with check (public.is_store_member(store_id));
      create policy %1$s_update on public.%1$s
        for update using (public.is_store_member(store_id))
        with check (public.is_store_member(store_id));
      create policy %1$s_delete on public.%1$s
        for delete using (public.is_store_member(store_id));
    $f$, t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Cron: cada minuto, avisarle a la Función Edge que revise si a alguna
-- tienda con la cola activa le toca mandar la siguiente. Se revisa cada
-- minuto (no cada 5-7) porque el intervalo real lo decide la propia
-- función mirando `sent_at` contra `publish_interval_minutes`; así no hay
-- que reprogramar el cron si mañana se ofrece otro intervalo.
--
-- Igual que expire_reservations(): si pg_net no está disponible, no
-- rompe nada más — solo no hay avisos automáticos hasta que se programe
-- a mano.
-- ═══════════════════════════════════════════════════════════════════════
do $$
begin
  create extension if not exists pg_net;

  perform cron.unschedule('publicar-cola')
  where exists (select 1 from cron.job where jobname = 'publicar-cola');

  -- La URL del proyecto no es secreta (es pública, la misma de
  -- NEXT_PUBLIC_SUPABASE_URL); lo único que viene de Vault es la clave de
  -- administración, que sí tiene que quedar fuera del repo.
  perform cron.schedule(
    'publicar-cola',
    '* * * * *',
    $cron$
      select net.http_post(
        url     := 'https://kygwgushdpishqrceygu.supabase.co/functions/v1/publicar-cola',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := '{}'::jsonb
      )
    $cron$
  );
exception when others then
  raise notice 'pg_cron/pg_net no disponible (%). La cola de publicación no se va a mover sola hasta que se programe a mano.', sqlerrm;
end $$;
