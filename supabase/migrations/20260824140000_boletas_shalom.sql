-- ═══════════════════════════════════════════════════════════════════════
-- 0016 · Guardar la boleta/guía de Shalom (PDF) de cada envío
--
-- Algunos clientes desconfían de un código escrito a mano; con el PDF
-- real de Shalom (que ya se sube para leer el DNI y el código) alcanza
-- con compartirlo tal cual. Ruta: {store_id}/{shipment_id}.pdf
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boletas-shalom', 'boletas-shalom', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "boletas: leer las de mi tienda"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'boletas-shalom'
    and (storage.foldername(name))[1]::uuid in (select public.my_store_ids())
  );

create policy "boletas: subir a mi tienda"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'boletas-shalom'
    and (storage.foldername(name))[1]::uuid in (select public.my_store_ids())
  );
