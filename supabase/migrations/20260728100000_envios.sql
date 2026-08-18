-- ═══════════════════════════════════════════════════════════════════════
-- 0006 · Clientes, pedidos y envíos (Shalom)
--
-- Ver la sección 11 del documento de diseño. El formato de las columnas
-- está sacado del archivo real de carga masiva del cliente, que vive en
-- docs/shalom/plantilla-original.xlsx.
-- ═══════════════════════════════════════════════════════════════════════

create type public.order_status    as enum ('draft','confirmed','packed','shipped','delivered','cancelled');
create type public.shipment_status as enum ('pending','exported','registered','in_transit','delivered','returned','cancelled');
create type public.doc_type        as enum ('DNI','RUC','CE');

-- ───────────────────────────────────────────────────────────────────────
-- AGENCIAS SHALOM · catálogo global, no por tienda
--
-- Los nombres tienen que coincidir EXACTAMENTE con los de la plantilla:
-- son los valores que aceptan las validaciones de las columnas ORIGEN y
-- DESTINO. Por eso el selector de la app solo ofrece estos y es imposible
-- generar un archivo que Shalom rechace por el nombre de la agencia.
-- ───────────────────────────────────────────────────────────────────────
create table public.shalom_agencies (
  id         integer primary key,          -- ID oficial del formato
  name       text not null unique,
  is_origin  boolean not null default false,
  is_destiny boolean not null default false,
  search_key text generated always as (public.immutable_unaccent(lower(name))) stored
);

create index shalom_agencies_search_idx
  on public.shalom_agencies using gin (search_key extensions.gin_trgm_ops);
create index shalom_agencies_destiny_idx
  on public.shalom_agencies (name) where is_destiny;

