import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/courierPushDevices.test.ts"],
    environment: "node",
    globals: false,
    watch: false,
    passWithNoTests: false,
  },
});
