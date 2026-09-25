import type { SettingsRepository } from "../ports";
import type { Db } from "./client";

export function createSettingsRepository(db: Db): SettingsRepository {
  return {
    async getAll() {
      const rows = await db.setting.findMany();
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },

    async setMany(entries) {
      await db.$transaction(
        Object.entries(entries).map(([key, value]) =>
          db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
        )
      );
    }
  };
}
