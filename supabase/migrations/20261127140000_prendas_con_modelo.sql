-- Prendas con foto de modelo: un apartado en el inventario para encontrarlas rápido.
alter table public.items add column if not exists con_modelo boolean not null default false;

comment on column public.items.con_modelo is
  'La prenda tiene al menos una foto con modelo (persona usándola). Filtro «Con modelo» del inventario.';

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
  i.gender,
  i.customer_id,
  i.con_modelo

from public.items i
left join public.brands     b  on b.id  = i.brand_id
left join public.sizes      s  on s.id  = i.size_id
left join public.categories c  on c.id  = i.category_id
left join public.colors     co on co.id = i.color_id
where i.deleted_at is null;
