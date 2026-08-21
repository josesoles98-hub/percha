-- ═══════════════════════════════════════════════════════════════════════
-- 0015 · Marca independiente de "empacado" en el pedido
--
-- No reusa el status del pedido (confirmed/packed/...) a propósito: la
-- mayoría de los pedidos de la usuaria quedan en 'draft' (los que
-- registran los clientes solos, muchos sin prendas del catálogo
-- asociadas todavía) y pasar por status='packed' saltaría la
-- confirmación real —la que marca la prenda como vendida— dejando el
-- inventario descuadrado. Esta marca es solo un tache visual, sin efectos
-- secundarios en items ni en customers.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.orders
  add column packed_at timestamptz;
