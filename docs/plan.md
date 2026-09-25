# Plan

Hoja de ruta del starter. Cada fase termina con `npm run validate` en verde, tests de lo nuevo y docs actualizadas (ver "Sincronización de documentación" en `CLAUDE.md`).

## Estado actual

- **Fase 0 (base global):** hecha.
- **Fase 1 (catálogo):** en curso. El sync con Ninox funciona desde `/admin/productos`; faltan la vitrina y las páginas de la tienda.
- **Fases 2 a 5:** pendientes.

**Próximo paso:** terminar la Fase 1 empezando por `/admin/productos/:id` (vitrina) y después las páginas de la tienda.

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

## Fase 1: Catálogo (en curso)

- [x] `modules/catalog/mapper.ts`: GetData → `CatalogItemInput`, tolerante a nombres alternativos.
- [x] `modules/catalog/sync.ts`: `syncCatalog` (manual, respeta la ventana `masivo`) y `syncCatalogIfDue` (programado por `CATALOG_SYNC_MINUTES`), registrados en `CatalogSyncRun`.
- [x] `/admin/productos`: listado, buscador, botón "Sincronizar con Ninox" y estado del último sync.
- [x] Rate limiter: libera la ventana si la request no llegó; distingue límite local vs. respuesta de la API. Certificados del sistema operativo.
- [ ] `/admin/productos/:id`: vitrina (descripción, imágenes por URL con vista previa, destacado, orden, visible) usando `catalog.findById` y `catalog.updateShowcase` (ya existen). Link desde cada fila del listado.
- [ ] Tienda `/`: destacados (`list({ destacados: true })`) y categorías (`listCategories`).
- [ ] Tienda `/productos?q&categoria`: grilla con buscador y filtro; `ProductCard` compartido.
- [ ] Tienda `/productos/:slug`: galería, descripción, selector talle/color que muestra stock por variante y deshabilita combinaciones sin stock; botón "Agregar al carrito" (se conecta en la Fase 2).

**Aceptación:** tests de la action de vitrina (validación con zod de URLs, orden entero) y del loader de detalle (404 si el slug no existe o el producto está oculto o eliminado).

## Fase 2: Carrito y checkout

- `app/lib/cart.ts`: carrito en localStorage (`{articuloId, colorId, talleId, cantidad}`), hook `useCart`, contador en el header.
- `/carrito`: revalida contra `catalog.findForPricing` (precio actual, stock, ítems que ya no existen) y muestra los cambios.
- `modules/orders/pricing.ts`: precios y totales **desde la base** (`round2`, regla de totales de Ninox).
- `modules/orders/checkout.ts`: zod del formulario (nombre, email, teléfono, DNI opcional, retiro/envío con dirección, notas) → `counters.next("ordenId", ordenIdBase)` → payload de Ninox congelado (`modules/orders/ninox-payload.ts`) → `orders.create`. Código público corto sin caracteres ambiguos, con reintento ante colisión.
- `/checkout` y `/pedido/:code` (resumen + botón "Enviar por WhatsApp"); el carrito se vacía al confirmar.
- `app/lib/whatsapp.ts`: render puro de la plantilla (`{tienda} {codigo} {nombre} {items} {total} {entrega}`) + link `https://wa.me/<phone>?text=`.
- `/admin/configuracion`: nombre, WhatsApp, plantilla con vista previa, `ordenIdBase` (usa `saveStoreSettings`, ya existe).

**Aceptación:** tests de pricing (precio manipulado en el cliente se ignora, stock insuficiente rechaza), checkout (transacción completa, `ordenId` consecutivo con piso, payload con la regla de totales) y render de WhatsApp.

## Fase 3: Sync de pedidos con Ninox

- `modules/orders/ninox-sync.ts`: `dispatchPending(ctx, { max })`:
  - `expireStaleLocks` → `claimNext` → `createPedido(payload congelado)`;
  - `facturaId > 0` → `created`; `facturaId` 0 o 4xx → `failed` (motivo de `datos`/`observaciones`/`errorFE`);
  - `NinoxNetworkError.sent === false` → `pending` con backoff exponencial (único reintento automático);
  - timeout, corte o 5xx → `unknown`.
  - Todas las transiciones con `updateSync(…, expected: ["sending"])`.
- Disparo:
  - tras el checkout, sin bloquear la respuesta;
  - `POST /api/cron/ninox` (`Authorization: Bearer CRON_SECRET`): pedidos pendientes + `syncCatalogIfDue`;
  - `RUN_SCHEDULER=true` para un intervalo en proceso (Azure/Docker).
- Admin: `/admin/pedidos` (filtro por estado) y `/admin/pedidos/:id` (línea de tiempo, payload, respuesta):
  - **Reintentar** (`failed`/`unknown` → `pending`, mismo `ordenId`);
  - **Conciliar** (`unknown` → `created` con facturaId, verificado con `GET comprobante/{id}` cuyo `ordenId` debe coincidir);
  - **Cancelar** (`created` → `Terceros/Pedido/cancelar`, exige `tipo === 1`).
- Sumar "Pedidos" al nav del admin y links desde los contadores del inicio.

**Aceptación:** tests de cada transición con fetch simulado, incluidos "timeout no reintenta", "no llegó sí reintenta con backoff", "conciliar rechaza ordenId distinto" y "dos dispatch concurrentes envían una sola vez".

## Fase 4: Deploy

- `docs/deploy.md` probado en las tres plataformas:
  - **Azure App Service (Linux, Node 24)**: `npm run build`, startup `npm start`, `RUN_SCHEDULER=true`. SQLite en `/home/data` (persistente) o Postgres.
  - **Vercel**: preset `@vercel/react-router` en `react-router.config.ts` (condicional por env), Postgres/Supabase obligatorio (el filesystem es efímero), Vercel Cron → `/api/cron/ninox`.
  - **Netlify**: `@netlify/vite-plugin-react-router`, Postgres/Supabase, Scheduled Function que llama al cron.
- Probar el paso a Postgres descrito en `docs/data-layer.md` y correr `tests/data-layer.test.ts` contra Postgres.
- Dockerfile opcional.

## Fase 5 (opcional)

- Webhook `articulos` de Ninox para stock casi en tiempo real (el receptor responde 200 en < 10 s y encola).
- Imágenes subidas a storage (Supabase Storage o Azure Blob) en vez de URLs.
- Email de confirmación, cupones de descuento, costo de envío por zona.
- Varios usuarios admin (reemplazar `modules/auth`).

## Pendientes técnicos

- `npm audit` marca 4 vulnerabilidades altas en dependencias internas de la CLI de Prisma (`deepmerge-ts`, `mysql2`). La app no usa ese código y el fix automático baja Prisma a la 6: revisar al salir una versión nueva de Prisma 7.
- `react-router-serve` loguea la URL con query string. Si algún parámetro llega a tener datos personales, pasar a un servidor propio (Express + `@react-router/express`) con log sin query.
- `CatalogSyncRun` registra también los intentos frenados por la ventana local (`skipped`). Si ensucia el historial, no registrar los `source: "local"`.
- La búsqueda usa `contains` sobre `searchText`: alcanza para catálogos chicos. Para miles de artículos, índice de texto completo en Postgres.
