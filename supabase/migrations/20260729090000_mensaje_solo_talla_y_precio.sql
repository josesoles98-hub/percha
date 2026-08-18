-- ═══════════════════════════════════════════════════════════════════════
-- 0008 · El mensaje que se comparte lleva solo talla y precio
-- ═══════════════════════════════════════════════════════════════════════
--
-- El valor por defecto de `stores.share_template` ya se cambió en la
-- migración 0002, pero un `default` solo se aplica a las filas nuevas: las
-- tiendas creadas antes se quedaron con la plantilla larga.
--
-- Esta migración las pone al día, y lo hace SOLO si la plantilla sigue
-- siendo exactamente la antigua por defecto. Si alguien la editó desde
-- Ajustes › Compartir, se respeta: una actualización de la app no debe
-- deshacer una decisión del usuario.

update public.stores
set    share_template = E'Talla: {{talla}}\nPrecio: {{precio}}',
       updated_at     = now()
where  share_template = E'🔥 NUEVO INGRESO 🔥\n\nMarca: {{marca}}\nTalla: {{talla}}\nEstado: {{estado}}\nPrecio: {{precio}}\n\nSolo una unidad.\nReserva desde {{adelanto}}.\nEscríbeme por interno.';
