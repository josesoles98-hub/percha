-- ═══════════════════════════════════════════════════════════════════════
-- 0019 · Invitar a alguien al equipo, sin que cree su propia tienda
--
-- Hoy, un usuario que se registra por primera vez cae en /bienvenida y
-- crea SU PROPIA tienda (bootstrap_store) — no hay forma de "unirse" a la
-- de otra persona. Para agregar un colaborador había que insertarlo a
-- mano en store_members por SQL. Con esto la dueña invita por correo
-- desde Ajustes, y cuando esa persona entra por primera vez con ESE
-- correo, se une sola a la tienda de la dueña en vez de crear una nueva.
-- ═══════════════════════════════════════════════════════════════════════

create table public.store_invites (
  id           uuid primary key default extensions.uuid_generate_v4(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  email        text not null check (position('@' in email) > 1),
  role         public.member_role not null default 'seller',
  invited_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

-- Una invitación pendiente por correo y tienda: invitar dos veces al mismo
-- correo antes de que acepte no debe duplicar filas.
create unique index store_invites_pendiente_idx
  on public.store_invites (store_id, lower(email))
  where accepted_at is null;

alter table public.store_invites enable row level security;

-- Solo la dueña gestiona invitaciones — igual que store_members.
create policy store_invites_select on public.store_invites
  for select using (public.is_store_owner(store_id));

create policy store_invites_insert on public.store_invites
  for insert with check (public.is_store_owner(store_id));

create policy store_invites_delete on public.store_invites
  for delete using (public.is_store_owner(store_id));

-- No hay policy de UPDATE: `accepted_at` lo marca únicamente
-- aceptar_invitacion(), que es SECURITY DEFINER.

-- ───────────────────────────────────────────────────────────────────────
-- Aceptar la invitación pendiente del usuario que llama, si hay una.
--
-- SECURITY DEFINER a propósito: necesita leer auth.users (el correo) y
-- escribir en store_members, dos cosas que el usuario recién registrado
-- no puede hacer todavía por sus propias políticas.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.aceptar_invitacion()
returns uuid  -- id de la tienda a la que se unió; null si no había invitación
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_invite public.store_invites%rowtype;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return null;
  end if;

  select * into v_invite
    from public.store_invites
   where lower(email) = lower(v_email)
     and accepted_at is null
   order by created_at desc
   limit 1;

  if v_invite.id is null then
    return null;
  end if;

  insert into public.store_members (store_id, user_id, role, invited_by)
  values (v_invite.store_id, auth.uid(), v_invite.role, v_invite.invited_by)
  on conflict (store_id, user_id) do nothing;

  update public.store_invites set accepted_at = now() where id = v_invite.id;

  return v_invite.store_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- Comprobación: ninguna tabla de public debe quedar sin RLS.
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
