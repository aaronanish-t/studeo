import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * The Prisma singleton.
 *
 * Two things going on here:
 *
 * 1. Prisma 7 takes a driver adapter rather than a connection string baked into
 *    the schema. We hand it the POOLED url — this process is the application,
 *    and on serverless it will be many short-lived instances. Migrations use
 *    the direct url instead; see prisma.config.ts.
 *
 * 2. The globalThis cache. Next's dev server hot-reloads modules on every edit,
 *    and a fresh PrismaClient per reload leaks a connection pool each time
 *    until Postgres refuses new connections. Caching on globalThis survives
 *    HMR. We deliberately don't do this in production, where each instance
 *    should own exactly one client.
 */

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres instance."
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Whether an error means "Postgres couldn't be reached at all", as opposed to
 * a query that ran and failed.
 *
 * With the pg driver adapter, a socket that never connects surfaces as a
 * PrismaClientKnownRequestError carrying the Node error code (ETIMEDOUT,
 * ECONNREFUSED) rather than a Prisma P-code — so we look at the code, not the
 * class. The distinction matters because the two failures need opposite
 * responses: a parser bug is ours to fix, while an unreachable database is
 * usually the network the student is on. SRM's campus WiFi blocks outbound
 * 5432 and 6543, which turned every local sync attempt from campus into a
 * generic 500 until this was told apart.
 */
export function isDatabaseUnreachable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return false;

  return (
    // Node socket-level codes, passed through by the pg adapter.
    ["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH"].includes(code) ||
    // Prisma's own: can't reach, timed out, server closed the connection.
    ["P1001", "P1002", "P1017"].includes(code)
  );
}
