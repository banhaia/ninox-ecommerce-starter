import { afterEach, describe, expect, it } from "vitest";
import { mapCatalog } from "~/.server/modules/catalog/mapper";
import { getCatalogSyncStatus, syncCatalog, syncCatalogIfDue } from "~/.server/modules/catalog/sync";
import { createTestContext, fixture, type FakeHandler, type TestContext } from "./helpers";

const catalogo = fixture<unknown[]>("getData.json");
const GET_DATA = "GET /integraciones/Terceros/GetData";

let current: TestContext | undefined;
function setup(routes: Record<string, FakeHandler>, options?: Parameters<typeof createTestContext>[1]): TestContext {
  current = createTestContext(routes, options);
  return current;
}
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

describe("mapCatalog", () => {
  it("normaliza GetData: precio1, curva, tags y artículos sin curva", () => {
    const [remera, taza] = mapCatalog(catalogo);
    expect(remera).toMatchObject({ articuloId: 1001, codigo: "REM-001", nombre: "Remera Básica", precio: 15000, stockTotal: 12 });
    expect(remera?.variants).toHaveLength(3);
    expect(remera?.variants[0]).toMatchObject({ colorId: 1, talleId: 10, talleNombre: "M", colorNombre: "Blanco", unidades: 5 });
    expect(remera?.tags.map((tag) => tag.nombre)).toEqual(["Remeras", "Temporada Verano"]);
    expect(taza).toMatchObject({ articuloId: 1002, variants: [], stockTotal: 0 });
  });

  it("tolera nombres alternativos y descarta basura", () => {
    const items = mapCatalog([
      { articuloId: 7, codigo: "X-7", descripcion: "Solo descripción", precioVenta: "99.5", curva: [{ colorId: 1, cantidad: 2 }, { colorId: 1, cantidad: 3 }] },
      { articuloId: 7, codigo: "duplicado" },
      { sinId: true },
      "texto"
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ nombre: "Solo descripción", precio: 99.5, stockTotal: 5 });
    expect(items[0]?.variants).toEqual([expect.objectContaining({ colorId: 1, talleId: 0, unidades: 5 })]);
  });
});

describe("syncCatalog", () => {
  it("guarda el catálogo y registra el run", async () => {
    const { ctx } = setup({ [GET_DATA]: () => ({ body: catalogo }) });
    await expect(syncCatalog(ctx, "manual")).resolves.toEqual({ ok: true, articulos: 2 });
    expect((await ctx.repos.catalog.list()).map((product) => product.nombre)).toEqual(["Remera Básica", "Taza Cerámica"]);
    expect(await ctx.repos.catalog.lastSyncRun()).toMatchObject({ status: "ok", articulos: 2, trigger: "manual" });
  });

  it("un segundo sync manual dentro de la ventana no llama a Ninox", async () => {
    const { ctx, calls } = setup({ [GET_DATA]: () => ({ body: catalogo }) });
    await syncCatalog(ctx, "manual");
    const second = await syncCatalog(ctx, "manual");
    expect(second).toMatchObject({ ok: false, skipped: true, retryAfterSeconds: 181 });
    expect(calls).toHaveLength(1);
    expect((await getCatalogSyncStatus(ctx)).nextAllowedInSeconds).toBe(181);
    expect(await ctx.repos.catalog.lastSyncRun()).toMatchObject({ status: "skipped" });
  });

  it("un error de Ninox queda registrado y no rompe el catálogo existente", async () => {
    let fail = false;
    const { ctx, advance } = setup({
      [GET_DATA]: () => (fail ? { status: 401, body: "token inválido" } : { body: catalogo })
    });
    await syncCatalog(ctx, "manual");
    fail = true;
    advance(ctx.limiter.windowMs("masivo"));
    const result = await syncCatalog(ctx, "manual");
    expect(result).toMatchObject({ ok: false, skipped: false });
    expect(result.ok ? "" : result.message).toContain("401");
    expect(await ctx.repos.catalog.list()).toHaveLength(2);
    expect(await ctx.repos.catalog.lastSyncRun()).toMatchObject({ status: "error" });
  });

  it("sin token no llama a Ninox", async () => {
    const { ctx, calls } = setup({ [GET_DATA]: () => ({ body: catalogo }) }, { token: null });
    expect(await syncCatalog(ctx, "manual")).toMatchObject({ ok: false, skipped: true });
    expect(calls).toHaveLength(0);
  });

  it("el sync programado solo corre si pasó el intervalo", async () => {
    const { ctx, calls, advance } = setup({ [GET_DATA]: () => ({ body: catalogo }) });
    expect(await syncCatalogIfDue(ctx, 15)).toMatchObject({ ok: true });
    advance(10 * 60_000);
    expect(await syncCatalogIfDue(ctx, 15)).toBeNull();
    advance(5 * 60_000);
    expect(await syncCatalogIfDue(ctx, 15)).toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
  });
});
