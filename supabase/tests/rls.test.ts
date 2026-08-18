import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { levantarBanco, type BancoDePruebas } from './entorno';

/**
 * Aislamiento entre tiendas.
 *
 * Este es EL test de seguridad del proyecto. La clave `anon` que viaja al
 * navegador es pública por diseño: lo único que impide que alguien lea el
 * inventario de otra tienda son estas políticas. Si este archivo pasa a
 * verde por accidente (por ejemplo, porque los tests corren como
 * superusuario), no está protegiendo nada — por eso todo se ejecuta con el
 * rol `authenticated`, igual que una petición real.
 */
describe('una tienda no puede ver ni tocar los datos de otra', () => {
  let banco: BancoDePruebas;

  let ana: string; // dueña de la tienda A
  let luis: string; // dueño de la tienda B
  let tiendaA: string;
  let tiendaB: string;
  let prendaA: string;

  beforeAll(async () => {
    banco = await levantarBanco();

    ana = await banco.crearUsuario('ana@tienda-a.pe');
    luis = await banco.crearUsuario('luis@tienda-b.pe');

    // Cada uno crea su tienda con sus catálogos.
    tiendaA = await banco.como(ana, async () => {
      const { rows } = await banco.db.query<{ bootstrap_store: string }>(
        `select public.bootstrap_store('Ropa Americana Ana') as bootstrap_store`,
      );
      return rows[0]!.bootstrap_store;
    });

    tiendaB = await banco.como(luis, async () => {
      const { rows } = await banco.db.query<{ bootstrap_store: string }>(
        `select public.bootstrap_store('Ropa Americana Luis') as bootstrap_store`,
      );
      return rows[0]!.bootstrap_store;
    });

    prendaA = await banco.como(ana, async () => {
      const { rows } = await banco.db.query<{ id: string }>(
        `insert into public.items (store_id, price_cents, name)
         values ($1, 5000, 'Casaca de Ana') returning id`,
        [tiendaA],
      );
      return rows[0]!.id;
    });
  });

  afterAll(async () => {
    await banco?.cerrar();
  });

  it('los tests corren con el rol que sufre las políticas, no como superusuario', async () => {
    // Sin esto, todos los demás tests de este archivo podrían estar
    // pasando en vacío: un superusuario se salta RLS y «no ve nada de la
    // otra tienda» sería mentira por otro motivo.
    const contexto = await banco.como(ana, async () => {
      const { rows } = await banco.db.query<{
        rol: string;
        superusuario: boolean;
        uid: string | null;
      }>(
        `select current_user as rol,
                (select rolsuper from pg_roles where rolname = current_user) as superusuario,
                auth.uid()::text as uid`,
      );
      return rows[0]!;
    });

    expect(contexto.rol).toBe('authenticated');
    expect(contexto.superusuario).toBe(false);
    expect(contexto.uid).toBe(ana);
  });

  it('cada quien ve su propia tienda', async () => {
    const deAna = await banco.como(ana, async () => {
      const { rows } = await banco.db.query<{ name: string }>(`select name from public.stores`);
      return rows.map((r) => r.name);
    });

    expect(deAna).toEqual(['Ropa Americana Ana']);
  });

  it('Luis NO ve la tienda de Ana', async () => {
    const deLuis = await banco.como(luis, async () => {
      const { rows } = await banco.db.query<{ name: string }>(`select name from public.stores`);
      return rows.map((r) => r.name);
    });

    expect(deLuis).toEqual(['Ropa Americana Luis']);
    expect(deLuis).not.toContain('Ropa Americana Ana');
  });

  it('Luis NO ve las prendas de Ana, ni buscándolas por id', async () => {
    const encontradas = await banco.como(luis, async () => {
      const { rows } = await banco.db.query(`select id from public.items where id = $1`, [prendaA]);
      return rows.length;
    });

    expect(encontradas).toBe(0);
  });

  it('Luis NO puede modificar una prenda de Ana', async () => {
    const afectadas = await banco.como(luis, async () => {
      const { rows } = await banco.db.query(
        `update public.items set price_cents = 1 where id = $1 returning id`,
        [prendaA],
      );
      return rows.length;
    });

    // RLS no lanza error en un UPDATE: simplemente no encuentra la fila.
    expect(afectadas).toBe(0);

    const precio = await banco.como(ana, async () => {
      const { rows } = await banco.db.query<{ price_cents: number }>(
        `select price_cents from public.items where id = $1`,
        [prendaA],
      );
      return rows[0]?.price_cents;
    });

    expect(precio).toBe(5000);
  });

  it('Luis NO puede crear prendas en la tienda de Ana', async () => {
    await expect(
      banco.como(luis, async () =>
        banco.db.query(
          `insert into public.items (store_id, price_cents) values ($1, 100)`,
          [tiendaA],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('Luis NO ve los catálogos de Ana', async () => {
    const categorias = await banco.como(luis, async () => {
      const { rows } = await banco.db.query(`select id from public.categories where store_id = $1`, [
        tiendaA,
      ]);
      return rows.length;
    });

    expect(categorias).toBe(0);
  });

  it('Luis NO ve el historial de las prendas de Ana', async () => {
    const eventos = await banco.como(luis, async () => {
      const { rows } = await banco.db.query(`select id from public.item_events where item_id = $1`, [
        prendaA,
      ]);
      return rows.length;
    });

    expect(eventos).toBe(0);
  });

  it('Luis NO ve los clientes ni los pedidos de Ana', async () => {
    const clienteA = await banco.como(ana, async () => {
      const { rows } = await banco.db.query<{ id: string }>(
        `insert into public.customers (store_id, full_name, doc_number, phone)
         values ($1, 'María', '70503353', '987654321') returning id`,
        [tiendaA],
      );
      return rows[0]!.id;
    });

    const visto = await banco.como(luis, async () => {
      const { rows } = await banco.db.query(`select id from public.customers where id = $1`, [
        clienteA,
      ]);
      return rows.length;
    });

    expect(visto).toBe(0);
  });

  it('sin sesión no se ve absolutamente nada', async () => {
    const sinSesion = await banco.como(null, async () => {
      const { rows: tiendas } = await banco.db.query(`select id from public.stores`);
      const { rows: prendas } = await banco.db.query(`select id from public.items`);
      return tiendas.length + prendas.length;
    });

    expect(sinSesion).toBe(0);
  });

  it('el catálogo de agencias de Shalom sí es común a todos', async () => {
    // Es información pública de Shalom, no de ninguna tienda.
    const cuantas = await banco.como(luis, async () => {
      const { rows } = await banco.db.query<{ total: number }>(
        `select count(*)::int as total from public.shalom_agencies`,
      );
      return rows[0]!.total;
    });

    expect(cuantas).toBe(498);
  });
});

describe('roles dentro de la misma tienda', () => {
  let banco: BancoDePruebas;
  let duena: string;
  let vendedor: string;
  let tienda: string;
  let prenda: string;

  beforeAll(async () => {
    banco = await levantarBanco();

    duena = await banco.crearUsuario('duena@tienda.pe');
    vendedor = await banco.crearUsuario('vendedor@tienda.pe');

    tienda = await banco.como(duena, async () => {
      const { rows } = await banco.db.query<{ bootstrap_store: string }>(
        `select public.bootstrap_store('Mi Tienda') as bootstrap_store`,
      );
      return rows[0]!.bootstrap_store;
    });

    // La dueña suma al vendedor a su tienda.
    await banco.como(duena, async () =>
      banco.db.query(
        `insert into public.store_members (store_id, user_id, role) values ($1, $2, 'seller')`,
        [tienda, vendedor],
      ),
    );

    prenda = await banco.como(vendedor, async () => {
      const { rows } = await banco.db.query<{ id: string }>(
        `insert into public.items (store_id, price_cents) values ($1, 8000) returning id`,
        [tienda],
      );
      return rows[0]!.id;
    });
  });

  afterAll(async () => {
    await banco?.cerrar();
  });

  it('el vendedor gestiona el inventario', async () => {
    expect(prenda).toBeTruthy();

    const cambiadas = await banco.como(vendedor, async () => {
      const { rows } = await banco.db.query(
        `update public.items set status = 'reserved' where id = $1 returning id`,
        [prenda],
      );
      return rows.length;
    });

    expect(cambiadas).toBe(1);
  });

  it('el vendedor NO puede cambiar los ajustes de la tienda', async () => {
    const cambiadas = await banco.como(vendedor, async () => {
      const { rows } = await banco.db.query(
        `update public.stores set reserve_days = 30 where id = $1 returning id`,
        [tienda],
      );
      return rows.length;
    });

    expect(cambiadas).toBe(0);
  });

  it('la dueña sí puede', async () => {
    const cambiadas = await banco.como(duena, async () => {
      const { rows } = await banco.db.query(
        `update public.stores set reserve_days = 7 where id = $1 returning id`,
        [tienda],
      );
      return rows.length;
    });

    expect(cambiadas).toBe(1);
  });

  it('el vendedor NO puede borrar prendas definitivamente', async () => {
    // Enviar a la papelera sí (es un update); vaciarla, no.
    const borradas = await banco.como(vendedor, async () => {
      const { rows } = await banco.db.query(`delete from public.items where id = $1 returning id`, [
        prenda,
      ]);
      return rows.length;
    });

    expect(borradas).toBe(0);
  });

  it('el historial no se puede falsear desde la app', async () => {
    // No hay política de INSERT en item_events a propósito: lo escriben
    // los triggers, que son SECURITY DEFINER.
    await expect(
      banco.como(vendedor, async () =>
        banco.db.query(
          `insert into public.item_events (item_id, store_id, type) values ($1, $2, 'sold')`,
          [prenda, tienda],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
