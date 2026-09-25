import { data, Form, redirect, useNavigation } from "react-router";
import { getAdminAuth, safeNext } from "~/.server/modules/auth/admin-auth";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { FieldError, Input, Label } from "~/components/ui/input";
import { Notice } from "~/components/ui/notice";
import type { Route } from "./+types/login";

export const meta: Route.MetaFunction = () => [{ title: "Ingresar · Admin" }];

export async function loader({ request }: Route.LoaderArgs) {
  const auth = getAdminAuth();
  if (await auth.isAdmin(request)) throw redirect(safeNext(new URL(request.url).searchParams.get("next")));
  return { configured: auth.configured };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const cookie = await getAdminAuth().login(request, password);
  if (!cookie) return data({ error: "Clave incorrecta" }, { status: 401 });
  throw redirect(safeNext(new URL(request.url).searchParams.get("next")), { headers: { "Set-Cookie": cookie } });
}

export default function AdminLogin({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-4 text-xl font-semibold">Panel de la tienda</h1>
        {loaderData.configured ? (
          <Form method="post" className="space-y-4">
            <div>
              <Label htmlFor="password">Clave</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
              <FieldError message={actionData?.error} />
            </div>
            <Button type="submit" className="w-full" disabled={navigation.state !== "idle"}>
              Ingresar
            </Button>
          </Form>
        ) : (
          <Notice tone="warning" title="Falta configurar el acceso">
            Definí <code>ADMIN_PASSWORD</code> y <code>SESSION_SECRET</code> en las variables de entorno (ver{" "}
            <code>.env.example</code>) y reiniciá el servidor.
          </Notice>
        )}
      </Card>
    </main>
  );
}
