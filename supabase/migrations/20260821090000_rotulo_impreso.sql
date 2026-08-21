-- ═══════════════════════════════════════════════════════════════════════
-- 0014 · Marcar cuándo se imprimió el rótulo de un envío
--
-- Al imprimir en tira, si llega un registro nuevo después, hace falta
-- distinguir cuáles ya se imprimieron de los que faltan sin tener que
-- recordarlo de memoria.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.shipments
  add column label_printed_at timestamptz;
