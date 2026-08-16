// WHAT EACH PAGE ACTUALLY SHIPS, AND THE §13 PROMISE THAT NOTHING WAS CHECKING.
//
// ═══ WHY THIS EXISTS ═══
//
// SPECIFICATION §13, verbatim: *"Champion, item, and rune data is lazy-loaded rather than shipped
// as a single bundle, keeping first-load time low despite the full-roster dataset."*
//
// **Nothing verified that.** The dataset is 4.4 MB. If a refactor ever imports `champions.json`
// from a module instead of fetching it, the promise breaks silently — the page still works, it is
// just enormous, and no test in this project could tell.
//
// It was found on 2026-08-16 by an audit of commit messages for measurements that never reached a
// file. Commit `18f08e9` claimed the landing page ships "6.2 kB of JavaScript against the
// calculator's 83.9 kB" and recorded it nowhere. **Re-measured for this file, both figures had
// moved and one of them had moved a long way** — which is the argument for the check in one line.
//
// ═══ WHY THIS RUNS AGAINST `dist/` AND SKIPS WHEN IT IS ABSENT ═══
//
// It measures the real build output, because that is the only thing that answers the question. It
// SKIPS rather than fails when `dist/` is missing, so `npm test` on a fresh clone is not red for a
// reason unrelated to the code — and it says loudly that it skipped, because a check that silently
// does nothing is worse than one that is absent.
//
//   npm run build && npm test
//
// ═══ HOW THE FIGURES ARE DEFINED, BECAUSE "THE PAGE SHIPS N kB" IS AMBIGUOUS ═══
//
// A route's HTML lists every JS chunk it preloads. Chunks are SHARED between routes — the router,
// React, the primitives — so "what the landing page ships" can mean two very different numbers.
// Both are measured and both are stated:
//
//   SHARED       chunks listed by BOTH the landing and calculator HTML
//   ROUTE-UNIQUE chunks listed by one and not the other
//
// **The ceiling is on ROUTE-UNIQUE JavaScript**, because that is what the §13 claim is really
// about: opening the landing page must not drag the calculator's engine and interface along.
// Shared weight is a separate concern and is recorded, not capped, here.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BUILT = existsSync(DIST);

/** The JS chunks a route's HTML preloads, as paths relative to `dist/`. */
function chunksOf(htmlPath: string): string[] {
  const html = readFileSync(join(DIST, htmlPath), 'utf8');
  return [...new Set([...html.matchAll(/assets\/[A-Za-z0-9_-]+\.js/g)].map((m) => m[0]))].sort();
}

const bytes = (rel: string) => statSync(join(DIST, rel)).size;
const gzipped = (rel: string) => gzipSync(readFileSync(join(DIST, rel))).length;
const sum = (rels: string[], f: (r: string) => number) => rels.reduce((n, r) => n + f(r), 0);

/**
 * CEILINGS, and the reason each is where it is.
 *
 * These are **not** aspirations. Each is today's measured figure with deliberate headroom stated,
 * so an ordinary change does not turn the suite red while a structural regression does. Raising one
 * is a decision to be argued in the commit that raises it — the same rule the page-length register
 * runs on.
 */
const CEILINGS = {
  /**
   * 12,000 bytes against a measured 7,348 (2026-08-16). The landing page's own chunks: its content
   * and the coverage figures it prints.
   *
   * **The number that matters is the ORDER OF MAGNITUDE, not the slack.** The calculator's unique
   * chunk is 187,262 bytes. If the landing page ever pulls it, this ceiling is exceeded twenty-five
   * times over and the failure is unmissable. A tight ceiling would instead fail on every ordinary
   * copy edit, get raised reflexively, and stop meaning anything.
   */
  landingUniqueBytes: 12_000,
  /**
   * 260,000 bytes against a measured 187,262 (2026-08-16). The calculator's engine, its twelve
   * interface areas and the burndown.
   *
   * This one is a WATCHER rather than a limit: nobody has decided what the calculator ought to
   * weigh, and this file is not the place to decide it. What it catches is the whole roster or the
   * ability data being bundled in, which would add megabytes rather than kilobytes.
   */
  calculatorUniqueBytes: 260_000,
} as const;

/** Champion and item names that must NOT appear inside any JS chunk. §13's actual subject. */
const DATA_MUST_NOT_BE_BUNDLED = ['Aatrox', 'Cassiopeia', 'Void Staff'] as const;

