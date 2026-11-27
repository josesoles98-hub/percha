-- ═══════════════════════════════════════════════════════════════════════
-- Miniaturas de las fotos de prendas
--
-- Cada foto pesa ~250 KB: el buscador del agente mostraba 60 de golpe
-- (~15 MB) y en el celular tardaba muchísimo. huellas-fotos ya baja una
-- versión de 256 px para sacar la huella; ahora además la guarda en
-- item-photos, junto a la original (1.jpg → 1.mini.jpg, ~15 KB) y anota la ruta en mini_path.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.item_photos add column if not exists mini_path text;

create index if not exists item_photos_sin_mini_idx
  on public.item_photos (created_at desc)
  where mini_path is null;

-- El buscador devuelve la miniatura de la primera foto (o la foto entera
-- si todavía no tiene miniatura).
drop function if exists public.buscar_prendas(uuid, text, text, text);
create function public.buscar_prendas(
  p_store_id uuid,
  p_texto    text default '',
  p_tipo     text default null,
  p_estado   text default 'available'
)
returns table (
  id               uuid,
  code             text,
  brand_name       text,
  size_label       text,
  price_cents      int,
  effective_status text,
  ai_tipo          text,
  ai_desc          text,
  foto             text,
  created_at       timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with palabras as (
    select translate(lower(w), 'áéíóúüñ', 'aeiouun') as w
    from unnest(string_to_array(coalesce(trim(p_texto), ''), ' ')) as w
    where w <> ''
  )
  select v.id, v.code, v.brand_name, v.size_label, v.price_cents, v.effective_status::text,
         i.ai_tipo, i.ai_desc,
         (select coalesce(f.mini_path, f.storage_path)
            from public.item_photos f
           where f.item_id = v.id and f.status = 'ready'
           order by f.position
           limit 1) as foto,
         v.created_at
  from public.items_view v
  join public.items i on i.id = v.id
  where v.store_id = p_store_id
    and v.effective_status <> 'hidden'
    and (p_estado is null or v.effective_status::text = p_estado)
    and (p_tipo is null or i.ai_tipo = p_tipo)
    and not exists (
      select 1 from palabras p
      where position(p.w in translate(lower(concat_ws(' ', v.code, v.brand_name, v.size_label, i.ai_tipo, i.ai_desc)),
                                      'áéíóúüñ', 'aeiouun')) = 0
    )
  order by v.created_at desc
  limit 60;
$$;

grant execute on function public.buscar_prendas(uuid, text, text, text) to authenticated;
