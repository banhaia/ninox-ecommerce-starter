import type { RateBucketRepository } from "../data/ports";
import { RateLimitedError } from "./errors";

/**
 * Buckets de rate limit de la API de terceros que usa la tienda. GetData comparte el
 * bucket "masivo" con exportar/stock y saldos: un sync de catálogo bloquea esos exports.
 * POST Pedido y cancelar no tienen bucket.
 */
export type RateBucket = "masivo" | "parametros" | "comprobante";

const WINDOWS_SECONDS: Record<RateBucket, { test: number; prod: number }> = {
  masivo: { test: 180, prod: 600 },
  parametros: { test: 3, prod: 10 },
  comprobante: { test: 3, prod: 10 }
};

/** Margen para no pegarle a Ninox justo en el borde de la ventana. */
const SAFETY_MARGIN_MS = 1000;

/** Ventana reservada antes de una llamada; se libera si la request no llegó. */
export interface Reservation {
  bucket: RateBucket;
  until: Date;
}

export interface RateLimiterOptions {
  env: "test" | "prod";
  now: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Cancelado"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Cancelado"));
      },
      { once: true }
    );
  });
}

/**
 * Rate limiter persistido en la base: la ventana sobrevive reinicios y es compartida
 * entre instancias (serverless). La reserva es un UPDATE condicional, así que dos
 * instancias no pueden tomar la misma ventana.
 */
export class RateLimiter {
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(
    private readonly repo: RateBucketRepository,
    private readonly options: RateLimiterOptions
  ) {
    this.sleep = options.sleep ?? defaultSleep;
  }

  windowMs(bucket: RateBucket): number {
    return WINDOWS_SECONDS[bucket][this.options.env] * 1000 + SAFETY_MARGIN_MS;
  }

  async remainingMs(bucket: RateBucket): Promise<number> {
    const next = await this.repo.nextAllowedAt(bucket);
    return next ? Math.max(0, next.getTime() - this.options.now()) : 0;
  }

  /**
   * Acciones manuales: si la ventana no está libre, falla con los segundos restantes.
   * El límite es local (la app se frena antes de llamar), no una respuesta de Ninox.
   */
  async take(bucket: RateBucket): Promise<Reservation> {
    const reservation = await this.tryReserve(bucket);
    if (reservation) return reservation;
    throw new RateLimitedError(bucket, Math.max(1, Math.ceil((await this.remainingMs(bucket)) / 1000)), "local");
  }

  /** Procesos en segundo plano: espera a que la ventana se libere. */
  async acquire(bucket: RateBucket, signal?: AbortSignal): Promise<Reservation> {
    for (;;) {
      const reservation = await this.tryReserve(bucket);
      if (reservation) return reservation;
      await this.sleep(Math.max(1, await this.remainingMs(bucket)), signal);
    }
  }

  /**
   * La request nunca llegó a Ninox (DNS, conexión rechazada, certificado): no consumió
   * la ventana del lado de Ninox, así que se libera para no bloquear el reintento.
   */
  async release(reservation: Reservation): Promise<void> {
    await this.repo.release(reservation.bucket, reservation.until, new Date(this.options.now()));
  }

  /** Ninox respondió 403 "Debe esperar N segundos": se respeta ese valor. */
  async penalize(bucket: RateBucket, seconds: number): Promise<void> {
    await this.repo.set(bucket, new Date(this.options.now() + seconds * 1000 + SAFETY_MARGIN_MS), "403");
  }

  private async tryReserve(bucket: RateBucket): Promise<Reservation | null> {
    const now = this.options.now();
    const until = new Date(now + this.windowMs(bucket));
    return (await this.repo.tryReserve(bucket, new Date(now), until)) ? { bucket, until } : null;
  }
}

/** Extrae N de "Debe esperar N segundos entre cada solicitud". */
export function parseWaitSeconds(body: string): number | null {
  const match = /esperar\s+(\d+)\s+segundo/i.exec(body);
  return match ? Number(match[1]) : null;
}
