import { afterEach, describe, expect, it } from "vitest";
import { createAdminAuth, safeNext } from "~/.server/modules/auth/admin-auth";
import { DEFAULT_WHATSAPP_TEMPLATE, getStoreSettings, saveStoreSettings } from "~/.server/modules/settings/service";
import { createTestContext, type TestContext } from "./helpers";

const auth = createAdminAuth({
  password: "clave-de-prueba",
  sessionSecret: "secreto-de-prueba-de-al-menos-32-caracteres",
  secureCookie: false
});

function request(cookie?: string): Request {
  return new Request("http://localhost/admin/pedidos?estado=failed", { headers: cookie ? { Cookie: cookie } : {} });
}

async function loginCookie(target = auth): Promise<string> {
  const setCookie = await target.login(request(), "clave-de-prueba");
  if (!setCookie) throw new Error("login falló");
  return setCookie.split(";")[0] ?? "";
}

describe("admin auth", () => {
  it("rechaza una clave incorrecta y acepta la correcta con cookie firmada", async () => {
    expect(await auth.login(request(), "otra-clave")).toBeNull();
    const setCookie = await auth.login(request(), "clave-de-prueba");
    expect(setCookie).toContain("__nx_admin=");
    expect(setCookie).toContain("HttpOnly");
    const cookie = await loginCookie();
    expect(await auth.isAdmin(request(cookie))).toBe(true);
    await expect(auth.requireAdmin(request(cookie))).resolves.toBeUndefined();
  });

  it("sin sesión redirige al login conservando la ruta", async () => {
    const thrown = await auth.requireAdmin(request()).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fpedidos%3Festado%3Dfailed");
  });

  it("una cookie firmada con otro secreto no vale", async () => {
    const other = createAdminAuth({ password: "clave-de-prueba", sessionSecret: "x".repeat(32), secureCookie: false });
    expect(await auth.isAdmin(request(await loginCookie(other)))).toBe(false);
  });

  it("safeNext evita redirecciones abiertas", () => {
    expect(safeNext("/admin/pedidos")).toBe("/admin/pedidos");
    expect(safeNext("https://evil.example.com")).toBe("/admin");
    expect(safeNext("//evil.example.com")).toBe("/admin");
    expect(safeNext(null)).toBe("/admin");
  });
});

describe("settings", () => {
  let current: TestContext | undefined;
  afterEach(async () => {
    await current?.cleanup();
    current = undefined;
  });

  it("devuelve defaults y valida al guardar", async () => {
    current = createTestContext();
    const { ctx } = current;
    expect(await getStoreSettings(ctx)).toEqual({
      storeName: "Mi tienda",
      whatsappPhone: "",
      whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
      ordenIdBase: 1
    });
    await saveStoreSettings(ctx, { storeName: "Tienda Ejemplo", whatsappPhone: "5491100000000", ordenIdBase: 5000 });
    expect(await getStoreSettings(ctx)).toMatchObject({ storeName: "Tienda Ejemplo", ordenIdBase: 5000 });
    await expect(saveStoreSettings(ctx, { whatsappPhone: "+54 9 11" })).rejects.toThrow();
  });
});
