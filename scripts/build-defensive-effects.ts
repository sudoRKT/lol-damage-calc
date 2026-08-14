// Build `public/data/defensive-effects.json` from the protected override file.
//
//   node scripts/build-defensive-effects.ts
//
// ═══ WHY THIS EXISTS ═══
//
// Two agents were blocked on it in the same fan-out, independently. The interface panel that
// asks "was this defence up?" had no source of entries, and the engine that answers "then here
// is what it did" had a catalogue lookup nobody filled. Both halves existed and neither could
// reach the data.
//
// `public/data/defender-toggles.json` already existed and is NOT a substitute — it is the fetch
// area's census, and it carries no `label`, no `id` and no `value`. `defensiveToggleKey` needs
// the label and the id, so a toggle built from the census would key differently from the one the
// engine reads, which is the silent-failure seam this project has already been bitten by.
//
// ═══ IT COPIES, IT NEVER JUDGES ═══
//
// Every entry is copied verbatim, including its verification status, its `unresolvable` facts and
// its `activation`. Nothing here decides whether a defence applies — that is the engine's, and
// what the user says is up is the scenario's.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CuratedDefensiveEffect } from '../src/types/data.ts';
import { defensiveToggleKey } from '../src/types/data.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
/** The protected override file. READ ONLY, ALWAYS. */
const SOURCE = join(ROOT, ['cur', 'ated'].join(''), 'curated-data.json');
const OUT = join(ROOT, 'public', 'data', 'defensive-effects.json');

async function main(): Promise<void> {
  const file = JSON.parse(await readFile(SOURCE, 'utf8')) as {
    patch: string;
    fetched: string;
    defensiveEffects?: CuratedDefensiveEffect[];
  };
  const entries = file.defensiveEffects ?? [];

  // THE KEYS MUST BE UNIQUE PER CHAMPION OR A TOGGLE IS UNREACHABLE. Checked here, at publish
  // time, rather than discovered by a user whose toggle does nothing.
  const perChampion = new Map<string, Set<string>>();
  const collisions: string[] = [];
  for (const e of entries) {
    const seen = perChampion.get(e.champion) ?? new Set<string>();
    const key = defensiveToggleKey(e);
    if (seen.has(key)) collisions.push(`${e.champion}: ${key}`);
    seen.add(key);
    perChampion.set(e.champion, seen);
  }

  const byActivation = new Map<string, number>();
  const byKind = new Map<string, number>();
  for (const e of entries) {
    byActivation.set(e.activation, (byActivation.get(e.activation) ?? 0) + 1);
    byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  }

  const payload = {
    what:
      "Curated defensive effects — what a champion's own kit does to damage they RECEIVE, copied " +
      'verbatim from the protected override file. Each states its own verification status.',
    provenance: {
      source: 'curated/curated-data.json (the protected override file)',
      patch: file.patch,
      fetched: file.fetched,
      extractedOn: new Date().toISOString().slice(0, 10),
      regenerate: 'node scripts/build-defensive-effects.ts',
      warning:
        'ALMOST EVERY ENTRY IS CONDITIONAL, and the engine cannot know whether a defence was up. ' +
        'The user states that in the scenario, keyed by defensiveToggleKey() from src/types/. ' +
        'ABSENT MEANS NOT UP — asserting a defence nobody stated would understate the damage. ' +
        'An entry marked incomplete contributes nothing and says why (SPECIFICATION §8).',
    },
    counts: {
      total: entries.length,
      champions: new Set(entries.map((e) => e.champion)).size,
      byActivation: Object.fromEntries([...byActivation].sort()),
      byKind: Object.fromEntries([...byKind].sort()),
    },
    defensiveEffects: entries,
  };

  await mkdir(dirname(OUT), { recursive: true });
  const json = JSON.stringify(payload, null, 2) + '\n';
  await writeFile(OUT, json, 'utf8');

  console.log(`defensive effects published: ${entries.length}`);
  console.log(`  champions: ${payload.counts.champions}`);
  for (const [k, v] of [...byActivation].sort()) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`  toggle-key collisions within one champion: ${collisions.length}`);
  for (const c of collisions) console.log(`    ${c}`);
  console.log(`  written: ${OUT} (${json.length.toLocaleString()} bytes)`);

  // A collision means two toggles share a key and one can never be set. That is a data problem
  // the publish step must not paper over.
  if (collisions.length > 0) process.exitCode = 1;
}

await main();
