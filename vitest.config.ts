import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Known-answer tests run here. `npm test` runs once and prints pass/fail counts (the
// completion report CLAUDE.md requires). Engine formula tests need no DOM, so the default
// environment is 'node'; UI areas that need a DOM set environment: 'jsdom' per-file with a
// `// @vitest-environment jsdom` comment at the top of the file.
//
// The include globs match BOTH .ts and .tsx. They matched .ts only until 2026-08-13, which
// meant a React component test written as Foo.test.tsx was not collected at all — it did not
// fail, it silently did not exist. A skipped test that looks like a passing suite is the
// exact failure this project's completion rule is written against (CLAUDE.md, "The rule that
// matters most"), so the glob is deliberately wider than the files that exist today.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'scripts/**/*.{test,spec}.{ts,tsx}',
        'tests/**/*.{test,spec}.{ts,tsx}',
      ],
    },
  }),
);
