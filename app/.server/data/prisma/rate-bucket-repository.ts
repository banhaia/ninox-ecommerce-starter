import type { RateBucketRepository } from "../ports";
import type { Db } from "./client";

export function createRateBucketRepository(db: Db): RateBucketRepository {
  return {
    async nextAllowedAt(bucket) {
      const row = await db.rateBucket.findUnique({ where: { bucket } });
      return row?.nextAllowedAt ?? null;
    },

    async tryReserve(bucket, now, until) {
      await db.rateBucket.upsert({
        where: { bucket },
        create: { bucket, nextAllowedAt: new Date(0) },
        update: {}
      });
      // UPDATE condicional: si otra instancia reservó primero, count = 0.
      const result = await db.rateBucket.updateMany({
        where: { bucket, nextAllowedAt: { lte: now } },
        data: { nextAllowedAt: until }
      });
      return result.count === 1;
    },

    async set(bucket, until, lastStatus) {
      await db.rateBucket.upsert({
        where: { bucket },
        create: { bucket, nextAllowedAt: until, lastStatus: lastStatus ?? null },
        update: { nextAllowedAt: until, ...(lastStatus === undefined ? {} : { lastStatus }) }
      });
    }
  };
}
