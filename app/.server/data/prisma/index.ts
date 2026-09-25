import type { Repositories } from "../ports";
import { createCatalogRepository } from "./catalog-repository";
import { createPrismaClient } from "./client";
import { createCounterRepository } from "./counter-repository";
import { createOrderRepository } from "./order-repository";
import { createRateBucketRepository } from "./rate-bucket-repository";
import { createSettingsRepository } from "./settings-repository";

/** Adaptador Prisma: implementa todos los puertos sobre un mismo cliente. */
export function createPrismaRepositories(databaseUrl: string): Repositories {
  const db = createPrismaClient(databaseUrl);
  return {
    catalog: createCatalogRepository(db),
    orders: createOrderRepository(db),
    settings: createSettingsRepository(db),
    counters: createCounterRepository(db),
    rateBuckets: createRateBucketRepository(db),
    close: () => db.$disconnect()
  };
}
