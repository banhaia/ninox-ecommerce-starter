/** Redondeo a centavos. Los montos del dominio son number con 2 decimales. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export function formatArs(value: number): string {
  return ars.format(value);
}
