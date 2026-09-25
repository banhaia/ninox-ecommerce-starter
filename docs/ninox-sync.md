# Sincronización de pedidos con Ninox

> Estado: el outbox (tablas, repositorio y garantías) está implementado y testeado. El despachador, el cron y la UI de seguimiento son la Fase 3 de [plan.md](plan.md).

## Principio

Ninox nunca bloquea la compra y un pedido nunca se duplica. El checkout guarda el pedido **y** un registro de outbox (`OrderSync`) con el payload congelado; el envío a Ninox ocurre después, de forma asíncrona y controlada.

## Idempotencia

- `ordenId` se asigna una vez (`counters.next("ordenId", orders.ordenIdBase)`) y viaja como `ordenId` y `numero` en `Terceros/Pedido`. Todo reenvío usa el mismo payload.
- `orders.ordenIdBase` (configurable) evita choques si dos apps comparten el token.
- `claimNext` toma un pedido con UPDATE condicional y lo pasa a `sending` con un lock de 60 s: dos instancias (serverless) nunca lo envían a la vez.

## Estados

```
pending ──claim──▶ sending ──facturaId>0──────────────▶ created ──cancelar──▶ cancelled
   ▲                  │
   │ no llegó         ├──facturaId 0 / 4xx──────────────▶ failed   (acción humana)
   └─(backoff)────────┤
                      ├──timeout / corte / 5xx──────────▶ unknown  (conciliar)
                      └──lock vencido (proceso murió)───▶ unknown
```

| Resultado del POST | Estado | ¿Reintento automático? |
|---|---|---|
| `facturaId > 0` | `created` | — |
| `facturaId` 0 o error 4xx | `failed` | No: el motivo (en `datos`, `observaciones` o `errorFE`) requiere corregir algo |
| `NinoxNetworkError.sent === false` (DNS, conexión rechazada, TLS) | `pending` + backoff | **Sí**: el POST no llegó a Ninox |
| Timeout, corte, 5xx | `unknown` | **No**: Ninox pudo haberlo creado |

## Conciliación de `unknown` (admin)

- **Reintentar** con el mismo `ordenId` (vuelve a `pending`).
- **Marcar como creado** con un `facturaId`: se verifica con `GET comprobante/{facturaId}` que su `ordenId` coincida antes de aceptar.

Cada transición queda en `OrderEvent` (línea de tiempo del pedido).

## Disparo del despacho

- Justo después del checkout, sin bloquear la respuesta.
- `POST /api/cron/ninox` con `Authorization: Bearer CRON_SECRET` (Vercel Cron, Netlify Scheduled Functions, Azure WebJob/Logic App).
- `RUN_SCHEDULER=true`: intervalo dentro del proceso (Azure App Service, Docker).
- Manual desde el admin.
