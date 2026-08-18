-- ═══════════════════════════════════════════════════════════════════════
-- 0005 · Almacenamiento de fotos
--
-- Bucket PRIVADO. Las fotos del inventario no deben ser accesibles por
-- quien adivine una URL: se sirven con URLs firmadas de duración corta.
--
-- Ruta: {store_id}/{item_id}/{position}.jpg
-- Poner store_id como primera carpeta permite que la política lo verifique
-- directamente sin consultar otras tablas.
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-photos',
  'item-photos',
  false,
  10485760,  -- 10 MB: el cliente ya comprime a ~300 KB, esto es solo el tope
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La primera carpeta de la ruta debe ser una tienda a la que pertenezco.
create policy "fotos: leer las de mi tienda"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1]::uuid in (select public.my_store_ids())
  );

create policy "fotos: subir a mi tienda"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1]::uuid in (select public.my_store_ids())
  );

create policy "fotos: reemplazar las de mi tienda"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1]::uuid in (select public.my_store_ids())
  );

create policy "fotos: borrar las de mi tienda"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1]::uuid in (select public.my_store_ids())
  );
