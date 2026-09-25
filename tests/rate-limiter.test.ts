import { afterEach, describe, expect, it } from "vitest";
import { RateLimitedError } from "~/.server/ninox/errors";
import { parseWaitSeconds } from "~/.server/ninox/rate-limiter";
import { createTestContext, type TestContext } from "./helpers";

let current: TestContext | undefined;
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

describe("RateLimiter", () => {
  it("take() reserva la ventana y falla rápido hasta que se libera", async () => {
    current = createTestContext();
    const { ctx, advance } = current;
    await ctx.limiter.take("masivo");
    const error = await ctx.limiter.take("masivo").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterSeconds).toBe(181);

    advance(ctx.limiter.windowMs("masivo"));
    await expect(ctx.limiter.take("masivo")).resolves.toBeUndefined();
  });

  it("acquire() espera la ventana en lugar de fallar", async () => {
    current = createTestContext();
    const { ctx } = current;
    await ctx.limiter.take("parametros");
    const before = ctx.now().getTime();
    await ctx.limiter.acquire("parametros");
    expect(ctx.now().getTime() - before).toBe(ctx.limiter.windowMs("parametros"));
  });

  it("dos reservas simultáneas: solo una toma la ventana", async () => {
    current = createTestContext();
    const { ctx } = current;
    const results = await Promise.allSettled([ctx.limiter.take("comprobante"), ctx.limiter.take("comprobante")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("parsea el mensaje de espera de Ninox", () => {
    expect(parseWaitSeconds("Debe esperar 600 segundos entre cada solicitud")).toBe(600);
    expect(parseWaitSeconds("Otro error")).toBeNull();
  });
});
