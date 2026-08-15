// Run gate 8 over the curated ability set and write the report.
//
//   node scripts/extract/aggregate-audit.ts
//
// Reads `curated/curated-data.json` (never writes it) and writes
// `build/proposed-curated/aggregate-rows.json`, this area's own output.
//
// It prints two populations and changes nothing. The tier-1 list is the DATA-SOURCES §60 class;
// the tier-2 list is redundancy of some other cause and is a reading task, not a fix.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CuratedAbility } from '../../src/types/data.ts';
import { findRedundantAdditions, READ_POPULATION } from './aggregate-rows.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CURATED = join(ROOT, 'curated', 'curated-data.json');
const OUT = join(ROOT, 'build', 'proposed-curated', 'aggregate-rows.json');

const file = JSON.parse(await readFile(CURATED, 'utf8')) as {
  patch: string;
  abilities: CuratedAbility[];
};

const audit = findRedundantAdditions(file.abilities);
const tier1 = audit.findings.filter((f) => f.tier === 1);
const tier2 = audit.findings.filter((f) => f.tier === 2);
const entriesTier1 = new Set(tier1.map((f) => `${f.champion}/${f.slot}/${f.abilityName}`));
const live = tier1.filter((f) => f.verification === 'derived');
const unread = tier1.filter((f) => !f.confirmedByReading);

console.log(`patch ${file.patch}: ${file.abilities.length} stored entries`);
console.log(
  `additive components compared: ${audit.compared}; ` +
    `components with no per-rank series to compare: ${audit.notComparable}`,
);
console.log(
  `\nTIER 1 — an aggregate row stored as an addition: ` +
    `${tier1.length} components across ${entriesTier1.size} entries ` +
    `(${live.length} on a 'derived' entry, therefore on screen)`,
);
for (const f of tier1) {
  const mark = f.confirmedByReading ? 'read' : 'UNREAD';
  console.log(`  [${mark}] ${f.champion} ${f.slot} ${f.abilityName} — "${f.label}" = ${f.restates}`);
}
console.log(`\nTIER 2 — additive components that restate a sibling, cause unknown: ${tier2.length}`);
for (const f of tier2) {
  console.log(`  ${f.champion} ${f.slot} ${f.abilityName} — "${f.label}" = ${f.restates}`);
}
if (unread.length) {
  console.log(
    `\n${unread.length} tier-1 component(s) are NOT in the read population. ` +
      `They are reported for someone to read the source sentence, never rewritten.`,
  );
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  `${JSON.stringify(
    {
      what:
        'Gate 8: additive components whose value series restates a sibling. Tier 1 is the ' +
        'DATA-SOURCES §60 aggregate-row class; tier 2 is redundancy of some other cause. ' +
        'A report, not a change: nothing here has been written to any stored entry.',
      patch: file.patch,
      storedEntries: file.abilities.length,
      additiveComponentsCompared: audit.compared,
      componentsWithNoComparableSeries: audit.notComparable,
      readPopulation: [...READ_POPULATION].map(([key, v]) => ({ key, ...v })),
      tier1,
      tier2,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwritten: build/proposed-curated/aggregate-rows.json`);
