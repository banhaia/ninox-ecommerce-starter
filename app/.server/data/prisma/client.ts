import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/client";

export type Db = InstanceType<typeof PrismaClient>;

/**
 * Crea el cliente Prisma. Hoy: SQLite con better-sqlite3. Para Postgres/Supabase se
 * cambia el adapter por `PrismaPg` y el `provider` del schema (docs/data-layer.md).
 */
export function createPrismaClient(databaseUrl: string): Db {
  if (databaseUrl.startsWith("file:")) {
    const file = databaseUrl.slice("file:".length);
    if (file && file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
}
