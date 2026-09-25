-- CreateTable
CREATE TABLE "Product" (
    "articuloId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcionNinox" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "talleColor" INTEGER NOT NULL DEFAULT 0,
    "precio" DECIMAL NOT NULL,
    "stockTotal" INTEGER NOT NULL DEFAULT 0,
    "imagenNinox" TEXT,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "rawJson" TEXT NOT NULL,
    "syncedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductShowcase" (
    "articuloId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "descripcion" TEXT,
    "imagenes" TEXT NOT NULL DEFAULT '[]',
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductShowcase_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Product" ("articuloId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "articuloId" INTEGER NOT NULL,
    "colorId" INTEGER NOT NULL DEFAULT 0,
    "talleId" INTEGER NOT NULL DEFAULT 0,
    "colorNombre" TEXT,
    "colorHex" TEXT,
    "talleNombre" TEXT,
    "codigoBarras" TEXT,
    "unidades" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Variant_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Product" ("articuloId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "tagId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "padreId" INTEGER,
    "destacada" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "articuloId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    PRIMARY KEY ("articuloId", "tagId"),
    CONSTRAINT "ProductTag_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Product" ("articuloId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("tagId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogSyncRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "articulos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "clienteNombre" TEXT NOT NULL,
    "clienteEmail" TEXT NOT NULL,
    "clienteTelefono" TEXT NOT NULL,
    "clienteDni" TEXT,
    "entrega" TEXT NOT NULL,
    "direccion" TEXT,
    "localidad" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "notas" TEXT,
    "subtotal" DECIMAL NOT NULL,
    "envio" DECIMAL NOT NULL DEFAULT 0,
    "descuento" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" TEXT NOT NULL,
    "articuloId" INTEGER NOT NULL,
    "colorId" INTEGER NOT NULL DEFAULT 0,
    "talleId" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "variante" TEXT,
    "precio" DECIMAL NOT NULL,
    "cantidad" INTEGER NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderSync" (
    "orderId" TEXT NOT NULL PRIMARY KEY,
    "ordenId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL,
    "lockedUntil" DATETIME,
    "facturaId" INTEGER,
    "responseJson" TEXT,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderSync_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Counter" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "RateBucket" (
    "bucket" TEXT NOT NULL PRIMARY KEY,
    "nextAllowedAt" DATETIME NOT NULL,
    "lastStatus" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Product_eliminado_idx" ON "Product"("eliminado");

-- CreateIndex
CREATE UNIQUE INDEX "ProductShowcase_slug_key" ON "ProductShowcase"("slug");

-- CreateIndex
CREATE INDEX "ProductShowcase_destacado_orden_idx" ON "ProductShowcase"("destacado", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_articuloId_colorId_talleId_key" ON "Variant"("articuloId", "colorId", "talleId");

-- CreateIndex
CREATE INDEX "CatalogSyncRun_startedAt_idx" ON "CatalogSyncRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSync_ordenId_key" ON "OrderSync"("ordenId");

-- CreateIndex
CREATE INDEX "OrderSync_status_nextAttemptAt_idx" ON "OrderSync"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");
