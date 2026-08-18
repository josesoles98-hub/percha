-- ═══════════════════════════════════════════════════════════════════════
-- 0010 · El mensaje que se comparte vuelve a llevar la marca
-- ═══════════════════════════════════════════════════════════════════════
--
-- La migración 0008 dejó el mensaje en solo talla y precio. Usando la app
-- unos días, falta la marca para decidir sin abrir la ficha.
--
-- Igual que 0008: se actualiza el `default` para las tiendas nuevas y,
-- SOLO si la plantilla sigue siendo exactamente la de "talla y precio", se
-- pone al día la de las tiendas que ya existían. Si alguien la editó desde
-- Ajustes › Compartir, se respeta.

alter table public.stores
  alter column share_template set default E'Marca: {{marca}}\nTalla: {{talla}}\nPrecio: {{precio}}';

update public.stores
set    share_template = E'Marca: {{marca}}\nTalla: {{talla}}\nPrecio: {{precio}}',
       updated_at     = now()
where  share_template = E'Talla: {{talla}}\nPrecio: {{precio}}';
