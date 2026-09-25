# AGENTS.md

Instrucciones para agentes (Codex, Cursor, Copilot, etc.). La guía completa está en [`CLAUDE.md`](CLAUDE.md); la hoja de ruta en [`docs/plan.md`](docs/plan.md); el playbook de integración con Ninox en [`.claude/agents/ninox-integration-expert.md`](.claude/agents/ninox-integration-expert.md). Para React Router hay una skill en `.agents/skills/react-router/`.

## Estructura

- `app/routes/**`: páginas y endpoints (React Router framework mode). Finas: parsean, llaman a un módulo y devuelven.
- `app/.server/modules/**`: dominio (catálogo, pedidos, settings, auth). Reciben `AppContext`.
- `app/.server/data/`: `ports.ts` (interfaces) + `prisma/` (adaptador). Nadie más importa Prisma.
- `app/.server/ninox/`: cliente HTTP de la API de terceros.
- `prisma/`: esquema y migraciones. `tests/`: Vitest con `createTestContext()`.

## Comandos

```bash
npm install && npm run dev   # un proceso en :5173
npm run validate             # typecheck + test + build + archivos sensibles
```

## Estilo

- TypeScript estricto, sin `any`; 2 espacios, comillas dobles, archivos kebab-case, imports con `~/`.
- UI, docs y errores en español. Montos en ARS.
- Cambios de esquema = nueva migración (`npm run db:migrate -- --name <nombre>`), nunca editar una existente.
- Repo público: nada de tokens, `.env`, bases de datos ni datos reales. Fixtures ficticias.
