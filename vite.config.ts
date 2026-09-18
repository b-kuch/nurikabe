import { defineConfig } from 'vitest/config';

export default defineConfig({
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
  plugins: []
});
