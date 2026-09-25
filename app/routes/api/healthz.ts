import { appContext } from "~/.server/context";
import type { Route } from "./+types/healthz";

/** Chequeo de vida para Azure/Vercel/Netlify: responde 200 si la base contesta. */
export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  try {
    await ctx.repos.settings.getAll();
    return Response.json({ ok: true, ninox: ctx.hasNinox() ? ctx.ninoxEnv : "sin-token" });
  } catch {
    return Response.json({ ok: false, error: "La base de datos no responde" }, { status: 503 });
  }
}
