# Arquitectura

## Un solo proceso

React Router en framework mode renderiza la tienda en el servidor (SSR) y expone loaders/actions: son el backend. En dev, `react-router dev` (Vite) corre todo en un proceso; en producción, `react-router-serve` sirve `build/client` (estáticos) y `build/server` (SSR + endpoints) en el mismo puerto. En Vercel y Netlify el mismo build se empaqueta como funciones con el preset de cada plataforma.

## Capas

```
app/routes/**                  parsea request, llama al módulo, devuelve datos/redirect
  └─ app/.server/modules/**    reglas de negocio; recibe AppContext
       ├─ app/.server/data/ports.ts   interfaces + tipos de dominio
       │    └─ data/prisma/*          único lugar que conoce Prisma
       └─ app/.server/ninox/*         único lugar que habla HTTP con Ninox
```

- `app/.server/` es un directorio server-only de React Router: si algo del cliente lo importa, el build falla. El token de Ninox y la base nunca llegan al navegador.
- `app/lib/` son utilidades puras que sirven en ambos lados (formato ARS, slugs).

## Contexto inyectable

`AppContext` (`app/.server/context.ts`) agrupa repositorios, rate limiter, reloj y un cliente Ninox perezoso. El middleware de `app/root.tsx` lo pone en el contexto de React Router:

```ts
export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  return { products: await ctx.repos.catalog.list() };
}
```

En tests, `createTestContext()` (`tests/helpers.ts`) arma el mismo contexto con una base SQLite temporal (migraciones aplicadas), fetch de Ninox simulado por ruta (`"POST /integraciones/Terceros/Pedido"`) y reloj falso: las esperas del rate limiter avanzan el reloj en vez de dormir.

## Configuración

`app/.server/config.ts` valida el entorno con zod al primer uso y falla con un mensaje claro si algo es inválido. Variables en `.env.example`.

## Logs

`react-router-serve` loguea método, ruta, status y duración. El cliente Ninox loguea método, ruta, status y duración, **nunca** bodies ni el token. No agregues logs con datos personales.
