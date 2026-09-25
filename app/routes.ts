import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  // Tienda
  layout("routes/store/layout.tsx", [index("routes/store/home.tsx")]),

  // Admin: login/logout públicos; el resto detrás del layout con middleware de sesión.
  route("admin/login", "routes/admin/login.tsx"),
  route("admin/logout", "routes/admin/logout.tsx"),
  ...prefix("admin", [
    layout("routes/admin/layout.tsx", [
      index("routes/admin/dashboard.tsx"),
      route("productos", "routes/admin/products.tsx")
    ])
  ]),

  // Recursos
  route("healthz", "routes/api/healthz.ts")
] satisfies RouteConfig;
