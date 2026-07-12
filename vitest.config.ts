import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The DSL is pure and framework-free, so tests run in a plain Node environment
// (no jsdom). The `@` alias mirrors the app tsconfig so tests can import `@/dsl`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
