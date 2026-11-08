-- ═══════════════════════════════════════════════════════════════════════
-- Clave de recojo de Shalom
--
-- En el registro masivo, Shalom permite poner una "clave de seguridad" de
-- 4 dígitos a todos los envíos: el destinatario tiene que decirla para
-- recoger su paquete. Se guarda en la tienda (no por envío) porque se usa
-- la misma en cada lote, y así el mensaje de WhatsApp que se le manda al
-- cliente con su boleta la puede incluir sin tener que escribirla a mano.
-- Nullable: sin clave configurada, el mensaje simplemente no la menciona.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.stores
  add column pickup_key text
  check (pickup_key is null or pickup_key ~ '^[0-9]{4}$');
