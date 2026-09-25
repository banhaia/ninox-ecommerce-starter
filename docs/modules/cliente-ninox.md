# Cliente Ninox

## Propósito

Único punto de contacto HTTP con la API de terceros. Corre solo en el servidor.

## Código

| Archivo | Responsabilidad |
|---|---|
| `app/.server/ninox/client.ts` | Un método por endpoint: `getConfig`, `getData`, `createPedido`, `cancelarPedido`, `getComprobante` |
| `app/.server/ninox/errors.ts` | `NinoxApiError` (status no 2xx), `NinoxNetworkError` (`sent`, `timedOut`), `RateLimitedError`, `NinoxNotConfiguredError` |
| `app/.server/ninox/rate-limiter.ts` | Ventanas por bucket persistidas en `RateBucket` con reserva atómica |
| `app/.server/ninox/types.ts` | Subconjunto del contrato que usa la tienda |

## Reglas

- Header `X-NX-TOKEN`; timeout `NINOX_TIMEOUT_MS` (30 s por defecto).
- **POST nunca se reintenta.** GET con `retries` reintenta ante 5xx o error de red, esperando la ventana del bucket.
- `NinoxNetworkError.sent`: `false` = la request no llegó (seguro reenviar); `true` = timeout o corte (resultado desconocido).
- 403 "Debe esperar N segundos" → `RateLimitedError` con `source: "api"` y el bucket queda bloqueado N s + 1 s de margen. Si la app se frena sola antes de llamar, `source: "local"`.
- La ventana se reserva antes de llamar; si la request **no llegó** (`sent: false`) la reserva se libera, porque la API no contó la llamada.
- Certificados: además de los de Node se usan los raíz del sistema operativo (`app/.server/lib/tls.ts`), así un servidor con certificado propio confiado en el equipo funciona sin desactivar TLS. `TLS_USE_SYSTEM_CA=false` lo apaga.
- `take()` para acciones manuales (falla rápido), `acquire()` para procesos programados (espera).

| Bucket | Endpoints | Prod | Test |
|---|---|---|---|
| `masivo` | GetData (compartido con exportaciones masivas) | 600 s | 180 s |
| `parametros` | config | 10 s | 3 s |
| `comprobante` | comprobante/{id} | 10 s | 3 s |

## Extender

Agregá el método en `client.ts` con su bucket, el tipo en `types.ts` (verificado contra https://docs.ninox.com.ar/docs/terceros) y un test en `tests/ninox-client.test.ts` con fetch simulado.
