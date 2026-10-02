<div align="center">

# Ninox Ecommerce Starter

Tienda online chica conectada a **Ninox ERP**: catálogo sincronizado desde Ninox, carrito, checkout, cierre por WhatsApp y pedidos sincronizados con Ninox de forma idempotente.

Un solo proceso Node · React Router (Vite) · Prisma · SQLite → Postgres/Supabase · Azure, Vercel o Netlify

</div>

> **Estado:** base global lista y sync de catálogo funcionando. Vitrina, carrito/checkout y sync de pedidos se implementan según [`docs/plan.md`](docs/plan.md).

> ¿Querés una **app de gestión para tu empresa** (stock, reservas, ventas, reportes)? Usá [ninox-integration-starters](https://github.com/banhaia/ninox-integration-starters).

## Empezá con una IA

No hace falta saber programar. Copiá este mensaje en el asistente de IA que uses (Claude, ChatGPT/Codex, Gemini, Grok, Cursor…), completá lo que está entre corchetes y dejá que te guíe:

```text
Quiero tener mi propia tienda online integrada a Ninox ERP usando este starter:
https://github.com/banhaia/ninox-ecommerce-starter

Tratalo como un repositorio de código: leé su ONBOARDING.md y seguí esas instrucciones.
Ayudame a crear mi propia copia del proyecto, instalá lo que me falte (o explicame
cómo, paso a paso) y dejá la tienda funcionando.

Sobre mí: [no soy programador / sé algo de programación / soy desarrollador].
Uso [Windows / Mac / Linux / solo el celular]. [Tengo / Todavía no tengo] token de Ninox.
Vendo [qué vendés].

Si desde donde estás no podés ejecutar comandos, decímelo y recomendame la mejor
alternativa, incluso si conviene pasárselo a alguien técnico.
```

La IA se encarga de los detalles técnicos según tu equipo. Nunca le pegues el token ni contraseñas en el chat: van en el archivo `.env`.

## Qué es

- **Catálogo desde Ninox** (`GetData`): precio, stock, talles/colores y categorías. Sin seed: Ninox es la fuente de verdad. Descripción, imágenes, destacados y orden se editan en la tienda (vitrina) y el sync nunca los pisa.
- **Carrito y checkout**: precios y stock recalculados en el servidor. El pedido se guarda en la base y el cliente lo envía por **WhatsApp** con un mensaje configurable.
- **Seguimiento en backend**: cada pedido tiene un outbox hacia Ninox (`Terceros/Pedido`) con `ordenId` estable, estados (`pending`, `created`, `failed`, `unknown`…), línea de tiempo y acciones de reintento, conciliación y cancelación. Nunca se duplica un pedido.

## Inicio rápido (manual)

```bash
git clone https://github.com/banhaia/ninox-ecommerce-starter.git && cd ninox-ecommerce-starter
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

- Guía para agentes: [`ONBOARDING.md`](ONBOARDING.md) (primeros pasos guiados), [`CLAUDE.md`](CLAUDE.md) y [`AGENTS.md`](AGENTS.md).
- Agente experto en Ninox: [`.claude/agents/ninox-integration-expert.md`](.claude/agents/ninox-integration-expert.md).

## Seguridad

Repo público: nunca commitees `.env`, tokens, la base de datos ni datos reales. CI corre gitleaks sobre todo el historial y `npm run validate` rechaza archivos sensibles trackeados.
