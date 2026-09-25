/**
 * Puertos de la capa de datos. El dominio (modules/*) y las rutas solo conocen estas
 * interfaces y tipos: nunca importan Prisma. Para cambiar de base (Postgres, Mongo…)
 * se escribe otro adaptador que implemente `Repositories` (ver docs/data-layer.md).
 */

// ── Catálogo ────────────────────────────────────────────────────────────────

export interface VariantInput {
  colorId: number;
  talleId: number;
  colorNombre: string | null;
  colorHex: string | null;
  talleNombre: string | null;
  codigoBarras: string | null;
  unidades: number;
}

export interface TagInput {
  tagId: number;
  tipo: number;
  nombre: string;
  padreId: number | null;
  destacada: boolean;
}

/** Artículo normalizado desde GetData, listo para guardar. */
export interface CatalogItemInput {
  articuloId: number;
  codigo: string;
  nombre: string;
  descripcionNinox: string | null;
  talleColor: number;
  precio: number;
  stockTotal: number;
  imagenNinox: string | null;
  rawJson: string;
  variants: VariantInput[];
  tags: TagInput[];
}

export interface ProductSummary {
  articuloId: number;
  codigo: string;
  slug: string;
  nombre: string;
  precio: number;
  stockTotal: number;
  /** Primera imagen de vitrina o, si no hay, la de Ninox. */
  imagen: string | null;
  destacado: boolean;
  visible: boolean;
}

export interface VariantInfo extends VariantInput {
  articuloId: number;
}

export interface TagInfo {
  tagId: number;
  tipo: number;
  nombre: string;
}

export interface ProductDetail extends ProductSummary {
  descripcion: string | null;
  talleColor: number;
  imagenes: string[];
  orden: number;
  variants: VariantInfo[];
  tags: TagInfo[];
}

export interface ProductFilter {
  q?: string;
  tagId?: number;
  destacados?: boolean;
  /** true incluye los ocultos en vitrina (admin). */
  includeHidden?: boolean;
  limit?: number;
  offset?: number;
}

export interface VariantKey {
  articuloId: number;
  colorId: number;
  talleId: number;
}

/** Precio y stock vigentes de una variante (para validar carrito y checkout). */
export interface PricingRow extends VariantKey {
  nombre: string;
  variante: string | null;
  precio: number;
  unidades: number;
}

export interface ShowcasePatch {
  descripcion?: string | null;
  imagenes?: string[];
  destacado?: boolean;
  orden?: number;
  visible?: boolean;
}

export type SyncRunStatus = "running" | "ok" | "error" | "skipped";

