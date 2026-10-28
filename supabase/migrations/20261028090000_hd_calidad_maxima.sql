-- ═══════════════════════════════════════════════════════════════════════
-- 0023 · Tamaño de la copia HD de las fotos, elegible por la tienda
--
-- La copia HD (migración 0022) salía siempre a 2048 px. Esta columna deja
-- elegir 4000 px ("máxima", cerca del tope de 4096 px que usa WhatsApp en
-- HD) para probar si así WhatsApp la trata mejor. Pesa varias veces más
-- (2-4 MB por foto contra ~0.5 MB), así que el valor por defecto sigue
-- siendo 2048 y solo cambia cuando la dueña lo pide.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.stores
  add column hd_max_side integer not null default 2048
    check (hd_max_side in (2048, 4000));
