-- ═══════════════════════════════════════════════════════════════════════
-- 0017 · Gastos de la tienda (ads y otros) para el Panel de Ganancias
--
-- La ganancia real no es solo "vendí menos lo que me costó la prenda": la
-- dueña también gasta en publicidad (Meta Ads) día a día. Sin este
-- registro, el panel solo mostraría ganancia bruta, no lo que de verdad
-- le queda en el bolsillo.
-- ═══════════════════════════════════════════════════════════════════════

create type public.expense_category as enum ('ads', 'otro');

create table public.expenses (
  id           uuid primary key default extensions.uuid_generate_v4(),
  store_id     uuid not null references public.stores(id) on delete cascade,

  -- Fecha del gasto, no de cuándo se registró: se puede cargar un día
  -- después y debe seguir contando para el día correcto en el panel.
  occurred_on  date not null default current_date,
  amount_cents integer not null check (amount_cents > 0),
  category     public.expense_category not null default 'ads',
  note         text,

  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index expenses_store_date_idx on public.expenses (store_id, occurred_on desc);

-- ───────────────────────────────────────────────────────────────────────
-- RLS · los gastos y el margen son información de la dueña, no del
-- vendedor — a diferencia del valor del inventario, que si el ajuste lo
-- permite (`stores.sellers_see_totals`) sí puede ver un vendedor.
-- ───────────────────────────────────────────────────────────────────────
alter table public.expenses enable row level security;

create policy expenses_select on public.expenses
  for select using (public.is_store_owner(store_id));

create policy expenses_insert on public.expenses
  for insert with check (public.is_store_owner(store_id));

create policy expenses_update on public.expenses
  for update using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy expenses_delete on public.expenses
  for delete using (public.is_store_owner(store_id));

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
