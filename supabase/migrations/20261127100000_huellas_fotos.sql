-- ═══════════════════════════════════════════════════════════════════════
-- Huella de cada foto de prenda
--
-- Los clientes reenvían la foto que publicaste en el grupo, sin marca,
-- talla ni precio. Para reconocer la prenda, cada foto de Percha guarda
-- una "huella" (resumen de la imagen, ver functions/_shared/huella.ts) y
-- el agente busca la más parecida. 'x' = la foto no se pudo leer.
-- La función huellas-fotos completa las que faltan cada 2 minutos.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.item_photos add column if not exists huella text;

create index if not exists item_photos_sin_huella_idx
  on public.item_photos (created_at desc)
  where huella is null;

do $$
begin
  perform cron.unschedule('huellas-fotos')
  where exists (select 1 from cron.job where jobname = 'huellas-fotos');

  perform cron.schedule(
    'huellas-fotos',
    '*/2 * * * *',
    $cron$
      select net.http_post(
        url     := 'https://kygwgushdpishqrceygu.supabase.co/functions/v1/huellas-fotos',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 140000
      )
    $cron$
  );
exception when others then
  raise notice 'No se pudo programar huellas-fotos (%).', sqlerrm;
end $$;
