import type { CounterRepository } from "../ports";
import type { Db } from "./client";

export function createCounterRepository(db: Db): CounterRepository {
  return {
    // upsert con increment es atómico (INSERT … ON CONFLICT DO UPDATE); el piso se
    // aplica dentro de la misma transacción.
    next(name, floor) {
      return db.$transaction(async (tx) => {
        const row = await tx.counter.upsert({
          where: { name },
          create: { name, value: floor },
          update: { value: { increment: 1 } }
        });
        if (row.value >= floor) return row.value;
        await tx.counter.update({ where: { name }, data: { value: floor } });
        return floor;
      });
    }
  };
}
