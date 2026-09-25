<div align="center">

# Ninox Ecommerce Starter

Tienda online chica conectada a **Ninox ERP**: catálogo sincronizado desde Ninox, carrito, checkout, cierre por WhatsApp y pedidos sincronizados con Ninox de forma idempotente.

Un solo proceso Node · React Router (Vite) · Prisma · SQLite → Postgres/Supabase · Azure, Vercel o Netlify

</div>

> **Estado:** base global lista (Fase 0). Catálogo, carrito/checkout y sync de pedidos se implementan según [`PLAN.md`](PLAN.md).

## Qué es

- **Catálogo desde Ninox** (`GetData`): precio, stock, talles/colores y categorías. Sin seed: Ninox es la fuente de verdad. Descripción, imágenes, destacados y orden se editan en la tienda (vitrina) y el sync nunca los pisa.
- **Carrito y checkout**: precios y stock recalculados en el servidor. El pedido se guarda en la base y el cliente lo envía por **WhatsApp** con un mensaje configurable.
- **Seguimiento en backend**: cada pedido tiene un outbox hacia Ninox (`Terceros/Pedido`) con `ordenId` estable, estados (`pending`, `created`, `failed`, `unknown`…), línea de tiempo y acciones de reintento, conciliación y cancelación. Nunca se duplica un pedido.

## Inicio rápido

```bash
git clone <este-repo> && cd ninox-ecommerce-starter
cp .env.example .env      # completá ADMIN_PASSWORD, SESSION_SECRET y (cuando lo tengas) NINOX_TOKEN
npm install
npm run dev               # http://localhost:5173 · panel en /admin
```

Sin token la tienda arranca vacía y el panel indica qué falta configurar. El token se pide en https://www.ninoxnet.com/integraciones/terceros; desarrollá siempre contra `NINOX_ENV=test`.

## Arquitectura

```
app/
  routes/          páginas y endpoints (loaders/actions = backend)
  components/      UI (primitivas en ui/)
  lib/             utilidades puras compartidas
  .server/         solo servidor
    config.ts      env validado con zod
    context.ts     AppContext inyectable (repos, cliente Ninox, reloj)
    data/          ports.ts (interfaces) + prisma/ (adaptador)
    ninox/         cliente de la API de terceros, rate limiter, errores
    modules/       dominio: catálogo, pedidos, settings, auth
prisma/            schema + migraciones
tests/             Vitest con base temporal, fetch y reloj simulados
```

Más detalle en [`docs/INDEX.md`](docs/INDEX.md).

## Base de datos

SQLite en `./data/app.db` para desarrollo. La capa de datos está detrás de interfaces (`app/.server/data/ports.ts`): pasar a Postgres/Supabase es cambiar el provider y el adapter de Prisma; Mongo se suma como otro adaptador. Ver [`docs/data-layer.md`](docs/data-layer.md).

## Producción

```bash
npm run build
npm start                 # aplica migraciones y sirve la app en $PORT
```

Guía por plataforma en [`docs/deploy.md`](docs/deploy.md). En producción `SESSION_SECRET` es obligatorio y la cookie del admin requiere HTTPS.

## Desarrollo

```bash
npm run validate          # typecheck + tests + build + chequeo de archivos sensibles
```

- Guía para agentes: [`CLAUDE.md`](CLAUDE.md) y [`AGENTS.md`](AGENTS.md).
- Agente experto en Ninox: [`.claude/agents/ninox-integration-expert.md`](.claude/agents/ninox-integration-expert.md).

## Seguridad

Repo público: nunca commitees `.env`, tokens, la base de datos ni datos reales. CI corre gitleaks sobre todo el historial y `npm run validate` rechaza archivos sensibles trackeados.
