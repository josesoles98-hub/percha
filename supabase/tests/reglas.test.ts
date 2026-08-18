import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { levantarBanco, type BancoDePruebas } from './entorno';

/**
 * Las reglas de negocio que viven en la base de datos.
 *
 * Están ahí y no en la app para que funcionen igual desde la web, desde la
 * futura app móvil o desde un script. Estos tests comprueban que de verdad
 * lo hacen.
 */
describe('reglas del inventario', () => {
  let banco: BancoDePruebas;
  let usuario: string;
  let tienda: string;

  const nuevaPrenda = async (precio = 5000, nombre?: string) =>
    banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ id: string; code: string }>(
        `insert into public.items (store_id, price_cents, name)
         values ($1, $2, $3) returning id, code`,
        [tienda, precio, nombre ?? null],
      );
      return rows[0]!;
    });

  beforeAll(async () => {
    banco = await levantarBanco();
    usuario = await banco.crearUsuario('duena@tienda.pe');
    tienda = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ bootstrap_store: string }>(
        `select public.bootstrap_store('Mi Tienda') as bootstrap_store`,
      );
      return rows[0]!.bootstrap_store;
    });
  });

  afterAll(async () => {
    await banco?.cerrar();
  });

  it('crea la tienda con sus catálogos listos para usar', async () => {
    const conteos = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ categorias: number; tallas: number; colores: number }>(
        `select
           (select count(*)::int from public.categories where store_id = $1) as categorias,
           (select count(*)::int from public.sizes      where store_id = $1) as tallas,
           (select count(*)::int from public.colors     where store_id = $1) as colores`,
        [tienda],
      );
      return rows[0]!;
    });

    expect(conteos.categorias).toBe(9);
    expect(conteos.tallas).toBe(24); // 6 de ropa + 7 de pantalón + 11 de calzado
    expect(conteos.colores).toBe(12);
  });

  it('genera códigos correlativos sin saltos', async () => {
    const primera = await nuevaPrenda();
    const segunda = await nuevaPrenda();

    expect(primera.code).toMatch(/^PR-\d{6}$/);

    const n = (code: string) => Number(code.slice(3));
    expect(n(segunda.code)).toBe(n(primera.code) + 1);
  });

  it('escribe el historial al crear y al cambiar el precio', async () => {
    const prenda = await nuevaPrenda(6000);

    await banco.como(usuario, async () =>
      banco.db.query(`update public.items set price_cents = 5000 where id = $1`, [prenda.id]),
    );

    const eventos = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ type: string; payload: Record<string, unknown> }>(
        `select type, payload from public.item_events where item_id = $1 order by id`,
        [prenda.id],
      );
      return rows;
    });

    expect(eventos.map((e) => e.type)).toEqual(['created', 'updated']);
    expect(eventos[1]?.payload.price_cents).toEqual([6000, 5000]);
  });

  it('congela los días de reserva al reservar', async () => {
    const prenda = await nuevaPrenda();

    // Se reserva con los 5 días de la configuración actual.
    await banco.como(usuario, async () =>
      banco.db.query(
        `update public.items set status = 'reserved', reserved_for_name = 'María' where id = $1`,
        [prenda.id],
      ),
    );

    const antes = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ snapshot: number; vence: string }>(
        `select reserve_days_snapshot as snapshot, reserve_expires_at as vence
         from public.items where id = $1`,
        [prenda.id],
      );
      return rows[0]!;
    });

    expect(antes.snapshot).toBe(5);

    // Ahora la dueña cambia el ajuste a 10 días.
    await banco.como(usuario, async () =>
      banco.db.query(`update public.stores set reserve_days = 10 where id = $1`, [tienda]),
    );

    const despues = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ snapshot: number; vence: string }>(
        `select reserve_days_snapshot as snapshot, reserve_expires_at as vence
         from public.items where id = $1`,
        [prenda.id],
      );
      return rows[0]!;
    });

    // La reserva viva no se entera del cambio: se le prometió una fecha a
    // un cliente y esa fecha no se mueve.
    expect(despues.snapshot).toBe(5);
    expect(despues.vence).toEqual(antes.vence);

    // Pero una reserva nueva sí usa los 10.
    const otra = await nuevaPrenda();
    await banco.como(usuario, async () =>
      banco.db.query(`update public.items set status = 'reserved' where id = $1`, [otra.id]),
    );

    const nueva = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ snapshot: number }>(
        `select reserve_days_snapshot as snapshot from public.items where id = $1`,
        [otra.id],
      );
      return rows[0]!;
    });

    expect(nueva.snapshot).toBe(10);

    // Se deja el ajuste como estaba para no afectar a los demás tests.
    await banco.como(usuario, async () =>
      banco.db.query(`update public.stores set reserve_days = 5 where id = $1`, [tienda]),
    );
  });

  it('guarda cuánto adelantó el cliente y lo deja ver en items_view', async () => {
    const prenda = await nuevaPrenda(8000);

    await banco.como(usuario, async () =>
      banco.db.query(
        `update public.items
            set status = 'reserved', reserved_for_name = 'María', reserved_deposit_cents = 2000
          where id = $1`,
        [prenda.id],
      ),
    );

    const fila = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ adelanto: number; precio: number }>(
        `select reserved_deposit_cents as adelanto, price_cents as precio
         from public.items_view where id = $1`,
        [prenda.id],
      );
      return rows[0]!;
    });

    expect(fila.adelanto).toBe(2000);
    expect(fila.precio - fila.adelanto).toBe(6000); // lo que falta por cobrar

    // Corregir el adelanto de una reserva en curso (mismo estado antes y
    // después) no debe reiniciar la cuenta atrás: es una edición, no una
    // reserva nueva.
    const antes = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ vence: string }>(
        `select reserve_expires_at as vence from public.items where id = $1`,
        [prenda.id],
      );
      return rows[0]!.vence;
    });

    await banco.como(usuario, async () =>
      banco.db.query(
        `update public.items set status = 'reserved', reserved_deposit_cents = 3000 where id = $1`,
        [prenda.id],
      ),
    );

    const despues = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ adelanto: number; vence: string }>(
        `select reserved_deposit_cents as adelanto, reserve_expires_at as vence
         from public.items where id = $1`,
        [prenda.id],
      );
      return rows[0]!;
    });

    expect(despues.adelanto).toBe(3000);
    expect(despues.vence).toEqual(antes);
  });

  it('limpia los datos de reserva —incluido el adelanto— al salir de reservada', async () => {
    const prenda = await nuevaPrenda();

    await banco.como(usuario, async () => {
      await banco.db.query(
        `update public.items
            set status = 'reserved', reserved_for_name = 'Luis', reserved_deposit_cents = 1500
          where id = $1`,
        [prenda.id],
      );
      await banco.db.query(`update public.items set status = 'available' where id = $1`, [prenda.id]);
    });

    const fila = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{
        reserved_at: string | null;
        reserved_for_name: string | null;
        reserve_expires_at: string | null;
        reserved_deposit_cents: number | null;
      }>(
        `select reserved_at, reserved_for_name, reserve_expires_at, reserved_deposit_cents
         from public.items where id = $1`,
        [prenda.id],
      );
      return rows[0]!;
    });

    expect(fila.reserved_at).toBeNull();
    expect(fila.reserved_for_name).toBeNull();
    expect(fila.reserve_expires_at).toBeNull();
    expect(fila.reserved_deposit_cents).toBeNull();
  });

  it('al vender guarda la fecha y el precio cobrado', async () => {
    const prenda = await nuevaPrenda(4500);

    await banco.como(usuario, async () =>
      banco.db.query(`update public.items set status = 'sold' where id = $1`, [prenda.id]),
    );

    const fila = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ sold_at: string; sold_price_cents: number }>(
        `select sold_at, sold_price_cents from public.items where id = $1`,
        [prenda.id],
      );
      return rows[0]!;
    });

    expect(fila.sold_at).toBeTruthy();
    expect(fila.sold_price_cents).toBe(4500);
  });

  it('items_view muestra como disponible una reserva ya vencida', async () => {
    const prenda = await nuevaPrenda();

    // Se reserva y se retrasa la fecha para simular que pasaron 6 días.
    await banco.como(usuario, async () =>
      banco.db.query(`update public.items set status = 'reserved' where id = $1`, [prenda.id]),
    );
    await banco.db.query(
      `update public.items set reserved_at = now() - interval '6 days' where id = $1`,
      [prenda.id],
    );

    const vista = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{
        status: string;
        effective_status: string;
        days_left: number | null;
      }>(
        `select status, effective_status, days_left from public.items_view where id = $1`,
        [prenda.id],
      );
      return rows[0]!;
    });

    // La tabla sigue diciendo 'reserved' porque el job aún no ha corrido,
    // pero la app lee de la vista y ahí ya está disponible.
    expect(vista.status).toBe('reserved');
    expect(vista.effective_status).toBe('available');
    expect(vista.days_left).toBe(0);
  });

  it('expire_reservations libera las vencidas y avisa', async () => {
    const antes = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ total: number }>(
        `select count(*)::int as total from public.notifications where store_id = $1`,
        [tienda],
      );
      return rows[0]!.total;
    });

    const liberadas = await banco.db.query<{ expire_reservations: number }>(
      `select public.expire_reservations() as expire_reservations`,
    );

    expect(liberadas.rows[0]!.expire_reservations).toBeGreaterThanOrEqual(1);

    const despues = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ total: number; titulo: string | null }>(
        `select count(*)::int as total,
                max(title) as titulo
         from public.notifications where store_id = $1`,
        [tienda],
      );
      return rows[0]!;
    });

    expect(despues.total).toBeGreaterThan(antes);
    expect(despues.titulo).toBe('Reserva vencida');
  });

  it('dashboard_stats cuadra con el inventario', async () => {
    const stats = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ stats: Record<string, number> }>(
        `select public.dashboard_stats($1) as stats`,
        [tienda],
      );
      return rows[0]!.stats;
    });

    const reales = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ total: number; valor: number }>(
        `select count(*)::int as total,
                coalesce(sum(price_cents) filter (
                  where effective_status in ('available','reserved')), 0)::int as valor
         from public.items_view where store_id = $1`,
        [tienda],
      );
      return rows[0]!;
    });

    expect(stats.total).toBe(reales.total);
    expect(stats.inventory_value).toBe(reales.valor);
  });
});

