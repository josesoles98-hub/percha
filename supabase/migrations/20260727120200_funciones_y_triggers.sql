-- ═══════════════════════════════════════════════════════════════════════
-- 0003 · Automatismos: código único, historial, reservas, estadísticas
-- Todo lo que "el sistema recuerda por ti" vive aquí, en la base de datos.
-- Así funciona igual desde la web, desde la futura app móvil o desde un
-- script: la regla de negocio no depende de qué cliente la invoque.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- Perfil automático al registrarse un usuario
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────
-- updated_at automático
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger t_stores_updated_at
  before update on public.stores
  for each row execute function public.touch_updated_at();

-- ───────────────────────────────────────────────────────────────────────
-- Código único de prenda: PR-000128
-- El correlativo se incrementa de forma atómica en la fila de la tienda,
-- así que dos altas simultáneas nunca reciben el mismo código.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.gen_item_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq    bigint;
begin
  update public.stores
     set code_seq = code_seq + 1
   where id = new.store_id
  returning code_prefix, code_seq into v_prefix, v_seq;

  if v_prefix is null then
    raise exception 'La tienda % no existe', new.store_id;
  end if;

  new.code := v_prefix || '-' || lpad(v_seq::text, 6, '0');
  return new;
end $$;

create trigger t_gen_item_code
  before insert on public.items
  for each row
  when (new.code is null)
  execute function public.gen_item_code();

-- ───────────────────────────────────────────────────────────────────────
-- Reserva y venta: congelar datos en el momento del cambio de estado
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.set_status_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Entra en reserva
  if new.status = 'reserved' and old.status is distinct from 'reserved' then
    new.reserved_at := coalesce(new.reserved_at, now());
    -- Congela los días configurados AHORA. Cambiar el ajuste después no
    -- afecta a esta reserva.
    new.reserve_days_snapshot := coalesce(
      new.reserve_days_snapshot,
      (select reserve_days from public.stores where id = new.store_id)
    );

  -- Sale de reserva (a disponible, vendida u oculta): se limpian los datos
  elsif new.status <> 'reserved' then
    new.reserved_at           := null;
    new.reserve_days_snapshot := null;
    new.reserved_for_name     := null;
    new.reserved_for_phone    := null;
  end if;

  -- Venta
  if new.status = 'sold' and old.status is distinct from 'sold' then
    new.sold_at          := coalesce(new.sold_at, now());
    new.sold_price_cents := coalesce(new.sold_price_cents, new.price_cents);
  elsif new.status <> 'sold' then
    new.sold_at          := null;
    new.sold_price_cents := null;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger t_set_status_snapshots
  before update on public.items
  for each row execute function public.set_status_snapshots();

-- ───────────────────────────────────────────────────────────────────────
-- Historial de cambios automático
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.log_item_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_type    public.event_type;
begin
  if tg_op = 'INSERT' then
    insert into public.item_events (item_id, store_id, actor_id, type, to_status)
    values (new.id, new.store_id, auth.uid(), 'created', new.status);
    return null;
  end if;

  -- Papelera y restauración
  if old.deleted_at is null and new.deleted_at is not null then
    insert into public.item_events (item_id, store_id, actor_id, type)
    values (new.id, new.store_id, auth.uid(), 'deleted');
    return null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    insert into public.item_events (item_id, store_id, actor_id, type)
    values (new.id, new.store_id, auth.uid(), 'restored');
    return null;
  end if;

  -- Qué campos cambiaron → {campo: [antes, después]}
  if new.price_cents is distinct from old.price_cents then
    v_changes := v_changes || jsonb_build_object(
      'price_cents', jsonb_build_array(old.price_cents, new.price_cents));
  end if;
  if new.name is distinct from old.name then
    v_changes := v_changes || jsonb_build_object(
      'name', jsonb_build_array(old.name, new.name));
  end if;
  if new.description is distinct from old.description then
    v_changes := v_changes || jsonb_build_object(
      'description', jsonb_build_array(old.description, new.description));
  end if;
  if new.brand_id is distinct from old.brand_id then
    v_changes := v_changes || jsonb_build_object(
      'brand_id', jsonb_build_array(old.brand_id, new.brand_id));
  end if;
  if new.size_id is distinct from old.size_id then
    v_changes := v_changes || jsonb_build_object(
      'size_id', jsonb_build_array(old.size_id, new.size_id));
  end if;
  if new.category_id is distinct from old.category_id then
    v_changes := v_changes || jsonb_build_object(
      'category_id', jsonb_build_array(old.category_id, new.category_id));
  end if;
  if new.color_id is distinct from old.color_id then
    v_changes := v_changes || jsonb_build_object(
      'color_id', jsonb_build_array(old.color_id, new.color_id));
  end if;

  if new.status is distinct from old.status then
    v_type := case new.status
                when 'reserved' then 'reserved'::public.event_type
                when 'sold'     then 'sold'::public.event_type
                else 'status_changed'::public.event_type
              end;

    insert into public.item_events (
      item_id, store_id, actor_id, type, from_status, to_status, payload)
    values (
      new.id, new.store_id, auth.uid(), v_type, old.status, new.status,
      v_changes || case
        when new.status = 'reserved'
        then jsonb_build_object('reserved_for', new.reserved_for_name,
                                'expires_at',   new.reserve_expires_at)
        else '{}'::jsonb
      end);

  elsif v_changes <> '{}'::jsonb then
    insert into public.item_events (item_id, store_id, actor_id, type, payload)
    values (new.id, new.store_id, auth.uid(), 'updated', v_changes);
  end if;

  return null;
