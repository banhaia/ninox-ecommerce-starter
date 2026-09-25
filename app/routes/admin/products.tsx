import { Form, useFetcher } from "react-router";
import { appContext } from "~/.server/context";
import { getCatalogSyncStatus, syncCatalog } from "~/.server/modules/catalog/sync";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Notice } from "~/components/ui/notice";
import { formatArs } from "~/lib/money";
import type { Route } from "./+types/products";

export const meta: Route.MetaFunction = () => [{ title: "Productos · Admin" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const [products, status] = await Promise.all([
    ctx.repos.catalog.list({ q, includeHidden: true, limit: 200 }),
    getCatalogSyncStatus(ctx)
  ]);
  return { q, products, status };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  if (form.get("intent") !== "sync") return { ok: false as const, skipped: false, message: "Acción desconocida" };
  return syncCatalog(context.get(appContext), "manual");
}

const RUN_LABELS = { running: "En curso", ok: "OK", error: "Error", skipped: "Omitido" } as const;
const RUN_TONES = { running: "info", ok: "success", error: "danger", skipped: "warning" } as const;

export default function AdminProducts({ loaderData }: Route.ComponentProps) {
  const { q, products, status } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const syncing = fetcher.state !== "idle";
  const result = fetcher.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="sync" />
          <Button type="submit" disabled={syncing || !status.configured}>
            {syncing ? "Sincronizando…" : "Sincronizar con Ninox"}
          </Button>
        </fetcher.Form>
      </div>

      {!status.configured ? (
        <Notice tone="warning" title="Ninox no está configurado">
          Definí <code>NINOX_TOKEN</code> en el <code>.env</code> y reiniciá el servidor.
        </Notice>
      ) : null}

      {result ? (
        result.ok ? (
          <Notice title={`Catálogo sincronizado: ${result.articulos} artículos`} />
        ) : (
          <Notice tone={result.skipped ? "warning" : "danger"} title="No se pudo sincronizar">
            {result.message}
          </Notice>
        )
      ) : null}

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          Último sync:{" "}
          {status.lastRun ? (
            <>
              <Badge tone={RUN_TONES[status.lastRun.status]}>{RUN_LABELS[status.lastRun.status]}</Badge>{" "}
              {new Date(status.lastRun.startedAt).toLocaleString("es-AR")}
              {status.lastRun.status === "ok" ? ` · ${status.lastRun.articulos} artículos` : ""}
            </>
          ) : (
            "nunca"
          )}
        </span>
        {status.lastRun?.error ? <span className="text-muted-foreground">{status.lastRun.error}</span> : null}
        {status.nextAllowedInSeconds > 0 ? (
          <span className="text-muted-foreground">
            Ninox permite el próximo sync en {Math.ceil(status.nextAllowedInSeconds / 60)} min
          </span>
        ) : null}
      </Card>

      <Form method="get" className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre o código" className="max-w-sm" />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </Form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 text-right font-medium">Precio</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Vitrina</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.articuloId} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{product.nombre}</td>
                <td className="px-4 py-3 text-muted-foreground">{product.codigo}</td>
                <td className="px-4 py-3 text-right">{formatArs(product.precio)}</td>
                <td className="px-4 py-3 text-right">{product.stockTotal}</td>
                <td className="space-x-1 px-4 py-3">
                  {product.visible ? <Badge tone="success">Visible</Badge> : <Badge>Oculto</Badge>}
                  {product.destacado ? <Badge tone="info">Destacado</Badge> : null}
                </td>
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {q ? "No hay productos que coincidan." : "Todavía no hay productos: sincronizá con Ninox."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
