import { redirect } from "react-router";
import { getAdminAuth } from "~/.server/modules/auth/admin-auth";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  const cookie = await getAdminAuth().logout(request);
  throw redirect("/admin/login", { headers: { "Set-Cookie": cookie } });
}

export function loader() {
  throw redirect("/admin");
}
