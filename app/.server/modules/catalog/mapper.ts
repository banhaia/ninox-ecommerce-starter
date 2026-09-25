import type { CatalogItemInput, TagInput, VariantInput } from "../../data/ports";

/**
 * Normaliza la respuesta de GetData al modelo de la tienda. Es tolerante: acepta campos
 * faltantes o con nombres alternativos que aparecen en distintas versiones del endpoint
 * (precioVenta, stockCantidad, curva.cantidad, codigoCurva…).
 */

type Loose = Record<string, unknown>;

function isRecord(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function num(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function int(...values: unknown[]): number | null {
  const value = num(...values);
  return value !== null && Number.isInteger(value) ? value : null;
}

export function mapCatalog(input: unknown[]): CatalogItemInput[] {
  const items: CatalogItemInput[] = [];
  const seen = new Set<number>();

  for (const item of input) {
    if (!isRecord(item)) continue;
    const articuloId = int(item.articuloId);
    if (articuloId === null || seen.has(articuloId)) continue;
    seen.add(articuloId);

    // Una variante por (color, talle): Ninox puede repetir combinaciones.
    const variants = new Map<string, VariantInput>();
    for (const variante of Array.isArray(item.curva) ? item.curva.filter(isRecord) : []) {
      const colorId = int(variante.colorId) ?? 0;
      const talleId = int(variante.talleId) ?? 0;
      const key = `${colorId}:${talleId}`;
      const unidades = num(variante.unidades, variante.cantidad, variante.total) ?? 0;
      const existing = variants.get(key);
      if (existing) {
        existing.unidades += unidades;
        continue;
      }
      variants.set(key, {
        colorId,
        talleId,
        colorNombre: str(variante.colorNombre),
        colorHex: str(variante.colorHex),
        talleNombre: str(variante.talleNombre),
        codigoBarras: str(variante.codigoBarras, variante.codigoCurva),
        unidades
      });
    }

    const tags = new Map<number, TagInput>();
    for (const tag of Array.isArray(item.tags) ? item.tags.filter(isRecord) : []) {
      const tagId = int(tag.tagId);
      const nombre = str(tag.tagNombre, tag.nombre);
      if (tagId === null || !nombre) continue;
      tags.set(tagId, {
        tagId,
        tipo: int(tag.tipo) ?? 0,
        nombre,
        padreId: int(tag.padreId),
        destacada: tag.destacada === true
      });
    }

    const variantList = [...variants.values()];
    const stockVariantes = variantList.reduce((total, variant) => total + variant.unidades, 0);
    const codigo = str(item.codigo) ?? String(articuloId);

    items.push({
      articuloId,
      codigo,
      nombre: str(item.nombre, item.descripcion, item.descripcionWeb) ?? codigo,
      descripcionNinox: str(item.descripcionWeb, item.descripcion),
      talleColor: int(item.talleColor) ?? 0,
      precio: num(item.precioVenta, item.precio1) ?? 0,
      stockTotal: Math.trunc(num(item.stockTotal, item.stockCantidad) ?? stockVariantes),
      imagenNinox: str(item.imagen),
      rawJson: JSON.stringify(item),
      variants: variantList.map((variant) => ({ ...variant, unidades: Math.trunc(variant.unidades) })),
      tags: [...tags.values()]
    });
  }

  return items;
}
