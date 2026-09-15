import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

/**
 * Billing tests talk to a real PostgreSQL server (the same engine as production),
 * but only ever through a database this process creates and drops itself
 * (see tests/helpers/testDb.ts).
 *
 * The server URL comes from TEST_DATABASE_URL, else DATABASE_URL in `.env.test`,
 * else DATABASE_URL in `.env` (the project's normal configuration).
 */
const parsed = [
  dotenv.config({ path: ".env.test" }).parsed,
  dotenv.config({ path: ".env" }).parsed,
].find(Boolean) as Record<string, string> | undefined;

const serverUrl =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || parsed?.DATABASE_URL || "";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/helpers/globalSetup.ts"],
    env: {
      ...(serverUrl ? { DATABASE_URL: serverUrl } : {}),
      NODE_ENV: "test",
    },
    // The billing tests share one throwaway database; running files in parallel
    // would make the fixtures fight over the same rows.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
