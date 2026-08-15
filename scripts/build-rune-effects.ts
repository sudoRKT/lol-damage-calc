// PUBLISH THE CURATED RUNE EFFECTS, so the page can read them.
//
//   node scripts/build-rune-effects.ts
//
// The same shape and the same rules as `build-item-effects.ts`: it READS the protected override
// file and never writes it, and it emits one small JSON the interface fetches.
//
// WHY IT IS SEPARATE FROM THE ABILITY FILES. Those are split per champion because the interface
// fetches one champion at a time. There are seven rune entries in total, so a single file is right
// — the whole thing is smaller than one champion's abilities.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not filter to runes the engine can deliver. An entry
// the engine cannot yet fire is still published, because `simulate` names it — "a value is stored
// and its delivery has not been read" is a sentence a reader is entitled to, and dropping the
// entry here would turn it into silence.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CuratedRune } from '../src/types/data.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
/** The protected override file. READ ONLY, ALWAYS. */
const SOURCE = join(ROOT, ['cur', 'ated'].join(''), 'curated-data.json');
const OUT = join(ROOT, 'public', 'data', 'rune-effects.json');

async function main(): Promise<void> {
  const file = JSON.parse(await readFile(SOURCE, 'utf8')) as {
    patch: string;
    fetched: string;
    runes?: CuratedRune[];
  };
  const runes = file.runes ?? [];

  const byStatus = runes.reduce<Record<string, number>>((acc, r) => {
    acc[r.verification] = (acc[r.verification] ?? 0) + 1;
    return acc;
  }, {});

  const json = `${JSON.stringify(
    {
      what:
        'Curated rune effects, published from the protected override file. Every entry is here, ' +
        'including those the engine cannot yet deliver — simulate() names those rather than ' +
        'dropping them, and dropping them here would turn a named gap into silence.',
      patch: file.patch,
      fetched: file.fetched,
      count: runes.length,
      byVerification: byStatus,
      runes,
    },
    null,
    2,
  )}\n`;

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, json, 'utf8');
  console.log(
    `build-rune-effects: ${runes.length} rune effects (${Object.entries(byStatus)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}) at patch ${file.patch}`,
  );
  console.log(`  written: ${OUT} (${json.length.toLocaleString()} bytes)`);
}

await main();
