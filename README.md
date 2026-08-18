# Percha

Gestión de inventario para tienda de ropa americana. Sube una prenda en menos
de 20 segundos y compártela en WhatsApp en un toque.

> El diseño completo del sistema está en
> [`docs/00-DISENO-DEL-SISTEMA.md`](docs/00-DISENO-DEL-SISTEMA.md).
> Ese documento es la referencia: si el código y el documento no coinciden,
> uno de los dos está mal.

## Estructura

```
apps/web/          Next.js 16 (App Router) + React 19 + Tailwind v4
packages/core/     Lógica de negocio pura — SIN React ni DOM
supabase/          Migraciones SQL versionadas y datos semilla
docs/              Diseño del sistema y referencias de Shalom
```

**Regla del monorepo:** `packages/core` no importa `react`, `next` ni usa
`window`. Gracias a eso, la futura app móvil en Expo reutiliza toda la lógica
de negocio sin reescribir una línea.

## Puesta en marcha

### 1. Dependencias

```bash
npm install
```

### 2. Proyecto de Supabase

Crea un proyecto en [supabase.com](https://supabase.com) (plan gratuito) y
copia sus credenciales:

```bash
cp .env.example apps/web/.env.local
```

Rellena `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` con los
valores de **Settings → API**.

### 3. Base de datos

```bash
npx supabase link --project-ref TU_PROJECT_REF
npm run db:push
```

Esto aplica las migraciones de `supabase/migrations/` en orden. Después,
genera los tipos de TypeScript a partir del esquema real:

```bash
npm run db:types
```

### 4. Arrancar

```bash
npm run dev
```

## Estado del desarrollo

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Cimientos: monorepo, esquema, auth, sistema de diseño | ✅ Hecho |
| 1 | MVP: subir prenda y compartir en WhatsApp | ✅ Hecho |
| 2 | Reservas con vencimiento automático | ✅ Hecho |
| 3 | Búsqueda, filtros y panel | ✅ Hecho |
| 4 | Ajustes y PWA | ✅ Hecho (falta equipo e invitaciones) |
| 5 | Endurecimiento y lanzamiento | ⏳ |
| 6 | Pedidos, clientes y envíos Shalom | ✅ Hecho |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | Comprueba tipos en todo el monorepo |
| `npm run db:push` | Aplica las migraciones a Supabase |
| `npm run db:types` | Regenera los tipos desde el esquema |

## Seguridad

La clave `anon` que va al navegador es pública por diseño; lo que protege los
datos son las políticas **RLS** de PostgreSQL. Por eso toda tabla nueva se
crea con RLS activado y su política escrita en la misma migración, sin
excepciones. La clave `service_role` nunca entra en el repositorio ni llega
al cliente.
