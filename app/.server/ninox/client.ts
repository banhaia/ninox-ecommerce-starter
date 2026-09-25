import { NinoxApiError, NinoxNetworkError, RateLimitedError } from "./errors";
import { parseWaitSeconds, type RateBucket, type RateLimiter, type Reservation } from "./rate-limiter";
import type {
  NinoxArticulo,
  NinoxComprobante,
  NinoxConfig,
  NinoxFacturaResult,
  NinoxPedido,
  NinoxResultado
} from "./types";

export const NINOX_BASE_URLS = {
  test: "https://api.test-ninox.com.ar",
  prod: "https://api.ninox.com.ar"
} as const;

export interface NinoxClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  limiter: RateLimiter;
  fetchImpl?: typeof fetch;
  /** Espera entre reintentos de GET (inyectable en tests). */
  retryDelay?: (attempt: number) => Promise<void>;
}

export interface CallOptions {
  /** true: espera a que se libere el bucket (cron). false: falla rápido con RateLimitedError. */
  wait?: boolean;
  signal?: AbortSignal;
}

interface RequestOptions extends CallOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  bucket?: RateBucket;
  /** Reintentos ante 5xx o errores de red. Solo para GET. */
  retries?: number;
}

const NOT_SENT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);

/** Traduce el error de fetch a un NinoxNetworkError que indica si la request llegó o no. */
function describeNetworkError(error: unknown, baseUrl: string, timeoutMs: number): NinoxNetworkError {
  if (error instanceof Error && error.name === "AbortError") {
    return new NinoxNetworkError(`Ninox no respondió en ${Math.round(timeoutMs / 1000)} s (${baseUrl})`, {
      sent: true,
      timedOut: true,
      cause: error
    });
  }
  const cause = (error as { cause?: { code?: string; message?: string } } | undefined)?.cause;
  const code = cause?.code ?? "";
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(code)) {
    return new NinoxNetworkError(`El certificado HTTPS de ${baseUrl} no es de confianza (${code}). Si es un servidor propio, confiá su certificado en el sistema operativo y reiniciá la app.`, {
      sent: false,
      cause: error
    });
  }
  if (NOT_SENT_CODES.has(code)) {
    return new NinoxNetworkError(`No se pudo conectar con ${baseUrl} (${code}).`, { sent: false, cause: error });
  }
  return new NinoxNetworkError(`Se cortó la conexión con Ninox (${code || cause?.message || "error de red"})`, {
    sent: true,
    cause: error
  });
}

function describeStatus(status: number, detail: string): string {
  const base: Record<number, string> = {
    400: "Ninox rechazó la solicitud (400)",
    401: "Token de Ninox inválido o expirado (401)",
    403: "Ninox denegó la solicitud (403)",
    404: "Ninox no encontró el recurso (404)",
    422: "Ninox rechazó los datos (422)"
  };
  const prefix = base[status] ?? `Ninox respondió ${status}`;
  return detail ? `${prefix}: ${detail}` : prefix;
}

/**
 * Cliente HTTP de la integración de terceros. Solo corre en el servidor: el token nunca
 * llega al navegador. No loguea bodies ni el token (pueden tener datos personales).
 * Los POST nunca se reintentan: podrían duplicar el comprobante.
 */
export class NinoxClient {
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelay: (attempt: number) => Promise<void>;

  constructor(private readonly options: NinoxClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retryDelay =
      options.retryDelay ?? ((attempt) => new Promise((resolve) => setTimeout(resolve, 1000 * 3 ** attempt)));
  }

  getConfig(call: CallOptions = {}): Promise<NinoxConfig> {
    return this.request("GET", "/integraciones/terceros/config", { bucket: "parametros", ...call });
  }

  async getData(call: CallOptions & { depositoId?: number } = {}): Promise<NinoxArticulo[]> {
    const { depositoId, ...rest } = call;
    const response = await this.request<unknown>("GET", "/integraciones/Terceros/GetData", {
      bucket: "masivo",
      query: { depositoId },
      ...rest
    });
    if (Array.isArray(response)) return response as NinoxArticulo[];
    const data = (response as { data?: unknown } | null)?.data;
    if (Array.isArray(data)) return data as NinoxArticulo[];
    throw new Error("Respuesta inesperada de GetData");
  }

  createPedido(payload: NinoxPedido): Promise<NinoxFacturaResult> {
    return this.request("POST", "/integraciones/Terceros/Pedido", { body: payload });
  }

  cancelarPedido(facturaId: number): Promise<NinoxResultado> {
    return this.request("POST", "/integraciones/Terceros/Pedido/cancelar", { query: { facturaid: facturaId } });
  }

  getComprobante(facturaId: number, call: CallOptions = {}): Promise<NinoxComprobante> {
    return this.request("GET", `/integraciones/terceros/comprobante/${facturaId}`, {
      bucket: "comprobante",
      retries: 1,
      ...call
    });
  }

  private async request<T>(method: "GET" | "POST", path: string, options: RequestOptions = {}): Promise<T> {
    const retries = method === "GET" ? (options.retries ?? 0) : 0;

    for (let attempt = 0; ; attempt++) {
      let reservation: Reservation | undefined;
      if (options.bucket) {
        // Un reintento siempre espera la ventana: el intento anterior ya la consumió.
        reservation =
          options.wait || attempt > 0
            ? await this.options.limiter.acquire(options.bucket, options.signal)
            : await this.options.limiter.take(options.bucket);
      }
      try {
        return await this.send<T>(method, path, options);
      } catch (error) {
        // Si la request no llegó, la API no contó la llamada: se devuelve la ventana.
        if (reservation && error instanceof NinoxNetworkError && !error.sent) {
          await this.options.limiter.release(reservation);
        }
        const retriable = error instanceof NinoxNetworkError || (error instanceof NinoxApiError && error.status >= 500);
        if (!retriable || attempt >= retries) throw error;
        await this.retryDelay(attempt);
      }
    }
  }

  private async send<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const url = new URL(path, this.options.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const onAbort = (): void => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const started = Date.now();

    let response: Response;
    let text: string;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: { "Content-Type": "application/json", "X-NX-TOKEN": this.options.token },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });
      text = await response.text();
    } catch (error) {
      const networkError = describeNetworkError(error, this.options.baseUrl, this.options.timeoutMs);
      console.warn(`[ninox] ${method} ${path} → ${networkError.message} (${Date.now() - started}ms)`);
      throw networkError;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    }
    console.log(`[ninox] ${method} ${path} → ${response.status} (${Date.now() - started}ms)`);

    if (!response.ok) {
      const detail = text.trim().slice(0, 300);
      if (response.status === 403 && options.bucket) {
        const wait = parseWaitSeconds(text);
        if (wait !== null) {
          await this.options.limiter.penalize(options.bucket, wait);
          throw new RateLimitedError(options.bucket, wait, "api");
        }
      }
      throw new NinoxApiError(describeStatus(response.status, detail), response.status, detail);
    }

    if (!text) return null as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}
