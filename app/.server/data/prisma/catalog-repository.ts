import { normalizeSearch, slugify } from "~/lib/text";
import type {
  CatalogRepository,
  PricingRow,
  ProductDetail,
  ProductSummary,
  SyncRun,
  TagInput
} from "../ports";
import type { Db } from "./client";
import type { Prisma } from "./generated/client";

const summaryInclude = { showcase: true } satisfies Prisma.ProductInclude;
const detailInclude = {
  showcase: true,
  variants: { orderBy: [{ talleId: "asc" }, { colorId: "asc" }] },
  tags: { include: { tag: true } }
} satisfies Prisma.ProductInclude;

type SummaryRow = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>;
type DetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

function parseImages(json: string | undefined): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toSummary(row: SummaryRow): ProductSummary {
  const imagenes = parseImages(row.showcase?.imagenes);
  return {
    articuloId: row.articuloId,
    slug: row.showcase?.slug ?? slugify(row.nombre, row.articuloId),
    nombre: row.nombre,
    precio: row.precio.toNumber(),
    stockTotal: row.stockTotal,
    imagen: imagenes[0] ?? row.imagenNinox,
    destacado: row.showcase?.destacado ?? false
  };
}

function toDetail(row: DetailRow): ProductDetail {
  const imagenes = parseImages(row.showcase?.imagenes);
  return {
    ...toSummary(row),
    codigo: row.codigo,
    descripcion: row.showcase?.descripcion ?? row.descripcionNinox,
    talleColor: row.talleColor,
    imagenes: imagenes.length > 0 ? imagenes : row.imagenNinox ? [row.imagenNinox] : [],
    visible: row.showcase?.visible ?? true,
    orden: row.showcase?.orden ?? 0,
    variants: row.variants.map((variant) => ({
      articuloId: variant.articuloId,
      colorId: variant.colorId,
      talleId: variant.talleId,
      colorNombre: variant.colorNombre,
      colorHex: variant.colorHex,
      talleNombre: variant.talleNombre,
      codigoBarras: variant.codigoBarras,
      unidades: variant.unidades
    })),
    tags: row.tags.map(({ tag }) => ({ tagId: tag.tagId, tipo: tag.tipo, nombre: tag.nombre }))
  };
}

function variantLabel(variant: { talleNombre: string | null; colorNombre: string | null }): string | null {
  const parts = [variant.talleNombre, variant.colorNombre].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" / ") : null;
}

