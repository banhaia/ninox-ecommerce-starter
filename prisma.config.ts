import { defineConfig } from "prisma/config";

// Carga .env si existe (Node >= 20.12), sin depender de dotenv.
try {
  process.loadEnvFile?.(".env");
} catch {
  // Sin .env: se usa el default.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./data/app.db"
  }
});