end $$;

create trigger t_log_item_event
  after insert or update on public.items
  for each row execute function public.log_item_event();

-- ───────────────────────────────────────────────────────────────────────
-- Contador de uso de marcas: las más usadas salen primero en el alta rápida
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.bump_brand_use()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.brand_id is not null
     and (tg_op = 'INSERT' or new.brand_id is distinct from old.brand_id) then
    update public.brands set use_count = use_count + 1 where id = new.brand_id;
  end if;
  return null;
end $$;

create trigger t_bump_brand_use
  after insert or update of brand_id on public.items
  for each row execute function public.bump_brand_use();

-- ═══════════════════════════════════════════════════════════════════════
-- VENCIMIENTO DE RESERVAS · doble red de seguridad
-- ═══════════════════════════════════════════════════════════════════════

-- (1) El job que hace el cambio real y genera la notificación.
--     Es SECURITY DEFINER porque lo ejecuta el planificador, sin usuario.
create or replace function public.expire_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with expired as (
    update public.items
       set status = 'available'
     where status = 'reserved'
       and reserve_expires_at <= now()
       and deleted_at is null
    returning id, store_id, code, name, reserved_for_name
  )
  insert into public.notifications (store_id, item_id, type, title, body)
  select
    store_id,
    id,
    'reservation_expired',
    'Reserva vencida',
    coalesce(name, code) || ' volvió a estar disponible' ||
      case when reserved_for_name is not null
           then ' (estaba reservada para ' || reserved_for_name || ')'
           else '' end
  from expired;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- (2) Programación cada 15 minutos.
--     pg_cron puede no estar disponible en todos los planes; si falla, la
--     vista items_view de abajo sigue mostrando el estado correcto y se
--     puede llamar a expire_reservations() desde un cron externo.
do $$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('expire-reservations')
  where exists (select 1 from cron.job where jobname = 'expire-reservations');

  perform cron.schedule(
    'expire-reservations',
    '*/15 * * * *',
    $cron$ select public.expire_reservations() $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible (%). El vencimiento seguirá siendo correcto vía items_view; programa un cron externo que llame a expire_reservations().', sqlerrm;
end $$;

-- ───────────────────────────────────────────────────────────────────────
-- (3) Vista de lectura: el estado SIEMPRE correcto.
-- Aunque el job aún no haya corrido, aquí una reserva vencida ya aparece
-- como disponible. Toda la app lee de esta vista, nunca de items directo.
-- ───────────────────────────────────────────────────────────────────────
create or replace view public.items_view
with (security_invoker = true)
as
select
  i.id,
  i.store_id,
  i.code,
  i.name,
  i.description,
  i.price_cents,
  i.cost_cents,
  i.status,
  i.brand_id,
  i.size_id,
  i.category_id,
  i.color_id,

  -- Estado efectivo: corrige al vuelo las reservas ya vencidas
  case
    when i.status = 'reserved' and i.reserve_expires_at <= now()
    then 'available'::public.item_status
    else i.status
  end as effective_status,

  i.reserved_at,
  i.reserve_expires_at,
  i.reserved_for_name,
  i.reserved_for_phone,

  -- Días que faltan para vencer (0 = vence hoy, null = no reservada)
  case
    when i.status = 'reserved' and i.reserve_expires_at > now()
    then ceil(extract(epoch from (i.reserve_expires_at - now())) / 86400.0)::int
    when i.status = 'reserved'
    then 0
  end as days_left,

  i.sold_at,
  i.sold_price_cents,
  i.share_count,
  i.created_by,
  i.created_at,
  i.updated_at,

  b.name  as brand_name,
  s.label as size_label,
  c.name  as category_name,
  c.emoji as category_emoji,
  co.name as color_name,
  co.hex  as color_hex,

  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'path',     p.storage_path,
          'position', p.position,
          'blurhash', p.blurhash,
          'status',   p.status
        ) order by p.position
      ),
      '[]'::jsonb
    )
    from public.item_photos p
    where p.item_id = i.id
  ) as photos

