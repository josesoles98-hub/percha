-- ═══════════════════════════════════════════════════════════════════════
-- 0009 · Cuánto adelantó el cliente al reservar
-- ═══════════════════════════════════════════════════════════════════════
--
-- Hasta ahora solo se guardaba PARA QUIÉN se reservaba una prenda. Esto
-- añade CUÁNTO adelantó esa persona en concreto — no el monto sugerido de
-- la tienda (`stores.share_deposit_cents`, igual para todos), sino lo que
-- de verdad se cobró en esta reserva. Con eso la ficha puede mostrar el
-- adelanto y lo que falta por cobrar cuando venga a recoger la prenda.

alter table public.items
  add column reserved_deposit_cents integer check (reserved_deposit_cents >= 0);

comment on column public.items.reserved_deposit_cents is
  'Lo que el cliente adelantó en ESTA reserva. Se limpia al salir de reserved, igual que reserved_for_name.';

-- ───────────────────────────────────────────────────────────────────────
-- Reescribe la función para limpiar también el adelanto al salir de
-- reserva. El resto es idéntico a la versión de la migración 0003.
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
    new.reserved_at            := null;
    new.reserve_days_snapshot  := null;
    new.reserved_for_name      := null;
    new.reserved_for_phone     := null;
    new.reserved_deposit_cents := null;
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

-- ───────────────────────────────────────────────────────────────────────
-- Vista de lectura: añade el adelanto.
--
-- `create or replace view` solo admite AÑADIR columnas al final de la
-- lista, nunca insertarlas en medio ni reordenar: por eso
-- `reserved_deposit_cents` va después de `photos` y no junto a las demás
-- columnas de reserva, aunque temáticamente encajaría ahí.
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
  ) as photos,

  i.reserved_deposit_cents

from public.items i
left join public.brands     b  on b.id  = i.brand_id
left join public.sizes      s  on s.id  = i.size_id
left join public.categories c  on c.id  = i.category_id
left join public.colors     co on co.id = i.color_id
where i.deleted_at is null;

comment on view public.items_view is
  'Lectura de prendas con estado efectivo ya corregido. security_invoker = las RLS de items siguen aplicando al usuario que consulta.';
