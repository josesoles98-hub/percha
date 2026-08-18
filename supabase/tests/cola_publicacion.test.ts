import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { levantarBanco, type BancoDePruebas } from './entorno';

/**
 * Cola de publicación automática (avisos push).
 *
 * Lo importante acá no es la lógica de "cada cuánto toca" —esa vive en la
 * Función Edge, que no corre en PGlite—, sino que las tablas nuevas
 * respeten el mismo aislamiento por tienda que todo lo demás: una
 * suscripción push o una cola es tan sensible como el inventario.
 */
describe('cola de publicación', () => {
  let banco: BancoDePruebas;
  let ana: string;
  let luis: string;
  let tiendaA: string;
  let tiendaB: string;
  let prendaA: string;

  beforeAll(async () => {
    banco = await levantarBanco();

    ana = await banco.crearUsuario('ana@tienda-a.pe');
    luis = await banco.crearUsuario('luis@tienda-b.pe');

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

  it('una tienda nueva arranca con la cola apagada', async () => {
    const ajustes = await banco.como(ana, async () => {
      const { rows } = await banco.db.query<{
        publish_active: boolean;
        publish_interval_minutes: number;
      }>(`select publish_active, publish_interval_minutes from public.stores where id = $1`, [
        tiendaA,
      ]);
      return rows[0]!;
    });

    expect(ajustes.publish_active).toBe(false);
    expect(ajustes.publish_interval_minutes).toBeGreaterThan(0);
  });

  it('Ana puede armar su cola y verla', async () => {
    await banco.como(ana, async () => {
      await banco.db.query(
        `insert into public.publish_queue (store_id, item_id, position) values ($1, $2, 0)`,
        [tiendaA, prendaA],
      );
      await banco.db.query(`update public.stores set publish_active = true where id = $1`, [
        tiendaA,
      ]);
    });

    const cola = await banco.como(ana, async () => {
      const { rows } = await banco.db.query<{ status: string }>(
        `select status from public.publish_queue where store_id = $1`,
        [tiendaA],
      );
      return rows;
    });

    expect(cola).toEqual([{ status: 'pending' }]);
  });

  it('Luis NO ve la cola ni las suscripciones de Ana', async () => {
    const deLuis = await banco.como(luis, async () => {
      const { rows } = await banco.db.query<{ id: string }>(
        `select id from public.publish_queue where store_id = $1`,
        [tiendaA],
      );
      return rows;
    });

    expect(deLuis).toEqual([]);
  });

  it('Luis NO puede insertar en la cola de la tienda de Ana', async () => {
    await expect(
      banco.como(luis, () =>
        banco.db.query(
          `insert into public.publish_queue (store_id, item_id, position) values ($1, $2, 0)`,
          [tiendaA, prendaA],
        ),
      ),
    ).rejects.toThrow();
  });

  it('cada tienda gestiona sus propias suscripciones push, aisladas de la otra', async () => {
    await banco.como(ana, () =>
      banco.db.query(
        `insert into public.push_subscriptions (store_id, endpoint, p256dh, auth)
         values ($1, 'https://push.ejemplo/ana', 'clave-p256dh', 'clave-auth')`,
        [tiendaA],
      ),
    );

    const deAna = await banco.como(ana, async () => {
      const { rows } = await banco.db.query<{ endpoint: string }>(
        `select endpoint from public.push_subscriptions where store_id = $1`,
        [tiendaA],
      );
      return rows;
    });
    const deLuis = await banco.como(luis, async () => {
      const { rows } = await banco.db.query<{ endpoint: string }>(
        `select endpoint from public.push_subscriptions where store_id = $1`,
        [tiendaA],
      );
      return rows;
    });

    expect(deAna).toEqual([{ endpoint: 'https://push.ejemplo/ana' }]);
    expect(deLuis).toEqual([]);
  });

  it('el intervalo tiene que estar entre 1 y 120 minutos', async () => {
    await expect(
      banco.como(ana, () =>
        banco.db.query(`update public.stores set publish_interval_minutes = 0 where id = $1`, [
          tiendaA,
        ]),
      ),
    ).rejects.toThrow();
  });

  it('el estado de la cola solo acepta pending, sent o skipped', async () => {
    await expect(
      banco.como(ana, () =>
        banco.db.query(
          `insert into public.publish_queue (store_id, item_id, position, status)
           values ($1, $2, 1, 'volando')`,
          [tiendaA, prendaA],
        ),
      ),
    ).rejects.toThrow();
  });

  it('borrar la prenda se lleva su fila de la cola (on delete cascade)', async () => {
    const prendaB = await banco.como(luis, async () => {
      const { rows } = await banco.db.query<{ id: string }>(
        `insert into public.items (store_id, price_cents, name)
         values ($1, 3000, 'Polo de Luis') returning id`,
        [tiendaB],
      );
      return rows[0]!.id;
    });

    await banco.como(luis, () =>
      banco.db.query(
        `insert into public.publish_queue (store_id, item_id, position) values ($1, $2, 0)`,
        [tiendaB, prendaB],
      ),
    );

    await banco.como(luis, () => banco.db.query(`delete from public.items where id = $1`, [prendaB]));

    const cola = await banco.como(luis, async () => {
      const { rows } = await banco.db.query(`select id from public.publish_queue where store_id = $1`, [
        tiendaB,
      ]);
      return rows;
    });

    expect(cola).toEqual([]);
  });
});