-- ───────────────────────────────────────────────────────────────────────
-- CLIENTES
-- ───────────────────────────────────────────────────────────────────────
create table public.customers (
  id                uuid primary key default extensions.uuid_generate_v4(),
  store_id          uuid not null references public.stores(id) on delete cascade,

  full_name         text not null check (length(trim(full_name)) > 0),
  doc_type          public.doc_type not null default 'DNI',
  -- Shalom exige documento para registrar el envío, pero un cliente puede
  -- existir antes de tener envío (por ejemplo, al reservar). Se pide en el
  -- momento de crear el pedido, no antes.
  doc_number        text,
  phone             text,
  email             text,

  -- La mayoría de clientes recoge siempre en la misma agencia: se recuerda
  -- y la segunda compra se registra en dos toques.
  default_agency_id integer references public.shalom_agencies(id),
  notes             text,

  orders_count      integer not null default 0,
  total_spent_cents bigint not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Un documento no puede repetirse dentro de la misma tienda, pero sí puede
-- haber varios clientes sin documento todavía.
create unique index customers_unique_doc
  on public.customers (store_id, doc_type, doc_number)
  where doc_number is not null;
create index customers_name_idx  on public.customers (store_id, lower(full_name));
create index customers_phone_idx on public.customers (store_id, phone);

-- ───────────────────────────────────────────────────────────────────────
-- PEDIDOS
-- ───────────────────────────────────────────────────────────────────────
create table public.orders (
  id             uuid primary key default extensions.uuid_generate_v4(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  code           text not null,                    -- 'PED-000042'
  customer_id    uuid not null references public.customers(id) on delete restrict,
  status         public.order_status not null default 'draft',

  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents    integer not null default 0 check (total_cents >= 0),
  paid_cents     integer not null default 0 check (paid_cents >= 0),

  notes          text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index orders_unique_code on public.orders (store_id, code);
create index orders_status_idx   on public.orders (store_id, status);
create index orders_customer_idx on public.orders (customer_id, created_at desc);

create table public.order_items (
  order_id    uuid not null references public.orders(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete restrict,
  -- Precio congelado al vender: si mañana cambias el precio de catálogo,
  -- el pedido tiene que seguir diciendo lo que se cobró.
  price_cents integer not null check (price_cents >= 0),
  primary key (order_id, item_id)
);
create index order_items_item_idx on public.order_items (item_id);

-- ───────────────────────────────────────────────────────────────────────
-- LOTES DE EXPORTACIÓN
-- ───────────────────────────────────────────────────────────────────────
create table public.export_batches (
  id            uuid primary key default extensions.uuid_generate_v4(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  provider      text not null default 'shalom',
  file_name     text not null,
  rows_count    integer not null check (rows_count > 0),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  -- Cuándo confirmaste que lo subiste a Shalom Pro.
  registered_at timestamptz
);
create index export_batches_store_idx on public.export_batches (store_id, created_at desc);

-- ───────────────────────────────────────────────────────────────────────
-- ENVÍOS · una fila por línea del Excel de carga masiva
-- ───────────────────────────────────────────────────────────────────────
create table public.shipments (
  id                uuid primary key default extensions.uuid_generate_v4(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  order_id          uuid not null references public.orders(id) on delete cascade,
  provider          text not null default 'shalom',

  origin_agency_id  integer not null references public.shalom_agencies(id),
  destiny_agency_id integer not null references public.shalom_agencies(id),

  -- Los seis valores que acepta la validación de la columna MERCADERIA.
  package_type      text not null default 'PAQUETE XS'
                    check (package_type in ('SOBRE','PAQUETE XXS','PAQUETE XS',
                                            'PAQUETE S','PAQUETE M','PAQUETE L')),

  -- Shalom pesa y mide en la agencia; en el ejemplo de la plantilla estas
  -- cuatro columnas van en 0 y lo que define la tarifa es package_type.
  height_cm         numeric(6,2) not null default 0 check (height_cm >= 0),
  width_cm          numeric(6,2) not null default 0 check (width_cm >= 0),
  length_cm         numeric(6,2) not null default 0 check (length_cm >= 0),
  weight_kg         numeric(6,2) not null default 0 check (weight_kg >= 0),
  packages_count    integer not null default 1 check (packages_count > 0),

  contact_doc       text,   -- columna C, opcional
  contact_phone     text,   -- columna D, opcional
  grr_number        text,   -- columna E, guía de remisión, opcional

  status            public.shipment_status not null default 'pending',
  tracking_code     text,
  cost_cents        integer check (cost_cents >= 0),

  export_batch_id   uuid references public.export_batches(id) on delete set null,
  registered_at     timestamptz,
  delivered_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index shipments_pendientes_idx on public.shipments (store_id, status);
create index shipments_order_idx      on public.shipments (order_id);
create index shipments_batch_idx      on public.shipments (export_batch_id);

-- ───────────────────────────────────────────────────────────────────────
-- AJUSTES DE ENVÍO EN LA TIENDA
-- ───────────────────────────────────────────────────────────────────────
alter table public.stores
  add column shalom_origin_agency_id integer references public.shalom_agencies(id),
  add column default_package_type    text not null default 'PAQUETE XS'
    check (default_package_type in ('SOBRE','PAQUETE XXS','PAQUETE XS',
                                    'PAQUETE S','PAQUETE M','PAQUETE L')),
  add column shipping_enabled        boolean not null default false;

-- ═══════════════════════════════════════════════════════════════════════
-- AUTOMATISMOS
-- ═══════════════════════════════════════════════════════════════════════

-- Código de pedido: PED-000042. Mismo correlativo atómico que las prendas.
alter table public.stores add column order_seq bigint not null default 0;

create or replace function public.gen_order_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_seq bigint;
begin
  update public.stores
     set order_seq = order_seq + 1
   where id = new.store_id
  returning order_seq into v_seq;

  if v_seq is null then
    raise exception 'La tienda % no existe', new.store_id;
  end if;

  new.code := 'PED-' || lpad(v_seq::text, 6, '0');
  return new;
end $$;

create trigger t_gen_order_code
  before insert on public.orders
  for each row when (new.code is null)
  execute function public.gen_order_code();

create trigger t_orders_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

create trigger t_customers_updated_at
  before update on public.customers
  for each row execute function public.touch_updated_at();

create trigger t_shipments_updated_at
  before update on public.shipments
  for each row execute function public.touch_updated_at();

-- ───────────────────────────────────────────────────────────────────────
-- Totales del pedido: se recalculan solos al añadir o quitar prendas.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.recalcular_total_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
  v_subtotal integer;
begin
  select coalesce(sum(price_cents), 0) into v_subtotal
  from public.order_items where order_id = v_order;

  update public.orders
     set subtotal_cents = v_subtotal,
         total_cents    = v_subtotal + shipping_cents
   where id = v_order;

  return null;
end $$;

create trigger t_recalcular_total
  after insert or delete or update of price_cents on public.order_items
  for each row execute function public.recalcular_total_pedido();

-- ───────────────────────────────────────────────────────────────────────
-- Una prenda es pieza única: no puede estar en dos pedidos vivos a la vez.
--
-- No se puede usar un índice parcial porque la condición depende de otra
-- tabla (el estado del pedido), así que se comprueba con un trigger.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.prenda_en_un_solo_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_otro text;
begin
  select o.code into v_otro
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.item_id = new.item_id
    and oi.order_id <> new.order_id
    and o.status <> 'cancelled'
  limit 1;

  if v_otro is not null then
    raise exception 'Esa prenda ya está en el pedido %', v_otro
      using errcode = 'unique_violation';
  end if;

  return new;
end $$;

create trigger t_prenda_en_un_solo_pedido
  before insert on public.order_items
  for each row execute function public.prenda_en_un_solo_pedido();

-- ───────────────────────────────────────────────────────────────────────
-- Al confirmar el pedido, sus prendas pasan a vendidas con el precio
-- congelado del pedido. Al cancelarlo, vuelven a estar disponibles.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.sincronizar_prendas_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then return null; end if;

  if new.status = 'confirmed' and old.status = 'draft' then
    update public.items i
       set status           = 'sold',
           sold_at          = coalesce(i.sold_at, now()),
           sold_price_cents = oi.price_cents
      from public.order_items oi
     where oi.order_id = new.id
       and i.id = oi.item_id
       and i.status <> 'sold';

    -- Estadísticas del cliente, para su historial de compras.
    update public.customers
       set orders_count      = orders_count + 1,
           total_spent_cents = total_spent_cents + new.total_cents
     where id = new.customer_id;

  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.items i
       set status = 'available'
      from public.order_items oi
     where oi.order_id = new.id
       and i.id = oi.item_id
       and i.status = 'sold';

    if old.status <> 'draft' then
      update public.customers
         set orders_count      = greatest(0, orders_count - 1),
             total_spent_cents = greatest(0, total_spent_cents - new.total_cents)
       where id = new.customer_id;
    end if;
  end if;

  return null;
end $$;

create trigger t_sincronizar_prendas_pedido
  after update of status on public.orders
  for each row execute function public.sincronizar_prendas_pedido();

-- ═══════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════
alter table public.shalom_agencies enable row level security;
alter table public.customers       enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.shipments       enable row level security;
alter table public.export_batches  enable row level security;

-- Las agencias son un catálogo público de Shalom: cualquiera con sesión
-- puede leerlas, nadie puede modificarlas desde la app.
create policy agencias_select on public.shalom_agencies
  for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['customers', 'orders', 'shipments', 'export_batches'] loop
    execute format($f$
      create policy %1$s_select on public.%1$s
        for select using (public.is_store_member(store_id));
      create policy %1$s_insert on public.%1$s
        for insert with check (public.is_store_member(store_id));
      create policy %1$s_update on public.%1$s
        for update using (public.is_store_member(store_id))
        with check (public.is_store_member(store_id));
      create policy %1$s_delete on public.%1$s
        for delete using (public.is_store_owner(store_id));
    $f$, t);
  end loop;
end $$;

-- order_items no tiene store_id: hereda el permiso de su pedido.
create policy order_items_select on public.order_items
  for select using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and public.is_store_member(o.store_id)
  ));

create policy order_items_insert on public.order_items
  for insert with check (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and public.is_store_member(o.store_id)
  ));

create policy order_items_delete on public.order_items
  for delete using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and public.is_store_member(o.store_id)
  ));

-- ───────────────────────────────────────────────────────────────────────
-- Misma comprobación que en la migración de RLS: ninguna tabla nueva
-- puede quedarse sin protección.
-- ───────────────────────────────────────────────────────────────────────
do $$
declare v_missing text;
begin
  select string_agg(tablename, ', ') into v_missing
  from pg_tables where schemaname = 'public' and rowsecurity = false;

  if v_missing is not null then
    raise exception 'Tablas sin RLS activado: %', v_missing;
  end if;
end $$;