function toSyncRun(row: {
  id: number;
  trigger: string;
  status: string;
  articulos: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): SyncRun {
  return {
    ...row,
    trigger: row.trigger === "scheduled" ? "scheduled" : "manual",
    status: row.status as SyncRun["status"]
  };
}

export function createCatalogRepository(db: Db): CatalogRepository {
  return {
    async replaceAll(items, syncedAt) {
      const tags = new Map<number, TagInput>();
      for (const item of items) for (const tag of item.tags) tags.set(tag.tagId, tag);

      await db.$transaction(
        async (tx) => {
          await tx.product.updateMany({ data: { eliminado: true } });
          await tx.variant.deleteMany();
          await tx.productTag.deleteMany();

          for (const tag of tags.values()) {
            const data = { tipo: tag.tipo, nombre: tag.nombre, padreId: tag.padreId, destacada: tag.destacada };
            await tx.tag.upsert({ where: { tagId: tag.tagId }, create: { tagId: tag.tagId, ...data }, update: data });
          }

          for (const item of items) {
            const data = {
              codigo: item.codigo,
              nombre: item.nombre,
              descripcionNinox: item.descripcionNinox,
              searchText: normalizeSearch(`${item.nombre} ${item.codigo}`),
              talleColor: item.talleColor,
              precio: item.precio,
              stockTotal: item.stockTotal,
              imagenNinox: item.imagenNinox,
              eliminado: false,
              rawJson: item.rawJson,
              syncedAt
            };
            await tx.product.upsert({
              where: { articuloId: item.articuloId },
              create: { articuloId: item.articuloId, ...data },
              update: data
            });
            // La vitrina es del admin: solo se crea si falta, nunca se pisa.
            await tx.productShowcase.upsert({
              where: { articuloId: item.articuloId },
              create: { articuloId: item.articuloId, slug: slugify(item.nombre, item.articuloId) },
              update: {}
            });
            if (item.variants.length > 0) {
              await tx.variant.createMany({
                data: item.variants.map((variant) => ({ ...variant, articuloId: item.articuloId }))
              });
            }
            if (item.tags.length > 0) {
              await tx.productTag.createMany({
                data: [...new Set(item.tags.map((tag) => tag.tagId))].map((tagId) => ({
                  articuloId: item.articuloId,
                  tagId
                }))
              });
            }
          }
        },
        { timeout: 120_000 }
      );

      return { articulos: items.length };
    },

    async list(filter = {}) {
      const where: Prisma.ProductWhereInput = { eliminado: false };
      if (filter.q?.trim()) where.searchText = { contains: normalizeSearch(filter.q) };
      if (filter.tagId) where.tags = { some: { tagId: filter.tagId } };
      const showcase: Prisma.ProductShowcaseWhereInput = {};
      if (!filter.includeHidden) showcase.visible = true;
      if (filter.destacados) showcase.destacado = true;
      if (Object.keys(showcase).length > 0) where.showcase = { is: showcase };

      const rows = await db.product.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ showcase: { orden: "asc" } }, { nombre: "asc" }],
        take: filter.limit ?? 48,
        skip: filter.offset ?? 0
      });
      return rows.map(toSummary);
    },

    async findBySlug(slug) {
      const row = await db.product.findFirst({
        where: { eliminado: false, showcase: { is: { slug } } },
        include: detailInclude
      });
      return row ? toDetail(row) : null;
    },

    async findById(articuloId) {
      const row = await db.product.findUnique({ where: { articuloId }, include: detailInclude });
      return row ? toDetail(row) : null;
    },

    async findForPricing(keys) {
      const ids = [...new Set(keys.map((key) => key.articuloId))];
      const products = await db.product.findMany({
        where: { articuloId: { in: ids }, eliminado: false },
        include: { variants: true }
      });
      const byId = new Map(products.map((product) => [product.articuloId, product]));

      const rows: PricingRow[] = [];
      for (const key of keys) {
        const product = byId.get(key.articuloId);
        if (!product) continue;
        const precio = product.precio.toNumber();
        const variant = product.variants.find((item) => item.colorId === key.colorId && item.talleId === key.talleId);
        if (variant) {
          rows.push({ ...key, nombre: product.nombre, variante: variantLabel(variant), precio, unidades: variant.unidades });
        } else if (product.variants.length === 0 && key.colorId === 0 && key.talleId === 0) {
          rows.push({ ...key, nombre: product.nombre, variante: null, precio, unidades: product.stockTotal });
        }
      }
      return rows;
    },

    async listCategories() {
      // tipo 1 = CATEGORIA en Ninox. Solo las que tienen algún artículo vigente.
      const rows = await db.tag.findMany({
        where: { tipo: 1, products: { some: { product: { eliminado: false } } } },
        orderBy: { nombre: "asc" }
      });
      return rows.map((row) => ({ tagId: row.tagId, tipo: row.tipo, nombre: row.nombre }));
    },

    async updateShowcase(articuloId, patch) {
      const { imagenes, ...rest } = patch;
      const data = { ...rest, ...(imagenes === undefined ? {} : { imagenes: JSON.stringify(imagenes) }) };
      await db.productShowcase.update({ where: { articuloId }, data });
    },

    async startSyncRun(trigger, at) {
      const run = await db.catalogSyncRun.create({ data: { trigger, status: "running", startedAt: at } });
      return run.id;
    },

    async finishSyncRun(id, result, at) {
      await db.catalogSyncRun.update({
        where: { id },
        data: { status: result.status, articulos: result.articulos ?? 0, error: result.error ?? null, finishedAt: at }
      });
    },

    async lastSyncRun() {
      const row = await db.catalogSyncRun.findFirst({ orderBy: { startedAt: "desc" } });
      return row ? toSyncRun(row) : null;
    }
  };
}
