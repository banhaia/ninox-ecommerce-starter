import { Link, Outlet } from "react-router";
import { appContext } from "~/.server/context";
import { getStoreSettings } from "~/.server/modules/settings/service";
import type { Route } from "./+types/layout";

export async function loader({ context }: Route.LoaderArgs) {
  const settings = await getStoreSettings(context.get(appContext));
  return { storeName: settings.storeName };
}

export default function StoreLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-semibold">
            {loaderData.storeName}
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="hover:text-primary">
              Inicio
            </Link>
          </nav>
        </div>
      </header>
      <main className="container mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        {loaderData.storeName} · Tienda conectada a Ninox ERP
      </footer>
    </div>
  );
}
