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

/** La ventana de rate limit del bucket no está libre (local o por 403 "Debe esperar N segundos"). */
export class RateLimitedError extends Error {
  readonly bucket: RateBucket;
  readonly retryAfterSeconds: number;

  constructor(bucket: RateBucket, retryAfterSeconds: number) {
    super(`Ninox limita esta consulta: esperá ${retryAfterSeconds} segundos antes de reintentar.`);
    this.name = "RateLimitedError";
    this.bucket = bucket;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Falta NINOX_TOKEN: la tienda funciona, pero no puede sincronizar. */
export class NinoxNotConfiguredError extends Error {
  constructor() {
    super("Falta configurar NINOX_TOKEN en las variables de entorno.");
    this.name = "NinoxNotConfiguredError";
  }
}
