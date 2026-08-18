# Percha — Documento de Diseño del Sistema

**Producto:** App web (PWA) para administrar el inventario de una tienda de ropa americana y compartir prendas en WhatsApp en segundos.
**Versión del documento:** 1.0 — borrador para aprobación
**Fecha:** 27 de julio de 2026
**Autor:** Equipo de producto / ingeniería
**Estado:** ⏳ Pendiente de aprobación. No se escribirá código hasta la aprobación.

> *"Percha"* es un nombre de trabajo. Se cambia en un solo archivo de configuración cuando decidas el definitivo.

---

## Tabla de contenidos

1. [Resumen ejecutivo y principios de producto](#1-resumen-ejecutivo-y-principios-de-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Base de datos](#3-base-de-datos)
4. [Flujo de usuarios](#4-flujo-de-usuarios)
5. [Diseño de cada pantalla](#5-diseño-de-cada-pantalla)
6. [Wireframes](#6-wireframes)
7. [Experiencia de usuario](#7-experiencia-de-usuario)
8. [Tecnologías recomendadas](#8-tecnologías-recomendadas)
9. [Escalabilidad](#9-escalabilidad)
10. [Seguridad](#10-seguridad)
11. [**Módulo de pedidos y envíos (Shalom)**](#11-módulo-de-pedidos-y-envíos-shalom)
12. [Plan de desarrollo por fases](#12-plan-de-desarrollo-por-fases)
13. [Anexos: decisiones abiertas y riesgos](#13-anexos-decisiones-abiertas-y-riesgos)

---

## 1. Resumen ejecutivo y principios de producto

### 1.1 El problema

Vender ropa americana es un negocio de **rotación rápida y pieza única**. Cada prenda es un SKU de una sola unidad. El ciclo real es:

1. Llega el fardo/pacas → se seleccionan prendas.
2. Se fotografían.
3. Se publican en grupos de WhatsApp.
4. Alguien reserva → hay que acordarse de a quién y hasta cuándo.
5. Se vende o la reserva vence y vuelve a estar disponible.

Hoy eso vive en la cabeza del dueño, en la galería del teléfono y en los chats. Se pierden prendas, se olvidan reservas y publicar toma minutos por prenda.

### 1.2 La solución

Una app **mobile-first** donde el flujo dominante es: **foto → precio → guardar → compartir**. Todo lo demás (código, fecha, estado, historial) lo hace el sistema solo.

### 1.3 Principios de diseño no negociables

| # | Principio | Consecuencia práctica |
|---|-----------|------------------------|
| P1 | **Velocidad sobre completitud** | Solo 3 campos obligatorios: foto, talla, precio. Todo lo demás opcional. |
| P2 | **Cero pantallas de espera** | Las fotos se suben en segundo plano mientras escribes. Guardar es instantáneo (optimistic UI). |
| P3 | **El pulgar manda** | Toda acción primaria está en el tercio inferior de la pantalla. Objetivos táctiles ≥ 44×44 pt. |
| P4 | **Nunca perder trabajo** | Borrador autoguardado local. Si se cae la red, la prenda se encola y se sube sola. |
| P5 | **El sistema recuerda, tú no** | Reservas, vencimientos y códigos son automáticos. |
| P6 | **Compartir es la función estrella** | Un botón, un toque, texto + fotos listos. |

### 1.4 Métricas de éxito (definen si el producto funciona)

- ⏱️ **Tiempo de alta de prenda ≤ 20 s** (medido de tocar `+` a ver el toast "Guardada"). Se instrumenta en el propio código.
- ⏱️ **Tiempo de compartir ≤ 5 s** (de abrir la ficha a tener WhatsApp abierto con el contenido).
- 🔎 **Encontrar una prenda ≤ 3 s** desde el buscador.
- 📉 **0 reservas vencidas sin detectar.**

### 1.5 Alcance de esta versión

**Dentro:** inventario, estados, reservas con vencimiento, ficha, compartir en WhatsApp, búsqueda, filtros, panel de estadísticas, ajustes, roles dueño/vendedor.

**Dentro, en una fase posterior:** pedidos, clientes y **registro de envíos en Shalom Pro** con generación automática del archivo de carga masiva (ver [sección 11](#11-módulo-de-pedidos-y-envíos-shalom)).

**Fuera (pero la base queda preparada):** QR/código de barras, caja, reportes financieros, Meta Ads, Shopify, IA (descripciones, precios, quitar fondo), publicación automática en redes, WhatsApp Business API.

---

## 2. Arquitectura del sistema

### 2.1 Vista general

La arquitectura es deliberadamente **simple y sin servidor propio que mantener**. Supabase provee base de datos, autenticación, almacenamiento y funciones. Next.js provee la interfaz y una capa fina de servidor para lo que no debe correr en el navegador.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENTE (iPhone / Android / Escritorio)       │
│                                                                      │
│   PWA instalable — Next.js 16 (App Router) + React 19 + Tailwind v4  │
│                                                                      │
│   ┌────────────┐  ┌──────────────┐  ┌────────────┐  ┌─────────────┐  │
│   │ UI / Vistas│  │ Estado       │  │ Cola       │  │ Web Share   │  │
│   │ (RSC + CC) │  │ TanStack     │  │ offline    │  │ API L2      │  │
│   │            │  │ Query        │  │ (IndexedDB)│  │ (compartir) │  │
│   └────────────┘  └──────────────┘  └────────────┘  └─────────────┘  │
│           │                │                │               │        │
│           │   Compresión + conversión HEIC→JPEG en el navegador       │
└───────────┼────────────────┼────────────────┼───────────────┼────────┘
            │                │                │               │
            │ (1) HTTPS      │ (2) supabase-js│ (3) upload    │ (4) SO
            ▼                ▼                ▼               ▼
┌───────────────────────┐   ┌──────────────────────────────────────────┐
│  Next.js Server       │   │              SUPABASE                    │
│  (Vercel Edge/Node)   │   │                                          │
│                       │   │  ┌────────────────────────────────────┐  │
│  • Server Components  │──▶│  │ PostgreSQL 16                      │  │
│  • Server Actions     │   │  │  · tablas de dominio               │  │
│  • Route Handlers     │   │  │  · RLS por store_id                │  │
│  • Middleware (sesión)│   │  │  · triggers (código, historial)    │  │
│  • OG images          │   │  │  · pg_cron (vencer reservas)       │  │
└───────────────────────┘   │  │  · pg_trgm + unaccent (búsqueda)   │  │
                            │  └────────────────────────────────────┘  │
                            │  ┌────────────┐ ┌──────────┐ ┌────────┐  │
                            │  │ Auth (GoTrue)│ Storage  │ │Realtime│  │
                            │  │ JWT + RLS  │ │ S3 + CDN │ │ (WS)   │  │
                            │  └────────────┘ └──────────┘ └────────┘  │
                            │  ┌────────────────────────────────────┐  │
                            │  │ Edge Functions (Deno) — Fase 5+    │  │
                            │  │  IA, webhooks, WhatsApp API        │  │
                            │  └────────────────────────────────────┘  │
                            └──────────────────────────────────────────┘
```

### 2.2 Por qué esta arquitectura

| Decisión | Razón | Alternativa descartada |
|---|---|---|
| **Supabase como backend** | Postgres real (no NoSQL) + auth + storage + RLS en un solo servicio. Cero servidores que mantener. Plan gratis suficiente para años a tu escala. | Backend propio en FastAPI/Node: más control, mucho más trabajo y coste operativo. |
| **Cliente habla directo con Supabase** para lectura/escritura de inventario | Elimina un salto de red. La seguridad la garantiza RLS en la base, no el servidor. | Todo por API propia: +100 ms por petición, más código, sin beneficio. |
| **Next.js Server Actions** solo para operaciones sensibles | Invitar usuarios, cambiar roles, generar URLs firmadas de larga duración. Cosas que no deben depender solo de RLS. | — |
| **Subida directa a Storage desde el navegador** | La foto no pasa por nuestro servidor: más rápido y sin límites de payload. | Subida vía API: cuello de botella y coste. |
| **PWA, no app nativa (por ahora)** | Se instala en la pantalla de inicio del iPhone, funciona offline, se actualiza sola, no depende de la App Store. | React Native desde el día 1: retrasa el lanzamiento semanas sin beneficio inmediato. |
| **pg_cron + expiración perezosa** para reservas | Doble red de seguridad: aunque el cron falle, la app siempre calcula el estado correcto al leer. | Solo cron: si falla, muestras datos incorrectos. Solo cliente: no genera notificaciones. |

### 2.3 Estructura del repositorio (monorepo ligero)

Se organiza como monorepo desde el día 1 **específicamente** para que la futura app React Native/Expo reutilice toda la lógica de negocio sin reescribirla.

```
tienda-app/
├── docs/
│   ├── 00-DISENO-DEL-SISTEMA.md      ← este documento
│   ├── 01-ADR/                        ← decisiones de arquitectura
│   └── 02-API.md
├── apps/
│   ├── web/                           ← Next.js (Fase 1–5)
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (app)/
│   │   │   │   ├── inventario/
│   │   │   │   ├── prenda/[code]/
│   │   │   │   ├── nueva/
│   │   │   │   ├── panel/
│   │   │   │   ├── alertas/
│   │   │   │   └── ajustes/
│   │   │   ├── layout.tsx
│   │   │   └── manifest.ts
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   └── mobile/                        ← Expo (Fase 6, vacío por ahora)
├── packages/
│   ├── core/                          ← ⭐ CERO dependencias de React/DOM
│   │   ├── types/                     ← tipos generados de la BD + dominio
│   │   ├── queries/                   ← consultas supabase-js reutilizables
│   │   ├── reservations/              ← cálculo de vencimientos
│   │   ├── share/                     ← generación del texto de WhatsApp
│   │   ├── validation/                ← esquemas Zod
│   │   └── format/                    ← moneda, fechas, tallas
│   └── ui/                            ← componentes compartibles (Fase 6)
├── supabase/
│   ├── migrations/                    ← SQL versionado
│   ├── seed.sql                       ← categorías, tallas y marcas iniciales
│   └── functions/                     ← Edge Functions (Fase 5+)
└── package.json                       ← workspaces (pnpm)
```

**Regla de oro del monorepo:** `packages/core` no importa nada de `react`, `next` ni `window`. Si esa regla se respeta, la app móvil de Expo se construye reutilizando el 100 % de la lógica y solo se reescribe la capa visual. Se aplica con una regla de ESLint, no con buena voluntad.

### 2.4 Flujo de datos de una prenda nueva (el camino crítico)

Este es el flujo que define el "≤ 20 segundos". El truco es que **nada bloquea al usuario**:

```
t=0s   Usuario toca [+]
       → Se abre el formulario. Se crea un draft_id (UUID) en el cliente.

t=1s   Usuario toca la primera foto → cámara/galería del iPhone
t=4s   Foto seleccionada
       → EN PARALELO, sin bloquear la interfaz:
         a) heic2any convierte HEIC→JPEG si hace falta
         b) se genera miniatura local (objectURL) → se muestra YA
         c) compresión a ~1600px / 82% calidad (Web Worker)
         d) subida a Storage en `items/{draft_id}/1.jpg`
       → El usuario ya está escribiendo el precio mientras sube.

t=6s   Fotos 2 y 3 (opcionales) → mismo proceso en paralelo
t=10s  Talla: se elige de chips grandes (un toque)
t=13s  Precio: teclado numérico, sin símbolo de moneda que escribir
t=15s  (Opcional) marca desde autocompletado de las que ya usaste
t=16s  Usuario toca [Guardar]
       → INSERT en `items` con los paths de las fotos ya subidas
       → Trigger genera el código único (ej. PR-000128)
       → Trigger escribe la primera entrada del historial
       → Optimistic UI: navega a la ficha inmediatamente

t=17s  Ficha visible con botón [Compartir] gigante
```

Si al tocar Guardar alguna foto sigue subiendo, la prenda se guarda igual con estado de foto `pending`; la interfaz muestra un indicador discreto y la subida termina sola. Si no hay red, todo se encola en IndexedDB y se sincroniza al volver.

---

## 3. Base de datos

### 3.1 Diagrama entidad-relación

```
┌──────────────┐        ┌────────────────┐        ┌──────────────┐
│   stores     │1──────*│ store_members  │*──────1│   profiles   │
│──────────────│        │────────────────│        │──────────────│
│ id           │        │ store_id       │        │ id (=auth.uid)│
│ name         │        │ user_id        │        │ full_name    │
│ currency     │        │ role           │        │ avatar_url   │
│ reserve_days │        │  owner|seller  │        │ phone        │
│ code_prefix  │        └────────────────┘        └──────────────┘
│ share_template│
│ ...settings  │
└──────┬───────┘
       │1
       │
       │*                    ┌────────────────┐
┌──────▼───────┐            │  item_photos   │
│    items     │1──────────*│────────────────│
│──────────────│            │ item_id        │
│ id           │            │ storage_path   │
│ store_id     │            │ position (1-3) │
│ code    ⚡   │            │ width, height  │
│ name         │            │ status         │
│ brand_id     │──┐         └────────────────┘
│ size_id      │──┼──▶ ┌──────────────┐
│ category_id  │──┤    │  brands      │
│ color_id     │──┘    │  sizes       │  (catálogos por tienda)
│ price_cents  │       │  categories  │
│ status       │       │  colors      │
│ description  │       └──────────────┘
│ reserved_at  │
│ reserve_days_snapshot        ┌──────────────────┐
│ reserve_expires_at ⚡ (gen)  │   item_events    │
│ reserved_for_name │1────────*│──────────────────│
│ sold_at          │           │ item_id          │
│ sold_price_cents │           │ actor_id         │
│ search_vector ⚡ │           │ type             │
│ created_at       │           │ from_status      │
│ updated_at       │           │ to_status        │
└──────────────────┘           │ payload (jsonb)  │
                               │ created_at       │
                               └──────────────────┘
       ┌──────────────────┐
       │  notifications   │   (reservas vencidas, avisos)
       │──────────────────│
       │ store_id, item_id│
       │ type, read_at    │
       └──────────────────┘

⚡ = generado / mantenido automáticamente por la base de datos
```

### 3.2 Decisiones de modelado importantes

**1. El precio se guarda en centavos (`integer`), nunca en `float`.**
`19.99` en coma flotante es `19.989999...`. En dinero eso es inaceptable. Se guarda `1999` y se formatea al mostrar.

**2. Catálogos (marcas, tallas, categorías, colores) son tablas, no texto libre.**
Permite filtrar de forma fiable, evita "Nike" / "nike" / "NIKE" como tres marcas distintas, y hace que los chips de selección rápida existan. Se pueden crear al vuelo desde el formulario (escribes una marca nueva y se añade al catálogo).

**3. `reserve_days_snapshot`: la reserva congela la configuración del momento.**
Si reservas una prenda con la config en 5 días y luego cambias los ajustes a 7, esa reserva **sigue venciendo a los 5 días**. Cambiar un ajuste no debe alterar retroactivamente compromisos ya adquiridos con clientes. Las reservas *nuevas* usarán 7.

**4. `reserve_expires_at` es una columna generada.**
No se puede desincronizar porque no se escribe a mano: `reserved_at + reserve_days_snapshot`. Se indexa para consultar "vence hoy" al instante.

**5. Estado efectivo = doble garantía.**
- Un job de `pg_cron` cada 15 minutos pasa a `available` las reservas vencidas y crea la notificación.
- **Además**, todas las lecturas pasan por la vista `items_view`, que calcula el estado real al vuelo. Si el cron se retrasa o falla, la app nunca muestra una reserva vencida como activa.

**6. Borrado lógico (`deleted_at`), no físico.**
"Eliminar" mueve a la papelera y se puede deshacer 30 días. Borrar por accidente una prenda con su historial es irrecuperable de otra forma.

**7. `search_vector` generado en la base.**
Búsqueda de texto completo en español, sin tildes, más `pg_trgm` para tolerar errores de tecleo ("adiddas" encuentra "Adidas").

### 3.3 Esquema SQL (propuesta para revisión)

> Este SQL es la especificación. Se implementará como migraciones versionadas en `supabase/migrations/` durante la Fase 1.

```sql
-- ═══════════════════════════════════════════════════════════════
-- EXTENSIONES
-- ═══════════════════════════════════════════════════════════════
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;    -- búsqueda tolerante a errores
create extension if not exists unaccent;   -- ignorar tildes
create extension if not exists pg_cron;    -- vencimiento de reservas

-- Configuración de búsqueda en español sin tildes
create text search configuration es_unaccent (copy = spanish);
alter text search configuration es_unaccent
  alter mapping for hword, hword_part, word with unaccent, spanish_stem;

-- ═══════════════════════════════════════════════════════════════
-- TIPOS
-- ═══════════════════════════════════════════════════════════════
create type item_status  as enum ('available','reserved','sold','hidden');
create type member_role  as enum ('owner','seller');
create type event_type   as enum (
  'created','updated','status_changed','reserved','reservation_expired',
  'reservation_cancelled','sold','shared','photo_added','photo_removed',
  'duplicated','deleted','restored'
);
create type photo_status as enum ('pending','ready','failed');

-- ═══════════════════════════════════════════════════════════════
-- TIENDAS Y USUARIOS
-- ═══════════════════════════════════════════════════════════════
create table stores (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  currency          text not null default 'PEN',       -- ISO 4217
  currency_symbol   text not null default 'S/',
  locale            text not null default 'es-PE',
  timezone          text not null default 'America/Lima',
  reserve_days      integer not null default 5 check (reserve_days between 1 and 60),
  code_prefix       text not null default 'PR' check (code_prefix ~ '^[A-Z]{1,4}$'),
  code_seq          bigint not null default 0,          -- correlativo interno
  share_template    text not null default
    E'🔥 NUEVO INGRESO 🔥\n\nMarca: {{marca}}\nTalla: {{talla}}\nEstado: {{estado}}\nPrecio: {{precio}}\n\nSolo una unidad.\nReserva desde {{adelanto}}.\nEscríbeme por interno.',
  share_deposit_cents integer not null default 1000,    -- "reserva desde S/10"
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table store_members (
  store_id    uuid not null references stores(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        member_role not null default 'seller',
  invited_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index on store_members (user_id);

-- ═══════════════════════════════════════════════════════════════
-- CATÁLOGOS (por tienda, editables desde Ajustes)
-- ═══════════════════════════════════════════════════════════════
create table categories (
  id         uuid primary key default uuid_generate_v4(),
  store_id   uuid not null references stores(id) on delete cascade,
  name       text not null,
  emoji      text,
  position   integer not null default 0,
  archived   boolean not null default false,
  unique (store_id, lower(name))
);

create table brands (
  id         uuid primary key default uuid_generate_v4(),
  store_id   uuid not null references stores(id) on delete cascade,
  name       text not null,
  use_count  integer not null default 0,   -- ordena las más usadas primero
  archived   boolean not null default false,
  unique (store_id, lower(name))
);

create table sizes (
  id         uuid primary key default uuid_generate_v4(),
  store_id   uuid not null references stores(id) on delete cascade,
  label      text not null,               -- 'S', 'M', '32', '9.5 US'
  group_name text not null default 'ropa',-- 'ropa' | 'pantalon' | 'calzado'
  position   integer not null default 0,
  archived   boolean not null default false,
  unique (store_id, group_name, lower(label))
);

create table colors (
  id       uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  name     text not null,
  hex      text check (hex ~ '^#[0-9a-fA-F]{6}$'),
  unique (store_id, lower(name))
);

-- ═══════════════════════════════════════════════════════════════
-- PRENDAS
-- ═══════════════════════════════════════════════════════════════
create table items (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid not null references stores(id) on delete cascade,
  code          text not null,                    -- 'PR-000128' (trigger)

  name          text,
  brand_id      uuid references brands(id)     on delete set null,
  size_id       uuid references sizes(id)      on delete set null,
  category_id   uuid references categories(id) on delete set null,
  color_id      uuid references colors(id)     on delete set null,
  description   text,
  price_cents   integer not null check (price_cents >= 0),
  cost_cents    integer check (cost_cents >= 0),  -- futuro: margen

  status        item_status not null default 'available',

  -- Reserva
  reserved_at            timestamptz,
  reserve_days_snapshot  integer,
  reserved_for_name      text,
  reserved_for_phone     text,
  reserve_expires_at     timestamptz generated always as (
    case when reserved_at is not null and reserve_days_snapshot is not null
         then reserved_at + make_interval(days => reserve_days_snapshot)
    end
  ) stored,

  -- Venta
  sold_at          timestamptz,
  sold_price_cents integer check (sold_price_cents >= 0),

  -- Metadatos
  share_count   integer not null default 0,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  -- Búsqueda de texto completo
  search_vector tsvector generated always as (
    setweight(to_tsvector('es_unaccent', coalesce(code,'')), 'A') ||
    setweight(to_tsvector('es_unaccent', coalesce(name,'')), 'A') ||
    setweight(to_tsvector('es_unaccent', coalesce(description,'')), 'C')
  ) stored,

  constraint reserve_fields_consistent check (
    (status = 'reserved') = (reserved_at is not null)
  ),
  unique (store_id, code)
);

create index items_store_status_idx  on items (store_id, status) where deleted_at is null;
create index items_created_idx       on items (store_id, created_at desc) where deleted_at is null;
create index items_expires_idx       on items (reserve_expires_at) where status = 'reserved';
create index items_price_idx         on items (store_id, price_cents);
create index items_search_idx        on items using gin (search_vector);
create index items_trgm_idx          on items using gin ((coalesce(name,'') || ' ' || coalesce(code,'')) gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════════
-- FOTOS
-- ═══════════════════════════════════════════════════════════════
create table item_photos (
  id            uuid primary key default uuid_generate_v4(),
  item_id       uuid not null references items(id) on delete cascade,
  store_id      uuid not null references stores(id) on delete cascade,
  storage_path  text not null,               -- 'store_id/item_id/1.jpg'
  position      smallint not null check (position between 1 and 3),
  width         integer,
  height        integer,
  bytes         integer,
  blurhash      text,                        -- placeholder mientras carga
  status        photo_status not null default 'pending',
  created_at    timestamptz not null default now(),
  unique (item_id, position)
);

-- ═══════════════════════════════════════════════════════════════
-- HISTORIAL DE CAMBIOS
-- ═══════════════════════════════════════════════════════════════
create table item_events (
  id          bigserial primary key,
  item_id     uuid not null references items(id) on delete cascade,
  store_id    uuid not null references stores(id) on delete cascade,
  actor_id    uuid references profiles(id),   -- null = el sistema
  type        event_type not null,
  from_status item_status,
  to_status   item_status,
  payload     jsonb not null default '{}',    -- {campo: [antes, después]}
  created_at  timestamptz not null default now()
);
create index on item_events (item_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════
-- NOTIFICACIONES
-- ═══════════════════════════════════════════════════════════════
create table notifications (
  id         bigserial primary key,
  store_id   uuid not null references stores(id) on delete cascade,
  item_id    uuid references items(id) on delete cascade,
  type       text not null,        -- 'reservation_expired' | 'expiring_today'
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (store_id, read_at nulls first, created_at desc);
```

### 3.4 Automatismos (triggers y jobs)

```sql
-- ── 1. Código único automático: PR-000128 ─────────────────────
create or replace function gen_item_code() returns trigger
language plpgsql as $$
declare v_prefix text; v_seq bigint;
begin
  update stores set code_seq = code_seq + 1
  where id = new.store_id
  returning code_prefix, code_seq into v_prefix, v_seq;

  new.code := v_prefix || '-' || lpad(v_seq::text, 6, '0');
  return new;
end $$;

create trigger t_gen_item_code before insert on items
for each row when (new.code is null) execute function gen_item_code();
```

```sql
-- ── 2. Historial automático de cambios ────────────────────────
create or replace function log_item_event() returns trigger
language plpgsql as $$
declare v_changes jsonb := '{}'; v_type event_type;
begin
  if tg_op = 'INSERT' then
    insert into item_events (item_id, store_id, actor_id, type, to_status)
    values (new.id, new.store_id, auth.uid(), 'created', new.status);
    return new;
  end if;

  -- Detecta qué campos cambiaron
  if new.price_cents is distinct from old.price_cents then
    v_changes := v_changes || jsonb_build_object('price_cents',
                 jsonb_build_array(old.price_cents, new.price_cents));
  end if;
  if new.name is distinct from old.name then
    v_changes := v_changes || jsonb_build_object('name',
                 jsonb_build_array(old.name, new.name));
  end if;
  -- (… mismo patrón para brand_id, size_id, category_id, color_id, description)

  if new.status is distinct from old.status then
    v_type := case new.status
                when 'reserved' then 'reserved'::event_type
                when 'sold'     then 'sold'::event_type
                else 'status_changed'::event_type end;
    insert into item_events (item_id, store_id, actor_id, type,
                             from_status, to_status, payload)
    values (new.id, new.store_id, auth.uid(), v_type,
            old.status, new.status, v_changes);
  elsif v_changes <> '{}' then
    insert into item_events (item_id, store_id, actor_id, type, payload)
    values (new.id, new.store_id, auth.uid(), 'updated', v_changes);
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger t_log_item_event
after insert or update on items
for each row execute function log_item_event();
```

```sql
-- ── 3. Al reservar, congela los días configurados ─────────────
create or replace function set_reserve_snapshot() returns trigger
language plpgsql as $$
begin
  if new.status = 'reserved' and (old.status is distinct from 'reserved') then
    new.reserved_at := coalesce(new.reserved_at, now());
    new.reserve_days_snapshot := coalesce(
      new.reserve_days_snapshot,
      (select reserve_days from stores where id = new.store_id)
    );
  elsif new.status <> 'reserved' then
    new.reserved_at := null;
    new.reserve_days_snapshot := null;
    new.reserved_for_name := null;
    new.reserved_for_phone := null;
  end if;

  if new.status = 'sold' and old.status is distinct from 'sold' then
    new.sold_at := coalesce(new.sold_at, now());
    new.sold_price_cents := coalesce(new.sold_price_cents, new.price_cents);
  end if;
  return new;
end $$;

create trigger t_set_reserve_snapshot before update on items
for each row execute function set_reserve_snapshot();
```

```sql
-- ── 4. Job: vencer reservas cada 15 minutos ───────────────────
create or replace function expire_reservations() returns integer
language plpgsql security definer as $$
declare v_count integer;
begin
  with expired as (
    update items
       set status = 'available'
     where status = 'reserved'
       and reserve_expires_at <= now()
       and deleted_at is null
    returning id, store_id, code, name
  ), notified as (
    insert into notifications (store_id, item_id, type, title, body)
    select store_id, id, 'reservation_expired',
           'Reserva vencida',
           coalesce(name, code) || ' volvió a estar disponible'
    from expired
    returning 1
  )
  select count(*) into v_count from notified;
  return v_count;
end $$;

select cron.schedule('expire-reservations', '*/15 * * * *',
                     $$select expire_reservations()$$);
```

```sql
-- ── 5. Vista de lectura: estado SIEMPRE correcto ──────────────
-- Aunque el cron no haya corrido todavía, aquí la reserva vencida
-- ya se ve como 'available'.
create view items_view as
select
  i.*,
  case
    when i.status = 'reserved' and i.reserve_expires_at <= now()
      then 'available'::item_status
    else i.status
  end as effective_status,
  case
    when i.status = 'reserved'
      then greatest(0, ceil(extract(epoch from (i.reserve_expires_at - now())) / 86400))::int
  end as days_left,
  b.name  as brand_name,
  s.label as size_label,
  c.name  as category_name,
  co.name as color_name,
  (select jsonb_agg(jsonb_build_object('path', p.storage_path, 'pos', p.position)
                    order by p.position)
     from item_photos p where p.item_id = i.id) as photos
from items i
left join brands     b  on b.id  = i.brand_id
left join sizes      s  on s.id  = i.size_id
left join categories c  on c.id  = i.category_id
left join colors     co on co.id = i.color_id
where i.deleted_at is null;
```

```sql
-- ── 6. Estadísticas del panel en UNA sola consulta ────────────
create or replace function dashboard_stats(p_store_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total',            count(*),
    'available',        count(*) filter (where effective_status = 'available'),
    'reserved',         count(*) filter (where effective_status = 'reserved'),
    'sold',             count(*) filter (where effective_status = 'sold'),
    'hidden',           count(*) filter (where effective_status = 'hidden'),
    'inventory_value',  coalesce(sum(price_cents) filter (
                          where effective_status in ('available','reserved')), 0),
    'sold_value',       coalesce(sum(sold_price_cents) filter (
                          where effective_status = 'sold'), 0),
    'expiring_today',   count(*) filter (
                          where status = 'reserved'
                            and reserve_expires_at::date = current_date),
    'expired',          count(*) filter (
                          where status = 'reserved' and reserve_expires_at <= now()),
    'added_this_week',  count(*) filter (where created_at >= date_trunc('week', now()))
  )
  from items_view where store_id = p_store_id;
$$;
```

### 3.5 Políticas RLS (Row Level Security)

**Regla:** nadie ve ni toca datos de una tienda a la que no pertenece. Esto se garantiza en la base de datos, no en el frontend.

```sql
alter table stores        enable row level security;
alter table store_members enable row level security;
alter table items         enable row level security;
alter table item_photos   enable row level security;
alter table item_events   enable row level security;
alter table notifications enable row level security;
alter table brands        enable row level security;  -- ídem categories, sizes, colors

-- Helper: ¿a qué tiendas pertenezco?
create or replace function my_store_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select store_id from store_members where user_id = auth.uid();
$$;

create or replace function is_owner(p_store uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members
                 where store_id = p_store and user_id = auth.uid() and role = 'owner');
$$;

-- Prendas: cualquier miembro lee y escribe
create policy items_select on items for select
  using (store_id in (select my_store_ids()));
create policy items_insert on items for insert
  with check (store_id in (select my_store_ids()));
create policy items_update on items for update
  using (store_id in (select my_store_ids()));

-- Borrado definitivo (vaciar papelera): SOLO el dueño
create policy items_delete on items for delete
  using (is_owner(store_id));

-- Ajustes de la tienda: SOLO el dueño modifica
create policy stores_select on stores for select
  using (id in (select my_store_ids()));
create policy stores_update on stores for update
  using (is_owner(id));

-- Historial: solo lectura desde el cliente; lo escriben los triggers
create policy events_select on item_events for select
  using (store_id in (select my_store_ids()));
```

**Matriz de permisos por rol:**

| Acción | Dueño | Vendedor |
|---|:---:|:---:|
| Ver inventario | ✅ | ✅ |
| Crear / editar prenda | ✅ | ✅ |
| Cambiar estado, reservar, vender | ✅ | ✅ |
| Compartir | ✅ | ✅ |
| Enviar a papelera | ✅ | ✅ |
| Vaciar papelera (borrado definitivo) | ✅ | ❌ |
| Ver panel de estadísticas y valor del inventario | ✅ | ⚙️ configurable |
| Editar ajustes (días de reserva, moneda, plantilla) | ✅ | ❌ |
| Gestionar catálogos (marcas, tallas, categorías) | ✅ | ✅ (solo crear) |
| Invitar / eliminar usuarios | ✅ | ❌ |

### 3.6 Almacenamiento de imágenes

**Bucket:** `item-photos` — **privado** (no público). Las imágenes se sirven con URLs firmadas o vía el CDN autenticado de Supabase.

**Ruta:** `{store_id}/{item_id}/{position}.jpg`
Incluir `store_id` en la ruta permite que la política de Storage lo verifique directamente.

```sql
create policy "leer fotos de mi tienda" on storage.objects for select
  using (bucket_id = 'item-photos'
         and (storage.foldername(name))[1]::uuid in (select my_store_ids()));

create policy "subir fotos a mi tienda" on storage.objects for insert
  with check (bucket_id = 'item-photos'
              and (storage.foldername(name))[1]::uuid in (select my_store_ids()));
```

**Tamaños servidos** (transformación de imagen de Supabase, cacheada en CDN):

| Uso | Ancho | Calidad | Peso aprox. |
|---|---|---|---|
| Miniatura de la cuadrícula | 400 px | 70 | ~25 KB |
| Ficha de prenda | 1080 px | 80 | ~120 KB |
| Compartir en WhatsApp | 1440 px | 85 | ~250 KB |
| Original archivado | 1600 px | 82 | ~300 KB |

La compresión ocurre **en el navegador antes de subir**: una foto de iPhone de 4 MB sube como ~300 KB. Eso es la diferencia entre 8 segundos y 1 segundo con datos móviles, y reduce el coste de almacenamiento 10×.

---

## 4. Flujo de usuarios

### 4.1 Mapa de navegación

```
                         ┌─────────────┐
                         │   /login    │  Magic link o Google
                         └──────┬──────┘
                                │ sesión válida (middleware)
                                ▼
        ╔═══════════════════════════════════════════════════╗
        ║          Barra inferior fija (4 pestañas)         ║
        ╚═══════════════════════════════════════════════════╝
             │            │            │             │
     ┌───────▼───┐  ┌─────▼────┐  ┌────▼────┐  ┌─────▼─────┐
     │ INVENTARIO│  │  PANEL   │  │ ALERTAS │  │  AJUSTES  │
     │  (inicio) │  │  (stats) │  │ (badge) │  │           │
     └─────┬─────┘  └──────────┘  └─────────┘  └─────┬─────┘
           │                                          │
           │  [+] FAB flotante                        ├─▶ Tienda
           │       │                                  ├─▶ Reservas
           │       ▼                                  ├─▶ Compartir
           │  ┌──────────┐                            ├─▶ Categorías
           │  │  /nueva  │  Alta rápida               ├─▶ Marcas
           │  └────┬─────┘                            ├─▶ Tallas
           │       │ guardar                          ├─▶ Equipo
           ▼       ▼                                  └─▶ Papelera
     ┌─────────────────────┐
     │  /prenda/PR-000128  │  Ficha
     └──┬────┬────┬────┬───┘
        │    │    │    │
        │    │    │    └─▶ [Eliminar]  → confirmación → papelera
        │    │    └──────▶ [Duplicar]  → /nueva precargada
        │    └───────────▶ [Editar]    → /prenda/[code]/editar
        └────────────────▶ [COMPARTIR] → hoja de compartir → WhatsApp
```

### 4.2 Flujo A — Alta de prenda (el crítico, ≤ 20 s)

```
┌────────────────────────────────────────────────────────────┐
│ 1. Toca [+] desde cualquier pantalla                       │
│    → Hoja modal a pantalla completa. Foco en la 1ª foto.   │
├────────────────────────────────────────────────────────────┤
│ 2. Toca el recuadro de foto                                │
│    → Menú nativo iOS: [Cámara] [Fototeca] [Archivos]       │
│    → Se pueden seleccionar 3 fotos de golpe desde galería  │
├────────────────────────────────────────────────────────────┤
│ 3. Aparecen las miniaturas al instante (preview local)     │
│    ↻ Subida en segundo plano, barra fina de progreso       │
├────────────────────────────────────────────────────────────┤
│ 4. Talla → chips grandes: [XS][S][M][L][XL][XXL] · un toque│
├────────────────────────────────────────────────────────────┤
│ 5. Precio → teclado numérico grande, símbolo ya puesto     │
├────────────────────────────────────────────────────────────┤
│ 6. (Opcional, colapsado tras "Más detalles")               │
│    Marca (autocompletar) · Categoría · Color · Nombre ·    │
│    Descripción                                             │
├────────────────────────────────────────────────────────────┤
│ 7. [Guardar]  ó  [Guardar y compartir]  ← 2 botones        │
│    → Toast "PR-000128 guardada" + navega a la ficha        │
└────────────────────────────────────────────────────────────┘

Camino alternativo: "Guardar y seguir" (para cargar un lote de 20 prendas
seguidas) mantiene el formulario abierto y conserva marca/categoría/talla
de la anterior. Cargar 20 prendas de un fardo pasa de 20 flujos completos
a 20 × (foto + precio).
```

**Manejo de errores en este flujo:**

| Situación | Comportamiento |
|---|---|
| Sin conexión al guardar | Se guarda en la cola local. Chip "1 pendiente de subir". Se sincroniza al recuperar red. Nunca se pierde. |
| Una foto falla al subir | La prenda se guarda igual. La ficha muestra "1 foto no subió · Reintentar". |
| Foto HEIC de iPhone | Se convierte a JPEG en el navegador, transparente para el usuario. |
| El usuario cierra la app a media carga | Borrador autoguardado. Al volver: "Tienes una prenda sin terminar · ¿Continuar?" |
| Precio vacío | El botón Guardar está deshabilitado y el campo se resalta. Sin diálogos de error. |

### 4.3 Flujo B — Compartir en WhatsApp

Este flujo merece atención especial porque hay una limitación técnica real que debemos resolver bien.

```
[COMPARTIR] en la ficha
        │
        ▼
┌───────────────────────────────────────────┐
│ Hoja de compartir (bottom sheet)          │
│                                           │
│  Vista previa del mensaje (editable)      │
│  ┌─────────────────────────────────────┐  │
│  │ 🔥 NUEVO INGRESO 🔥                 │  │
│  │                                     │  │
│  │ Marca: Nike                         │  │
│  │ Talla: L                            │  │
│  │ Estado: Disponible                  │  │
│  │ Precio: S/50                        │  │
│  │                                     │  │
│  │ Solo una unidad.                    │  │
│  │ Reserva desde S/10.                 │  │
│  │ Escríbeme por interno.              │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  Fotos:  [✓1] [✓2] [✓3]                   │
│                                           │
│  [ 📤 Compartir con fotos ]  ← principal  │
│  [ 💬 Solo texto a WhatsApp ]             │
│  [ 📋 Copiar texto ]                      │
└───────────────────────────────────────────┘
```

**La limitación:** el estándar Web Share API Level 2 permite compartir archivos **y** texto, pero cuando el destino es WhatsApp en iOS, la app receptora frecuentemente **descarta el texto y conserva solo las imágenes**. Es un comportamiento de WhatsApp, no algo que podamos arreglar desde el código.

**Nuestra solución en tres capas:**

1. **Copiar al portapapeles siempre, antes de abrir la hoja de compartir.** Si WhatsApp pierde el texto, el usuario hace un pegado largo en el campo del chat. Se lo avisamos con un toast discreto: *"Texto copiado — pégalo si no aparece"*.
2. **Opción "Solo texto a WhatsApp":** abre `https://wa.me/?text=...` con el mensaje garantizado. Útil cuando la foto no es imprescindible.
3. **Opción avanzada (Fase 4): "Imagen única con datos".** Genera en el navegador (Canvas) **una sola imagen** que combina las fotos en collage con el precio, la talla y la marca superpuestos. Se comparte como una imagen: el mensaje viaja *dentro* de la foto y no se puede perder. Además queda mucho más profesional en el grupo.

**Fallback de escritorio:** si `navigator.canShare({files})` no existe (Chrome de escritorio), se muestra "Descargar fotos + copiar texto" y `web.whatsapp.com`.

**Plantilla con variables** (editable en Ajustes):

| Variable | Se reemplaza por | Si está vacío |
|---|---|---|
| `{{marca}}` | Nike | se omite la línea completa |
| `{{talla}}` | L | se omite la línea |
| `{{precio}}` | S/50 | — (obligatorio) |
| `{{estado}}` | Disponible | — |
| `{{codigo}}` | PR-000128 | — |
| `{{nombre}}` | Casaca cortavientos | se omite |
| `{{descripcion}}` | … | se omite |
| `{{categoria}}` | Casacas | se omite |
| `{{color}}` | Negro | se omite |
| `{{adelanto}}` | S/10 | — |
| `{{tienda}}` | Ropa Americana JS | — |

Las líneas cuyo único contenido es una variable vacía **desaparecen**, para que nunca se envíe "Marca: " a un grupo.

### 4.4 Flujo C — Ciclo de reserva

```
DISPONIBLE ──[Reservar]──▶ RESERVADA ──┬──[Vender]──────▶ VENDIDA
    ▲                        │         │
    │                        │         └──[Cancelar]───┐
    │                        │                         │
    │                        │ 5 días sin acción       │
    │                        ▼                         │
    └──────── automático ────┴─────────────────────────┘
              + notificación

DISPONIBLE ──[Ocultar]──▶ OCULTA ──[Mostrar]──▶ DISPONIBLE
DISPONIBLE ──[Vender]───▶ VENDIDA ──[Deshacer venta]──▶ DISPONIBLE
```

**Al tocar "Reservar":** se abre una hoja mínima con un campo opcional *"¿Para quién?"* (nombre o teléfono) y confirma. Un solo toque más si no quieres poner nombre. El contador arranca en ese instante.

**Cómo se ve el tiempo restante:**

| Estado | Indicador |
|---|---|
| 5 – 3 días | 🟡 `Vence en 4 días` |
| 2 – 1 días | 🟠 `Vence mañana` |
| Hoy | 🔴 `Vence hoy · 6 h` |
| Vencida (sin procesar aún) | ⚪️ `Reserva vencida · volvió a disponible` |

**Al vencer:** la prenda vuelve a `Disponible`, se crea la notificación, aparece el badge rojo en la pestaña Alertas y —si el usuario dio permiso— se envía una notificación push (Fase 4).

### 4.5 Flujo D — Búsqueda y filtros

```
Cuadrícula de inventario
     │
     ├─ Barra de búsqueda (siempre visible, pegada arriba)
     │    · Escribe → resultados en vivo con 250 ms de debounce
     │    · Reconoce automáticamente el tipo de consulta:
     │        "PR-000128" o "128"  → busca por código
     │        "50" o "S/50"        → busca por precio
     │        "L", "XL", "32"      → busca por talla
     │        "nike", "casaca"     → texto completo (tolera errores)
     │
     └─ Fila de filtros rápidos (chips, scroll horizontal)
          [Todo] [🟢 Disponibles] [🟡 Reservadas] [🔴 Vendidas]
          [✨ Nuevas] [Marca ▾] [Talla ▾] [Precio ▾] [Categoría ▾]
                                                          │
                                                    [ Filtros ▾ ]
                                                          ▼
                                        Hoja con todos los filtros
                                        combinables + [Limpiar todo]
```

Los filtros activos se reflejan en la URL (`?estado=disponible&marca=nike`), así que la vista se puede compartir, recargar y volver atrás sin perderla.

### 4.6 Flujo E — Primera vez (onboarding)

```
1. Login (magic link al correo — sin contraseña que recordar)
2. "¿Cómo se llama tu tienda?"          → nombre
3. "¿Qué moneda usas?"                   → S/ (preseleccionado por país)
4. "¿Cuántos días dura una reserva?"     → 5 (preseleccionado)
5. Listo → se crea la tienda con catálogos precargados:
     Categorías: Casacas, Polos, Camisas, Pantalones, Jeans,
                 Shorts, Vestidos, Zapatillas, Accesorios
     Tallas:     XS S M L XL XXL · 28–40 · calzado 35–45
     Colores:    12 básicos
6. Pantalla vacía del inventario con una flecha grande al botón [+]:
     "Sube tu primera prenda"
```

Tres preguntas, todas con valor por defecto. Se puede terminar en 15 segundos tocando "Continuar" tres veces.

---

## 5. Diseño de cada pantalla

### 5.1 Sistema de diseño

**Filosofía:** la interfaz debe desaparecer. Sin sombras decorativas, sin degradados, sin animaciones que no comuniquen algo. El contenido son las prendas: las fotos mandan y todo lo demás se aparta.

**Color**

| Rol | Claro | Oscuro | Uso |
|---|---|---|---|
| Fondo | `#FFFFFF` | `#0B0B0C` | |
| Superficie | `#F7F7F8` | `#161618` | tarjetas, hojas |
| Borde | `#E5E5E7` | `#2A2A2E` | separadores de 1 px |
| Texto principal | `#0B0B0C` | `#F5F5F7` | |
| Texto secundario | `#6B6B70` | `#9A9AA0` | |
| Acento (acción) | `#111111` | `#F5F5F7` | botones primarios: negro/blanco, no un color de marca |
| 🟢 Disponible | `#16A34A` | `#22C55E` | |
| 🟡 Reservada | `#EAB308` | `#FACC15` | |
| 🔴 Vendida | `#DC2626` | `#EF4444` | |
| ⚫ Oculta | `#71717A` | `#71717A` | |

El acento es **neutro (negro)** a propósito: los cuatro colores de estado son la única información cromática de la pantalla, así se leen de un vistazo sin competir con un azul o morado de marca.

**Tipografía:** fuente del sistema (`-apple-system`, SF Pro en iPhone). Carga instantánea, se ve nativa, cero KB de descarga.

| Estilo | Tamaño / peso | Uso |
|---|---|---|
| Display | 32 / 700 | precio en la ficha |
| Título | 22 / 600 | encabezados de pantalla |
| Cuerpo | 17 / 400 | por defecto (tamaño iOS) |
| Etiqueta | 15 / 500 | campos de formulario |
| Pie | 13 / 400 | metadatos, fechas |

**Espaciado:** escala de 4 px (4, 8, 12, 16, 24, 32, 48). Margen lateral de pantalla: 16 px.

**Radios:** 12 px tarjetas · 10 px botones y campos · 20 px hojas modales · 999 px chips.

**Objetivos táctiles:** mínimo 44 × 44 pt siempre. Sin excepciones.

**Movimiento:** 150–200 ms, `cubic-bezier(0.2, 0, 0, 1)`. Solo transiciones que expliquen de dónde viene o adónde va algo. Respeta `prefers-reduced-motion`.

**Zonas seguras:** `env(safe-area-inset-bottom)` en la barra inferior para el iPhone con Face ID. La barra de búsqueda usa `position: sticky` con desenfoque de fondo.

### 5.2 Catálogo de pantallas

| # | Pantalla | Ruta | Propósito | Renderizado |
|---|---|---|---|---|
| 1 | Login | `/login` | Entrar por magic link o Google | Cliente |
| 2 | Onboarding | `/bienvenida` | Crear la tienda en 3 pasos | Cliente |
| 3 | **Inventario** | `/` | Cuadrícula, búsqueda, filtros | RSC + cliente |
| 4 | **Ficha de prenda** | `/prenda/[code]` | Todo sobre una prenda + acciones | RSC |
| 5 | **Alta rápida** | `/nueva` | Subir prenda en ≤ 20 s | Cliente |
| 6 | Editar | `/prenda/[code]/editar` | Mismo formulario, precargado | Cliente |
| 7 | Hoja de compartir | modal | Vista previa y envío | Cliente |
| 8 | **Panel** | `/panel` | Estadísticas del negocio | RSC |
| 9 | Alertas | `/alertas` | Reservas por vencer y vencidas | RSC |
| 10 | Ajustes | `/ajustes` | Índice de configuración | RSC |
| 10a | · Tienda | `/ajustes/tienda` | Nombre, moneda, prefijo | Cliente |
| 10b | · Reservas | `/ajustes/reservas` | Días de reserva | Cliente |
| 10c | · Compartir | `/ajustes/compartir` | Plantilla con vista previa | Cliente |
| 10d | · Catálogos | `/ajustes/categorias` etc. | Marcas, tallas, categorías, colores | Cliente |
| 10e | · Equipo | `/ajustes/equipo` | Invitar y gestionar usuarios | Cliente |
| 10f | · Papelera | `/ajustes/papelera` | Restaurar o borrar definitivo | Cliente |

### 5.3 Detalle de las pantallas clave

#### Pantalla 3 — Inventario (pantalla de inicio)

**Objetivo:** ver todo el stock y llegar a cualquier prenda en menos de 3 segundos.

- **Cuadrícula:** 2 columnas en iPhone, 3 en iPhone Plus/Max horizontal, 4–6 en escritorio. Relación de aspecto 3:4 (vertical, como la ropa).
- **Tarjeta:** foto + punto de estado en la esquina superior derecha + precio en negrita + marca · talla en gris. Nada más. Si está reservada, una franja inferior amarilla con `Vence en 3 d`.
- **Rendimiento:** scroll virtualizado (`@tanstack/react-virtual`) + paginación por cursor de 30 en 30. Con 10 000 prendas el scroll sigue a 60 fps y la memoria no crece.
- **Imágenes:** `next/image` con `blurhash` como marcador de posición y `loading="lazy"`. Sin saltos de maquetación.
- **Estado vacío:** distinto si es tienda nueva ("Sube tu primera prenda" + flecha al `+`) o si es una búsqueda sin resultados ("Sin resultados para «adidas» · Limpiar filtros").
- **Pull to refresh** nativo.
- **Toque largo en una tarjeta:** menú contextual rápido — Compartir · Reservar · Marcar vendida · Duplicar. Cambiar el estado de 5 prendas sin abrir ninguna ficha.

#### Pantalla 4 — Ficha de prenda

**Objetivo:** toda la información y las acciones, sin scroll para lo importante.

Orden de arriba abajo:

1. **Carrusel de fotos** a sangre completa, deslizable, con puntos indicadores. Toque = pantalla completa con zoom.
2. **Insignia de estado** superpuesta arriba a la izquierda.
3. **Precio** en 32 px, negrita. Es el dato que más se consulta.
4. **Nombre** (si existe) y **código** en gris pequeño, con toque para copiar.
5. **Fila de datos:** Marca · Talla · Categoría · Color, como chips. Cada chip es tocable y lleva al inventario filtrado por ese valor.
6. **Bloque de reserva** (solo si está reservada): fondo amarillo suave — *"Reservada el 25 jul, 14:30 · Vence en 3 días (30 jul) · Para: María"* + botones `Vender` y `Cancelar reserva`.
7. **Descripción**, si existe.
8. **Fechas:** publicada el… · última modificación…
9. **Historial de cambios:** lista colapsada ("Ver historial · 6 cambios") con línea de tiempo: `Hoy 14:30 — Reservada por Jose` / `24 jul — Precio S/60 → S/50` / `22 jul — Creada`.
10. **Botones secundarios** en fila: `Editar` · `Duplicar` · `Eliminar`.
11. **Barra de acción fija abajo** (siempre visible, sobre la zona segura):
    `[ 📤 COMPARTIR ]` ocupando el 65 % del ancho + `[ Estado ▾ ]` el 35 %.

El botón Compartir es el elemento más grande y prominente de toda la aplicación. Es intencional: es la acción que genera ingresos.

#### Pantalla 5 — Alta rápida

**Objetivo:** ≤ 20 segundos. Cada elemento se justifica contra ese número.

```
Estructura vertical:
  [Cancelar]                              [Guardar]   ← barra superior fija
  ────────────────────────────────────────────────
  Fotos: 3 recuadros en fila (el 1º grande, 2º y 3º más pequeños)
  ────────────────────────────────────────────────
  TALLA    chips grandes en 2 filas, un toque
  PRECIO   campo grande, teclado numérico, símbolo fijo
  ────────────────────────────────────────────────
  ▸ Más detalles          (colapsado por defecto)
      Marca · Categoría · Color · Nombre · Descripción
  ────────────────────────────────────────────────
  [ Guardar ]  [ Guardar y compartir ]     ← barra inferior fija
  Guardar y seguir cargando ⌄
```

Detalles que hacen la diferencia:

- El teclado **numérico** (`inputMode="decimal"`) para el precio evita dos toques.
- Los chips de talla evitan abrir un selector desplegable (que en iOS es una rueda lenta).
- El campo de marca es un `combobox` con las marcas ordenadas por frecuencia de uso: las 6 que más usas aparecen como chips antes de escribir.
- "Más detalles" está cerrado porque **el 80 % de las prendas se publican solo con foto, talla y precio**.
- El borrador se guarda en `localStorage` en cada cambio, con `debounce` de 500 ms.

#### Pantalla 8 — Panel

**Objetivo:** entender el estado del negocio en 5 segundos, sin interpretar gráficos.

- **Fila superior de 4 tarjetas** (2×2 en móvil): Total · Disponibles · Reservadas · Vendidas. Números grandes, etiqueta pequeña. Cada tarjeta es tocable y lleva al inventario ya filtrado.
- **Tarjeta destacada: Valor del inventario.** Suma de las prendas disponibles + reservadas. Es el número que más importa. Debajo, en pequeño: "vendido este mes: S/…".
- **Bloque de atención** (solo si hay algo): 🔴 `2 reservas vencidas` · 🟠 `1 vence hoy`. Tocable, lleva a Alertas.
- **Actividad:** "8 prendas agregadas esta semana" + minigráfico de barras de 7 días.
- Sin gráficos de tarta, sin dashboards de analítica. Números grandes que se leen de un vistazo.

#### Pantalla 10b — Ajustes › Reservas

Un único control: un stepper grande `[ − ]  5 días  [ + ]` con un texto explicativo debajo:

> *"Las reservas nuevas durarán 5 días. Las reservas que ya están activas mantienen los días con los que se crearon."*

Esa frase evita la duda más probable del usuario sobre esta pantalla.

---

## 6. Wireframes

> Wireframes de baja fidelidad a escala de iPhone (390 × 844 pt). Definen estructura y jerarquía, no el acabado visual final.

### 6.1 Inventario (inicio)

```
┌──────────────────────────────────────┐
│ ●●●                          9:41  ▮ │
├──────────────────────────────────────┤
│                                      │
│  Ropa Americana JS            🔔²    │  ← badge de alertas
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🔍  Buscar prenda, marca, código│ │  ← sticky al hacer scroll
│  └────────────────────────────────┘  │
│                                      │
│  ⟨ [Todo] [🟢 Disp] [🟡 Res] [🔴 Ven]│  ← chips, scroll horizontal
│    [✨Nuevas] [Marca▾] [Talla▾]   ⟩  │
│                                      │
│  128 prendas · S/6,240               │
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │              │🟢│              │🟡│
│  │              │  │              │  │
│  │    FOTO      │  │    FOTO      │  │
│  │              │  │              │  │
│  │              │  │              │  │
│  ├──────────────┤  ├──────────────┤  │
│  │ S/50         │  │ S/85         │  │
│  │ Nike · L     │  │ Levi's · 32  │  │
│  │              │  │▓ Vence en 3d ▓│  │
│  └──────────────┘  └──────────────┘  │
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │              │🔴│              │🟢│
│  │    FOTO      │  │    FOTO      │  │
│  │              │  │              │  │
│  ├──────────────┤  ├──────────────┤  │
│  │ S/40  VENDIDA│  │ S/120        │  │
│  │ Adidas · M   │  │ NorthFace· L │  │
│  └──────────────┘  └──────────────┘  │
│                                 ╭──╮ │
│                                 │ +│ │  ← FAB, 64pt, sombra suave
│                                 ╰──╯ │
├──────────────────────────────────────┤
│  ▣        ◷        🔔²       ⚙       │  ← barra inferior
│ Invent.  Panel   Alertas   Ajustes   │
└──────────────────────────────────────┘
```

### 6.2 Ficha de prenda

```
┌──────────────────────────────────────┐
│ ‹ Atrás                        ⋯     │
├──────────────────────────────────────┤
│┌────────────────────────────────────┐│
││ 🟡 Reservada                       ││  ← insignia superpuesta
││                                    ││
││                                    ││
││            FOTO GRANDE             ││  ← carrusel, 3:4
││          (deslizar 1/3)            ││
││                                    ││
││                                    ││
││             ● ○ ○                  ││
│└────────────────────────────────────┘│
│                                      │
│  S/50                                │  ← 32pt bold
│  Casaca cortavientos                 │
│  PR-000128  ⧉                        │  ← toque = copiar
│                                      │
│  [Nike]  [Talla L]  [Casacas] [Negro]│  ← chips → filtran
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🟡 Reservada el 25 jul, 14:30    │ │
│ │    Vence en 3 días (30 jul)      │ │
│ │    Para: María                   │ │
│ │    [ Vender ]  [ Cancelar ]      │ │
│ └──────────────────────────────────┘ │
│                                      │
│  Casaca en excelente estado, sin     │
│  detalles. Ideal para entretiempo.   │
│                                      │
│  Publicada: 22 jul 2026              │
│  Modificada: hoy, 14:30              │
│                                      │
│  ▸ Ver historial · 6 cambios         │
│                                      │
│  [ Editar ] [ Duplicar ] [ Eliminar ]│
│                                      │
├──────────────────────────────────────┤
│ ┌───────────────────────┐ ┌────────┐ │  ← barra fija inferior
│ │   📤  COMPARTIR       │ │Estado ▾│ │
│ └───────────────────────┘ └────────┘ │
└──────────────────────────────────────┘
```

### 6.3 Alta rápida

```
┌──────────────────────────────────────┐
│ Cancelar      Nueva prenda    Guardar│
├──────────────────────────────────────┤
│                                      │
│ ┌─────────────┐ ┌──────┐ ┌──────┐    │
│ │             │ │      │ │      │    │
│ │   📷        │ │  +   │ │  +   │    │
│ │  Añadir     │ │      │ │      │    │
│ │   foto      │ │      │ │      │    │
│ │             │ │      │ │      │    │
│ └─────────────┘ └──────┘ └──────┘    │
│  ▓▓▓▓▓▓░░░ subiendo                  │  ← progreso, no bloquea
│                                      │
│  TALLA                               │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐      │
│  │ XS ││ S  ││ M  ││ L ✓││ XL │      │  ← 48pt de alto
│  └────┘└────┘└────┘└────┘└────┘      │
│  ┌────┐┌────┐┌─────────────┐         │
│  │XXL ││ 32 ││   Otra…     │         │
│  └────┘└────┘└─────────────┘         │
│                                      │
│  PRECIO                              │
│  ┌────────────────────────────────┐  │
│  │ S/  50                         │  │  ← 28pt, teclado numérico
│  └────────────────────────────────┘  │
│                                      │
│  ▸ Más detalles                      │  ← colapsado
│                                      │
│                                      │
├──────────────────────────────────────┤
│ ┌────────────┐ ┌───────────────────┐ │
│ │  Guardar   │ │ Guardar y compartir││
│ └────────────┘ └───────────────────┘ │
│      Guardar y seguir cargando ⌄     │
└──────────────────────────────────────┘
```

### 6.4 Hoja de compartir

```
┌──────────────────────────────────────┐
│░░░░░░░░ (fondo atenuado) ░░░░░░░░░░░░│
│                                      │
│ ╭────────────────────────────────╮   │
│ │            ▔▔▔▔                │   │  ← asa de arrastre
│ │  Compartir prenda              │   │
│ │                                │   │
│ │ ┌────────────────────────────┐ │   │
│ │ │ 🔥 NUEVO INGRESO 🔥        │ │   │
│ │ │                            │ │   │
│ │ │ Marca: Nike                │ │   │
│ │ │ Talla: L                   │ │   │
│ │ │ Estado: Disponible         │ │   │
│ │ │ Precio: S/50               │ │   │
│ │ │                            │ │   │
│ │ │ Solo una unidad.           │ │   │
│ │ │ Reserva desde S/10.        │ │   │
│ │ │ Escríbeme por interno.     │ │   │
│ │ │                     ✎ Editar│ │   │
│ │ └────────────────────────────┘ │   │
│ │                                │   │
│ │ Fotos a enviar                 │   │
│ │ [▣✓] [▣✓] [▢ ]                 │   │
│ │                                │   │
│ │ ┌────────────────────────────┐ │   │
│ │ │  📤  Compartir con fotos   │ │   │  ← principal
│ │ └────────────────────────────┘ │   │
│ │ ┌────────────────────────────┐ │   │
│ │ │  💬  Solo texto a WhatsApp │ │   │
│ │ └────────────────────────────┘ │   │
│ │       📋 Copiar texto          │   │
│ ╰────────────────────────────────╯   │
└──────────────────────────────────────┘
```

### 6.5 Panel

```
┌──────────────────────────────────────┐
│  Panel                               │
├──────────────────────────────────────┤
│                                      │
│ ┌─────────────────────────────────┐  │
│ │ VALOR DEL INVENTARIO            │  │
│ │                                 │  │
│ │  S/ 6,240                       │  │  ← 40pt
│ │  103 prendas en stock           │  │
│ │  Vendido este mes: S/1,850      │  │
│ └─────────────────────────────────┘  │
│                                      │
│ ┌──────────────┐  ┌───────────────┐  │
│ │  128         │  │   89          │  │
│ │  Total       │  │ 🟢 Disponibles│  │
│ └──────────────┘  └───────────────┘  │
│ ┌──────────────┐  ┌───────────────┐  │
│ │  14          │  │   25          │  │
│ │🟡 Reservadas │  │ 🔴 Vendidas   │  │
│ └──────────────┘  └───────────────┘  │
│                                      │
│ ┌─────────────────────────────────┐  │
│ │ ⚠️  Requiere atención        ›  │  │
│ │  🔴 2 reservas vencidas         │  │
│ │  🟠 1 vence hoy                 │  │
│ └─────────────────────────────────┘  │
│                                      │
│  ESTA SEMANA                         │
│  8 prendas agregadas                 │
│   ▁ ▃ ▂ ▅ █ ▃ ▁                      │
│   L  M  M  J  V  S  D                │
│                                      │
├──────────────────────────────────────┤
│  ▣        ◷        🔔       ⚙        │
└──────────────────────────────────────┘
```

### 6.6 Ajustes (índice)

```
┌──────────────────────────────────────┐
│  Ajustes                             │
├──────────────────────────────────────┤
│                                      │
│  TIENDA                              │
│  ┌─────────────────────────────────┐ │
│  │ 🏪  Datos de la tienda       ›  │ │
│  │ 💰  Moneda            S/ PEN ›  │ │
│  │ ⏱  Días de reserva      5 días ›│ │
│  │ 💬  Mensaje para compartir   ›  │ │
│  └─────────────────────────────────┘ │
│                                      │
│  CATÁLOGOS                           │
│  ┌─────────────────────────────────┐ │
│  │ 🏷  Categorías             9  ›  │ │
│  │ 👟  Marcas                34  ›  │ │
│  │ 📏  Tallas                22  ›  │ │
│  │ 🎨  Colores               12  ›  │ │
│  └─────────────────────────────────┘ │
│                                      │
│  EQUIPO                              │
│  ┌─────────────────────────────────┐ │
│  │ 👥  Usuarios               2  ›  │ │
│  └─────────────────────────────────┘ │
│                                      │
│  DATOS                               │
│  ┌─────────────────────────────────┐ │
│  │ 🗑  Papelera               3  ›  │ │
│  │ ⬇️  Exportar inventario (CSV)  › │ │
│  └─────────────────────────────────┘ │
│                                      │
│  Cerrar sesión                       │
│  Percha v1.0                         │
└──────────────────────────────────────┘
```

---

## 7. Experiencia de usuario

### 7.1 Reglas de interacción

| Regla | Implementación |
|---|---|
| **Nada bloquea** | Ninguna acción muestra un spinner a pantalla completa. Todo es optimista con reversión si falla. |
| **Confirmar solo lo irreversible** | Eliminar pide confirmación. Cambiar estado no: se hace y se ofrece "Deshacer" durante 5 s en el toast. |
| **Respuesta táctil** | Vibración ligera (`navigator.vibrate` / Haptics en RN) al guardar, cambiar estado y compartir. |
| **Errores en contexto** | El mensaje aparece junto al campo, no en un diálogo. |
| **Se recuerda dónde estabas** | Volver atrás desde una ficha restaura la posición de scroll y los filtros. |

### 7.2 Accesibilidad

- Contraste AA mínimo (4.5:1) en todo el texto.
- **El estado nunca se comunica solo con color:** siempre hay texto o icono junto al punto de color. Un usuario con daltonismo distingue igual disponible de reservada.
- Etiquetas ARIA en todos los controles solo con icono.
- Navegación completa por teclado en escritorio; `focus-visible` claro.
- Compatible con Dynamic Type de iOS: la interfaz no se rompe al 200 % de tamaño de texto.
- `prefers-reduced-motion` desactiva transiciones.

### 7.3 Rendimiento (presupuestos, no aspiraciones)

| Métrica | Objetivo | Cómo se logra |
|---|---|---|
| LCP en 4G | < 1.8 s | RSC, imágenes optimizadas, fuente del sistema |
| INP | < 200 ms | virtualización, sin JS bloqueante |
| JS inicial | < 130 KB gzip | Server Components, `dynamic()` en modales |
| Scroll de la cuadrícula | 60 fps con 5 000 prendas | `react-virtual` + paginación por cursor |
| Búsqueda | < 300 ms percibido | índice GIN + debounce + resultados en caché |

Se controla con un presupuesto en CI: si un PR supera el tamaño de bundle, falla la build.

### 7.4 Offline y PWA

- **Manifest + iconos**, `display: standalone` → se instala en la pantalla de inicio del iPhone y se abre sin barra de Safari.
- **Service worker** (Serwist): cachea el esqueleto de la app y las últimas imágenes vistas.
- **Cola de escritura offline:** las prendas creadas o editadas sin red se guardan en IndexedDB y se sincronizan al volver. Indicador persistente: `⏳ 2 cambios pendientes`.
- **Lectura offline:** el inventario visto recientemente sigue navegable.
- **Notificaciones push** (iOS 16.4+, solo si la app está instalada): aviso de reserva vencida.

### 7.5 Microcopy

Todo en español peruano, tuteo, directo. Sin jerga técnica.

| Situación | ❌ Evitar | ✅ Usar |
|---|---|---|
| Guardado correcto | "Operación exitosa" | "PR-000128 guardada" |
| Sin resultados | "0 registros encontrados" | "Nada por aquí. Prueba con otra búsqueda." |
| Error de red | "Error 503: Service Unavailable" | "Sin conexión. Se guardó y se subirá solo." |
| Confirmar borrado | "¿Está seguro?" | "¿Eliminar esta prenda? Va a la papelera 30 días." |
| Reserva vencida | "Reservation expired" | "La reserva de PR-000128 venció. Ya está disponible." |
| Estado vacío inicial | "No hay elementos" | "Sube tu primera prenda 👇" |

---

## 8. Tecnologías recomendadas

### 8.1 Pila completa

| Capa | Tecnología | Versión | Justificación |
|---|---|---|---|
| Framework | **Next.js (App Router)** | 16.x | RSC reduce el JS enviado al móvil; el ecosistema y Vercel son la ruta más rápida a producción. |
| UI | **React** | 19.x | — |
| Lenguaje | **TypeScript** (strict) | 5.6+ | Con tipos generados de la BD, un cambio de esquema rompe la compilación en vez de romper producción. |
| Estilos | **Tailwind CSS** | v4 | Sin CSS que mantener, bundle mínimo, coherencia forzada por el sistema de diseño. |
| Componentes | **shadcn/ui** (Radix) | — | Se copia el código al repo: accesibilidad resuelta, control total, cero dependencia externa que se rompa. |
| Estado servidor | **TanStack Query** | v5 | Caché, revalidación, mutaciones optimistas y reintentos offline: exactamente lo que necesita el flujo de alta rápida. |
| Estado cliente | **Zustand** | v5 | Solo para lo poco global (filtros, cola de subida). Sin Redux. |
| Formularios | **React Hook Form + Zod** | — | Sin re-renderizados por tecla; el mismo esquema Zod valida en cliente y servidor. |
| BaaS | **Supabase** | — | Postgres + Auth + Storage + Realtime + RLS. |
| Base de datos | **PostgreSQL** | 16 | — |
| Migraciones | **Supabase CLI** | — | SQL versionado en git, entorno local reproducible con Docker. |
| Imágenes cliente | `browser-image-compression` + `heic2any` | — | Compresión y HEIC→JPEG en el navegador (heic2any ya está probado en tu app de try-on). |
| Virtualización | `@tanstack/react-virtual` | — | Cuadrículas de miles de elementos a 60 fps. |
| Fechas | **date-fns** + `date-fns-tz` | v4 | Ligero, tree-shakeable, locale `es`. |
| PWA | **Serwist** | — | Sucesor mantenido de next-pwa. |
| Tests unitarios | **Vitest** | — | Foco en `packages/core`: reservas, plantilla de compartir, formato de precios. |
| Tests E2E | **Playwright** | — | Un test crítico: alta de prenda en menos de 20 s (con cronómetro real). |
| Errores | **Sentry** | — | Plan gratuito suficiente. |
| Hosting web | **Vercel** | — | Despliegue por push, previews por PR, CDN global. |
| Futuro móvil | **Expo (React Native)** | SDK 54+ | `supabase-js` funciona igual; se reutiliza `packages/core`. |

### 8.2 Lo que deliberadamente NO usamos

| Descartado | Por qué |
|---|---|
| Prisma / Drizzle | Con Supabase, un ORM añade una capa que pelea con RLS. `supabase-js` con tipos generados es más directo y seguro. |
| Redux / MobX | Sobredimensionado. El estado real vive en el servidor; TanStack Query ya lo gestiona. |
| Una biblioteca de gráficos | El panel usa números grandes y un minigráfico de barras hecho con divs. No justifica 100 KB. |
| Fuentes personalizadas | La fuente del sistema carga instantáneamente y se ve nativa en iOS. |
| Backend propio (FastAPI/Nest) | Duplicaría trabajo. Supabase + Server Actions cubre todo hasta un volumen muy superior al tuyo. |
| Docker en producción | Vercel + Supabase gestionados. Sin servidores que parchear. |

### 8.3 Costes estimados

| Escala | Supabase | Vercel | Total mensual |
|---|---|---|---|
| Hasta ~2 000 prendas, 1–3 usuarios | Free (500 MB BD, 1 GB storage) | Hobby (gratis) | **$0** |
| 2 000 – 20 000 prendas | Pro $25 (8 GB BD, 100 GB storage) | Hobby o Pro $20 | **$25 – 45** |
| Multi-tienda / miles de usuarios | Pro + add-ons | Pro | $50 – 150 |

Con fotos comprimidas a ~300 KB × 3 por prenda, 1 GB gratis da para ~1 100 prendas. El primer límite que tocarás es el almacenamiento, no la base de datos.

### 8.4 Camino a la app móvil nativa

No se construye ahora, pero cada decisión de la Fase 1 la habilita:

1. `packages/core` sin dependencias de DOM → se importa tal cual en Expo.
2. `supabase-js` funciona idéntico en React Native.
3. Los tipos generados de la BD se comparten.
4. Solo se reescribe la capa visual (~30 % del código), y se gana: cámara nativa, notificaciones push fiables en iOS, lector de códigos de barras, compartir nativo sin las limitaciones de la Web Share API.
5. Distribución con EAS Build + TestFlight.

**Cuándo dar el salto:** cuando la limitación de compartir de WhatsApp o las notificaciones push web se vuelvan un problema real medido, no antes.

---

## 9. Escalabilidad

### 9.1 Escalabilidad técnica

| Dimensión | Límite del diseño actual | Cuándo se toca | Solución |
|---|---|---|---|
| Prendas por tienda | ~100 000 con índices actuales | Muy lejos | Particionar `items` por año, archivar vendidas antiguas |
| Fotos | 1 GB gratis → ~1 100 prendas | ~1 año de uso | Supabase Pro (100 GB) o mover a Cloudflare R2 |
| Usuarios concurrentes | Cientos | Muy lejos | Connection pooling (Supavisor) ya incluido |
| Búsqueda | Excelente hasta ~500 k filas | Muy lejos | Migrar a Postgres FTS con `websearch_to_tsquery` o Typesense |
| Multi-tienda | ✅ Listo desde el día 1 | — | `store_id` ya está en todas las tablas y en RLS |

**La decisión clave de escalabilidad ya está tomada:** `store_id` en cada tabla desde la primera migración. Convertir la app en un SaaS multi-tienda más adelante no requiere migración de datos, solo una pantalla de selección de tienda y un flujo de suscripción.

### 9.2 Escalabilidad del producto

Las funciones futuras que pediste ya tienen su punto de anclaje en este diseño:

| Función futura | Anclaje ya previsto |
|---|---|
| **QR / código de barras** | `items.code` ya es único e imprimible. Se añade `items.barcode` y una pantalla `/escanear` con `BarcodeDetector` (web) o `expo-camera` (móvil). Escanear = abrir la ficha. |
| **Clientes** | ✅ Ya planificado — Fase 6, [sección 11](#11-módulo-de-pedidos-y-envíos-shalom). Los campos nombre/teléfono de la reserva capturan el dato desde la Fase 2. |
| **Ventas e historial de compras** | ✅ Ya planificado — tablas `orders` + `order_items` en la Fase 6. |
| **Envíos con otros couriers (Olva, etc.)** | La interfaz `ShippingProvider` de la Fase 6 permite añadir un courier escribiendo solo su adaptador. |
| **Reportes / dashboard financiero** | `items.cost_cents` ya existe en el esquema (margen por prenda). Vistas materializadas para agregados mensuales. |
| **IA: descripciones automáticas** | Edge Function que recibe `item_id`, lee las fotos y llama a la API de Claude con visión → escribe `description`. Punto de entrada: un botón ✨ junto al campo descripción. |
| **IA: sugerencia de precio** | Edge Function con el histórico de `sold_price_cents` por marca/categoría + visión. |
| **IA: quitar el fondo** | Ya tienes infraestructura de Replicate en tu app de try-on: se reutiliza el patrón. Se aplica en la subida como paso opcional, guardando original y procesada. |
| **Probador virtual** | Tu app existente (`virtual-tryon-app`) se integra como servicio: la ficha gana un botón "Probar en modelo" que envía las fotos a ese backend. Diferenciador fuerte frente a la competencia. |
| **Publicación automática en redes** | Tabla `publications (item_id, channel, external_id, published_at)`. Edge Functions por canal. La plantilla de compartir ya es configurable por canal. |
| **Meta Ads / Shopify** | Se exporta un feed de producto (XML/CSV) desde `items_view`. La estructura de datos ya es compatible con el formato de catálogo de Meta. |
| **WhatsApp Business API** | Edge Function + webhook. Reemplaza el compartir manual por envío directo a listas de difusión. Requiere cuenta verificada de Meta. |

### 9.3 Deuda técnica aceptada conscientemente

| Atajo | Por qué se acepta | Cuándo se paga |
|---|---|---|
| Sin i18n (solo español) | Tu mercado es local | Si abres a otro país |
| Estadísticas calculadas al vuelo | Instantáneo hasta ~50 k prendas | Vista materializada cuando el panel tarde > 500 ms |
| Sin auditoría de accesos | Equipo pequeño y de confianza | Si crece el equipo |
| Compartir manual (no automatizado) | La API de WhatsApp Business requiere verificación y coste | Cuando el volumen lo justifique |

---

## 10. Seguridad

### 10.1 Modelo de amenazas

| Amenaza | Riesgo | Mitigación |
|---|---|---|
| Alguien accede al inventario de otra tienda | Alto | RLS en **todas** las tablas + tests automatizados que lo verifican |
| Fotos accesibles por URL pública | Medio | Bucket privado + políticas de Storage por `store_id` + URLs firmadas de 1 h |
| Un vendedor borra el inventario | Medio | Borrado lógico + papelera de 30 días + borrado definitivo solo para el dueño |
| Robo de la sesión del teléfono | Medio | JWT de 1 h con refresh rotativo; cierre de sesión remoto desde Ajustes › Equipo |
| Clave de API filtrada en el cliente | Alto | Solo la clave `anon` va al navegador (es pública por diseño y está limitada por RLS). La `service_role` **nunca** sale del servidor. |
| Inyección SQL | Bajo | `supabase-js` parametriza todo; ninguna consulta se concatena |
| XSS por descripción de prenda | Bajo | React escapa por defecto; nunca se usa `dangerouslySetInnerHTML` |
| Abuso de subida de archivos | Bajo | Validación de tipo MIME y tamaño en cliente y en la política de Storage (máx. 10 MB) |

### 10.2 Autenticación

- **Magic link por correo** como método principal: sin contraseñas que recordar ni que filtrar. Ideal para el flujo móvil.
- **Google OAuth** como alternativa de un toque.
- Sesión gestionada por `@supabase/ssr` con cookies `httpOnly`, `secure`, `sameSite=lax`.
- Middleware de Next.js protege todas las rutas bajo `(app)`: sin sesión → `/login`.
- Invitaciones al equipo: correo con enlace de un solo uso, caducidad de 7 días, rol asignado por el dueño.

### 10.3 La regla de oro de RLS

> **Toda tabla nueva nace con RLS activado y política escrita en la misma migración.**

Y se verifica automáticamente. En CI corre un test que, autenticado como usuario de la Tienda A, intenta leer y escribir datos de la Tienda B en cada tabla. Si algo pasa, el build falla. Es el único test de seguridad que realmente importa aquí, y es barato de mantener.

```sql
-- Consulta de auditoría: ninguna tabla debe aparecer aquí
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;
```

### 10.4 Protección de datos

- **Datos personales mínimos:** solo nombre y teléfono opcionales de quien reserva. No se guardan datos de pago (no hay pagos en la app).
- **Cifrado:** TLS 1.3 en tránsito, AES-256 en reposo (gestionado por Supabase/AWS).
- **Copias de seguridad:** diarias automáticas (7 días de retención en el plan Pro). Además, exportación manual a CSV desde Ajustes, para que nunca dependas de un único proveedor.
- **Registro:** sin datos personales en los logs. Sentry configurado con `beforeSend` que elimina campos sensibles.
- **Cabeceras HTTP:** CSP estricta, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 10.5 Seguridad operativa

- Secretos en variables de entorno de Vercel, nunca en git. `.env.example` documenta las claves sin valores.
- `git-secrets` o Gitleaks en pre-commit.
- Dependabot para actualizaciones de seguridad.
- Rama `main` protegida: sin push directo, requiere PR y CI en verde.

---

## 11. Módulo de pedidos y envíos (Shalom)

> Añadido tras tu consulta del 27/07/2026. Analicé el archivo real
> `Formato-Pro-Masivo-2026_07_27_22.xlsx` que me enviaste y este diseño está
> mapeado campo por campo contra él.

### 11.0 Corrección importante sobre el formato

**No es un PDF, es un Excel (.xlsx).** Y eso es una muy buena noticia: rellenar un PDF de formulario mediante código es frágil, mientras que generar un `.xlsx` idéntico al que Shalom espera es determinista y fiable. El módulo puede producir exactamente el mismo archivo que llenas a mano hoy, sin que tú toques una celda.

### 11.1 Anatomía del formato (extraída del archivo)

El libro tiene tres hojas. Solo **Hoja1** se rellena; las otras dos son catálogos que alimentan los desplegables.

**Hoja1 — 13 columnas, hasta 499 envíos por archivo (filas 2 a 500):**

| Col | Encabezado | Tipo | Obligatorio | Origen del dato en nuestra app |
|:---:|---|---|:---:|---|
| A | `DESTINATARIO (DOC)` | Texto (DNI/RUC) | ✅ | `customers.doc_number` |
| B | `TELF. DESTINATARIO` | Texto | ✅ | `customers.phone` |
| C | `CONTACTO (DOC)` | Texto | ➖ | `shipments.contact_doc` (opcional) |
| D | `TELF. CONTACTO` | Texto | ➖ | `shipments.contact_phone` (opcional) |
| E | `NRO GRR` | Texto | ➖ | Guía de remisión. Vacío salvo que factures con GRR |
| F | `ORIGEN` | **Lista cerrada** (498 agencias) | ✅ | `stores.shalom_origin_agency` — fijo, tu agencia |
| G | `DESTINO` | **Lista cerrada** (486 agencias) | ✅ | `shipments.destiny_agency` |
| H | `MERCADERIA` | **Lista cerrada** (6 valores) | ✅ | `shipments.package_type` |
| I | `ALTO` | Número | ✅ (0 permitido) | `shipments.height_cm` |
| J | `ANCHO` | Número | ✅ (0 permitido) | `shipments.width_cm` |
| K | `LARGO` | Número | ✅ (0 permitido) | `shipments.length_cm` |
| L | `PESO` | Número | ✅ (0 permitido) | `shipments.weight_kg` |
| M | `CANTIDAD` | Entero | ✅ | `shipments.packages_count` (normalmente 1) |

**Valores válidos de `MERCADERIA`** (validación de la propia plantilla):
`SOBRE` · `PAQUETE XXS` · `PAQUETE XS` · `PAQUETE S` · `PAQUETE M` · `PAQUETE L`

**Fila de ejemplo que trae la plantilla:**
`70503353 | 987654321 | | | | ZAMACOLA | JAEN | PAQUETE L | 0 | 0 | 0 | 0 | 1`

Nota: en el ejemplo, alto/ancho/largo/peso van en **0**. Es decir, Shalom pesa y mide en la agencia; el tipo de paquete (`MERCADERIA`) es lo que realmente define la tarifa. Eso simplifica muchísimo nuestro formulario: en el 95 % de los casos solo hay que elegir el tamaño del paquete.

**Hoja2 y Medidas — catálogos de referencia:**

- 498 agencias de **origen** con su **ID numérico** (ej. `543 = AAHH SANTA ROSA PIURA`, `15 = ABANCAY`)
- 486 agencias de **destino**
- 25 departamentos · 194 provincias · 1 683 distritos

**Ya extraje esos catálogos** a [`docs/shalom/catalogos-shalom.json`](shalom/catalogos-shalom.json). Se cargarán como datos semilla, de modo que el selector de agencia de destino funcione con búsqueda instantánea y **nunca** genere un nombre que Shalom rechace. Esto elimina la causa número uno de errores en la carga masiva: escribir el nombre de la agencia con una variación mínima.

### 11.2 Tres caminos posibles (y cuál recomiendo)

| | **A · Generar el Excel** | **B · API de terceros** | **C · API oficial** |
|---|---|---|---|
| Cómo funciona | La app genera el `.xlsx` idéntico y tú lo subes a Shalom Pro | Un servicio externo crea los envíos en `pro.shalom.pe` con tus credenciales | Contrato comercial con Shalom → credenciales de API propias |
| Esfuerzo | 3 días | 2 días | 2 días + negociación comercial |
| Coste | S/0 | Cuota del tercero | Requiere contrato con tarifas negociadas |
| Riesgo | Ninguno | ⚠️ **Alto** (ver abajo) | Bajo |
| Depende de terceros | No | Sí, totalmente | De Shalom (aceptable) |
| Se rompe si Shalom cambia algo | Solo si cambia la plantilla (visible y fácil de corregir) | Sí, silenciosamente | No |

**Mi recomendación: empezar por A, y migrar a C cuando tu volumen justifique el contrato.**

**Sobre el camino B — te lo desaconsejo explícitamente.** Existe un servicio no oficial ([shalom-api-peru.com](https://shalom-api-peru.com/docs/)) que crea envíos en Shalom Pro, pero **exige enviarle tu correo y contraseña de Shalom Pro** para actuar en tu nombre. Eso significa entregar el control total de tu cuenta —incluidos datos de todos tus clientes y la posibilidad de generar envíos— a un tercero sin relación contractual con Shalom. Si esas credenciales se filtran o el servicio desaparece, el problema es tuyo. No lo voy a implementar salvo que me lo pidas expresamente entendiendo ese riesgo.

El camino A conserva **exactamente** tu flujo actual (subes un archivo a Shalom Pro), solo que el archivo se genera solo y sin errores de tipeo.

### 11.3 El flujo que quedaría

```
Prenda RESERVADA para María
   │  (ya tienes su nombre y teléfono de la reserva)
   ▼
[ Convertir en pedido ]
   │
   ├─▶ Cliente: María — se autocompleta de la reserva
   │            Falta: DNI (obligatorio para Shalom)
   │            Se guarda en la ficha del cliente → no lo pides nunca más
   │
   ├─▶ Prendas del pedido: PR-000128  (+ añadir más del inventario)
   │            Total: S/50
   │
   └─▶ Envío:  Destino: [buscar agencia…] → JAEN
               Paquete: [SOBRE][XXS][XS][S][M][L]  → un toque
               Cantidad: 1
   │
   ▼
Pedido PED-000042 creado · envío en estado "Pendiente de registrar"
   │
   ▼
Pantalla ENVÍOS ▸ Pendientes (7)
   [ ✓ ] PED-000042  María · JAEN · PAQUETE M
   [ ✓ ] PED-000043  Luis  · TRUJILLO · PAQUETE S
   ...
   ┌──────────────────────────────────────┐
   │  ⬇️  Generar Excel para Shalom (7)   │
   └──────────────────────────────────────┘
   │
   ▼
Se descarga  Shalom-Masivo-2026-07-28.xlsx  (idéntico a la plantilla)
   │
   ├─▶ Lo subes a Shalom Pro (igual que hoy)
   │
   ▼
Vuelves a la app: [ Marcar lote como registrado ]
   │  (opcional: pegar los códigos de seguimiento que devuelve Shalom)
   │
   ▼
Prendas → VENDIDAS · Pedido → ENVIADO
   │
   ▼
[ 📤 Avisar al cliente por WhatsApp ]
   "Hola María 👋 Tu pedido ya está en camino.
    Agencia: Shalom JAEN · Código: XXXXX
    Puedes recogerlo desde mañana."
```

**El detalle que ahorra más tiempo:** cuando reservas una prenda ya capturas nombre y teléfono. Al convertir en pedido, lo único nuevo que se pide es el **DNI** y la **agencia de destino**. Y como el cliente queda guardado, la segunda compra de la misma persona se registra en dos toques.

### 11.4 Modelo de datos adicional

```sql
create type order_status    as enum ('draft','confirmed','packed','shipped','delivered','cancelled');
create type shipment_status as enum ('pending','exported','registered','in_transit','delivered','returned','cancelled');
create type doc_type        as enum ('DNI','RUC','CE');

-- ── Clientes ──────────────────────────────────────────────────
create table customers (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid not null references stores(id) on delete cascade,
  full_name     text not null,
  doc_type      doc_type not null default 'DNI',
  doc_number    text,                       -- validado: DNI 8, RUC 11, CE 9-12
  phone         text,
  email         text,
  -- destino habitual: la mayoría de clientes recoge siempre en la misma agencia
  default_agency_id integer references shalom_agencies(id),
  notes         text,
  orders_count  integer not null default 0,
  total_spent_cents bigint not null default 0,
  created_at    timestamptz not null default now(),
  unique (store_id, doc_type, doc_number)
);
create index on customers (store_id, lower(full_name));
create index on customers (store_id, phone);

-- ── Catálogo de agencias Shalom (global, semilla del Excel) ───
create table shalom_agencies (
  id          integer primary key,          -- ID oficial del formato (543, 15, …)
  name        text not null unique,         -- 'JAEN', 'ZAMACOLA' — EXACTO como en la plantilla
  is_origin   boolean not null default false,
  is_destiny  boolean not null default false,
  department  text,
  province    text,
  search_key  text generated always as (unaccent(lower(name))) stored
);
create index on shalom_agencies using gin (search_key gin_trgm_ops);

-- ── Pedidos ───────────────────────────────────────────────────
create table orders (
  id             uuid primary key default uuid_generate_v4(),
  store_id       uuid not null references stores(id) on delete cascade,
  code           text not null,                     -- 'PED-000042'
  customer_id    uuid not null references customers(id),
  status         order_status not null default 'draft',
  subtotal_cents integer not null default 0,
  shipping_cents integer not null default 0,        -- si le cobras el envío
  total_cents    integer not null default 0,
  paid_cents     integer not null default 0,        -- adelanto de la reserva
  notes          text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (store_id, code)
);

-- Una prenda es pieza única: no puede estar en dos pedidos activos a la vez
create table order_items (
  order_id    uuid not null references orders(id) on delete cascade,
  item_id     uuid not null references items(id),
  price_cents integer not null,          -- precio congelado al momento de vender
  primary key (order_id, item_id)
);
create unique index one_active_order_per_item on order_items (item_id)
  where (select status from orders o where o.id = order_id) <> 'cancelled';

-- ── Envíos ────────────────────────────────────────────────────
create table shipments (
  id                uuid primary key default uuid_generate_v4(),
  store_id          uuid not null references stores(id) on delete cascade,
  order_id          uuid not null references orders(id) on delete cascade,
  provider          text not null default 'shalom',

  origin_agency_id  integer not null references shalom_agencies(id),
  destiny_agency_id integer not null references shalom_agencies(id),

  package_type      text not null default 'PAQUETE S'
                    check (package_type in ('SOBRE','PAQUETE XXS','PAQUETE XS',
                                            'PAQUETE S','PAQUETE M','PAQUETE L')),
  height_cm         numeric(6,2) not null default 0,
  width_cm          numeric(6,2) not null default 0,
  length_cm         numeric(6,2) not null default 0,
  weight_kg         numeric(6,2) not null default 0,
  packages_count    integer not null default 1 check (packages_count > 0),

  contact_doc       text,      -- col C, opcional
  contact_phone     text,      -- col D, opcional
  grr_number        text,      -- col E, opcional

  status            shipment_status not null default 'pending',
  tracking_code     text,      -- lo devuelve Shalom tras la carga
  cost_cents        integer,
  export_batch_id   uuid references export_batches(id),
  registered_at     timestamptz,
  delivered_at      timestamptz,
  created_at        timestamptz not null default now()
);
create index on shipments (store_id, status);

-- ── Lotes de exportación ──────────────────────────────────────
create table export_batches (
  id           uuid primary key default uuid_generate_v4(),
  store_id     uuid not null references stores(id) on delete cascade,
  provider     text not null default 'shalom',
  file_path    text,                    -- copia guardada en Storage
  rows_count   integer not null,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  registered_at timestamptz             -- cuándo confirmaste la subida
);
```

Se añaden a `stores`:

```sql
alter table stores
  add column shalom_origin_agency_id integer references shalom_agencies(id),
  add column default_package_type text not null default 'PAQUETE S',
  add column shipping_enabled boolean not null default false;
```

Y RLS con el mismo patrón de `store_id` que el resto — sin excepciones.

### 11.5 El generador de archivos

Vive en `packages/core/shipping/` para que la futura app móvil lo reutilice:

```
packages/core/shipping/
├── providers/
│   ├── shalom/
│   │   ├── columns.ts      ← el mapa de las 13 columnas
│   │   ├── validate.ts     ← valida ANTES de generar
│   │   ├── build.ts        ← shipments[] → filas
│   │   └── template.xlsx   ← la plantilla original, intacta
│   └── types.ts            ← interfaz ShippingProvider
└── index.ts
```

**Decisión técnica clave: se escribe sobre la plantilla original, no se genera un Excel desde cero.** Con `exceljs` se abre `template.xlsx`, se rellenan las filas 2..N y se guarda. Así se conservan las validaciones, los desplegables, el formato y las hojas de catálogo tal como Shalom las espera. Si Shalom cambia la plantilla, reemplazas un archivo y listo — cero código que tocar.

**Validación previa a la generación.** Antes de descargar nada, la app comprueba cada envío y muestra los problemas en pantalla, para que nunca subas un archivo que Shalom rechace:

| Regla | Mensaje |
|---|---|
| DNI vacío | "María no tiene DNI. Agrégalo para poder enviar." |
| DNI ≠ 8 dígitos (o RUC ≠ 11) | "El DNI de Luis tiene 7 dígitos." |
| Teléfono vacío | "Falta el teléfono de Ana." |
| Agencia destino no está en el catálogo | Imposible por diseño: el selector solo ofrece las 486 válidas. |
| Más de 499 envíos | "Se generarán 2 archivos." (partición automática) |
| Agencia de origen sin configurar | "Configura tu agencia en Ajustes › Envíos." |

**Interfaz `ShippingProvider`** — para que añadir Olva u otro courier después sea escribir un adaptador nuevo, sin tocar nada del resto:

```ts
interface ShippingProvider {
  id: 'shalom' | 'olva' | 'other';
  name: string;
  maxRowsPerFile: number;                     // Shalom: 499
  validate(s: ShipmentDraft[]): ValidationIssue[];
  buildFile(s: ShipmentDraft[]): Promise<Blob>;
  parseResponse?(file: File): TrackingResult[]; // si Shalom devuelve un archivo
}
```

### 11.6 Pantallas nuevas

| Pantalla | Ruta | Contenido |
|---|---|---|
| Pedidos | `/pedidos` | Lista con estado, cliente, total y destino. Filtros por estado. |
| Nuevo pedido | `/pedidos/nuevo` | Cliente + prendas + datos de envío en una sola pantalla |
| Ficha de pedido | `/pedidos/[code]` | Prendas, cliente, envío, seguimiento, historial |
| **Envíos** | `/envios` | 🎯 Pendientes de registrar → generar Excel → marcar como registrados |
| Lotes | `/envios/lotes` | Historial de archivos generados, con descarga otra vez |
| Clientes | `/clientes` | Lista, búsqueda por nombre/DNI/teléfono, historial de compras |
| Ficha de cliente | `/clientes/[id]` | Datos, agencia habitual, pedidos anteriores |
| Ajustes › Envíos | `/ajustes/envios` | Agencia de origen, tipo de paquete por defecto, plantilla |

La barra inferior pasa de 4 a 5 pestañas: **Inventario · Pedidos · [+] · Panel · Más**. Alertas y Ajustes se agrupan bajo "Más" para no saturar el pulgar.

```
┌──────────────────────────────────────┐
│  Envíos                              │
├──────────────────────────────────────┤
│  PENDIENTES DE REGISTRAR        (7)  │
│                                      │
│  ┌─────────────────────────────────┐ │
│  │ ✓  PED-000042                   │ │
│  │    María Quispe · 70503353      │ │
│  │    → JAEN · PAQUETE M · 1       │ │
│  ├─────────────────────────────────┤ │
│  │ ✓  PED-000043                   │ │
│  │    Luis Ramos · 45889210        │ │
│  │    → TRUJILLO · PAQUETE S · 1   │ │
│  ├─────────────────────────────────┤ │
│  │ ⚠️  PED-000044                  │ │
│  │    Ana Torres · falta DNI       │ │
│  │    [ Completar datos ]          │ │
│  └─────────────────────────────────┘ │
│                                      │
│  Origen: ZAMACOLA          Cambiar   │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ⬇️  Generar Excel para Shalom (6)│ │
│ └──────────────────────────────────┘ │
│   1 envío excluido por datos faltantes│
│                                      │
│  ─────────────────────────────────── │
│  ÚLTIMOS LOTES                       │
│  26 jul · 12 envíos · ✅ Registrado  │
│  24 jul · 8 envíos  · ✅ Registrado  │
└──────────────────────────────────────┘
```

### 11.7 Qué cambia en el resto del sistema

| Zona | Cambio |
|---|---|
| Ficha de prenda | Botón nuevo: **"Convertir en pedido"** (visible si está disponible o reservada) |
| Reserva | Los campos nombre/teléfono pasan de texto suelto a vincularse con `customers` |
| Panel | Tarjetas nuevas: pedidos por enviar, envíos en tránsito, ventas del mes |
| Compartir | Plantilla nueva de "pedido enviado" con el código de seguimiento |
| Estados de prenda | Al confirmar un pedido, sus prendas pasan a `vendida` automáticamente |

### 11.8 Preparado para lo que viene

Este módulo es exactamente la base que faltaba para varias de tus funciones futuras: `customers` habilita el historial de compras; `orders` habilita ventas y reportes financieros; `shipments` habilita el seguimiento y las notificaciones automáticas al cliente. La API oficial de Shalom (camino C) se enchufaría como un `ShippingProvider` más, sin rediseñar nada.

---

## 12. Plan de desarrollo por fases

Cada fase produce algo **usable en producción**. No hay una fase que sea solo "cimientos invisibles": la Fase 1 ya te deja subir y compartir prendas reales.

### Fase 0 — Cimientos · 2 días

| # | Entregable |
|---|---|
| 0.1 | Monorepo pnpm: `apps/web`, `packages/core`, `supabase/` |
| 0.2 | Next.js 16 + TS strict + Tailwind v4 + shadcn/ui |
| 0.3 | Proyecto Supabase (prod) + entorno local con Supabase CLI |
| 0.4 | Migración 001: tipos, tablas, índices, triggers, RLS |
| 0.5 | `seed.sql` con categorías, tallas y colores iniciales |
| 0.6 | Generación de tipos TS desde la BD (`supabase gen types`) |
| 0.7 | Auth por magic link + middleware de sesión |
| 0.8 | Sistema de diseño: tokens, tema claro/oscuro, componentes base |
| 0.9 | CI en GitHub Actions: typecheck, lint, tests, presupuesto de bundle |
| 0.10 | Despliegue en Vercel con previews por PR |

**✅ Criterio de aceptación:** puedes iniciar sesión, se crea tu tienda y ves un inventario vacío desplegado en una URL real.

---

### Fase 1 — MVP: subir y compartir · 5 días 🎯

**Esta es la fase que resuelve tu problema.** Al terminarla, la app ya sustituye tu flujo actual.

| # | Entregable |
|---|---|
| 1.1 | Onboarding de 3 pasos + creación de tienda con catálogos |
| 1.2 | Cuadrícula de inventario con virtualización y paginación por cursor |
| 1.3 | Componente de subida de fotos: HEIC→JPEG, compresión, subida paralela en segundo plano, reintentos |
| 1.4 | Formulario de alta rápida con borrador autoguardado |
| 1.5 | "Guardar", "Guardar y compartir", "Guardar y seguir" |
| 1.6 | Ficha de prenda completa (sin historial todavía) |
| 1.7 | Editar y eliminar (a papelera) |
| 1.8 | **Motor de compartir:** plantilla con variables, Web Share API L2 con archivos, copia al portapapeles, fallback `wa.me` |
| 1.9 | Cambio de estado con menú y "Deshacer" |
| 1.10 | Barra de navegación inferior + FAB |
| 1.11 | Test E2E cronometrado: alta de prenda < 20 s |

**✅ Criterio de aceptación:** subes 10 prendas reales en menos de 4 minutos y compartes una en un grupo de WhatsApp con fotos y texto.

---

### Fase 2 — Reservas y control · 3 días

| # | Entregable |
|---|---|
| 2.1 | Flujo de reserva con "¿Para quién?" opcional |
| 2.2 | `reserve_days_snapshot` + columna generada `reserve_expires_at` |
| 2.3 | Job `pg_cron` de vencimiento + vista `items_view` con estado efectivo |
| 2.4 | Contador visual de días restantes con código de color |
| 2.5 | Tabla de notificaciones + pestaña Alertas con badge |
| 2.6 | Realtime: el badge se actualiza sin recargar |
| 2.7 | Historial de cambios en la ficha (línea de tiempo) |
| 2.8 | Duplicar prenda |
| 2.9 | Papelera con restaurar y borrado definitivo |

**✅ Criterio de aceptación:** reservas una prenda, adelantas el reloj de la BD 6 días, y la prenda vuelve sola a disponible con su notificación.

---

### Fase 3 — Encontrar y entender · 3 días

| # | Entregable |
|---|---|
| 3.1 | Búsqueda con detección de intención (código / precio / talla / texto) |
| 3.2 | Índices GIN + `pg_trgm` + búsqueda tolerante a errores de tecleo |
| 3.3 | Chips de filtro rápido + hoja de filtros avanzados |
| 3.4 | Estado de filtros sincronizado con la URL |
| 3.5 | Ordenación: recientes, precio ↑↓, vencimiento próximo |
| 3.6 | Panel con `dashboard_stats()` y tarjetas tocables |
| 3.7 | Minigráfico de actividad semanal |
| 3.8 | Menú contextual con toque largo en la cuadrícula |

**✅ Criterio de aceptación:** con 200 prendas cargadas, encuentras cualquiera en menos de 3 segundos, escribiendo mal el nombre a propósito.

---

### Fase 4 — Ajustes, equipo y pulido móvil · 3 días

| # | Entregable |
|---|---|
| 4.1 | Ajustes › Tienda (nombre, moneda, prefijo de código) |
| 4.2 | Ajustes › Reservas (stepper de días) |
| 4.3 | Ajustes › Plantilla de compartir con vista previa en vivo |
| 4.4 | Gestión de catálogos: categorías, marcas, tallas, colores |
| 4.5 | Ajustes › Equipo: invitar, cambiar rol, eliminar usuario |
| 4.6 | Exportar inventario a CSV |
| 4.7 | PWA: manifest, iconos, service worker, instalable en iPhone |
| 4.8 | Cola de escritura offline con IndexedDB + indicador de pendientes |
| 4.9 | Notificaciones push web para reservas vencidas |
| 4.10 | **Compartir avanzado:** collage generado en Canvas con precio y datos superpuestos |
| 4.11 | Vibración háptica, pull-to-refresh, restauración de scroll |
| 4.12 | Auditoría de accesibilidad y contraste |

**✅ Criterio de aceptación:** la app está instalada en tu pantalla de inicio, funciona en modo avión y un empleado invitado puede usarla sin ver los ajustes.

---

### Fase 5 — Endurecimiento y lanzamiento · 2 días

| # | Entregable |
|---|---|
| 5.1 | Tests de RLS entre tiendas en CI |
| 5.2 | Tests unitarios de `packages/core` (reservas, plantilla, formato) |
| 5.3 | Tests E2E de los 3 flujos críticos |
| 5.4 | Sentry + monitorización de rendimiento |
| 5.5 | Cabeceras de seguridad y CSP |
| 5.6 | Auditoría Lighthouse ≥ 95 en móvil |
| 5.7 | Migración de tus datos reales actuales |
| 5.8 | README, documentación de despliegue, guía de uso de 1 página |

**✅ Criterio de aceptación:** la app es tu herramienta diaria de trabajo.

---

---

### Fase 6 — Pedidos, clientes y envíos Shalom · 5 días 📦

Detalle completo del diseño en la [sección 11](#11-módulo-de-pedidos-y-envíos-shalom).

| # | Entregable |
|---|---|
| 6.1 | Migración: `customers`, `orders`, `order_items`, `shipments`, `export_batches`, `shalom_agencies` + RLS |
| 6.2 | Carga semilla de las 498 agencias de origen y 486 de destino desde el Excel real |
| 6.3 | CRUD de clientes con búsqueda por nombre, DNI y teléfono; validación de DNI/RUC/CE |
| 6.4 | "Convertir en pedido" desde la ficha de prenda, autocompletando de la reserva |
| 6.5 | Pantalla de pedido: prendas, cliente, totales, adelanto |
| 6.6 | Selector de agencia de destino con búsqueda tolerante a errores (486 opciones) |
| 6.7 | Selector de tipo de paquete con chips (SOBRE → PAQUETE L) |
| 6.8 | `packages/core/shipping/providers/shalom` — validador + generador sobre la plantilla real |
| 6.9 | Pantalla Envíos: pendientes, validación previa con avisos, generar `.xlsx`, partición automática cada 499 filas |
| 6.10 | Lotes: historial, re-descarga, "marcar como registrado", pegar códigos de seguimiento |
| 6.11 | Al confirmar el pedido: prendas → vendidas; mensaje de WhatsApp "tu pedido va en camino" |
| 6.12 | Panel: pedidos por enviar, en tránsito, ventas del mes |
| 6.13 | Barra de navegación de 5 pestañas |

**✅ Criterio de aceptación:** registras 7 pedidos reales, generas el Excel, lo subes a Shalom Pro **sin editar una sola celda** y la carga se procesa sin errores.

---

### Fases futuras (no incluidas en este alcance)

| Fase | Contenido | Estimación |
|---|---|---|
| 7 | App nativa con Expo (cámara, push fiable, escáner) | 2 semanas |
| 8 | Reportes y dashboard financiero (margen, ventas por marca) | 1 semana |
| 9 | IA: descripciones, sugerencia de precio, quitar fondo | 1 semana |
| 10 | Integración con el Probador Virtual existente | 4 días |
| 11 | API oficial de Shalom (requiere contrato comercial) | 2 días + negociación |
| 12 | WhatsApp Business API + publicación automática en redes | 2 semanas |
| 13 | Feed de catálogo para Meta Ads / Shopify | 1 semana |

### Resumen de cronograma

```
Fase 0  ██                        2 d   Cimientos
Fase 1  █████                     5 d   🎯 MVP usable
Fase 2  ███                       3 d   Reservas
Fase 3  ███                       3 d   Búsqueda y panel
Fase 4  ███                       3 d   Ajustes y PWA
Fase 5  ██                        2 d   Lanzamiento
Fase 6  █████                     5 d   📦 Pedidos y envíos Shalom
                                 ────
                                 23 días de desarrollo
```

**Tienes una app que ya te sirve al terminar la Fase 1 (día 7).** El resto la vuelve completa.

> Si los envíos son hoy tu mayor pérdida de tiempo, la Fase 6 puede adelantarse justo después de la Fase 2 (reservas), porque el flujo natural es *reserva → pedido → envío*. Dímelo y reordeno el plan.

---

## 13. Anexos: decisiones abiertas y riesgos

### 13.1 Preguntas que necesito que confirmes antes de empezar

| # | Pregunta | Mi recomendación |
|---|---|---|
| Q1 | ¿Moneda y país? | **S/ (PEN), Perú, zona horaria America/Lima** — deducido de tu ejemplo "S/50". Confírmalo. |
| Q2 | ¿Prefijo del código de prenda? | `PR-000001`. Se puede cambiar por las iniciales de tu tienda. |
| Q3 | ¿El vendedor puede ver el valor total del inventario? | Sí por defecto, con interruptor en Ajustes para ocultarlo. |
| Q4 | ¿Cuántas prendas tienes hoy? ¿Hay que migrar algo? | Si tienes una hoja de cálculo, la importamos en la Fase 5. |
| Q5 | ¿Quieres registrar el **costo** de cada prenda (para ver margen)? | El campo ya está en el esquema, oculto. Se activa cuando quieras. |
| Q6 | ¿Nombre definitivo de la app? | "Percha" es solo un nombre de trabajo. |
| Q7 | ¿Cuál es **tu agencia Shalom de origen**? | ✅ **Respondido (27/07):** `OVALO DE LA FAMILIA` (Nuevo Chimbote, Áncash) — **ID 177** en el catálogo oficial. Verificado: existe como agencia de origen y de destino. |
| Q8 | ¿Cuántos envíos haces por semana? | Pendiente. Define si conviene el contrato de API oficial más adelante. No bloquea nada. |
| Q9 | ¿Qué tipo de paquete usas normalmente? | ✅ **Respondido (27/07):** `PAQUETE XS` a `PAQUETE S`. Por defecto **`PAQUETE XS`**, con `S` a un toque de distancia y los demás tamaños detrás de "Otro". |
| Q10 | ¿El módulo de envíos va en la **Fase 6** o lo adelanto? | Pendiente. Por defecto queda en Fase 6. Se puede mover sin coste hasta que empiece la Fase 3. |
| Q11 | ¿Cobras el envío al cliente o va incluido? | Pendiente. El campo `shipping_cents` ya existe; solo cambia si se muestra o no. No bloquea. |

**Valores por defecto asumidos** (Q1–Q6, confirmados implícitamente al dar luz verde el 27/07 — cualquiera se cambia en un archivo de configuración):
Perú · `PEN` / `S/` · zona horaria `America/Lima` · prefijo de código `PR-000001` · el vendedor sí ve el valor del inventario · campo de costo presente pero oculto · nombre de trabajo "Percha".

### 13.2 Riesgos y planes de contingencia

| Riesgo | Probabilidad | Impacto | Plan |
|---|---|---|---|
| **WhatsApp descarta el texto al compartir con fotos en iOS** | Alta | Alto | Ya mitigado en tres capas (portapapeles + solo-texto + collage con datos incrustados). Se valida con tu iPhone real en el día 1 de la Fase 1, antes de construir el resto. |
| Las notificaciones push web en iOS son poco fiables | Media | Medio | El badge en la app y la pestaña Alertas son la fuente principal; el push es un extra. La app nativa (Fase 6) lo resuelve del todo. |
| Se agota el 1 GB de storage gratuito | Alta (~1 año) | Bajo | Compresión agresiva desde el día 1 + aviso al 80 % de uso + Supabase Pro por $25. |
| El objetivo de 20 s no se cumple en 3G | Media | Medio | Guardar no espera a que suban las fotos; la prenda queda creada y las fotos terminan solas. |
| **Shalom cambia la plantilla de carga masiva** | Media (anual) | Bajo | Se escribe sobre el archivo original, no se genera desde cero: basta con reemplazar `template.xlsx` y revisar el mapa de 13 columnas. Además, la app avisa si detecta que los encabezados de la plantilla no coinciden con los esperados. |
| **Shalom rechaza el archivo generado** | Media en la 1ª prueba | Medio | Validación previa en la app + prueba real con 2–3 envíos antes de usarlo en producción. Siempre queda la opción de editar el Excel a mano antes de subirlo. |
| Alcance que crece durante el desarrollo | Alta | Alto | Este documento es el contrato. Todo lo nuevo va a la lista de fases futuras, no a la fase en curso. |

### 13.3 Validación técnica previa (día 1, antes de escribir la app)

Tres pruebas de concepto de medio día que eliminan el riesgo de las tres apuestas del diseño:

1. **Compartir en WhatsApp** desde Safari iOS con `navigator.share({files, text})` — verificar exactamente qué llega al grupo.
2. **Subida de foto de iPhone**: HEIC de 4 MB → JPEG comprimido → Supabase Storage, cronometrado con datos móviles.
3. **`pg_cron` en el plan gratuito** de Supabase: confirmar que está disponible; si no lo estuviera, se sustituye por un Cron Job de Vercel que llama a una Edge Function.
4. **Carga masiva en Shalom Pro** (antes de la Fase 6): generar un `.xlsx` con 2 envíos reales usando el generador y subirlo a Shalom Pro para confirmar que se procesa sin errores. Es la única incógnita del módulo de envíos y se despeja en una hora.

**Archivos de referencia guardados:** [`docs/shalom/plantilla-original.xlsx`](shalom/plantilla-original.xlsx) (tu archivo, intacto) y [`docs/shalom/catalogos-shalom.json`](shalom/catalogos-shalom.json) (agencias, departamentos y provincias ya extraídos).

Si alguna falla, ajustamos el diseño **antes** de construir, no después.

---

## Aprobación

Este documento requiere tu revisión. Cuando estés conforme, respóndeme con:

- ✅ **"Aprobado, empieza por la Fase 0"** — y comienzo a desarrollar por módulos, entregando código organizado y documentado.
- ✏️ Los cambios que quieras en cualquier sección (especialmente las preguntas del punto 12.1).

Mientras no haya aprobación, no se escribe código.
