-- ═══════════════════════════════════════════════════════════════════════
-- 0021 · WhatsApp de la tienda para el flujo de registro público
--
-- El link público donde el cliente registra su pedido (y el de corregirlo)
-- necesita a dónde mandarlo cuando le pedimos que confirme por WhatsApp que
-- ya registró todo: muchos clientes no leen los mensajes que les manda la
-- dueña, así que en vez de eso se les da un botón para que ELLOS le
-- escriban a ella. Nullable porque una tienda puede no tenerlo configurado
-- todavía (el botón simplemente no aparece en ese caso).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.stores
  add column whatsapp_number text;
