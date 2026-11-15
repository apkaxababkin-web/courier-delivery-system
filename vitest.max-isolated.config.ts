import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: "/tmp",
  test: {
    environment: "node",
    include: ["tests/max-request-display.test.ts", "tests/max-delayed-notifications.test.ts"],
    globalSetup: [],
    fileParallelism: false,
    env: { NODE_ENV: "test" },
  },
});
