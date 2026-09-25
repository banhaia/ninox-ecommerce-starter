import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createAppContext, type AppContext } from "~/.server/context";
import { createRepositories } from "~/.server/data";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Fixtures ficticias con la forma real del contrato (tests/fixtures). */
export function fixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", name), "utf8")) as T;
}

/** Crea una base SQLite temporal con todas las migraciones de prisma/migrations aplicadas. */
function createTestDatabase(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nx-shop-"));
  const file = path.join(dir, "test.db");
  const db = new Database(file);
  const migrationsDir = path.join(root, "prisma", "migrations");
  for (const name of fs.readdirSync(migrationsDir).sort()) {
    const sql = path.join(migrationsDir, name, "migration.sql");
    if (fs.existsSync(sql)) db.exec(fs.readFileSync(sql, "utf8"));
  }
  db.close();
  return file;
}

export interface FakeCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

export type FakeHandler = (call: FakeCall) => { status?: number; body?: unknown } | Error;

/**
 * Contexto de test: base SQLite temporal, fetch de Ninox simulado (rutas "METHOD /path")
 * y reloj falso (las esperas del rate limiter y de los reintentos avanzan el reloj).
 */
export function createTestContext(
  routes: Record<string, FakeHandler> = {},
  options: { token?: string | null } = {}
) {
  const file = createTestDatabase();
  const repos = createRepositories(`file:${file}`);
  const calls: FakeCall[] = [];
  let clock = Date.UTC(2026, 2, 1, 12, 0, 0);

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const call: FakeCall = {
      method,
      path: url.pathname,
      query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>
    };
    calls.push(call);

    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return new Response("not found", { status: 404 });
    const result = handler(call);
    if (result instanceof Error) throw result;
    const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? null);
    return new Response(body, { status: result.status ?? 200 });
  }) as typeof fetch;

  const ctx: AppContext = createAppContext({
    repos,
    ninox: {
      env: "test",
      token: options.token === null ? undefined : (options.token ?? "token-de-prueba"),
      timeoutMs: 5_000
    },
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    retryDelay: async () => {}
  });

  return {
    ctx,
    calls,
    advance: (ms: number) => {
      clock += ms;
    },
    cleanup: async () => {
      await repos.close();
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  };
}

export type TestContext = ReturnType<typeof createTestContext>;

/** Error de red como el que lanza fetch de Node (undici) con un `cause.code`. */
export function networkError(code: string): Error {
  return new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });
}

/** Error que lanza fetch cuando se aborta por timeout. */
export function abortError(): Error {
  return new DOMException("This operation was aborted", "AbortError");
}
