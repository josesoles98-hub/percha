-- ═══════════════════════════════════════════════════════════════════════
-- 0001 · Extensiones, tipos y configuración de búsqueda
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm    with schema extensions;  -- búsqueda tolerante a errores
create extension if not exists unaccent   with schema extensions;  -- ignorar tildes

-- ───────────────────────────────────────────────────────────────────────
-- Búsqueda de texto completo en español, insensible a tildes.
-- 'adiddas' encontrará 'Adidas'; 'casaca' encontrará 'Casacas'.
-- ───────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_ts_config where cfgname = 'es_unaccent'
  ) then
    create text search configuration public.es_unaccent (copy = spanish);
    alter text search configuration public.es_unaccent
      alter mapping for hword, hword_part, word
      with extensions.unaccent, spanish_stem;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────
-- unaccent() es STABLE, no IMMUTABLE, así que PostgreSQL no la acepta en
-- columnas generadas ni en índices. Este envoltorio la marca IMMUTABLE,
-- lo cual es correcto aquí: el diccionario unaccent no cambia en tiempo
-- de ejecución. Sin esto, los índices de búsqueda no se pueden crear.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = extensions, public
as $$ select extensions.unaccent('extensions.unaccent', $1) $$;

-- ───────────────────────────────────────────────────────────────────────
-- Tipos del dominio
-- ───────────────────────────────────────────────────────────────────────

-- Los cuatro estados de una prenda (🟢 🟡 🔴 ⚫)
create type public.item_status as enum ('available', 'reserved', 'sold', 'hidden');

-- Roles dentro de una tienda
create type public.member_role as enum ('owner', 'seller');

-- Tipos de evento del historial de cambios
create type public.event_type as enum (
  'created',
  'updated',
  'status_changed',
  'reserved',
  'reservation_expired',
  'reservation_cancelled',
  'sold',
  'shared',
  'photo_added',
  'photo_removed',
  'duplicated',
  'deleted',
  'restored'
);

-- Estado de subida de una foto. Permite guardar la prenda aunque la foto
-- todavía se esté subiendo en segundo plano.
create type public.photo_status as enum ('pending', 'ready', 'failed');