export interface SyncRun {
  id: number;
  trigger: "manual" | "scheduled";
  status: SyncRunStatus;
  articulos: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface CatalogRepository {
  /** Reemplazo completo en una transacción: lo que no viene queda `eliminado`. No toca la vitrina. */
  replaceAll(items: CatalogItemInput[], syncedAt: Date): Promise<{ articulos: number }>;
  list(filter?: ProductFilter): Promise<ProductSummary[]>;
  findBySlug(slug: string): Promise<ProductDetail | null>;
  findById(articuloId: number): Promise<ProductDetail | null>;
  findForPricing(keys: VariantKey[]): Promise<PricingRow[]>;
  listCategories(): Promise<TagInfo[]>;
  updateShowcase(articuloId: number, patch: ShowcasePatch): Promise<void>;
  startSyncRun(trigger: SyncRun["trigger"], at: Date): Promise<number>;
  finishSyncRun(id: number, result: { status: SyncRunStatus; articulos?: number; error?: string | null }, at: Date): Promise<void>;
  lastSyncRun(): Promise<SyncRun | null>;
  lastSuccessfulSyncRun(): Promise<SyncRun | null>;
}

// ── Pedidos ─────────────────────────────────────────────────────────────────

/**
 * Estado de la sincronización con Ninox:
 * - pending: en cola (o reintento automático programado: el POST nunca llegó).
 * - sending: tomado por un despachador (lock con vencimiento).
 * - created: Ninox devolvió facturaId > 0.
 * - failed: Ninox rechazó el pedido; requiere acción humana.
 * - unknown: timeout o corte después de enviar. Conciliar antes de reintentar.
 * - cancelled: cancelado en Ninox.
 */
export const ORDER_SYNC_STATUSES = ["pending", "sending", "created", "failed", "unknown", "cancelled"] as const;
export type OrderSyncStatus = (typeof ORDER_SYNC_STATUSES)[number];

export type Entrega = "retiro" | "envio";

export interface NewOrderItem extends VariantKey {
  nombre: string;
  variante: string | null;
  precio: number;
  cantidad: number;
}

export interface NewOrder {
  code: string;
  ordenId: number;
  cliente: { nombre: string; email: string; telefono: string; dni: string | null };
  entrega: Entrega;
  direccion: { direccion: string; localidad: string; provincia: string; codigoPostal: string } | null;
  notas: string | null;
  subtotal: number;
  envio: number;
  descuento: number;
  total: number;
  items: NewOrderItem[];
  /** Payload de Ninox congelado: se reenvía idéntico en cada intento. */
  payloadJson: string;
  createdAt: Date;
}

export interface OrderSyncInfo {
  ordenId: number;
  status: OrderSyncStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  facturaId: number | null;
  lastError: string | null;
  payloadJson: string;
  responseJson: string | null;
  updatedAt: Date;
}

export interface OrderEventInfo {
  id: number;
  type: string;
  message: string;
  createdAt: Date;
}

export interface OrderListItem {
  id: string;
  code: string;
  clienteNombre: string;
  total: number;
  createdAt: Date;
  syncStatus: OrderSyncStatus;
  ordenId: number;
  facturaId: number | null;
}

export interface OrderDetail {
  id: string;
  code: string;
  cliente: NewOrder["cliente"];
  entrega: Entrega;
  direccion: NewOrder["direccion"];
  notas: string | null;
  subtotal: number;
  envio: number;
  descuento: number;
  total: number;
  createdAt: Date;
  items: NewOrderItem[];
  sync: OrderSyncInfo;
  events: OrderEventInfo[];
}

/** Pedido tomado por un despachador, con el payload a enviar. */
export interface ClaimedOrder {
  orderId: string;
  ordenId: number;
  attempts: number;
  payloadJson: string;
}

export interface SyncPatch {
  status?: OrderSyncStatus;
  nextAttemptAt?: Date;
  lockedUntil?: Date | null;
  facturaId?: number | null;
  responseJson?: string | null;
  lastError?: string | null;
}

export interface OrderRepository {
  /** Inserta pedido, líneas, outbox (pending) y evento "created" en una transacción. */
  create(order: NewOrder): Promise<{ id: string; code: string }>;
  findById(id: string): Promise<OrderDetail | null>;
  findByCode(code: string): Promise<OrderDetail | null>;
  list(filter?: { status?: OrderSyncStatus; limit?: number }): Promise<OrderListItem[]>;
  countBySyncStatus(): Promise<Record<OrderSyncStatus, number>>;
  /**
   * Toma atómicamente el próximo pedido listo para enviar (pending, vencido su
   * nextAttemptAt y sin lock vigente) y lo pasa a `sending`. Dos instancias nunca
   * toman el mismo pedido.
   */
  claimNext(now: Date, lockUntil: Date): Promise<ClaimedOrder | null>;
  /**
   * Actualiza el outbox y registra un evento. Si `expected` viene, solo aplica si el
   * estado actual coincide (evita pisar una transición concurrente); devuelve si aplicó.
   */
  updateSync(orderId: string, patch: SyncPatch, event: { type: string; message: string }, expected?: OrderSyncStatus[]): Promise<boolean>;
  /** `sending` con lock vencido → `unknown` (el proceso murió a mitad del envío). */
  expireStaleLocks(now: Date): Promise<number>;
}

// ── Infraestructura ─────────────────────────────────────────────────────────

export interface SettingsRepository {
  getAll(): Promise<Record<string, string>>;
  setMany(entries: Record<string, string>): Promise<void>;
}

export interface CounterRepository {
  /** Siguiente valor de la secuencia, nunca menor que `floor`. Atómico. */
  next(name: string, floor: number): Promise<number>;
}

export interface RateBucketRepository {
  nextAllowedAt(bucket: string): Promise<Date | null>;
  /** Reserva la ventana solo si está libre en `now`. Atómico: devuelve false si otro la tomó. */
  tryReserve(bucket: string, now: Date, until: Date): Promise<boolean>;
  /**
   * Devuelve una reserva que no se usó (la request nunca llegó): libera la ventana en
   * `releaseAt`, solo si nadie la modificó desde la reserva (sigue en `reservedUntil`).
   */
  release(bucket: string, reservedUntil: Date, releaseAt: Date): Promise<void>;
  /** Fuerza la próxima llamada permitida (por ejemplo tras un 403 "Debe esperar N segundos"). */
  set(bucket: string, until: Date, lastStatus?: string): Promise<void>;
}

export interface Repositories {
  catalog: CatalogRepository;
  orders: OrderRepository;
  settings: SettingsRepository;
  counters: CounterRepository;
  rateBuckets: RateBucketRepository;
  /** Cierra conexiones (tests y apagado ordenado). */
  close(): Promise<void>;
}
