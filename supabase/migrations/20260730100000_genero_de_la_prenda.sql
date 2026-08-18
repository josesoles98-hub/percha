-- ═══════════════════════════════════════════════════════════════════════
-- 0010 · Género de la prenda
-- ═══════════════════════════════════════════════════════════════════════
--
-- Para varón, para dama, o unisex. Opcional: muchas prendas (una casaca
-- básica, unos jeans rectos) se venden igual para cualquiera, así que no
-- se obliga a elegir uno al cargar la prenda.

create type public.item_gender as enum ('varon', 'dama', 'unisex');

alter table public.items
  add column gender public.item_gender;

-- ───────────────────────────────────────────────────────────────────────
-- Vista de lectura: añade el género.
--
-- `create or replace view` solo admite AÑADIR columnas al final de la
-- lista (ver el comentario de la migración 0009): va después de
-- `reserved_deposit_cents`, no junto a las demás columnas de la prenda.
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

  i.reserved_deposit_cents,
  i.gender

from public.items i
left join public.brands     b  on b.id  = i.brand_id
left join public.sizes      s  on s.id  = i.size_id
left join public.categories c  on c.id  = i.category_id
left join public.colors     co on co.id = i.color_id
where i.deleted_at is null;

comment on view public.items_view is
  'Lectura de prendas con estado efectivo ya corregido. security_invoker = las RLS de items siguen aplicando al usuario que consulta.';
