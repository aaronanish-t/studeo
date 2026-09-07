import { config } from "dotenv";

/**
 * Loads .env.local for scripts that run outside Next.js — the seed, the sync
 * worker, anything under tsx. Next loads .env.local itself, so nothing in the
 * app needs this.
 *
 * It exists as its own module purely because of import hoisting. Writing
 *
 *     import { config } from "dotenv";
 *     config({ path: ".env.local" });
 *     import { prisma } from "./db";      // <- evaluated FIRST
 *
 * looks correct and is not: every `import` is hoisted above the statements
 * between them, so `db` initialises against an empty process.env and throws
 * "DATABASE_URL is not set" while the file plainly appears to set it.
 *
 * Side-effect imports, on the other hand, evaluate in source order. So the
 * rule for any script is: `import "../lib/env";` on the first line, above
 * everything that reads an environment variable.
 */
config({ path: ".env.local", quiet: true });
config({ quiet: true }); // fall back to .env
