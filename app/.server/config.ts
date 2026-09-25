import { z } from "zod";

const isTest = Boolean(process.env.VITEST);

// Carga .env si existe (Node >= 20.12), sin depender de dotenv. En tests se ignora
// para que un .env local no cambie los resultados.
if (!isTest) {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // Sin .env: se usan los defaults y las variables del entorno (Azure, Vercel, Netlify).
  }
}

/** "" → undefined: una variable vacía en .env cuenta como no configurada. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().default("file:./data/app.db"),
  NINOX_ENV: z.enum(["test", "prod"]).default("test"),
  NINOX_TOKEN: optional(z.string().trim()),
  NINOX_BASE_URL: optional(z.url()),
  NINOX_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CATALOG_SYNC_MINUTES: z.coerce.number().int().min(10).default(15),
  ADMIN_PASSWORD: optional(z.string().min(8, "ADMIN_PASSWORD debe tener al menos 8 caracteres")),
  SESSION_SECRET: optional(z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres")),
  CRON_SECRET: optional(z.string().min(16, "CRON_SECRET debe tener al menos 16 caracteres")),
  RUN_SCHEDULER: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() === "true")
});

export type AppConfig = ReturnType<typeof readConfig>;

export function readConfig(env: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  const vars = parsed.data;
  return {
    isProduction: vars.NODE_ENV === "production",
    databaseUrl: vars.DATABASE_URL,
    ninox: {
      env: vars.NINOX_ENV,
      token: vars.NINOX_TOKEN,
      baseUrl: vars.NINOX_BASE_URL,
      timeoutMs: vars.NINOX_TIMEOUT_MS
    },
    catalogSyncMinutes: vars.CATALOG_SYNC_MINUTES,
    admin: { password: vars.ADMIN_PASSWORD, sessionSecret: vars.SESSION_SECRET },
    cronSecret: vars.CRON_SECRET,
    runScheduler: vars.RUN_SCHEDULER
  };
}

let cached: AppConfig | undefined;

/** Config del proceso, validada una sola vez. */
export function getConfig(): AppConfig {
  cached ??= readConfig(process.env);
  return cached;
}
