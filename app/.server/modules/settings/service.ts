import { z } from "zod";
import type { AppContext } from "../../context";

/** Configuración de la tienda editable desde /admin/configuracion. */
export interface StoreSettings {
  storeName: string;
  /** Número de WhatsApp en formato internacional sin "+" ni espacios (ej. 5491100000000). */
  whatsappPhone: string;
  /** Plantilla del mensaje. Variables: {tienda} {codigo} {nombre} {items} {total} {entrega}. */
  whatsappTemplate: string;
  /** Piso del ordenId enviado a Ninox (para que dos apps con el mismo token no choquen). */
  ordenIdBase: number;
}

export const DEFAULT_WHATSAPP_TEMPLATE = [
  "¡Hola {tienda}! Hice el pedido *{codigo}*:",
  "{items}",
  "Total: *{total}*",
  "Entrega: {entrega}",
  "A nombre de: {nombre}"
].join("\n");

const DEFAULTS: StoreSettings = {
  storeName: "Mi tienda",
  whatsappPhone: "",
  whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
  ordenIdBase: 1
};

const KEYS: Record<keyof StoreSettings, string> = {
  storeName: "store.name",
  whatsappPhone: "whatsapp.phone",
  whatsappTemplate: "whatsapp.template",
  ordenIdBase: "orders.ordenIdBase"
};

export const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(1, "Ingresá el nombre de la tienda").max(80),
  whatsappPhone: z
    .string()
    .trim()
    .regex(/^\d{8,15}$/, "Usá formato internacional, solo dígitos (ej. 5491100000000)")
    .or(z.literal("")),
  whatsappTemplate: z.string().trim().min(1, "La plantilla no puede quedar vacía").max(1000),
  ordenIdBase: z.coerce.number().int().min(1)
});

export async function getStoreSettings(ctx: AppContext): Promise<StoreSettings> {
  const stored = await ctx.repos.settings.getAll();
  const read = (key: keyof StoreSettings): string | undefined => stored[KEYS[key]];
  const ordenIdBase = Number(read("ordenIdBase"));
  return {
    storeName: read("storeName") ?? DEFAULTS.storeName,
    whatsappPhone: read("whatsappPhone") ?? DEFAULTS.whatsappPhone,
    whatsappTemplate: read("whatsappTemplate") ?? DEFAULTS.whatsappTemplate,
    ordenIdBase: Number.isInteger(ordenIdBase) && ordenIdBase > 0 ? ordenIdBase : DEFAULTS.ordenIdBase
  };
}

export async function saveStoreSettings(ctx: AppContext, patch: Partial<StoreSettings>): Promise<StoreSettings> {
  const next = storeSettingsSchema.parse({ ...(await getStoreSettings(ctx)), ...patch });
  await ctx.repos.settings.setMany(
    Object.fromEntries(
      (Object.keys(KEYS) as Array<keyof StoreSettings>).map((key) => [KEYS[key], String(next[key])])
    )
  );
  return next;
}
