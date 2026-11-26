-- ═══════════════════════════════════════════════════════════════════════
-- Resumen de la mañana
--
-- Todos los días a las 8:00 de Lima (13:00 UTC; Perú no cambia de hora)
-- la función `resumen-diario` arma un resumen de cada tienda —ventas de
-- ayer, reservas que vencen, chats por aprobar— y lo deja en Alertas con
-- una notificación push.
--
-- Se activa por tienda en Ajustes del agente. Por defecto está prendido:
-- quien ya configuró el agente lo quiere.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.agent_settings
  add column if not exists daily_summary boolean not null default true;

do $$
begin
  perform cron.unschedule('resumen-diario')
  where exists (select 1 from cron.job where jobname = 'resumen-diario');

  perform cron.schedule(
    'resumen-diario',
    '0 13 * * *',
    $cron$
      select net.http_post(
        url     := 'https://kygwgushdpishqrceygu.supabase.co/functions/v1/resumen-diario',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := '{}'::jsonb
      )
    $cron$
  );
exception when others then
  raise notice 'pg_cron/pg_net no disponible (%). El resumen no se enviará solo.', sqlerrm;
end $$;
