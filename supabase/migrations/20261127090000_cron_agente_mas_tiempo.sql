-- ═══════════════════════════════════════════════════════════════════════
-- Más tiempo para las funciones del agente
--
-- net.http_post espera 5 s por defecto. El agente tarda más (lee HighLevel,
-- le pregunta a Claude, compara fotos) y, cuando pg_net corta la conexión a
-- los 5 s, Supabase apaga la función a medio trabajo ("EarlyDrop"): nunca
-- llegaba a guardar un borrador. Se reprograman los tres trabajos con 140 s
-- (el tope de una Función Edge es 150 s).
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  trabajo record;
begin
  for trabajo in
    select * from (values
      ('agente-whatsapp',  '* * * * *',  'agente-whatsapp'),
      ('resumen-diario',   '0 13 * * *', 'resumen-diario'),
      ('promo-acumulados', '0 15 * * *', 'promo-acumulados')
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
  raise notice 'No se pudo reprogramar el agente (%).', sqlerrm;
end $$;
