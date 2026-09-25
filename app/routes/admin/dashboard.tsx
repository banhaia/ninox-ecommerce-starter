import { appContext } from "~/.server/context";
import { getStoreSettings } from "~/.server/modules/settings/service";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Notice } from "~/components/ui/notice";
import type { Route } from "./+types/dashboard";

export const meta: Route.MetaFunction = () => [{ title: "Inicio · Admin" }];

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  const [counts, lastSync, settings] = await Promise.all([
    ctx.repos.orders.countBySyncStatus(),
    ctx.repos.catalog.lastSyncRun(),
    getStoreSettings(ctx)
  ]);
  return {
    ninox: { connected: ctx.hasNinox(), env: ctx.ninoxEnv },
    counts,
    lastSync,
    whatsappConfigured: Boolean(settings.whatsappPhone)
  };
}

const STATUS_LABELS = {
  pending: "En cola",
  sending: "Enviando",
  created: "En Ninox",
  failed: "Rechazados",
  unknown: "A verificar",
  cancelled: "Cancelados"
} as const;

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { ninox, counts, lastSync, whatsappConfigured } = loaderData;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Inicio</h1>

      {!ninox.connected ? (
        <Notice tone="warning" title="Ninox no está configurado">
          Definí <code>NINOX_TOKEN</code> (y <code>NINOX_ENV</code>) en las variables de entorno para sincronizar el
          catálogo y enviar pedidos.
        </Notice>
      ) : null}
      {!whatsappConfigured ? (
        <Notice title="WhatsApp sin configurar">Cargá el número de WhatsApp de la tienda para cerrar las ventas.</Notice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-sm text-muted-foreground">Conexión con Ninox</p>
          <p className="mt-1 text-lg font-medium">
            {ninox.connected ? <Badge tone="success">Conectado · {ninox.env}</Badge> : <Badge>Sin token</Badge>}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Último sync de catálogo</p>
          <p className="mt-1 text-lg font-medium">
            {lastSync
              ? `${lastSync.status} · ${lastSync.articulos} artículos · ${new Date(lastSync.startedAt).toLocaleString("es-AR")}`
              : "Nunca"}
          </p>
        </Card>
      </div>

      <Card>
        <p className="mb-3 text-sm text-muted-foreground">Pedidos por estado de sincronización</p>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((status) => (
            <div key={status} className="rounded-lg bg-muted p-3">
              <p className="text-2xl font-semibold">{counts[status]}</p>
              <p className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
