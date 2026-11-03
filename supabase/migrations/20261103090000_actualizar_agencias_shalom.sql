-- ═══════════════════════════════════════════════════════════════════════
-- Actualiza el catálogo de agencias de Shalom con la plantilla del 03/11/2026
-- (Formato-Pro-Masivo-2026_11_03_10.xlsx, 513 agencias).
--
-- · Shalom renombró agencias conservando su ID: se actualiza el nombre.
-- · Las agencias que se agregaron a mano con ID provisional (9001–9017) ya
--   tienen ID oficial: sus pedidos, clientes y tiendas se pasan al oficial y
--   el provisional se borra.
-- · Las agencias nuevas entran como destino.
-- ═══════════════════════════════════════════════════════════════════════

-- 0. Libera los nombres de los provisionales para no chocar con el UNIQUE.
update public.shalom_agencies set name = name || ' [provisional]' where id between 9001 and 9017;

-- 1. Nombres que Shalom cambió (mismo ID).
update public.shalom_agencies set name = 'ABANCAY CO' where id = 15;
update public.shalom_agencies set name = 'AV MARISCAL CASTILLA  PARQ INDUSTRIAL' where id = 24;
update public.shalom_agencies set name = 'AV PARRA 379' where id = 7;
update public.shalom_agencies set name = 'AV. 27 DE NOVIEMBRE CO' where id = 125;
update public.shalom_agencies set name = 'BARRIO STA ANA CO' where id = 257;
update public.shalom_agencies set name = 'CALLE TACNA' where id = 184;
update public.shalom_agencies set name = 'CHILCA CO LEONCIO PRADO' where id = 689;
update public.shalom_agencies set name = 'CONGATA' where id = 393;
update public.shalom_agencies set name = 'IQUITOS CO JR. BOLOGNESI' where id = 460;
update public.shalom_agencies set name = 'IQUITOS JR PABLO ROSSEL' where id = 52;
update public.shalom_agencies set name = 'JAEN CO' where id = 28;
update public.shalom_agencies set name = 'JR MAYRO' where id = 27;
update public.shalom_agencies set name = 'MOYOBAMBA  CO' where id = 14;
update public.shalom_agencies set name = 'SICUANI AV CONFEDERACION CO' where id = 34;
update public.shalom_agencies set name = 'SMP AV BERTELLO' where id = 107;
update public.shalom_agencies set name = 'TAMBOPATA AV UCAYALI  CO' where id = 280;
update public.shalom_agencies set name = 'URB UNIVERSAL' where id = 653;

-- 2. Agencias nuevas.
insert into public.shalom_agencies (id, name, is_origin, is_destiny) values
  (309, 'AV LARCO', true, true),
  (694, 'AV LOS PRECURSORES / LAS AMERICAS', true, true),
  (722, 'AV REVOLUCIÓN', true, true),
  (706, 'AV UNIVERSITARIA CON IZAGUIRRE', true, true),
  (715, 'AV. 12 DE NOVIEMBRE', true, true),
  (718, 'BARRIO YANANACO', true, true),
  (691, 'CHURÍN', true, true),
  (716, 'EL RETAMAL', true, true),
  (732, 'HUARAZ INDEPENDENCIA', true, true),
  (717, 'LA TABLADA ZONA NUEVA', true, true),
  (540, 'OUTLET ARAUCO FAUCETT', false, true),
  (703, 'PICHARI', true, true),
  (721, 'SAPALLANGA', true, true),
  (701, 'SEGUNDA DE PRO', true, true),
  (708, 'SMP AV PACASMAYO', true, true),
  (671, 'VARIANTE UCHUMAYO CO', true, true);

-- 3. Pedidos, clientes y tiendas pasan del ID provisional al oficial.
create temp table _mapa_agencias (viejo integer primary key, nuevo integer not null) on commit drop;
insert into _mapa_agencias (viejo, nuevo) values
  (9001, 694),
  (9002, 7),
  (9003, 706),
  (9004, 184),
  (9005, 691),
  (9006, 393),
  (9007, 125),
  (9008, 460),
  (9009, 52),
  (9010, 28),
  (9011, 14),
  (9012, 703),
  (9013, 701),
  (9014, 107),
  (9015, 708),
  (9016, 653),
  (9017, 671);

update public.shipments s set origin_agency_id  = m.nuevo from _mapa_agencias m where s.origin_agency_id  = m.viejo;
update public.shipments s set destiny_agency_id = m.nuevo from _mapa_agencias m where s.destiny_agency_id = m.viejo;
update public.customers c set default_agency_id = m.nuevo from _mapa_agencias m where c.default_agency_id = m.viejo;
update public.stores    t set shalom_origin_agency_id = m.nuevo from _mapa_agencias m where t.shalom_origin_agency_id = m.viejo;

-- 4. Ya nadie usa los provisionales.
delete from public.shalom_agencies where id between 9001 and 9017;

-- 5. Los destinos oficiales que antes se habían agregado a mano deben poder elegirse.
update public.shalom_agencies set is_destiny = true where id in (694, 7, 706, 184, 691, 393, 125, 460, 52, 28, 14, 703, 701, 107, 708, 653, 671);

-- 6. CERCADO MOLLENDO no está en la plantilla de Shalom (ni en la anterior): Shalom lo
--    rechazaría. Se oculta en lugar de borrarlo.
update public.shalom_agencies set is_origin = false, is_destiny = false where id = 294;
