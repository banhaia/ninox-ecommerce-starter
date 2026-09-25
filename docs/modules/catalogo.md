# Catálogo

## Propósito

Traer el catálogo de Ninox (`GetData`) a la base local para que la tienda lea precio, stock, variantes y categorías sin llamar a Ninox en cada visita.

## Código

| Archivo | Responsabilidad |
|---|---|
| `app/.server/modules/catalog/mapper.ts` | `mapCatalog`: GetData → `CatalogItemInput[]`, tolerante a nombres alternativos (`precioVenta`, `stockCantidad`, `curva.cantidad`, `codigoCurva`) y a variantes repetidas |
| `app/.server/modules/catalog/sync.ts` | `syncCatalog(ctx, trigger)`, `syncCatalogIfDue(ctx, minutos)`, `getCatalogSyncStatus(ctx)` |
| `app/routes/admin/products.tsx` | Listado del admin con buscador y botón "Sincronizar con Ninox" |

## Sync

- **Manual** (botón del admin): si la ventana `masivo` no está libre no llama a Ninox y muestra en cuántos minutos se puede (600 s en prod, 180 s en test).
- **Programado** (`syncCatalogIfDue`): corre solo si pasaron `CATALOG_SYNC_MINUTES` desde el último sync OK y la ventana está libre. Lo va a disparar el cron de la Fase 3.
- Reemplazo completo en una transacción: lo que no viene queda `eliminado`; la vitrina (`ProductShowcase`) nunca se pisa.
- Cada intento queda en `CatalogSyncRun` (`ok`, `error` con el mensaje, `skipped` si la ventana no estaba libre). Nunca lanza: devuelve un `SyncResult`.
- Precio de venta = `precioVenta` o `precio1`. Si hace falta otra lista, ajustá el mapper.

## Extender

Stock por depósito: pasar `depositoId` a `getData` en `sync.ts`. Stock casi en tiempo real: webhook `articulos` (Fase 5).
