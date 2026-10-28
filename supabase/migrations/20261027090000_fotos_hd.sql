-- ═══════════════════════════════════════════════════════════════════════
-- 0022 · Copia HD de cada foto de prenda
--
-- La foto "normal" (1280 px, ~200 KB) es la que usan la cuadrícula, la
-- cola y las fichas: tiene que ser liviana para que la app cargue rápido.
-- Pero esa misma foto era la que se mandaba a WhatsApp, y ahí se veía
-- achicada aunque el original fuera HD.
--
-- Ahora cada foto nueva guarda una SEGUNDA copia (hasta ~2048 px) en
-- '{store_id}/{item_id}/{position}-hd.jpg', que se usa solo al compartir.
-- Estas columnas dicen si esa copia existe y qué tamaño real tiene, para
-- poder verificar qué fotos están en HD y cuáles no. Todas son nulas en
-- las fotos que ya existían: nunca se guardó su original.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.item_photos
  add column hd_path   text,
  add column hd_width  integer,
  add column hd_height integer,
  add column hd_bytes  integer;
