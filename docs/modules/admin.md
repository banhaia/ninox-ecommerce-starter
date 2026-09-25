# Admin y configuración

## Propósito

Panel `/admin` para operar la tienda: estado de Ninox, pedidos y (según `PLAN.md`) catálogo, vitrina y configuración.

## Código

| Archivo | Responsabilidad |
|---|---|
| `app/.server/modules/auth/admin-auth.ts` | Clave única (`ADMIN_PASSWORD`, comparación en tiempo constante) y cookie firmada `__nx_admin` (`SESSION_SECRET`, 7 días, HttpOnly, SameSite=Lax, Secure en producción) |
| `app/routes/admin/layout.tsx` | Middleware que exige sesión para todo lo que cuelga del layout |
| `app/routes/admin/login.tsx`, `logout.tsx` | Login (respeta `?next=` solo hacia `/admin…`) y logout |
| `app/.server/modules/settings/service.ts` | Configuración de la tienda validada con zod: nombre, WhatsApp, plantilla del mensaje, `ordenIdBase` |

## Reglas

- Sin `ADMIN_PASSWORD` el login explica cómo configurarlo.
- Sin `SESSION_SECRET` en dev se usa un secreto efímero (las sesiones se pierden al reiniciar); en producción es obligatorio.

## Extender

Para varios usuarios o roles, reemplazá `admin-auth.ts` por un módulo con tabla de usuarios manteniendo la interfaz `AdminAuth` (`isAdmin`, `requireAdmin`, `login`, `logout`).
