import { createPrismaRepositories } from "./prisma";
import type { Repositories } from "./ports";

export * from "./ports";

/**
 * Único punto que elige el adaptador de datos. Para sumar otro (por ejemplo Mongo con
 * el driver oficial), implementá `Repositories` en data/<adaptador>/ y agregalo acá.
 */
export function createRepositories(databaseUrl: string): Repositories {
  return createPrismaRepositories(databaseUrl);
}
