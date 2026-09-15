import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "node:path";

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
  // The manager frontend uses the automatic JSX runtime; without this the tests
  // would need a React import in scope.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    // One React copy for the whole test module graph. The component under test is
    // imported from courier-manager, which has its own React; without forcing every
    // React import (including the jsx runtimes) to a single copy, hooks fail with a
    // null dispatcher.
    dedupe: ["react", "react-dom"],
    alias: {
      "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "node_modules/react/jsx-dev-runtime.js"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom/client": path.resolve(__dirname, "node_modules/react-dom/client.js"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      // Icons are decoration for the component tests; the real package is linked
      // against the manager's React copy (see the stub file).
      "lucide-react": path.resolve(__dirname, "tests/helpers/lucide-react-stub.tsx"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
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
