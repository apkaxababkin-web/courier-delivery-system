import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/hemotestRoutes.test.ts'],
    environment: 'node',
  },
});
