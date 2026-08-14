// Generates `src/ui/landing/coverage.json` from the published ability data.
//
// The landing page IMPORTS that file rather than fetching it, so the figures are in the HTML at
// first paint — the page's central claim should not pop in after a request.
//
// THE GENERATED FILE IS COMMITTED, WHICH IS ONLY SAFE BECAUSE A TEST RE-DERIVES IT.
// `src/ui/landing/coverage.test.ts` recounts from `public/data/` on every run and fails if the
// committed figures differ by one. A generated file nobody re-derives is a hand-typed file with
// extra steps.
//
// Run by `npm run build` before Vite, and by `npm run build:coverage` on its own.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summariseCoverage, coverageAddsUp, type CoverageEntry } from '../../src/ui/landing/coverage.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ABILITY_DIR = join(REPO, 'public', 'data', 'abilities');
const OUT = join(REPO, 'src', 'ui', 'landing', 'coverage.json');

export function readPublishedCoverage() {
  const files = readdirSync(ABILITY_DIR).filter((f) => f.endsWith('.json')).sort();
  const entries: CoverageEntry[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(ABILITY_DIR, file), 'utf8')) as {
      abilities: CoverageEntry[];
    };
    entries.push(...parsed.abilities);
  }
  const manifest = JSON.parse(
    readFileSync(join(REPO, 'public', 'data', 'manifest.json'), 'utf8'),
  ) as { patch: string };
  return summariseCoverage(entries, { patch: manifest.patch, champions: files.length });
}

const coverage = readPublishedCoverage();
if (!coverageAddsUp(coverage)) {
  throw new Error(`build-coverage: the four statuses do not account for all ${coverage.abilities} entries.`);
}
writeFileSync(OUT, `${JSON.stringify(coverage, null, 2)}\n`, 'utf8');
console.log(
  `build-coverage: ${coverage.abilities} abilities across ${coverage.champions} champions, patch ${coverage.patch} -> src/ui/landing/coverage.json`,
);
