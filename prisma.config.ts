import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads .env.local automatically; the Prisma CLI does not. Load it
// explicitly, then fall back to .env — without this the CLI sees no database
// url and fails with a message that points nowhere near the real cause.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

/**
 * Migration-time configuration.
 *
 * Prisma 7 no longer accepts connection URLs in schema.prisma — the CLI reads
 * them here, and the running application supplies its own driver adapter (see
 * lib/db.ts). The split is useful rather than annoying: migrations want a
 * DIRECT connection, because connection poolers can't reliably run DDL, while
 * the app wants the POOLED one, because serverless functions open a great many
 * short-lived connections.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    // Fall back to DATABASE_URL so a plain local Postgres — where there is no
    // pooler and the two URLs are the same — works with one variable set.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
