/**
 * Subconjunto del contrato de la API "Integración de terceros" de NinoxNet que usa la tienda.
 * Referencia: https://docs.ninox.com.ar/docs/terceros
 *
 * - JSON en camelCase, enums como enteros.
 * - Los DateTime llegan como "dd/MM/yyyy HH:mm:ss" (UTC).
 */

// ── Configuración ───────────────────────────────────────────────────────────

export interface NinoxConfig {
  appId: number;
  nombre: string;
  multiDeposito: boolean;
  depositos: Array<{ depositoId: number; nombre: string; default?: boolean }>;
  puntoVentaId: number;
  listaPrecioId: number;
}

// ── Catálogo (GetData) ──────────────────────────────────────────────────────

export interface NinoxArticuloCurva {
  articuloId: number;
  colorId?: number | null;
  talleId?: number | null;
  colorNombre?: string | null;
  colorCodigo?: string | null;
  colorHex?: string | null;
  talleNombre?: string | null;
  talleCodigo?: string | null;
  codigoBarras?: string | null;
  unidades?: number | null;
}

/** tipo: 0 TAG, 1 CATEGORIA, 2 MARCA, 3 TEMPORADA */
export interface NinoxArticuloTag {
  articuloId: number;
  tipo: number;
  tagId: number;
  tagNombre: string;
  padreId?: number | null;
  destacada?: boolean;
}

/** talleColor: 0 NINGUNO, 1 TALLES, 2 COLORES, 3 TALLES_COLORES */
export interface NinoxArticulo {
  articuloId: number;
  codigo: string;
  descripcion?: string | null;
  descripcionWeb?: string | null;
  nombre?: string | null;
  talleColor?: number;
  precio1?: number | null;
  stockTotal?: number | null;
  imagen?: string | null;
  curva?: NinoxArticuloCurva[] | null;
  tags?: NinoxArticuloTag[] | null;
}

// ── Pedidos (preventa) ──────────────────────────────────────────────────────

export interface NinoxDireccion {
  provincia: string;
  localidad: string;
  direccion: string;
  codigoPostal: string;
}

/** condicion: CondicionIva 0 SIN_CATEGORIA, 1 CF, 2 RI, 3 MONO, 4 EXENTO, 5 RNI */
export interface NinoxUsuario {
  nombre: string;
  email: string;
  dni: string;
  cuit: string;
  telefono: string;
  condicion: number;
}

export interface NinoxProductoPedido {
  articuloId: number;
  precio: number;
  cantidad: number;
  talleId?: number;
  colorId?: number;
}

/**
 * POST Terceros/Pedido. Reglas: `total = subtotal + envio + recargo - descuento`
 * (si no, 422) y `usuario` con dni, cuit o email salvo que se envíe `entidadId`.
 */
export interface NinoxPedido {
  /** Clave de idempotencia: única y estable para el pedido. */
  ordenId: number;
  numero: number;
  detalle?: string;
  direccionEnvio?: NinoxDireccion;
  usuario?: NinoxUsuario;
  entidadId?: number;
  productos: NinoxProductoPedido[];
  subtotal: number;
  descuento: number;
  envio: number;
  recargo: number;
  total: number;
}

/** Respuesta de Pedido. Éxito solo si facturaId > 0; si no, el motivo viene en `datos`. */
export interface NinoxFacturaResult {
  facturaId?: number;
  numero?: number;
  pVNumero?: number;
  estado?: number;
  datos?: Record<string, string> | null;
  observaciones?: string | null;
  errorFE?: string | null;
  errores?: boolean;
}

/** Respuesta de cancelar. tipo: 0 ERROR, 1 OK, 2 VALIDACION */
export interface NinoxResultado {
  tipo: number;
  mensajes?: string[];
  errores?: string[];
}

/** GET comprobante/{facturaId}. comprobanteTipo: 2 VENTA, 4 NOTA_CREDITO, 33 PREVENTA */
export interface NinoxComprobante {
  facturaId: number;
  ordenId?: string | null;
  comprobanteTipo: number;
  estado: number;
  numero?: number;
  totales?: { subTotal: number; descuento: number; recargo: number; envio: number; total: number };
}
