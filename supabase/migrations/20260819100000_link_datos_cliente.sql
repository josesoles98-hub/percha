-- ═══════════════════════════════════════════════════════════════════════
-- 0013 · Link para que el cliente complete sus propios datos de envío
--
-- Hoy ella tiene que teclear documento, teléfono y agencia de destino de
-- cada cliente. La idea: puede crear el pedido sin esos datos y mandarle
-- al cliente un link (con el propio id del pedido, que ya es un UUID
-- random — no hace falta un token aparte) donde los completa él mismo,
-- con una foto de referencia opcional para que ella reconozca el pedido
-- al empacar. Los completa una Función Edge con la service role key,
-- porque el cliente nunca tiene sesión ni pertenece a la tienda.
-- ═══════════════════════════════════════════════════════════════════════

-- La agencia de destino ya no es obligatoria al crear el pedido: puede
-- quedar pendiente hasta que el cliente la elija por el link. Mientras
-- tanto, `enviosValidos` (paquete @percha/core) ya la excluye del archivo
-- de Shalom hasta que se complete — no hace falta ningún cambio ahí.
alter table public.shipments
  alter column destiny_agency_id drop not null;

alter table public.orders
  add column customer_data_submitted_at timestamptz;

-- ───────────────────────────────────────────────────────────────────────
-- Foto de referencia que sube el cliente, para reconocer el pedido al
-- empacar. Ruta: {store_id}/{order_id}.jpg
-- ───────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-photos',
  'order-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Solo lectura para la tienda dueña: la escribe la Función Edge con la
-- service role key, que salta RLS. Un cliente sin sesión no tiene forma
-- de escribir acá directamente, ni falta que hace.
create policy "fotos de pedido: leer las de mi tienda"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'order-photos'
    and (storage.foldername(name))[1]::uuid in (select public.my_store_ids())
  );
