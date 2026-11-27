-- ═══════════════════════════════════════════════════════════════════════
-- Buscador de prendas + agente más rápido
--
-- 1. Etiquetas de IA: casi ninguna prenda tiene categoría, color ni nombre,
--    así que buscar "shorts" no encontraba nada. La función
--    etiquetar-prendas mira la foto de cada prenda una sola vez y guarda
--    el tipo y una descripción con palabras para buscarla. No toca la
--    categoría ni ningún dato que cargaste tú.
-- 2. buscar_prendas(): el buscador de la bandeja del agente.
-- 3. El agente revisa WhatsApp cada 15 s (antes cada minuto), con un
--    candado para que dos vueltas no trabajen el mismo chat a la vez.
-- 4. La bandeja se entera al instante de cada borrador nuevo (Realtime).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.items
  add column if not exists ai_tipo text,
  add column if not exists ai_desc text,
  add column if not exists ai_tagged_at timestamptz;

create index if not exists items_sin_etiqueta_idx
  on public.items (created_at desc)
  where ai_tagged_at is null;

alter table public.agent_settings
  add column if not exists running_until timestamptz;

-- ── Buscador ────────────────────────────────────────────────────────────
-- Cada palabra escrita tiene que aparecer en el código, marca, talla, tipo
-- o descripción (sin importar tildes ni mayúsculas). RLS de items aplica:
-- cada quien solo ve las prendas de su tienda.
create or replace function public.buscar_prendas(
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
  photos           jsonb,
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
         i.ai_tipo, i.ai_desc, v.photos, v.created_at
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

-- ── Realtime de borradores ──────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_drafts'
  ) then
    alter publication supabase_realtime add table public.agent_drafts;
  end if;
exception when others then
  raise notice 'No se pudo activar Realtime en agent_drafts (%).', sqlerrm;
end $$;

-- ── Cron ────────────────────────────────────────────────────────────────
do $$
declare
  trabajo record;
begin
  for trabajo in
    select * from (values
      ('agente-whatsapp',   '15 seconds',  'agente-whatsapp'),
      ('etiquetar-prendas', '*/2 * * * *', 'etiquetar-prendas')
    ) as t(nombre, horario, funcion)
  loop
    perform cron.unschedule(trabajo.nombre)
    where exists (select 1 from cron.job where jobname = trabajo.nombre);

    perform cron.schedule(
      trabajo.nombre,
      trabajo.horario,
      format($cron$
        select net.http_post(
          url     := 'https://kygwgushdpishqrceygu.supabase.co/functions/v1/%s',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 140000
        )
      $cron$, trabajo.funcion)
    );
  end loop;
exception when others then
  raise notice 'No se pudo reprogramar (%).', sqlerrm;
end $$;