describe('reglas de pedidos y envíos', () => {
  let banco: BancoDePruebas;
  let usuario: string;
  let tienda: string;
  let cliente: string;

  beforeAll(async () => {
    banco = await levantarBanco();
    usuario = await banco.crearUsuario('duena@tienda.pe');

    tienda = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ bootstrap_store: string }>(
        `select public.bootstrap_store('Mi Tienda') as bootstrap_store`,
      );
      return rows[0]!.bootstrap_store;
    });

    cliente = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ id: string }>(
        `insert into public.customers (store_id, full_name, doc_number, phone)
         values ($1, 'María Quispe', '70503353', '987654321') returning id`,
        [tienda],
      );
      return rows[0]!.id;
    });
  });

  afterAll(async () => {
    await banco?.cerrar();
  });

  const crearPrenda = async (precio: number) =>
    banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ id: string }>(
        `insert into public.items (store_id, price_cents) values ($1, $2) returning id`,
        [tienda, precio],
      );
      return rows[0]!.id;
    });

  const crearPedido = async () =>
    banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ id: string; code: string }>(
        `insert into public.orders (store_id, customer_id) values ($1, $2) returning id, code`,
        [tienda, cliente],
      );
      return rows[0]!;
    });

  it('genera códigos de pedido correlativos', async () => {
    const primero = await crearPedido();
    const segundo = await crearPedido();

    expect(primero.code).toMatch(/^PED-\d{6}$/);
    expect(Number(segundo.code.slice(4))).toBe(Number(primero.code.slice(4)) + 1);
  });

  it('recalcula el total al añadir prendas', async () => {
    const pedido = await crearPedido();
    const a = await crearPrenda(5000);
    const b = await crearPrenda(3000);

    await banco.como(usuario, async () =>
      banco.db.query(
        `insert into public.order_items (order_id, item_id, price_cents)
         values ($1, $2, 5000), ($1, $3, 3000)`,
        [pedido.id, a, b],
      ),
    );

    const totales = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ subtotal_cents: number; total_cents: number }>(
        `select subtotal_cents, total_cents from public.orders where id = $1`,
        [pedido.id],
      );
      return rows[0]!;
    });

    expect(totales.subtotal_cents).toBe(8000);
    expect(totales.total_cents).toBe(8000);
  });

  it('una prenda no puede estar en dos pedidos vivos', async () => {
    const pedido1 = await crearPedido();
    const pedido2 = await crearPedido();
    const prenda = await crearPrenda(5000);

    await banco.como(usuario, async () =>
      banco.db.query(
        `insert into public.order_items (order_id, item_id, price_cents) values ($1, $2, 5000)`,
        [pedido1.id, prenda],
      ),
    );

    await expect(
      banco.como(usuario, async () =>
        banco.db.query(
          `insert into public.order_items (order_id, item_id, price_cents) values ($1, $2, 5000)`,
          [pedido2.id, prenda],
        ),
      ),
    ).rejects.toThrow(/ya está en el pedido/);
  });

  it('al confirmar el pedido las prendas pasan a vendidas', async () => {
    const pedido = await crearPedido();
    const prenda = await crearPrenda(7000);

    await banco.como(usuario, async () => {
      await banco.db.query(
        `insert into public.order_items (order_id, item_id, price_cents) values ($1, $2, 6500)`,
        [pedido.id, prenda],
      );
      await banco.db.query(`update public.orders set status = 'confirmed' where id = $1`, [
        pedido.id,
      ]);
    });

    const fila = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ status: string; sold_price_cents: number }>(
        `select status, sold_price_cents from public.items where id = $1`,
        [prenda],
      );
      return rows[0]!;
    });

    // Se guarda lo que se cobró en el pedido, no el precio de catálogo.
    expect(fila.status).toBe('sold');
    expect(fila.sold_price_cents).toBe(6500);
  });

  it('al cancelar el pedido las prendas vuelven al inventario', async () => {
    const pedido = await crearPedido();
    const prenda = await crearPrenda(9000);

    await banco.como(usuario, async () => {
      await banco.db.query(
        `insert into public.order_items (order_id, item_id, price_cents) values ($1, $2, 9000)`,
        [pedido.id, prenda],
      );
      await banco.db.query(`update public.orders set status = 'confirmed' where id = $1`, [pedido.id]);
      await banco.db.query(`update public.orders set status = 'cancelled' where id = $1`, [pedido.id]);
    });

    const estado = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ status: string }>(
        `select status from public.items where id = $1`,
        [prenda],
      );
      return rows[0]!.status;
    });

    expect(estado).toBe('available');
  });

  it('lleva la cuenta de compras del cliente', async () => {
    const pedido = await crearPedido();
    const prenda = await crearPrenda(12000);

    const antes = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ orders_count: number }>(
        `select orders_count from public.customers where id = $1`,
        [cliente],
      );
      return rows[0]!.orders_count;
    });

    await banco.como(usuario, async () => {
      await banco.db.query(
        `insert into public.order_items (order_id, item_id, price_cents) values ($1, $2, 12000)`,
        [pedido.id, prenda],
      );
      await banco.db.query(`update public.orders set status = 'confirmed' where id = $1`, [pedido.id]);
    });

    const despues = await banco.como(usuario, async () => {
      const { rows } = await banco.db.query<{ orders_count: number; total_spent_cents: number }>(
        `select orders_count, total_spent_cents from public.customers where id = $1`,
        [cliente],
      );
      return rows[0]!;
    });

    expect(despues.orders_count).toBe(antes + 1);
    expect(despues.total_spent_cents).toBeGreaterThanOrEqual(12000);
  });

  it('solo acepta los seis tipos de paquete del formato de Shalom', async () => {
    const pedido = await crearPedido();

    await expect(
      banco.como(usuario, async () =>
        banco.db.query(
          `insert into public.shipments (store_id, order_id, origin_agency_id, destiny_agency_id, package_type)
           values ($1, $2, 177, 15, 'CAJA GIGANTE')`,
          [tienda, pedido.id],
        ),
      ),
    ).rejects.toThrow(/package_type/);
  });

  it('el envío se ata a agencias que existen en el catálogo', async () => {
    const pedido = await crearPedido();

    await expect(
      banco.como(usuario, async () =>
        banco.db.query(
          `insert into public.shipments (store_id, order_id, origin_agency_id, destiny_agency_id)
           values ($1, $2, 177, 999999)`,
          [tienda, pedido.id],
        ),
      ),
    ).rejects.toThrow(/foreign key|shalom_agencies/i);
  });
});
