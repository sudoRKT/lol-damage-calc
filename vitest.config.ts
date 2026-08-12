import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Known-answer tests run here. `npm test` runs once and prints pass/fail counts (the
// completion report CLAUDE.md requires). Engine formula tests need no DOM, so the default
// environment is 'node'; UI areas that need a DOM can set environment: 'jsdom' per-file
// with a `// @vitest-environment jsdom` comment once that dependency is added.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    },
  }),
);
