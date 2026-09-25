import { createContext } from "react-router";
import { getConfig } from "./config";
import { createRepositories, type Repositories } from "./data";
import { trustSystemCertificates } from "./lib/tls";
import { NINOX_BASE_URLS, NinoxClient } from "./ninox/client";
import { NinoxNotConfiguredError } from "./ninox/errors";
import { RateLimiter } from "./ninox/rate-limiter";

/**
 * Todo lo que necesita el dominio, inyectado. Los módulos reciben el contexto y no
 * importan singletons: en tests se arma con una base temporal, fetch y reloj simulados.
 */
export interface AppContext {
  repos: Repositories;
  limiter: RateLimiter;
  now: () => Date;
  ninoxEnv: "test" | "prod";
  hasNinox: () => boolean;
  /** Cliente de Ninox. Lanza NinoxNotConfiguredError si falta el token. */
  ninox: () => NinoxClient;
}

export interface ContextOptions {
  repos: Repositories;
  ninox: { env: "test" | "prod"; token?: string; baseUrl?: string; timeoutMs: number };
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  retryDelay?: (attempt: number) => Promise<void>;
}

export function createAppContext(options: ContextOptions): AppContext {
  const now = options.now ?? Date.now;
  const limiter = new RateLimiter(options.repos.rateBuckets, { env: options.ninox.env, now, sleep: options.sleep });
  const baseUrl = (options.ninox.baseUrl ?? NINOX_BASE_URLS[options.ninox.env]).replace(/\/+$/, "");
  let client: NinoxClient | undefined;

  return {
    repos: options.repos,
    limiter,
    now: () => new Date(now()),
    ninoxEnv: options.ninox.env,
    hasNinox: () => Boolean(options.ninox.token),
    ninox: () => {
      const token = options.ninox.token;
      if (!token) throw new NinoxNotConfiguredError();
      client ??= new NinoxClient({
        baseUrl,
        token,
        timeoutMs: options.ninox.timeoutMs,
        limiter,
        fetchImpl: options.fetchImpl,
        retryDelay: options.retryDelay
      });
      return client;
    }
  };
}

// En dev, Vite recarga módulos. Solo los repositorios (la conexión a la base) sobreviven en
// globalThis; el contexto se rearma por recarga para que el cliente y las clases de error
// sean las del módulo vigente (si no, `instanceof` falla entre versiones).
const globalForRepos = globalThis as typeof globalThis & { __repos?: Repositories };
let processContext: AppContext | undefined;

/** Contexto del proceso, armado desde las variables de entorno. */
export function getAppContext(): AppContext {
  if (!processContext) {
    const config = getConfig();
    trustSystemCertificates();
    globalForRepos.__repos ??= createRepositories(config.databaseUrl);
    processContext = createAppContext({ repos: globalForRepos.__repos, ninox: config.ninox });
  }
  return processContext;
}

/** Clave para leer el AppContext desde loaders y actions: `context.get(appContext)`. */
export const appContext = createContext<AppContext>();
