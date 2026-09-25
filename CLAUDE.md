# CLAUDE.md

Guía para agentes AI (Claude Code, Codex, Cursor, etc.) que trabajan en este repositorio.

Este repo es un **ecommerce chico integrado a Ninox ERP** mediante la [integración de terceros](https://docs.ninox.com.ar/docs/terceros): catálogo sincronizado desde Ninox con campos de vitrina locales, carrito, checkout que guarda el pedido en la base, cierre de la venta por WhatsApp y **sincronización idempotente del pedido con Ninox** (outbox). Es un solo proceso Node (React Router framework mode sobre Vite) deployable en Azure, Vercel y Netlify.

**Estado:** ver `PLAN.md`. Fase 0 (base global) hecha; Fase 1 (catálogo) en curso: el sync con Ninox ya funciona.

## Agente experto

`.claude/agents/ninox-integration-expert.md` conoce la API de terceros y esta app. Delegale cualquier tarea de integración: sync de catálogo, envío de pedidos, rate limits, errores de Ninox o pruebas contra la API real.

## ⚠️ Repositorio público

Nunca commitear:
- tokens (`X-NX-TOKEN`), `.env`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, cookies;
- la base (`data/`, `*.db`), el cliente Prisma generado ni respuestas reales de la API;
- nombres de tenants/empresas clientes, CUIT/DNI/emails/teléfonos reales, capturas con datos reales.

Las fixtures de `tests/fixtures/` son **ficticias** (Remera Básica, Cliente Ejemplo, `ejemplo@example.com`, CUIT `20-00000000-0`). El cliente Ninox no loguea bodies ni el token; mantenelo así. CI corre gitleaks sobre todo el historial.

## Commands

```bash
npm install            # instala y genera el cliente Prisma (postinstall)
npm run dev            # aplica migraciones pendientes + dev server (un proceso, :5173)
npm run build          # build de React Router (build/client + build/server)
npm start              # aplica migraciones + react-router-serve (PORT, default 3000)
npm run typecheck      # typegen de rutas + tsc
npm test               # vitest (tests/**/*.test.ts, SQLite temporal, fetch y reloj simulados)
npm run validate       # typecheck + test + build + chequeo de archivos sensibles
npm run db:migrate -- --name <nombre>   # nueva migración tras cambiar prisma/schema.prisma
npm run db:studio      # explorar la base
```

Node 24 (`.nvmrc`), mínimo 22.22 (lo exige React Router 8).

## Architecture

- **Framework:** React Router 8 framework mode (SSR) + Vite 8 + React 19 + Tailwind 4. Loaders/actions son el backend; no hay servidor aparte.
- **Capas:** `app/routes/** → app/.server/modules/** → app/.server/data/ports.ts`. Solo `data/prisma/*` importa Prisma; solo `ninox/*` habla HTTP con Ninox. `app/.server/` nunca llega al bundle del cliente.
- **Contexto** (`app/.server/context.ts`): `AppContext { repos, limiter, now(), ninoxEnv, hasNinox(), ninox() }`. El middleware de `app/root.tsx` lo inyecta y las rutas lo leen con `context.get(appContext)`. En tests: `createTestContext()` de `tests/helpers.ts`.
- **Datos** (`app/.server/data/`): `ports.ts` (interfaces y tipos de dominio), `index.ts` (`createRepositories`, único lugar que elige adaptador), `prisma/` (adaptador: Prisma 7 + `@prisma/adapter-better-sqlite3`). Ver `docs/data-layer.md`.
- **Cliente Ninox** (`app/.server/ninox/`): `client.ts` (timeout, reintentos solo en GET), `errors.ts` (`NinoxApiError`, `NinoxNetworkError{sent,timedOut}`, `RateLimitedError`, `NinoxNotConfiguredError`), `rate-limiter.ts` (ventanas persistidas en `RateBucket`, reserva atómica), `types.ts`.
- **Config** (`app/.server/config.ts`): env validado con zod; `.env` se carga con `process.loadEnvFile` (se ignora bajo Vitest).

### Data Model

Esquema en `prisma/schema.prisma`, migraciones en `prisma/migrations/` (solo hacia adelante). Portable SQLite ↔ Postgres: estados como String, JSON como String, montos Decimal (el adaptador los devuelve como number).

| Modelo | Uso |
|---|---|
| `Product` | Artículo de Ninox (GetData). **Solo lo escribe el sync**. `searchText` = búsqueda portable |
| `ProductShowcase` | Vitrina editable (slug, descripción, imágenes JSON, destacado, orden, visible). **Solo lo escribe el admin**; el sync la crea si falta |
| `Variant` | Curva talle/color, unique `(articuloId, colorId, talleId)`; 0 = sin talle/color |
| `Tag`, `ProductTag` | Categorías/marcas de Ninox (tipo 1 = categoría) |
| `CatalogSyncRun` | Historial de syncs de catálogo |
| `Order`, `OrderItem` | Pedido con `code` público y líneas con precio congelado |
| `OrderSync` | **Outbox hacia Ninox**: `ordenId` único (idempotencia), status, payload congelado, attempts, backoff, lock |
| `OrderEvent` | Línea de tiempo del pedido |
| `Setting` | Clave/valor: `store.name`, `whatsapp.phone`, `whatsapp.template`, `orders.ordenIdBase` |
| `Counter` | Secuencias atómicas (`ordenId`) |
| `RateBucket` | Próxima llamada permitida por bucket de Ninox |

### Routes

Config en `app/routes.ts`.

- Tienda (layout `routes/store/layout.tsx`): `/` inicio.
- Admin: `/admin/login`, `POST /admin/logout`; detrás de `routes/admin/layout.tsx` (middleware de sesión): `/admin` inicio (estado de Ninox, último sync, pedidos por estado), `/admin/productos` (listado con buscador, `POST intent=sync` sincroniza con GetData).
- Recursos: `GET /healthz` (200 si la base responde).

### Frontend Structure

- `app/root.tsx`: documento, middleware de contexto, ErrorBoundary en español.
- `app/components/ui/*`: primitivas (button, input, card, badge, notice) con `cn()`.
- `app/lib/*`: utilidades puras compartidas (`money.ts` ARS y `round2`, `text.ts` slug y búsqueda, `cn.ts`).
- Tokens de marca en `app/app.css` (`@theme`).

## Integración Ninox: reglas que el código respeta

- **Token solo en env** (`NINOX_TOKEN`, `NINOX_ENV=test|prod`, `NINOX_BASE_URL` opcional). Nunca en la base ni en el navegador.
- **Rate limits** (`ninox/rate-limiter.ts`), prod / test: `masivo` 600 s / 180 s (GetData), `parametros` y `comprobante` 10 s / 3 s. Acciones manuales usan `take()` (falla rápido), procesos programados `acquire()` (espera). Un 403 "Debe esperar N segundos" actualiza el bucket.
- **Pedidos (preventa, `Terceros/Pedido`)**: `total = subtotal + envio + recargo - descuento`; `usuario` con dni/cuit/email; éxito solo si `facturaId > 0`. `numero = ordenId`.
- **Idempotencia (outbox)**: el pedido se guarda con `OrderSync(pending)` y payload congelado antes de hablar con Ninox. El envío toma el pedido con un claim atómico + lock. Solo se reintenta solo si el POST **no llegó** (`sent: false`). Timeout, corte o 5xx → `unknown`, nunca reintento automático. Lock vencido → `unknown`. Ver `docs/ninox-sync.md`.
- **Catálogo**: reemplazo completo en transacción; lo que no viene queda `eliminado`; la vitrina nunca se pisa.

## Key Conventions

- Español en UI, docs y mensajes de error. Montos en ARS.
- TypeScript estricto (`noUncheckedIndexedAccess`), sin `any`. 2 espacios, comillas dobles, archivos kebab-case. Imports con alias `~/` (sin extensión).
- El dominio usa tipos de `data/ports.ts`, nunca modelos de Prisma. Multi-escritura siempre en una transacción del adaptador.
- No loguear bodies, tokens ni datos personales.
- Cada feature del servidor lleva al menos un test con `createTestContext()`.

## Sincronización de documentación

Después de cada cambio:

- **Nueva ruta** → Routes en este archivo.
- **Nueva página o componente compartido** → Frontend Structure.
- **Cambio de esquema** → nueva migración + Data Model + `docs/data-layer.md` si cambia un puerto.
- **Nuevo módulo o flujo** → `docs/modules/<nombre>.md` + `docs/INDEX.md`.
- **Cambio de contrato con Ninox** → `ninox/types.ts` + `docs/ninox-sync.md`.
- **Fase terminada** → marcarla en `PLAN.md`.
- Antes de commitear: `npm run validate`.

## Documentación externa

- API: https://docs.ninox.com.ar/docs/terceros (incluye changelog)
- Alta comercial y token: https://www.ninoxnet.com/integraciones/terceros
- React Router: docs versionadas en `node_modules/react-router/docs/` (ver `.agents/skills/react-router/SKILL.md`).