describe('bundle size/§13 — the data is fetched, not bundled', () => {
  it('SAYS SO WHEN IT IS NOT MEASURING ANYTHING', () => {
    // A skipped check that says nothing is how a test stops being a test. If `dist/` is absent this
    // prints, loudly, rather than passing quietly.
    if (!BUILT) {
      console.warn(
        '\n  bundle-size: dist/ is absent, so NOTHING in this file was measured.\n' +
          '  Run `npm run build` first. These checks are the only thing verifying SPECIFICATION\n' +
          "  §13's promise that the 4.4 MB dataset is fetched rather than bundled.\n",
      );
    }
    expect(true).toBe(true);
  });

  it.skipIf(!BUILT)('no champion or item DATA is inside a JS chunk', () => {
    // THE ACTUAL §13 CHECK. The dataset is 4.4 MB on disk. A single `import champions from
    // '../../public/data/champions.json'` would inline it, the page would still work, and every
    // other test in this project would still pass.
    const js = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
    expect(js.length).toBeGreaterThan(3);
    const offenders: string[] = [];
    for (const file of js) {
      const text = readFileSync(join(DIST, 'assets', file), 'utf8');
      for (const name of DATA_MUST_NOT_BE_BUNDLED) {
        if (text.includes(name)) offenders.push(`${file} contains "${name}"`);
      }
    }
    expect(
      offenders,
      'SPECIFICATION §13: champion, item and rune data is lazy-loaded rather than shipped as a ' +
        'single bundle. A data file has been imported into a module instead of fetched.',
    ).toEqual([]);
  });

  it.skipIf(!BUILT)('the data is actually there to fetch, so the check above cannot pass by emptiness', () => {
    // The paired positive. "No champion names in the JS" is trivially true of a build that ships no
    // data at all, which would be a different and worse failure.
    expect(existsSync(join(DIST, 'data', 'champions.json'))).toBe(true);
    const champs = readFileSync(join(DIST, 'data', 'champions.json'), 'utf8');
    expect(champs).toContain('Aatrox');
  });
});

describe('bundle size/what each route ships', () => {
  it.skipIf(!BUILT)('the landing page does not drag the calculator along', () => {
    const landing = chunksOf('index.html');
    const calculator = chunksOf(join('calculator', 'index.html'));
    const shared = landing.filter((c) => calculator.includes(c));
    const landingOnly = landing.filter((c) => !calculator.includes(c));
    const calcOnly = calculator.filter((c) => !landing.includes(c));

    // Measured 2026-08-16, by this test against its own build: 5 shared chunks at 163,810 bytes
    // (54,138 gzipped); landing-only 2 chunks at 7,348 (3,101 gzipped); calculator-only 1 chunk at
    // 187,262 (57,326 gzipped).
    //
    // THE GZIP FIGURES ARE NODE'S `gzipSync`, NOT THE gzip COMMAND. They differ — the CLI gave
    // 3,156 and 56,683 for the same bytes, because the two use different default compression
    // levels. Stated because a comment holding one number while the test prints another is the
    // exact defect this project spent 2026-08-16 sweeping out of its own history.
    expect(shared.length).toBeGreaterThan(0);
    expect(landingOnly.length).toBeGreaterThan(0);
    expect(calcOnly.length).toBeGreaterThan(0);

    const landingBytes = sum(landingOnly, bytes);
    const calcBytes = sum(calcOnly, bytes);

    console.warn(
      `\n  route-unique JavaScript, measured from dist/:\n` +
        `    landing     ${landingBytes.toLocaleString()} B raw, ${sum(landingOnly, gzipped).toLocaleString()} B gzipped  (ceiling ${CEILINGS.landingUniqueBytes.toLocaleString()})\n` +
        `    calculator  ${calcBytes.toLocaleString()} B raw, ${sum(calcOnly, gzipped).toLocaleString()} B gzipped  (ceiling ${CEILINGS.calculatorUniqueBytes.toLocaleString()})\n` +
        `    shared      ${sum(shared, bytes).toLocaleString()} B raw, ${sum(shared, gzipped).toLocaleString()} B gzipped  (recorded, not capped)\n`,
    );

    expect(
      landingBytes,
      `The landing page's own JavaScript exceeded ${CEILINGS.landingUniqueBytes} bytes. If it has ` +
        `picked up the calculator's chunk this will be many times over, which is the case this ` +
        `ceiling exists for.`,
    ).toBeLessThanOrEqual(CEILINGS.landingUniqueBytes);
    expect(calcBytes).toBeLessThanOrEqual(CEILINGS.calculatorUniqueBytes);
  });

  it.skipIf(!BUILT)('the calculator chunk is NOT among the landing page’s chunks, by name', () => {
    // The byte ceiling above catches this by consequence. This catches it by identity, which is the
    // sentence a reader wants: the landing page does not load the calculator.
    const landing = chunksOf('index.html');
    expect(landing.some((c) => /calculator/.test(c))).toBe(false);
    expect(chunksOf(join('calculator', 'index.html')).some((c) => /calculator/.test(c))).toBe(true);
  });
});
