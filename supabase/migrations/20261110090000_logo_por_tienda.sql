-- ═══════════════════════════════════════════════════════════════════════
-- Logo por tienda
--
-- Hasta hoy el logo era un archivo fijo de la app (public/logo-tienda.jpg),
-- así que los clientes de CUALQUIER tienda habrían visto el de American
-- Vintage Club en el formulario de registro y en el rótulo del paquete.
--
-- Ahora cada tienda guarda el suyo en un bucket público (un logo no es un
-- dato sensible: lo ve cualquiera que abra el link del cliente).
--
--   · logo_path        → logo para los formularios del cliente.
--   · logo_dark        → true si el logo es letras claras sobre fondo negro
--                        (así el formulario le pone fondo negro alrededor).
--   · rotulo_logo_path → variante para imprimir (letras oscuras sobre
--                        blanco). Si no hay, el rótulo usa logo_path.
--
-- Cambio aditivo: no toca ninguna columna existente.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.stores
  add column if not exists logo_path        text,
  add column if not exists logo_dark        boolean not null default false,
  add column if not exists rotulo_logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-logos', 'store-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leer no necesita política (el bucket es público). Escribir: solo el
-- dueño de la tienda, y solo dentro de la carpeta de su tienda.
create policy "logos: subir el de mi tienda"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'store-logos'
    and public.is_store_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "logos: reemplazar el de mi tienda"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'store-logos'
    and public.is_store_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "logos: borrar el de mi tienda"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'store-logos'
    and public.is_store_owner(((storage.foldername(name))[1])::uuid)
  );
