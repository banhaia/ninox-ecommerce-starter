# Capa de datos

## Propósito

Que el dominio no dependa de la base. Los módulos usan interfaces (`app/.server/data/ports.ts`) y tipos propios; el adaptador traduce a la base concreta.

## Código

| Archivo | Responsabilidad |
|---|---|
| `app/.server/data/ports.ts` | Interfaces (`CatalogRepository`, `OrderRepository`, `SettingsRepository`, `CounterRepository`, `RateBucketRepository`) y tipos de dominio |
| `app/.server/data/index.ts` | `createRepositories(url)`: único punto que elige el adaptador |
| `app/.server/data/prisma/client.ts` | Cliente Prisma con driver adapter (hoy `@prisma/adapter-better-sqlite3`) |
| `app/.server/data/prisma/*-repository.ts` | Implementación de cada puerto; convierten `Decimal` a `number` y JSON a tipos |
| `prisma/schema.prisma` | Esquema; `prisma/migrations/` migraciones (solo hacia adelante) |

## Garantías que debe cumplir cualquier adaptador

- `catalog.replaceAll`: transaccional; lo que no viene queda `eliminado`; la vitrina (`ProductShowcase`) nunca se pisa.
- `orders.create`: pedido + líneas + outbox `pending` + evento en una sola transacción.
- `orders.claimNext`: atómico (UPDATE condicional); dos instancias nunca toman el mismo pedido.
- `orders.updateSync(…, expected)`: aplica solo si el estado actual está en `expected`.
- `counters.next`: atómico, nunca repite, respeta el piso.
- `rateBuckets.tryReserve`: atómico (UPDATE condicional).

Los tests de `tests/data-layer.test.ts` verifican estas garantías: correlos contra cualquier adaptador nuevo.

## Pasar a Postgres (Supabase)

1. `npm install @prisma/adapter-pg`.
2. En `prisma/schema.prisma`: `provider = "postgresql"`.
3. En `app/.server/data/prisma/client.ts`: `new PrismaPg({ connectionString: databaseUrl })` en lugar de `PrismaBetterSqlite3`.
4. Borrar `prisma/migrations/` (son de SQLite) y generar la inicial de Postgres: `npm run db:migrate -- --name init`.
5. `DATABASE_URL` con la connection string de Supabase. En serverless usá el **pooler** (puerto 6543, `?pgbouncer=true`) para la app y la conexión directa para `prisma migrate deploy`.

El esquema ya es portable: estados como String, JSON como String, búsqueda por `searchText` normalizado (sin depender de `mode: "insensitive"`).

## Adaptador Mongo

Prisma 7 no soporta MongoDB. Para usar Mongo directo:

1. `npm install mongodb`.
2. Crear `app/.server/data/mongo/` con una función por puerto que implemente las interfaces de `ports.ts` (colecciones `products`, `orders` con items/sync/events embebidos, `settings`, `counters`, `rateBuckets`).
3. Atomicidad: `findOneAndUpdate` con filtro de estado para `claimNext`/`tryReserve`, `$inc` con `upsert` para `counters.next`, y transacciones multi-documento (replica set) para `replaceAll`.
4. Elegirlo en `data/index.ts` (por ejemplo si `DATABASE_URL` empieza con `mongodb`).
5. Correr `tests/data-layer.test.ts` contra el nuevo adaptador.

## SQLite en producción

Sirve en un servidor con disco persistente (Azure App Service con `DATABASE_URL=file:/home/data/app.db`, VM, Docker con volumen) y **una sola instancia**. En Vercel/Netlify el disco es efímero: usá Postgres (o Turso con `@prisma/adapter-libsql`).
