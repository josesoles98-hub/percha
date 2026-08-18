-- ═══════════════════════════════════════════════════════════════════════
-- 0004 · Row Level Security
--
-- REGLA DE ORO DEL PROYECTO: toda tabla nace con RLS activado y su política
-- escrita en la misma migración. Sin excepciones.
--
-- La clave `anon` que va al navegador es pública por diseño; lo único que
-- impide que alguien lea el inventario de otra tienda son estas políticas.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.stores        enable row level security;
alter table public.profiles      enable row level security;
alter table public.store_members enable row level security;
alter table public.categories    enable row level security;
alter table public.brands        enable row level security;
alter table public.sizes         enable row level security;
alter table public.colors        enable row level security;
alter table public.items         enable row level security;
alter table public.item_photos   enable row level security;
alter table public.item_events   enable row level security;
alter table public.notifications enable row level security;

-- ───────────────────────────────────────────────────────────────────────
-- Helpers
--
-- SECURITY DEFINER a propósito: estas funciones consultan store_members,
-- que a su vez tiene RLS. Sin definer, la política se llamaría a sí misma
-- y provocaría una recursión infinita.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.my_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.store_members where user_id = auth.uid();
$$;

create or replace function public.is_store_member(p_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store and user_id = auth.uid()
  );
$$;

create or replace function public.is_store_owner(p_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ───────────────────────────────────────────────────────────────────────
-- STORES · cualquier miembro lee; solo el dueño modifica los ajustes
-- ───────────────────────────────────────────────────────────────────────
create policy stores_select on public.stores
  for select using (public.is_store_member(id));

create policy stores_update on public.stores
  for update using (public.is_store_owner(id))
  with check (public.is_store_owner(id));

-- El INSERT solo se hace vía bootstrap_store(), que es security definer.
create policy stores_delete on public.stores
  for delete using (public.is_store_owner(id));

-- ───────────────────────────────────────────────────────────────────────
-- PROFILES · veo el mío y el de mis compañeros de tienda
-- ───────────────────────────────────────────────────────────────────────
create policy profiles_select_self on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.store_members m
      where m.user_id = profiles.id
        and m.store_id in (select public.my_store_ids())
    )
  );

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────
-- STORE_MEMBERS · veo el equipo de mis tiendas; solo el dueño lo gestiona
-- ───────────────────────────────────────────────────────────────────────
create policy members_select on public.store_members
  for select using (public.is_store_member(store_id));

create policy members_insert on public.store_members
  for insert with check (public.is_store_owner(store_id));

create policy members_update on public.store_members
  for update using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

-- El dueño puede eliminar a otros; cualquiera puede salirse de una tienda.
create policy members_delete on public.store_members
  for delete using (public.is_store_owner(store_id) or user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────
-- CATÁLOGOS · todo miembro lee y crea (para poder añadir una marca al
-- vuelo desde el alta rápida); solo el dueño archiva o borra.
-- ───────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['categories', 'brands', 'sizes', 'colors'] loop
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

-- ───────────────────────────────────────────────────────────────────────
-- ITEMS · todo miembro gestiona el inventario.
-- El borrado DEFINITIVO (vaciar papelera) queda reservado al dueño: enviar
-- a la papelera es un UPDATE de deleted_at, que sí puede hacer un vendedor.
-- ───────────────────────────────────────────────────────────────────────
create policy items_select on public.items
  for select using (public.is_store_member(store_id));

create policy items_insert on public.items
  for insert with check (public.is_store_member(store_id));

create policy items_update on public.items
  for update using (public.is_store_member(store_id))
  with check (public.is_store_member(store_id));

create policy items_delete on public.items
  for delete using (public.is_store_owner(store_id));

-- ───────────────────────────────────────────────────────────────────────
-- FOTOS
-- ───────────────────────────────────────────────────────────────────────
create policy photos_select on public.item_photos
  for select using (public.is_store_member(store_id));

create policy photos_insert on public.item_photos
  for insert with check (public.is_store_member(store_id));

create policy photos_update on public.item_photos
  for update using (public.is_store_member(store_id))
  with check (public.is_store_member(store_id));

create policy photos_delete on public.item_photos
  for delete using (public.is_store_member(store_id));

-- ───────────────────────────────────────────────────────────────────────
-- HISTORIAL · solo lectura desde el cliente.
-- No hay política de INSERT a propósito: lo escriben los triggers, que son
-- SECURITY DEFINER. Así el historial no se puede falsear desde la app.
-- ───────────────────────────────────────────────────────────────────────
create policy events_select on public.item_events
  for select using (public.is_store_member(store_id));

-- ───────────────────────────────────────────────────────────────────────
-- NOTIFICACIONES · leer y marcar como leídas
-- ───────────────────────────────────────────────────────────────────────
create policy notifications_select on public.notifications
  for select using (public.is_store_member(store_id));

create policy notifications_update on public.notifications
  for update using (public.is_store_member(store_id))
  with check (public.is_store_member(store_id));

-- ───────────────────────────────────────────────────────────────────────
-- Comprobación: ninguna tabla de public debe quedar sin RLS.
-- Si esta migración falla aquí, es que se añadió una tabla sin política.
-- ───────────────────────────────────────────────────────────────────────
do $$
declare v_missing text;
begin
  select string_agg(tablename, ', ')
    into v_missing
  from pg_tables
  where schemaname = 'public'
    and rowsecurity = false;

  if v_missing is not null then
    raise exception 'Tablas sin RLS activado: %', v_missing;
  end if;
end $$;
