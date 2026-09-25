import type { AppContext } from "../../context";
import type { SyncRun } from "../../data/ports";
import { NinoxApiError, NinoxNetworkError, NinoxNotConfiguredError, RateLimitedError } from "../../ninox/errors";
import { mapCatalog } from "./mapper";

export type SyncTrigger = SyncRun["trigger"];

export type SyncResult =
  | { ok: true; articulos: number }
  | { ok: false; skipped: boolean; message: string; retryAfterSeconds?: number };

export interface CatalogSyncStatus {
  configured: boolean;
  lastRun: SyncRun | null;
  /** Segundos hasta que Ninox permita otro GetData (bucket "masivo"). */
  nextAllowedInSeconds: number;
}

/** Mensaje accionable para mostrar en el admin (nunca incluye el token). */
function describeSyncError(error: unknown): string {
  if (error instanceof NinoxNotConfiguredError || error instanceof RateLimitedError) return error.message;
  if (error instanceof NinoxApiError || error instanceof NinoxNetworkError) return error.message;
  return "Error inesperado al sincronizar el catálogo";
}

/**
 * Trae el catálogo completo con GetData y reemplaza el local (la vitrina no se toca).
 * Respeta la ventana del bucket "masivo": si no está libre, no llama a Ninox y devuelve
 * `skipped` con los segundos restantes. Nunca lanza: el resultado queda en CatalogSyncRun.
 */
export async function syncCatalog(ctx: AppContext, trigger: SyncTrigger): Promise<SyncResult> {
  if (!ctx.hasNinox()) {
    return { ok: false, skipped: true, message: new NinoxNotConfiguredError().message };
  }

  const runId = await ctx.repos.catalog.startSyncRun(trigger, ctx.now());
  try {
    const raw = await ctx.ninox().getData();
    const items = mapCatalog(raw);
    const { articulos } = await ctx.repos.catalog.replaceAll(items, ctx.now());
    await ctx.repos.catalog.finishSyncRun(runId, { status: "ok", articulos }, ctx.now());
    console.log(`[catalog] sync ${trigger}: ${articulos} artículos`);
    return { ok: true, articulos };
  } catch (error) {
    const skipped = error instanceof RateLimitedError;
    const message = describeSyncError(error);
    await ctx.repos.catalog.finishSyncRun(runId, { status: skipped ? "skipped" : "error", error: message }, ctx.now());
    if (!skipped) console.warn(`[catalog] sync ${trigger} falló: ${message}`);
    return {
      ok: false,
      skipped,
      message,
      ...(error instanceof RateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {})
    };
  }
}

/** Sync programado (cron o scheduler): solo corre si pasaron `intervalMinutes` desde el último OK. */
export async function syncCatalogIfDue(ctx: AppContext, intervalMinutes: number): Promise<SyncResult | null> {
  if (!ctx.hasNinox()) return null;
  const lastOk = await ctx.repos.catalog.lastSuccessfulSyncRun();
  if (lastOk && ctx.now().getTime() - lastOk.startedAt.getTime() < intervalMinutes * 60_000) return null;
  if ((await ctx.limiter.remainingMs("masivo")) > 0) return null;
  return syncCatalog(ctx, "scheduled");
}

export async function getCatalogSyncStatus(ctx: AppContext): Promise<CatalogSyncStatus> {
  return {
    configured: ctx.hasNinox(),
    lastRun: await ctx.repos.catalog.lastSyncRun(),
    nextAllowedInSeconds: Math.ceil((await ctx.limiter.remainingMs("masivo")) / 1000)
  };
}
