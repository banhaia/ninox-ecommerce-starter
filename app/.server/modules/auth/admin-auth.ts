import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createCookieSessionStorage, redirect } from "react-router";
import { getConfig } from "../../config";

/**
 * Acceso al panel /admin: una sola clave (ADMIN_PASSWORD) y una cookie firmada con
 * SESSION_SECRET. Sin tablas de usuarios: alcanza para una tienda chica y funciona igual
 * en serverless. Si hacen falta varios usuarios, reemplazar este módulo.
 */
export interface AdminAuth {
  /** false si falta ADMIN_PASSWORD: el login muestra cómo configurarlo. */
  configured: boolean;
  isAdmin(request: Request): Promise<boolean>;
  /** Para loaders/actions protegidos: redirige al login si no hay sesión. */
  requireAdmin(request: Request): Promise<void>;
  /** Devuelve el header Set-Cookie si la clave es correcta, o null. */
  login(request: Request, password: string): Promise<string | null>;
  logout(request: Request): Promise<string>;
}

export interface AdminAuthOptions {
  password: string | undefined;
  sessionSecret: string | undefined;
  secureCookie: boolean;
}

/** Comparación en tiempo constante (sobre digests, así no filtra el largo). */
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function createAdminAuth(options: AdminAuthOptions): AdminAuth {
  // Sin SESSION_SECRET (solo dev) se usa uno efímero: las sesiones se pierden al reiniciar.
  const secret = options.sessionSecret ?? randomBytes(32).toString("hex");
  const storage = createCookieSessionStorage<{ admin: boolean }>({
    cookie: {
      name: "__nx_admin",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: options.secureCookie,
      secrets: [secret],
      maxAge: 60 * 60 * 24 * 7
    }
  });

  async function isAdmin(request: Request): Promise<boolean> {
    const session = await storage.getSession(request.headers.get("Cookie"));
    return session.get("admin") === true;
  }

  return {
    configured: Boolean(options.password),
    isAdmin,

    async requireAdmin(request) {
      if (await isAdmin(request)) return;
      const url = new URL(request.url);
      throw redirect(`/admin/login?next=${encodeURIComponent(url.pathname + url.search)}`);
    },

    async login(request, password) {
      if (!options.password || !safeEqual(password, options.password)) return null;
      const session = await storage.getSession(request.headers.get("Cookie"));
      session.set("admin", true);
      return storage.commitSession(session);
    },

    async logout(request) {
      const session = await storage.getSession(request.headers.get("Cookie"));
      return storage.destroySession(session);
    }
  };
}

let cached: AdminAuth | undefined;

export function getAdminAuth(): AdminAuth {
  if (!cached) {
    const config = getConfig();
    if (config.isProduction && config.admin.password && !config.admin.sessionSecret) {
      throw new Error("Falta SESSION_SECRET: es obligatorio en producción para firmar la sesión del admin.");
    }
    if (!config.admin.sessionSecret) {
      console.warn("[admin] Sin SESSION_SECRET: se usa un secreto efímero (las sesiones se pierden al reiniciar).");
    }
    cached = createAdminAuth({
      password: config.admin.password,
      sessionSecret: config.admin.sessionSecret,
      secureCookie: config.isProduction
    });
  }
  return cached;
}

/** Evita open redirects: solo rutas internas del admin. */
export function safeNext(value: string | null): string {
  return value && value.startsWith("/admin") && !value.startsWith("//") ? value : "/admin";
}
