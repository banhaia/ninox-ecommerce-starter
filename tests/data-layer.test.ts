import { afterEach, describe, expect, it } from "vitest";
import type { CatalogItemInput, NewOrder } from "~/.server/data";
import { createTestContext, type TestContext } from "./helpers";

let current: TestContext | undefined;
function setup(): TestContext {
  current = createTestContext();
  return current;
}
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

const remera: CatalogItemInput = {
  articuloId: 1001,
  codigo: "REM-001",
  nombre: "Remera Básica",
  descripcionNinox: "Remera básica de algodón",
  talleColor: 3,
  precio: 15000,
  stockTotal: 9,
  imagenNinox: null,
  rawJson: "{}",
  variants: [
    { colorId: 1, talleId: 10, colorNombre: "Blanco", colorHex: "#ffffff", talleNombre: "M", codigoBarras: null, unidades: 5 },
    { colorId: 1, talleId: 11, colorNombre: "Blanco", colorHex: "#ffffff", talleNombre: "L", codigoBarras: null, unidades: 4 }
  ],
  tags: [{ tagId: 50, tipo: 1, nombre: "Remeras", padreId: null, destacada: false }]
};

const taza: CatalogItemInput = {
  ...remera,
  articuloId: 1002,
  codigo: "TAZ-010",
  nombre: "Taza Cerámica",
  talleColor: 0,
  precio: 4500,
  stockTotal: 3,
  variants: [],
  tags: [{ tagId: 51, tipo: 1, nombre: "Bazar", padreId: null, destacada: false }]
};

function newOrder(ordenId: number, createdAt: Date): NewOrder {
  return {
    code: `TEST-${ordenId}`,
    ordenId,
    cliente: { nombre: "Cliente Ejemplo", email: "ejemplo@example.com", telefono: "5491100000000", dni: null },
    entrega: "retiro",
    direccion: null,
    notas: null,
    subtotal: 15000,
    envio: 0,
    descuento: 0,
    total: 15000,
    items: [
      { articuloId: 1001, colorId: 1, talleId: 10, nombre: "Remera Básica", variante: "M / Blanco", precio: 15000, cantidad: 1 }
    ],
    payloadJson: JSON.stringify({ ordenId }),
    createdAt
  };
}

function inOneMinute(date: Date): Date {
  return new Date(date.getTime() + 60_000);
}

describe("Counter", () => {
  it("entrega valores únicos con incrementos concurrentes y respeta el piso", async () => {
    const { ctx } = setup();
    const values = await Promise.all(Array.from({ length: 20 }, () => ctx.repos.counters.next("ordenId", 1000)));
    expect(new Set(values).size).toBe(20);
    expect(Math.min(...values)).toBe(1000);
    expect(Math.max(...values)).toBe(1019);
    // Subir el piso adelanta la secuencia.
    expect(await ctx.repos.counters.next("ordenId", 5000)).toBe(5000);
  });
});

describe("CatalogRepository", () => {
  it("reemplaza el catálogo sin pisar la vitrina y da de baja lo que no vino", async () => {
    const { ctx } = setup();
    await ctx.repos.catalog.replaceAll([remera, taza], ctx.now());
    await ctx.repos.catalog.updateShowcase(1001, {
      destacado: true,
      descripcion: "Texto de vitrina",
      imagenes: ["https://example.com/remera.jpg"]
    });

    await ctx.repos.catalog.replaceAll([{ ...remera, precio: 16000 }], ctx.now());

    const detail = await ctx.repos.catalog.findBySlug("remera-basica-1001");
    expect(detail?.precio).toBe(16000);
    expect(detail?.descripcion).toBe("Texto de vitrina");
    expect(detail?.imagen).toBe("https://example.com/remera.jpg");
    expect(detail?.variants).toHaveLength(2);
    expect(await ctx.repos.catalog.list()).toHaveLength(1);
    expect(await ctx.repos.catalog.findBySlug("taza-ceramica-1002")).toBeNull();
  });

  it("busca sin distinguir acentos ni mayúsculas y filtra por destacados y categoría", async () => {
    const { ctx } = setup();
    await ctx.repos.catalog.replaceAll([remera, taza], ctx.now());
    await ctx.repos.catalog.updateShowcase(1002, { destacado: true });
    const ids = (list: Array<{ articuloId: number }>) => list.map((product) => product.articuloId);
    expect(ids(await ctx.repos.catalog.list({ q: "CERAMICA" }))).toEqual([1002]);
    expect(ids(await ctx.repos.catalog.list({ destacados: true }))).toEqual([1002]);
    expect(ids(await ctx.repos.catalog.list({ tagId: 50 }))).toEqual([1001]);
    expect((await ctx.repos.catalog.listCategories()).map((tag) => tag.nombre)).toEqual(["Bazar", "Remeras"]);
  });

  it("resuelve precio y stock por variante (y por artículo sin curva)", async () => {
    const { ctx } = setup();
    await ctx.repos.catalog.replaceAll([remera, taza], ctx.now());
    const rows = await ctx.repos.catalog.findForPricing([
      { articuloId: 1001, colorId: 1, talleId: 11 },
      { articuloId: 1002, colorId: 0, talleId: 0 },
      { articuloId: 1001, colorId: 9, talleId: 9 }
    ]);
    expect(rows).toEqual([
      { articuloId: 1001, colorId: 1, talleId: 11, nombre: "Remera Básica", variante: "L / Blanco", precio: 15000, unidades: 4 },
      { articuloId: 1002, colorId: 0, talleId: 0, nombre: "Taza Cerámica", variante: null, precio: 4500, unidades: 3 }
    ]);
  });
});

