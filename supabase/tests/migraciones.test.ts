import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PLANTILLA_RECOMENDADA } from '@percha/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { levantarBanco, migracionesEnOrden, type BancoDePruebas } from './entorno';

const PLANTILLA_VIEJA =
  '🔥 NUEVO INGRESO 🔥\n\nMarca: {{marca}}\nTalla: {{talla}}\nEstado: {{estado}}\nPrecio: {{precio}}\n\nSolo una unidad.\nReserva desde {{adelanto}}.\nEscríbeme por interno.';

// Lo que dejó la migración 0008: es historia, así que va fijo aquí en vez
// de compararlo contra PLANTILLA_RECOMENDADA (que ya cambió desde entonces).
const PLANTILLA_SOLO_TALLA_Y_PRECIO = 'Talla: {{talla}}\nPrecio: {{precio}}';

// Lo que dejó la migración 0008: es historia, así que va fijo aquí en vez
// de compararlo contra PLANTILLA_RECOMENDADA (que ya cambió desde entonces).
const PLANTILLA_SOLO_TALLA_Y_PRECIO = 'Talla: {{talla}}\nPrecio: {{precio}}';

/**
 * Que las migraciones se ejecuten.
 *
 * Parece poco, pero es lo que separa «el SQL parece correcto» de «el SQL
 * corre». Antes de esto, un punto y coma de más se habría descubierto al
 * hacer db:push contra la base de producción.
 */
describe('las migraciones se aplican sobre PostgreSQL', () => {
  let banco: BancoDePruebas;

  beforeAll(async () => {
    banco = await levantarBanco();
  });

  afterAll(async () => {
    await banco?.cerrar();
  });

  it('se aplican todas, en orden', () => {
    expect(migracionesEnOrden().length).toBeGreaterThanOrEqual(7);
  });

  it('crea las tablas del dominio', async () => {
    const { rows } = await banco.db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    const tablas = rows.map((r) => r.tablename);

    expect(tablas).toEqual(
      expect.arrayContaining([
        'brands',
        'categories',
        'colors',
        'customers',
        'export_batches',
        'item_events',
        'item_photos',
        'items',
        'notifications',
        'order_items',
        'orders',
        'profiles',
        'shalom_agencies',
        'shipments',
        'sizes',
        'store_members',
        'stores',
      ]),
    );
  });

  it('deja RLS activado en TODAS las tablas', async () => {
    // La misma comprobación que hacen las migraciones, pero verificada
    // desde fuera: es la única barrera entre el inventario de una tienda y
    // el de otra.
    const { rows } = await banco.db.query<{ tablename: string }>(
      `select tablename from pg_tables
       where schemaname = 'public' and rowsecurity = false`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it('carga las 498 agencias de Shalom del formato oficial', async () => {
    const { rows } = await banco.db.query<{ total: number }>(
      `select count(*)::int as total from public.shalom_agencies`,
    );
    expect(rows[0]?.total).toBe(498);

    const { rows: familia } = await banco.db.query<{ id: number; name: string }>(
      `select id, name from public.shalom_agencies where name = 'OVALO DE LA FAMILIA'`,
    );
    expect(familia[0]).toEqual({ id: 177, name: 'OVALO DE LA FAMILIA' });
  });

  it('las tiendas nuevas nacen con el mensaje recomendado', async () => {
    const usuario = await banco.crearUsuario('recien-llegada@tienda.pe');
    const plantilla = await banco.como(usuario, async () => {
      await banco.db.query(`select public.bootstrap_store('Tienda Nueva')`);
      const { rows } = await banco.db.query<{ share_template: string }>(
        `select share_template from public.stores where name = 'Tienda Nueva'`,
      );
      return rows[0]?.share_template;
    });

    expect(plantilla).toBe(PLANTILLA_NUEVA);
  });

  it('pone al día las tiendas viejas, pero respeta las personalizadas', async () => {
    // Un `default` solo alcanza a las filas nuevas. Esto comprueba que la
    // migración 0008 arregla las tiendas que ya existían — y que no pisa el
    // mensaje de quien lo haya escrito a mano desde Ajustes › Compartir.
    const propio = 'Talla {{talla}} · {{precio}} · llévatela hoy';

    await banco.db.query(
      `insert into public.stores (name, share_template) values ($1, $2), ($3, $4)`,
      ['Vieja', PLANTILLA_VIEJA, 'Con mensaje propio', propio],
    );

    const migracion = migracionesEnOrden().find((m) =>
      m.includes('mensaje_solo_talla_y_precio'),
    );
    expect(migracion).toBeDefined();

    await banco.db.exec(
      readFileSync(join(import.meta.dirname, '..', 'migrations', migracion!), 'utf8'),
    );

    const { rows } = await banco.db.query<{ name: string; share_template: string }>(
      `select name, share_template from public.stores
       where name in ('Vieja', 'Con mensaje propio')`,
    );
    const porNombre = Object.fromEntries(rows.map((r) => [r.name, r.share_template]));

    expect(porNombre['Vieja']).toBe(PLANTILLA_NUEVA);
    expect(porNombre['Con mensaje propio']).toBe(propio);
  });

  it('crea la vista de lectura y las funciones que usa la app', async () => {
    const { rows: vistas } = await banco.db.query<{ viewname: string }>(
      `select viewname from pg_views where schemaname = 'public'`,
    );
    expect(vistas.map((v) => v.viewname)).toContain('items_view');

    const { rows: funciones } = await banco.db.query<{ proname: string }>(
      `select proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'`,
    );
    const nombres = funciones.map((f) => f.proname);

    expect(nombres).toEqual(
      expect.arrayContaining([
        'bootstrap_store',
        'dashboard_stats',
        'expire_reservations',
        'gen_item_code',
        'gen_order_code',
        'is_store_member',
        'is_store_owner',
        'my_store_ids',
      ]),
    );
  });
});
