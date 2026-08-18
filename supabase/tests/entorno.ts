import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

/**
 * Banco de pruebas de la base de datos.
 *
 * Levanta un PostgreSQL de verdad (PGlite, el mismo motor compilado a
 * WebAssembly) y le aplica las migraciones tal cual. Sirve para lo que
 * ningún typecheck puede comprobar: que el SQL se ejecute, que los
 * triggers hagan lo que dicen y —lo más importante— que las políticas RLS
 * aíslen de verdad una tienda de otra.
 *
 * No sustituye a probar contra Supabase, pero atrapa antes casi todo:
 * erratas, referencias mal escritas, lógica de triggers equivocada y
 * agujeros de RLS.
 */

const MIGRACIONES = join(import.meta.dirname, '..', 'migrations');

/**
 * Lo que Supabase trae de fábrica y las migraciones dan por hecho.
 *
 * Es una imitación mínima: solo lo que las migraciones tocan. Si algún día
 * usan algo más de `auth` o `storage`, hay que añadirlo aquí.
 */
const SHIM_SUPABASE = `
  -- Roles que usan las políticas RLS
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls;
    end if;
  end $$;

  create schema if not exists auth;
  create schema if not exists extensions;
  create schema if not exists storage;

  create table if not exists auth.users (
    id                    uuid primary key,
    email                 text,
    raw_user_meta_data    jsonb default '{}'::jsonb,
    created_at            timestamptz default now()
  );

  -- El usuario de la petición. En Supabase lo saca del JWT; aquí de una
  -- variable de sesión que los tests cambian para simular a cada persona.
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create table if not exists storage.buckets (
    id                 text primary key,
    name               text not null,
    public             boolean default false,
    file_size_limit    bigint,
    allowed_mime_types text[]
  );

  create table if not exists storage.objects (
    id         uuid primary key default gen_random_uuid(),
    bucket_id  text references storage.buckets(id),
    name       text,
    owner      uuid,
    created_at timestamptz default now()
  );
  alter table storage.objects enable row level security;

  create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$
    select string_to_array(name, '/')
  $$;

  grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
`;

export interface BancoDePruebas {
  db: PGlite;
  /** Ejecuta como un usuario concreto, con sus políticas RLS aplicadas. */
  como<T>(userId: string | null, trabajo: () => Promise<T>): Promise<T>;
  /** Crea un usuario en auth.users y devuelve su id. */
  crearUsuario(email: string): Promise<string>;
  cerrar(): Promise<void>;
}

export function migracionesEnOrden(): string[] {
  return readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Levanta la base con todas las migraciones aplicadas.
 *
 * Cada test arranca de cero: es más lento que compartir una instancia,
 * pero un test que ensucia la base y hace fallar al siguiente cuesta mucho
 * más tiempo del que ahorra.
 */
export async function levantarBanco(): Promise<BancoDePruebas> {
  // Las mismas extensiones que usa Supabase. pg_cron no existe aquí, pero
  // las migraciones ya contemplan que pueda faltar: el vencimiento de
  // reservas sigue siendo correcto vía items_view aunque no haya job.
  const db = await PGlite.create({
    extensions: { uuid_ossp, pg_trgm, unaccent },
  });

  await db.exec(SHIM_SUPABASE);

  for (const archivo of migracionesEnOrden()) {
    const sql = readFileSync(join(MIGRACIONES, archivo), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(
        `La migración ${archivo} falló:\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Supabase concede estos permisos de fábrica; sin ellos el rol
  // `authenticated` no podría ni leer, y estaríamos probando el permiso de
  // tabla en vez de las políticas RLS.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);

  return {
    db,

    async como(userId, trabajo) {
      // `authenticated` es el rol con el que Supabase ejecuta las peticiones
      // de un usuario con sesión: es el que sufre las políticas RLS. El
      // superusuario las saltaría y el test no probaría nada.
      await db.exec(`
        select set_config('request.jwt.claim.sub', ${userId ? `'${userId}'` : 'null'}, false);
        set role authenticated;
      `);

      try {
        return await trabajo();
      } finally {
        await db.exec(`reset role; select set_config('request.jwt.claim.sub', null, false);`);
      }
    },

    async crearUsuario(email) {
      const { rows } = await db.query<{ id: string }>(
        `insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`,
        [email],
      );
      return rows[0]!.id;
    },

    async cerrar() {
      await db.close();
    },
  };
}
