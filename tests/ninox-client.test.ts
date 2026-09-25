import { afterEach, describe, expect, it } from "vitest";
import { NinoxApiError, NinoxNetworkError, NinoxNotConfiguredError, RateLimitedError } from "~/.server/ninox/errors";
import type { NinoxPedido } from "~/.server/ninox/types";
import { abortError, createTestContext, fixture, networkError, type TestContext } from "./helpers";

const pedido: NinoxPedido = {
  ordenId: 1,
  numero: 1,
  usuario: {
    nombre: "Cliente Ejemplo",
    email: "ejemplo@example.com",
    dni: "",
    cuit: "",
    telefono: "5491100000000",
    condicion: 1
  },
  productos: [{ articuloId: 1001, precio: 15000, cantidad: 1, talleId: 10, colorId: 1 }],
  subtotal: 15000,
  descuento: 0,
  envio: 0,
  recargo: 0,
  total: 15000
};

let current: TestContext | undefined;
function setup(...args: Parameters<typeof createTestContext>): TestContext {
  current = createTestContext(...args);
  return current;
}
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

describe("NinoxClient", () => {
  it("envía el token en X-NX-TOKEN y parsea GetData", async () => {
    const { ctx, calls } = setup({ "GET /integraciones/Terceros/GetData": () => ({ body: fixture("getData.json") }) });
    const articulos = await ctx.ninox().getData();
    expect(articulos).toHaveLength(2);
    expect(calls[0]?.headers["X-NX-TOKEN"]).toBe("token-de-prueba");
  });

  it("sin token lanza NinoxNotConfiguredError", () => {
    const { ctx } = setup({}, { token: null });
    expect(ctx.hasNinox()).toBe(false);
    expect(() => ctx.ninox()).toThrow(NinoxNotConfiguredError);
  });

  it("nunca reintenta un POST, aunque Ninox responda 5xx", async () => {
    const { ctx, calls } = setup({ "POST /integraciones/Terceros/Pedido": () => ({ status: 502, body: "bad gateway" }) });
    await expect(ctx.ninox().createPedido(pedido)).rejects.toBeInstanceOf(NinoxApiError);
    expect(calls).toHaveLength(1);
  });

  it("reintenta un GET ante 5xx esperando la ventana del bucket", async () => {
    let attempt = 0;
    const { ctx, calls } = setup({
      "GET /integraciones/terceros/comprobante/9001": () =>
        ++attempt === 1 ? { status: 503, body: "" } : { body: { facturaId: 9001, ordenId: "1", comprobanteTipo: 33, estado: 1 } }
    });
    const comprobante = await ctx.ninox().getComprobante(9001);
    expect(comprobante.ordenId).toBe("1");
    expect(calls).toHaveLength(2);
  });

  it("distingue 'no llegó' (seguro reenviar) de timeout (resultado desconocido)", async () => {
    const refused = setup({ "POST /integraciones/Terceros/Pedido": () => networkError("ECONNREFUSED") });
    const notSent = await refused.ctx.ninox().createPedido(pedido).catch((error: unknown) => error);
    expect(notSent).toBeInstanceOf(NinoxNetworkError);
    expect((notSent as NinoxNetworkError).sent).toBe(false);
    await refused.cleanup();

    const timeout = setup({ "POST /integraciones/Terceros/Pedido": () => abortError() });
    const unknown = await timeout.ctx.ninox().createPedido(pedido).catch((error: unknown) => error);
    expect(unknown).toBeInstanceOf(NinoxNetworkError);
    expect((unknown as NinoxNetworkError).sent).toBe(true);
    expect((unknown as NinoxNetworkError).timedOut).toBe(true);
  });

  it("un 403 'Debe esperar N segundos' penaliza el bucket con ese valor", async () => {
    const { ctx } = setup({
      "GET /integraciones/Terceros/GetData": () => ({ status: 403, body: "Debe esperar 120 segundos entre cada solicitud" })
    });
    const error = await ctx.ninox().getData().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterSeconds).toBe(120);
    expect(await ctx.limiter.remainingMs("masivo")).toBe(121_000);
  });

  it("devuelve el motivo del rechazo de Pedido (facturaId 0) sin lanzar", async () => {
    const { ctx } = setup({ "POST /integraciones/Terceros/Pedido": () => ({ body: fixture("pedido-rechazado.json") }) });
    const result = await ctx.ninox().createPedido(pedido);
    expect(result.facturaId).toBe(0);
    expect(result.datos?.error).toBe("Artículo sin stock");
  });
});
