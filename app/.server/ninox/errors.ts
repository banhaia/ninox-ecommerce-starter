import type { RateBucket } from "./rate-limiter";

/** Ninox respondió con un status no 2xx. */
export class NinoxApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "NinoxApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * No hubo respuesta HTTP de Ninox.
 * - `sent = false`: la request nunca llegó (conexión rechazada, DNS, certificado TLS):
 *   es seguro reenviar un POST.
 * - `sent = true`: timeout o corte a mitad de camino: el resultado en Ninox es desconocido.
 */
export class NinoxNetworkError extends Error {
  readonly sent: boolean;
  readonly timedOut: boolean;

  constructor(message: string, options: { sent: boolean; timedOut?: boolean; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "NinoxNetworkError";
    this.sent = options.sent;
    this.timedOut = options.timedOut ?? false;
  }
}

/**
 * La ventana de rate limit del bucket no está libre.
 * - `local`: la app se frenó sola para respetar la ventana (no llamó a la API).
 * - `api`: la API respondió 403 "Debe esperar N segundos".
 */
export class RateLimitedError extends Error {
  readonly bucket: RateBucket;
  readonly retryAfterSeconds: number;
  readonly source: "local" | "api";

  constructor(bucket: RateBucket, retryAfterSeconds: number, source: "local" | "api") {
    super(
      source === "api"
        ? `La API pidió esperar ${retryAfterSeconds} segundos antes de reintentar.`
        : `Todavía no pasó la ventana mínima entre consultas: esperá ${retryAfterSeconds} segundos (la app no llamó a la API).`
    );
    this.name = "RateLimitedError";
    this.bucket = bucket;
    this.retryAfterSeconds = retryAfterSeconds;
    this.source = source;
  }
}

/** Falta NINOX_TOKEN: la tienda funciona, pero no puede sincronizar. */
export class NinoxNotConfiguredError extends Error {
  constructor() {
    super("Falta configurar NINOX_TOKEN en las variables de entorno.");
    this.name = "NinoxNotConfiguredError";
  }
}
