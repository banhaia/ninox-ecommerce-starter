# Deploy

> Estado: el camino Node (Azure/Docker) funciona hoy con `npm run build && npm start`. Los presets de Vercel y Netlify y el cron se completan en la Fase 4 de `PLAN.md`.

## Variables de entorno

Las mismas en todas las plataformas (ver `.env.example`): `DATABASE_URL`, `NINOX_ENV`, `NINOX_TOKEN`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, `RUN_SCHEDULER`.

## Azure App Service (Linux, Node 24)

- Build: `npm ci && npm run build`. Startup command: `npm start` (aplica migraciones y levanta `react-router-serve` en `$PORT`).
- Base: SQLite en disco persistente con `DATABASE_URL=file:/home/data/app.db` (una sola instancia) o Postgres.
- `RUN_SCHEDULER=true` para despachar pedidos y sincronizar el catálogo dentro del proceso.
- Health check: `/healthz`.

## Vercel

- Preset `@vercel/react-router` en `react-router.config.ts`.
- Base: Postgres (Supabase). El filesystem es efímero: SQLite no persiste.
- Migraciones en el build (`prisma migrate deploy` con la conexión directa).
- Vercel Cron → `POST /api/cron/ninox` con `CRON_SECRET`.

## Netlify

- Plugin `@netlify/vite-plugin-react-router` en `vite.config.ts`.
- Base: Postgres (Supabase).
- Scheduled Function que llama a `/api/cron/ninox` con `CRON_SECRET`.
