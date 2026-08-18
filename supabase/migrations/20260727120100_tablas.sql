-- ═══════════════════════════════════════════════════════════════════════
-- 0002 · Tablas del dominio
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- TIENDAS
-- Toda la configuración vive aquí: es lo que hace configurable los días
-- de reserva, la moneda y la plantilla de compartir sin tocar código.
-- ───────────────────────────────────────────────────────────────────────
create table public.stores (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  name                text not null check (length(trim(name)) > 0),

  -- Localización
  currency            text not null default 'PEN',
  currency_symbol     text not null default 'S/',
  locale              text not null default 'es-PE',
  timezone            text not null default 'America/Lima',

  -- Reservas: configurable desde Ajustes, 5 días por defecto
  reserve_days        integer not null default 5
                      check (reserve_days between 1 and 60),

  -- Código único de prenda: prefijo + correlativo (PR-000001)
  code_prefix         text not null default 'PR'
                      check (code_prefix ~ '^[A-Z]{1,4}$'),
  code_seq            bigint not null default 0,

  -- Plantilla del mensaje de WhatsApp. Las variables {{...}} se sustituyen
  -- en packages/core/share. Las líneas cuya única variable esté vacía se
  -- eliminan, para no enviar nunca "Marca: " a un grupo.
  share_template      text not null default
    -- Solo talla y precio: es lo que el cliente necesita para decidir, y
    -- va debajo de las fotos en WhatsApp. Se puede ampliar desde
    -- Ajustes › Compartir sin tocar código.
    E'Talla: {{talla}}\nPrecio: {{precio}}',
  share_deposit_cents integer not null default 1000
                      check (share_deposit_cents >= 0),

  -- Si el rol 'seller' puede ver el valor total del inventario
  sellers_see_totals  boolean not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.stores.code_seq is
  'Correlativo interno de códigos. Lo incrementa el trigger gen_item_code().';

-- ───────────────────────────────────────────────────────────────────────
-- PERFILES · extiende auth.users
-- ───────────────────────────────────────────────────────────────────────
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────
-- MIEMBROS · qué usuario pertenece a qué tienda y con qué rol
-- Es la tabla sobre la que se apoya TODA la seguridad del sistema.
-- ───────────────────────────────────────────────────────────────────────
create table public.store_members (
  store_id   uuid not null references public.stores(id)   on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.member_role not null default 'seller',
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index store_members_user_idx on public.store_members (user_id);

-- ───────────────────────────────────────────────────────────────────────
-- CATÁLOGOS · por tienda, editables desde Ajustes
-- Son tablas y no texto libre para que "Nike", "nike" y "NIKE" no acaben
-- siendo tres marcas distintas, y para que los filtros sean fiables.
-- ───────────────────────────────────────────────────────────────────────
create table public.categories (
  id       uuid primary key default extensions.uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name     text not null check (length(trim(name)) > 0),
  emoji    text,
  position integer not null default 0,
  archived boolean not null default false
);
create unique index categories_unique_name
  on public.categories (store_id, lower(name));
create index categories_store_idx on public.categories (store_id, position);

create table public.brands (
  id        uuid primary key default extensions.uuid_generate_v4(),
  store_id  uuid not null references public.stores(id) on delete cascade,
  name      text not null check (length(trim(name)) > 0),
  -- Ordena las marcas más usadas primero en el formulario de alta rápida
  use_count integer not null default 0,
  archived  boolean not null default false
);
create unique index brands_unique_name on public.brands (store_id, lower(name));
create index brands_frequent_idx on public.brands (store_id, use_count desc);

create table public.sizes (
  id         uuid primary key default extensions.uuid_generate_v4(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  label      text not null check (length(trim(label)) > 0),
  -- 'ropa' (XS-XXL) · 'pantalon' (28-40) · 'calzado' (35-45)
  group_name text not null default 'ropa',
  position   integer not null default 0,
  archived   boolean not null default false
);
create unique index sizes_unique_label
  on public.sizes (store_id, group_name, lower(label));
create index sizes_store_idx on public.sizes (store_id, group_name, position);

create table public.colors (
  id       uuid primary key default extensions.uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name     text not null check (length(trim(name)) > 0),
  hex      text check (hex ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0
);
create unique index colors_unique_name on public.colors (store_id, lower(name));

-- ───────────────────────────────────────────────────────────────────────
-- PRENDAS
-- ───────────────────────────────────────────────────────────────────────
create table public.items (
  id          uuid primary key default extensions.uuid_generate_v4(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  code        text not null,                       -- 'PR-000128', lo pone el trigger

  name        text,
  brand_id    uuid references public.brands(id)     on delete set null,
  size_id     uuid references public.sizes(id)      on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  color_id    uuid references public.colors(id)     on delete set null,
  description text,

  -- El dinero SIEMPRE en centavos enteros. Nunca float: 19.99 en coma
  -- flotante es 19.989999..., y eso en dinero es inaceptable.
  price_cents integer not null check (price_cents >= 0),
  cost_cents  integer check (cost_cents >= 0),      -- oculto en la UI hasta Fase 8

  status      public.item_status not null default 'available',

  -- ── Reserva ──────────────────────────────────────────────────────────
  reserved_at           timestamptz,
  -- Congela los días configurados al momento de reservar. Si mañana cambias
  -- el ajuste de 5 a 7 días, esta reserva sigue venciendo a los 5: cambiar
  -- una preferencia no debe alterar un compromiso ya adquirido con un cliente.
  reserve_days_snapshot integer check (reserve_days_snapshot > 0),
  reserved_for_name     text,
  reserved_for_phone    text,
  -- Columna generada: imposible de desincronizar porque no se escribe a mano.
  --
  -- La suma va en UTC a propósito. `timestamptz + interval` NO es inmutable
  -- —el resultado depende del huso horario de la sesión al cruzar un cambio
  -- de hora—, y PostgreSQL no admite expresiones no inmutables en columnas
  -- generadas. Pasando a timestamp sin zona, sumando y volviendo, la
  -- operación sí lo es. Además es lo que queremos: una reserva de 5 días
  -- son 5 × 24 h exactas, no «el mismo día de la semana que viene».
  reserve_expires_at    timestamptz generated always as (
    case
      when reserved_at is not null and reserve_days_snapshot is not null
      then ((reserved_at at time zone 'UTC') + make_interval(days => reserve_days_snapshot))
             at time zone 'UTC'
    end
  ) stored,

  -- ── Venta ────────────────────────────────────────────────────────────
  sold_at          timestamptz,
  sold_price_cents integer check (sold_price_cents >= 0),

  -- ── Metadatos ────────────────────────────────────────────────────────
  share_count integer not null default 0,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Borrado lógico: "eliminar" manda a la papelera 30 días. Borrar por
  -- accidente una prenda con su historial no debe ser irreversible.
  deleted_at  timestamptz,

  -- ── Búsqueda de texto completo ───────────────────────────────────────
  search_vector tsvector generated always as (
    setweight(to_tsvector('public.es_unaccent', coalesce(code, '')), 'A') ||
    setweight(to_tsvector('public.es_unaccent', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('public.es_unaccent', coalesce(description, '')), 'C')
  ) stored,

  -- Coherencia: solo hay fecha de reserva si el estado es 'reserved'
  constraint reserve_fields_consistent
    check ((status = 'reserved') = (reserved_at is not null))
);

create unique index items_unique_code on public.items (store_id, code);
create index items_store_status_idx  on public.items (store_id, status)
  where deleted_at is null;
create index items_created_idx       on public.items (store_id, created_at desc)
  where deleted_at is null;
create index items_expires_idx       on public.items (reserve_expires_at)
  where status = 'reserved';
create index items_price_idx         on public.items (store_id, price_cents)
  where deleted_at is null;
create index items_search_idx        on public.items using gin (search_vector);
-- Índice trigram: tolera errores de tecleo en nombre y código
create index items_trgm_idx on public.items
  using gin ((coalesce(name, '') || ' ' || code) extensions.gin_trgm_ops);

-- ───────────────────────────────────────────────────────────────────────
-- FOTOS · de 1 a 3 por prenda
-- ───────────────────────────────────────────────────────────────────────
create table public.item_photos (
  id           uuid primary key default extensions.uuid_generate_v4(),
  item_id      uuid not null references public.items(id)  on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  storage_path text not null,                      -- '{store_id}/{item_id}/1.jpg'
  position     smallint not null check (position between 1 and 3),
  width        integer,
  height       integer,
  bytes        integer,
  blurhash     text,                               -- placeholder mientras carga
  status       public.photo_status not null default 'pending',
  created_at   timestamptz not null default now(),
  unique (item_id, position)
);
create index item_photos_item_idx on public.item_photos (item_id, position);

-- ───────────────────────────────────────────────────────────────────────
-- HISTORIAL DE CAMBIOS · lo escriben los triggers, nunca el cliente
-- ───────────────────────────────────────────────────────────────────────
create table public.item_events (
  id          bigserial primary key,
  item_id     uuid not null references public.items(id)  on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  actor_id    uuid references public.profiles(id),       -- null = el sistema
  type        public.event_type not null,
  from_status public.item_status,
  to_status   public.item_status,
  payload     jsonb not null default '{}'::jsonb,        -- {campo: [antes, después]}
  created_at  timestamptz not null default now()
);
create index item_events_item_idx on public.item_events (item_id, created_at desc);

-- ───────────────────────────────────────────────────────────────────────
-- NOTIFICACIONES · reservas vencidas y avisos
-- ───────────────────────────────────────────────────────────────────────
create table public.notifications (
  id         bigserial primary key,
  store_id   uuid not null references public.stores(id) on delete cascade,
  item_id    uuid references public.items(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx
  on public.notifications (store_id, read_at nulls first, created_at desc);