describe("OrderRepository (outbox hacia Ninox)", () => {
  it("crea pedido, outbox pending y evento en una sola escritura", async () => {
    const { ctx } = setup();
    const { code } = await ctx.repos.orders.create(newOrder(1, ctx.now()));
    const order = await ctx.repos.orders.findByCode(code);
    expect(order?.sync).toMatchObject({ ordenId: 1, status: "pending", attempts: 0 });
    expect(order?.items[0]).toMatchObject({ precio: 15000, variante: "M / Blanco" });
    expect(order?.events.map((event) => event.type)).toEqual(["created"]);
  });

  it("claimNext: dos despachadores concurrentes nunca toman el mismo pedido", async () => {
    const { ctx } = setup();
    await ctx.repos.orders.create(newOrder(1, ctx.now()));
    const now = ctx.now();
    const [a, b] = await Promise.all([
      ctx.repos.orders.claimNext(now, inOneMinute(now)),
      ctx.repos.orders.claimNext(now, inOneMinute(now))
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((a ?? b)?.attempts).toBe(1);
    expect(await ctx.repos.orders.claimNext(now, inOneMinute(now))).toBeNull();
  });

  it("respeta el backoff: no toma pedidos con nextAttemptAt futuro", async () => {
    const { ctx, advance } = setup();
    const { id } = await ctx.repos.orders.create(newOrder(1, ctx.now()));
    await ctx.repos.orders.updateSync(
      id,
      { nextAttemptAt: new Date(ctx.now().getTime() + 30_000) },
      { type: "retry-scheduled", message: "Reintento en 30 s" }
    );
    expect(await ctx.repos.orders.claimNext(ctx.now(), inOneMinute(ctx.now()))).toBeNull();
    advance(30_000);
    expect(await ctx.repos.orders.claimNext(ctx.now(), inOneMinute(ctx.now()))).not.toBeNull();
  });

  it("updateSync con estado esperado no pisa una transición concurrente", async () => {
    const { ctx } = setup();
    const { id } = await ctx.repos.orders.create(newOrder(1, ctx.now()));
    const applied = await ctx.repos.orders.updateSync(
      id,
      { status: "created", facturaId: 9001 },
      { type: "created-in-ninox", message: "ok" },
      ["sending"]
    );
    expect(applied).toBe(false);
    expect((await ctx.repos.orders.findById(id))?.sync.status).toBe("pending");
  });

  it("un lock vencido en 'sending' pasa a 'unknown' (nunca se reenvía solo)", async () => {
    const { ctx, advance } = setup();
    const { id } = await ctx.repos.orders.create(newOrder(1, ctx.now()));
    await ctx.repos.orders.claimNext(ctx.now(), inOneMinute(ctx.now()));
    advance(61_000);
    expect(await ctx.repos.orders.expireStaleLocks(ctx.now())).toBe(1);
    expect((await ctx.repos.orders.findById(id))?.sync.status).toBe("unknown");
    expect(await ctx.repos.orders.countBySyncStatus()).toMatchObject({ unknown: 1, pending: 0, sending: 0 });
  });
});
