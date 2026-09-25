import {
  ORDER_SYNC_STATUSES,
  type Entrega,
  type OrderDetail,
  type OrderRepository,
  type OrderSyncStatus
} from "../ports";
import type { Db } from "./client";
import type { Prisma } from "./generated/client";

const detailInclude = {
  items: { orderBy: { id: "asc" } },
  sync: true,
  events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }
} satisfies Prisma.OrderInclude;

type DetailRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

function toStatus(value: string): OrderSyncStatus {
  return (ORDER_SYNC_STATUSES as readonly string[]).includes(value) ? (value as OrderSyncStatus) : "unknown";
}

function toDetail(row: DetailRow): OrderDetail {
  if (!row.sync) throw new Error(`El pedido ${row.code} no tiene registro de sincronización`);
  return {
    id: row.id,
    code: row.code,
    cliente: { nombre: row.clienteNombre, email: row.clienteEmail, telefono: row.clienteTelefono, dni: row.clienteDni },
    entrega: row.entrega as Entrega,
    direccion:
      row.entrega === "envio"
        ? {
            direccion: row.direccion ?? "",
            localidad: row.localidad ?? "",
            provincia: row.provincia ?? "",
            codigoPostal: row.codigoPostal ?? ""
          }
        : null,
    notas: row.notas,
    subtotal: row.subtotal.toNumber(),
    envio: row.envio.toNumber(),
    descuento: row.descuento.toNumber(),
    total: row.total.toNumber(),
    createdAt: row.createdAt,
    items: row.items.map((item) => ({
      articuloId: item.articuloId,
      colorId: item.colorId,
      talleId: item.talleId,
      nombre: item.nombre,
      variante: item.variante,
      precio: item.precio.toNumber(),
      cantidad: item.cantidad
    })),
    sync: {
      ordenId: row.sync.ordenId,
      status: toStatus(row.sync.status),
      attempts: row.sync.attempts,
      nextAttemptAt: row.sync.nextAttemptAt,
      lockedUntil: row.sync.lockedUntil,
      facturaId: row.sync.facturaId,
      lastError: row.sync.lastError,
      payloadJson: row.sync.payloadJson,
      responseJson: row.sync.responseJson,
      updatedAt: row.sync.updatedAt
    },
    events: row.events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt
    }))
  };
}

/** Condición de "listo para enviar": pending, vencido el backoff y sin lock vigente. */
function readyWhere(now: Date): Prisma.OrderSyncWhereInput {
  return {
    status: "pending",
    nextAttemptAt: { lte: now },
    OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }]
  };
}

export function createOrderRepository(db: Db): OrderRepository {
  return {
    async create(order) {
      const created = await db.order.create({
        data: {
          code: order.code,
          clienteNombre: order.cliente.nombre,
          clienteEmail: order.cliente.email,
          clienteTelefono: order.cliente.telefono,
          clienteDni: order.cliente.dni,
          entrega: order.entrega,
          direccion: order.direccion?.direccion ?? null,
          localidad: order.direccion?.localidad ?? null,
          provincia: order.direccion?.provincia ?? null,
          codigoPostal: order.direccion?.codigoPostal ?? null,
          notas: order.notas,
          subtotal: order.subtotal,
          envio: order.envio,
          descuento: order.descuento,
          total: order.total,
          createdAt: order.createdAt,
          // Escritura anidada: Prisma inserta todo en una sola transacción.
          items: { create: order.items },
          sync: {
            create: {
              ordenId: order.ordenId,
              status: "pending",
              payloadJson: order.payloadJson,
              nextAttemptAt: order.createdAt
            }
          },
          events: {
            create: { type: "created", message: `Pedido recibido (ordenId ${order.ordenId})`, createdAt: order.createdAt }
          }
        },
        select: { id: true, code: true }
      });
      return created;
    },

    async findById(id) {
      const row = await db.order.findUnique({ where: { id }, include: detailInclude });
      return row ? toDetail(row) : null;
    },

    async findByCode(code) {
      const row = await db.order.findUnique({ where: { code }, include: detailInclude });
      return row ? toDetail(row) : null;
    },

    async list(filter = {}) {
      const rows = await db.order.findMany({
        where: filter.status ? { sync: { is: { status: filter.status } } } : {},
        include: { sync: true },
        orderBy: { createdAt: "desc" },
        take: filter.limit ?? 100
      });
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        clienteNombre: row.clienteNombre,
        total: row.total.toNumber(),
        createdAt: row.createdAt,
        syncStatus: toStatus(row.sync?.status ?? "unknown"),
        ordenId: row.sync?.ordenId ?? 0,
        facturaId: row.sync?.facturaId ?? null
      }));
    },

    async countBySyncStatus() {
      const groups = await db.orderSync.groupBy({ by: ["status"], _count: { _all: true } });
      const counts = Object.fromEntries(ORDER_SYNC_STATUSES.map((status) => [status, 0])) as Record<
        OrderSyncStatus,
        number
      >;
      for (const group of groups) counts[toStatus(group.status)] += group._count._all;
      return counts;
    },

    async claimNext(now, lockUntil) {
      const candidates = await db.orderSync.findMany({
        where: readyWhere(now),
        orderBy: { nextAttemptAt: "asc" },
        take: 5,
        select: { orderId: true }
      });
      for (const { orderId } of candidates) {
        // UPDATE condicional: si otra instancia lo tomó primero, count = 0 y se prueba el siguiente.
        const result = await db.orderSync.updateMany({
          where: { orderId, ...readyWhere(now) },
          data: { status: "sending", lockedUntil: lockUntil, attempts: { increment: 1 } }
        });
        if (result.count === 1) {
          const row = await db.orderSync.findUniqueOrThrow({ where: { orderId } });
          return { orderId, ordenId: row.ordenId, attempts: row.attempts, payloadJson: row.payloadJson };
        }
      }
      return null;
    },

    async updateSync(orderId, patch, event, expected) {
      return db.$transaction(async (tx) => {
        const result = await tx.orderSync.updateMany({
          where: { orderId, ...(expected ? { status: { in: expected } } : {}) },
          data: patch
        });
        if (result.count === 0) return false;
        await tx.orderEvent.create({ data: { orderId, type: event.type, message: event.message } });
        return true;
      });
    },

    async expireStaleLocks(now) {
      return db.$transaction(async (tx) => {
        const stale = await tx.orderSync.findMany({
          where: { status: "sending", lockedUntil: { lt: now } },
          select: { orderId: true }
        });
        for (const { orderId } of stale) {
          await tx.orderSync.update({
            where: { orderId },
            data: {
              status: "unknown",
              lockedUntil: null,
              lastError: "El envío a Ninox quedó a mitad de camino. Verificá en Ninox antes de reintentar."
            }
          });
          await tx.orderEvent.create({
            data: { orderId, type: "unknown", message: "Lock vencido durante el envío: resultado en Ninox desconocido" }
          });
        }
        return stale.length;
      });
    }
  };
}
