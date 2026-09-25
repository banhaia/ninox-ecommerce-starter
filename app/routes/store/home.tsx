import { appContext } from "~/.server/context";
import { Card } from "~/components/ui/card";
import { Notice } from "~/components/ui/notice";
import { formatArs } from "~/lib/money";
import type { Route } from "./+types/home";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `Inicio · ${loaderData.count} productos` : "Inicio" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  const products = await ctx.repos.catalog.list({ limit: 12 });
  return { products, count: products.length };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (loaderData.products.length === 0) {
    return (
      <Notice title="Todavía no hay productos">
        El catálogo se sincroniza desde Ninox. Configurá <code>NINOX_TOKEN</code> y sincronizá desde{" "}
        <a href="/admin" className="text-primary underline">
          el panel de administración
        </a>
        .
      </Notice>
    );
  }

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold">Productos</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {loaderData.products.map((product) => (
          <Card key={product.articuloId} className="p-3">
            <div className="mb-3 aspect-square overflow-hidden rounded-lg bg-muted">
              {product.imagen ? (
                <img src={product.imagen} alt={product.nombre} className="h-full w-full object-cover" loading="lazy" />
              ) : null}
            </div>
            <p className="text-sm font-medium">{product.nombre}</p>
            <p className="text-sm text-muted-foreground">{formatArs(product.precio)}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