from public.items i
left join public.brands     b  on b.id  = i.brand_id
left join public.sizes      s  on s.id  = i.size_id
left join public.categories c  on c.id  = i.category_id
left join public.colors     co on co.id = i.color_id
where i.deleted_at is null;

comment on view public.items_view is
  'Lectura de prendas con estado efectivo ya corregido. security_invoker = las RLS de items siguen aplicando al usuario que consulta.';

-- ───────────────────────────────────────────────────────────────────────
-- Estadísticas del panel en UNA sola consulta
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.dashboard_stats(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total',           count(*),
    'available',       count(*) filter (where effective_status = 'available'),
    'reserved',        count(*) filter (where effective_status = 'reserved'),
    'sold',            count(*) filter (where effective_status = 'sold'),
    'hidden',          count(*) filter (where effective_status = 'hidden'),

    'inventory_value', coalesce(sum(price_cents) filter (
                         where effective_status in ('available', 'reserved')), 0),
    'sold_value_month', coalesce(sum(sold_price_cents) filter (
                         where effective_status = 'sold'
                           and sold_at >= date_trunc('month', now())), 0),

    'expiring_today',  count(*) filter (
                         where status = 'reserved'
                           and reserve_expires_at > now()
                           and reserve_expires_at < (current_date + 1)),
    'expired',         count(*) filter (
                         where status = 'reserved' and reserve_expires_at <= now()),

    'added_this_week', count(*) filter (where created_at >= date_trunc('week', now()))
  )
  from public.items_view
  where store_id = p_store_id;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- Onboarding: crear la tienda con sus catálogos en una sola llamada
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.bootstrap_store(
  p_name          text,
  p_currency      text default 'PEN',
  p_symbol        text default 'S/',
  p_reserve_days  integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_user_id  uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Se requiere sesión iniciada';
  end if;

  insert into public.stores (name, currency, currency_symbol, reserve_days)
  values (trim(p_name), p_currency, p_symbol, p_reserve_days)
  returning id into v_store_id;

  -- Quien crea la tienda es su dueño
  insert into public.store_members (store_id, user_id, role)
  values (v_store_id, v_user_id, 'owner');

  -- Catálogos iniciales pensados para ropa americana
  insert into public.categories (store_id, name, emoji, position)
  values
    (v_store_id, 'Casacas',     '🧥', 1),
    (v_store_id, 'Polos',       '👕', 2),
    (v_store_id, 'Camisas',     '👔', 3),
    (v_store_id, 'Pantalones',  '👖', 4),
    (v_store_id, 'Jeans',       '👖', 5),
    (v_store_id, 'Shorts',      '🩳', 6),
    (v_store_id, 'Vestidos',    '👗', 7),
    (v_store_id, 'Zapatillas',  '👟', 8),
    (v_store_id, 'Accesorios',  '🧢', 9);

  insert into public.sizes (store_id, label, group_name, position)
  select v_store_id, label, 'ropa', ord
  from unnest(array['XS','S','M','L','XL','XXL']) with ordinality as t(label, ord);

  insert into public.sizes (store_id, label, group_name, position)
  select v_store_id, label, 'pantalon', ord
  from unnest(array['28','30','32','34','36','38','40']) with ordinality as t(label, ord);

  insert into public.sizes (store_id, label, group_name, position)
  select v_store_id, label, 'calzado', ord
  from unnest(array['35','36','37','38','39','40','41','42','43','44','45'])
       with ordinality as t(label, ord);

  insert into public.colors (store_id, name, hex, position)
  values
    (v_store_id, 'Negro',    '#000000', 1),
    (v_store_id, 'Blanco',   '#FFFFFF', 2),
    (v_store_id, 'Gris',     '#808080', 3),
    (v_store_id, 'Azul',     '#1E40AF', 4),
    (v_store_id, 'Celeste',  '#38BDF8', 5),
    (v_store_id, 'Rojo',     '#DC2626', 6),
    (v_store_id, 'Verde',    '#16A34A', 7),
    (v_store_id, 'Amarillo', '#FACC15', 8),
    (v_store_id, 'Beige',    '#D6C7A1', 9),
    (v_store_id, 'Marrón',   '#78350F', 10),
    (v_store_id, 'Rosado',   '#F9A8D4', 11),
    (v_store_id, 'Morado',   '#7C3AED', 12);

  return v_store_id;
end $$;
