# Plan

Hoja de ruta del starter. Cada fase termina con `npm run validate` en verde, tests de lo nuevo y docs actualizadas (ver "Sincronización de documentación" en `CLAUDE.md`).

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Framework | React Router 8 framework mode (SSR, Vite) | Un solo proceso Node: loaders/actions son el backend. Presets para Vercel y Netlify; `react-router-serve` en Azure |
| Datos | Puertos (`data/ports.ts`) + adaptador Prisma 7 con driver adapters | SQLite en dev; Postgres/Supabase cambiando provider + adapter; Mongo como otro adaptador de los mismos puertos |
| Catálogo | Solo desde Ninox (GetData), sin seed. Vitrina local editable | Ninox es la fuente de verdad de precio y stock; la tienda suma lo visual |
| Pedido en Ninox | Preventa (`Terceros/Pedido`) | El pago se acuerda por WhatsApp; la reserva se factura después en Ninox |
| Idempotencia | Outbox (`OrderSync`) + claim atómico + `ordenId` estable | Ninox nunca bloquea la compra y un pedido nunca se duplica |
| Token Ninox | Solo en variables de entorno | Serverless-friendly y el token nunca toca la base |
| Admin | Una clave (`ADMIN_PASSWORD`) + cookie firmada | Suficiente para una tienda chica, sin tablas de usuarios |
| Carrito | localStorage + revalidación en servidor | Sin estado de servidor; precios y stock siempre de la base |

## Fase 0: base global ✅

- [x] Repo, tooling (TS estricto, Vite, Tailwind 4, Vitest), `.env.example`, `.gitignore`, CI (validate + gitleaks), `scripts/validate.mjs`.
- [x] Esquema Prisma completo + migración inicial.
- [x] Puertos de datos + adaptador Prisma (catálogo, pedidos/outbox, settings, contadores, rate buckets).
- [x] Cliente Ninox (GetData, Pedido, cancelar, comprobante, config), errores y rate limiter persistido.
- [x] `AppContext` inyectable + middleware de React Router.
- [x] Shell de tienda y admin, login de admin, `/healthz`.
- [x] Tests: cliente Ninox, rate limiter, capa de datos (counter concurrente, claim concurrente, locks vencidos), auth y settings.
- [x] Docs: `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/`, agente experto.

## Fase 1: Catálogo

- `modules/catalog/mapper.ts`: `NinoxArticulo → CatalogItemInput` (portar la tolerancia de nombres alternativos del starter original: `nombre ?? descripcion ?? descripcionWeb ?? codigo`, `precioVenta ?? precio1`, stock desde `stockTotal` o suma de la curva).
- `modules/catalog/sync.ts`: `syncCatalog(ctx, trigger)` con `CatalogSyncRun`; manual usa `take()` (429 si la ventana no está libre), programado usa la ventana y `CATALOG_SYNC_MINUTES`.
- Admin: `/admin/productos` (listado con buscador, botón "Sincronizar ahora", último sync) y `/admin/productos/:id` (vitrina: descripción, imágenes por URL, destacado, orden, visible).
- Tienda: `/` (destacados + categorías), `/productos?q&categoria`, `/productos/:slug` (galería, selector talle/color con stock, agregar al carrito).

**Aceptación:** test del mapper con `tests/fixtures/getData.json`; test del sync (reemplazo, baja lógica, vitrina intacta, 429 en el segundo sync manual dentro de la ventana).

## Fase 2: Carrito y checkout

- `app/lib/cart.ts`: carrito en localStorage (`{articuloId, colorId, talleId, cantidad}`), hook `useCart`, contador en el header.
- `/carrito`: action/loader que revalida contra `catalog.findForPricing` (precio actual, stock, ítems que ya no existen).
- `modules/orders/pricing.ts`: precios y totales **desde la base** (`round2`, regla de totales de Ninox).
- `modules/orders/checkout.ts`: zod del formulario (nombre, email, teléfono, DNI opcional, retiro/envío con dirección, notas) → `counters.next("ordenId", ordenIdBase)` → payload de Ninox congelado (`modules/orders/ninox-payload.ts`) → `orders.create`. Código público corto sin caracteres ambiguos.
- `/checkout` y `/pedido/:code` (resumen + botón "Enviar por WhatsApp").
- `app/lib/whatsapp.ts`: render puro de la plantilla (`{tienda} {codigo} {nombre} {items} {total} {entrega}`) + link `https://wa.me/<phone>?text=`.
- Admin: `/admin/configuracion` (nombre, WhatsApp, plantilla con vista previa, `ordenIdBase`).

**Aceptación:** tests de pricing (precio manipulado en el cliente se ignora, stock insuficiente rechaza), checkout (transacción completa, `ordenId` consecutivo con piso), render de WhatsApp.

## Fase 3: Sync de pedidos con Ninox

- `modules/orders/ninox-sync.ts`: `dispatchPending(ctx, {max})`:
  - `expireStaleLocks` → `claimNext` → `createPedido(payload congelado)`;
  - `facturaId > 0` → `created`; `facturaId` 0 o 4xx → `failed` (motivo de `datos`/`observaciones`/`errorFE`);
  - `NinoxNetworkError.sent === false` → `pending` con backoff exponencial (único reintento automático);
  - timeout, corte o 5xx → `unknown`.
- Disparo: tras el checkout (sin bloquear la respuesta), `POST /api/cron/ninox` (`Authorization: Bearer CRON_SECRET`: pedidos pendientes + catálogo si toca) y `RUN_SCHEDULER=true` para un intervalo en proceso (Azure/Docker).
- Admin: `/admin/pedidos` (filtro por estado) y `/admin/pedidos/:id` (línea de tiempo, payload, respuesta):
  - **Reintentar** (`failed`/`unknown` → `pending`, mismo `ordenId`);
  - **Conciliar** (`unknown` → `created` con facturaId, verificado con `GET comprobante/{id}` cuyo `ordenId` debe coincidir);
  - **Cancelar** (`created` → `Terceros/Pedido/cancelar`, exige `tipo === 1`).

**Aceptación:** tests de cada transición con fetch simulado, incluido "timeout no reintenta", "no llegó sí reintenta con backoff", "conciliar rechaza ordenId distinto" y "dos dispatch concurrentes envían una sola vez".

## Fase 4: Deploy

- `docs/deploy.md` probado en las tres plataformas:
  - **Azure App Service (Linux, Node 24)**: `npm run build`, startup `npm start`, `RUN_SCHEDULER=true`. SQLite en `/home/data` (persistente) o Postgres.
  - **Vercel**: preset `@vercel/react-router` en `react-router.config.ts` (condicional por env), Postgres/Supabase obligatorio (el filesystem es efímero), Vercel Cron → `/api/cron/ninox`.
  - **Netlify**: `@netlify/vite-plugin-react-router`, Postgres/Supabase, Scheduled Function que llama al cron.
- `docs/data-layer.md`: paso a Postgres (provider + `@prisma/adapter-pg` + migraciones nuevas) y guía para un adaptador Mongo con el driver oficial (Prisma 7 no soporta Mongo).
- Dockerfile opcional.

## Fase 5 (opcional)

- Webhook `articulos` de Ninox para stock casi en tiempo real (receptor responde 200 en < 10 s y encola).
- Imágenes subidas a storage (Supabase Storage o Azure Blob) en vez de URLs.
- Email de confirmación, cupones de descuento, costo de envío por zona.
- Varios usuarios admin (reemplazar `modules/auth`).
