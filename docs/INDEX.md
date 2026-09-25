# Documentación

| Documento | Contenido |
|---|---|
| [architecture.md](architecture.md) | Un proceso, capas, contexto inyectable, flujo de una request |
| [data-layer.md](data-layer.md) | Puertos, adaptador Prisma, SQLite → Postgres/Supabase, adaptador Mongo |
| [ninox-sync.md](ninox-sync.md) | Outbox de pedidos hacia Ninox: estados, idempotencia, conciliación |
| [deploy.md](deploy.md) | Azure App Service, Vercel, Netlify |
| [plan.md](plan.md) | Hoja de ruta por fases, estado actual y próximo paso |

## Módulos

| Módulo | Documento | Código |
|---|---|---|
| Catálogo | [modules/catalogo.md](modules/catalogo.md) | `app/.server/modules/catalog/`, `app/routes/admin/products.tsx` |
| Cliente Ninox | [modules/cliente-ninox.md](modules/cliente-ninox.md) | `app/.server/ninox/` |
| Admin y configuración | [modules/admin.md](modules/admin.md) | `app/.server/modules/auth/`, `app/.server/modules/settings/`, `app/routes/admin/` |
