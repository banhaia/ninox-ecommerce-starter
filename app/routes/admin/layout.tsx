import { Form, NavLink, Outlet } from "react-router";
import { getAdminAuth } from "~/.server/modules/auth/admin-auth";
import { cn } from "~/lib/cn";
import type { Route } from "./+types/layout";

/** Todo lo que cuelga de este layout requiere sesión de admin. */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }) => {
    await getAdminAuth().requireAdmin(request);
  }
];

const NAV = [{ to: "/admin", label: "Inicio", end: true }];

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-muted">
      <header className="border-b border-border bg-white">
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-1 text-sm">
            <span className="mr-4 font-semibold">Admin</span>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn("rounded-md px-3 py-1.5 hover:bg-muted", isActive && "bg-muted font-medium")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <a href="/" className="text-muted-foreground hover:text-foreground">
              Ver tienda
            </a>
            <Form method="post" action="/admin/logout">
              <button type="submit" className="text-muted-foreground hover:text-foreground">
                Salir
              </button>
            </Form>
          </div>
        </div>
      </header>
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
