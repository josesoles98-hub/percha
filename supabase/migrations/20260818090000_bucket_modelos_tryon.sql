-- ═══════════════════════════════════════════════════════════════════════
-- 0012 · Bucket de fotos de modelos para el try-on automático
--
-- Guarda las fotos base (sin cara, ya procesadas) que usa la Función Edge
-- generar-tryon para componer la tercera foto de una prenda. Organizadas
-- por carpeta: tryon-models/dama/... y tryon-models/varon/...
--
-- Privado: no hace falta que nadie fuera de la tienda las vea sueltas, y
-- la Función Edge las lee con su propia clave de administración, que no
-- pasa por RLS.
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tryon-models',
  'tryon-models',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cualquier dueña de tienda puede subir/ver/borrar: no es información
-- sensible de ninguna tienda en particular, es una librería compartida
-- que arma la propia usuaria.
create policy "modelos: leer"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'tryon-models');

create policy "modelos: subir"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'tryon-models');

create policy "modelos: borrar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'tryon-models');
