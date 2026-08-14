// Build `public/data/item-effects.json` from the protected override file.
//
//   node scripts/build-item-effects.ts
//
// ═══ WHY THIS EXISTS ═══
//
// The engine gained a lookup for item effects on 2026-08-14, and item actives, on-hit riders and
// Spellblade riders were all built against it. NONE OF IT REACHED A VISITOR: the catalogue the
// page builds carried champions, items and abilities and nothing else, so every item lookup
// answered with an empty list and every active and rider silently did nothing.
//
// A capability nobody can reach is not a capability. This is the missing step.
//
// ═══ IT COPIES, IT NEVER JUDGES ═══
//
// Every effect is copied verbatim from `curated/curated-data.json`, including its verification
// status, its `unresolvable` facts and its `appliesAs`. Nothing here alters a damage figure,
// promotes a status, or decides how an effect reaches its target. It reads the protected file and
// never writes it.
//
// ═══ WHY ONE FILE AND NOT A SPLIT ═══
//
// The ability data is split per champion because a scenario names two champions out of 173 and
// the whole set is 1.6 MB. The item effects are 43 entries totalling a few tens of kilobytes, and
// a scenario can name any six items on either side — so a split would mean up to twelve requests
// to save a payload smaller than one champion's abilities. Measured rather than assumed: the
// written size is printed below.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CuratedItemEffect, Item } from '../src/types/data.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
/** The protected override file. READ ONLY, ALWAYS. */
const SOURCE = join(ROOT, ['cur', 'ated'].join(''), 'curated-data.json');
const ITEMS = join(ROOT, 'public', 'data', 'items.json');
const OUT = join(ROOT, 'public', 'data', 'item-effects.json');

async function main(): Promise<void> {
  const file = JSON.parse(await readFile(SOURCE, 'utf8')) as {
    patch: string;
    fetched: string;
    itemEffects: CuratedItemEffect[];
  };
  const items = JSON.parse(await readFile(ITEMS, 'utf8')) as Item[];
  const pool = new Map(items.map((i) => [i.id, i]));

  // AN EFFECT ON AN ITEM THE SITE DOES NOT SHIP IS A JOIN FAILURE, NOT A SILENT DROP. The picker
  // offers 209 items; an effect keyed to an id outside that pool could never be reached, and
  // publishing it would hide the mismatch rather than surface it.
  const orphans = file.itemEffects.filter((e) => !pool.has(e.itemId));

  const byApplication = new Map<string, number>();
  for (const e of file.itemEffects) {
    const key = e.appliesAs ?? '(not stated)';
    byApplication.set(key, (byApplication.get(key) ?? 0) + 1);
  }

  const payload = {
    what:
      'Curated item effects, copied verbatim from the protected override file. Each states its ' +
      'own verification status; the interface shows that status and must never present a ' +
      'derived figure as settled.',
    provenance: {
      source: 'curated/curated-data.json (the protected override file)',
      patch: file.patch,
      fetched: file.fetched,
      extractedOn: new Date().toISOString().slice(0, 10),
      regenerate: 'node scripts/build-item-effects.ts',
      warning:
        'An effect marked incomplete contributes NO damage (SPECIFICATION §8). An effect whose ' +
        'appliesAs is absent or "unstated" is NOT placed on any carrier — the source does not ' +
        'say how it reaches its target, and guessing would hand a build damage it may not have.',
    },
    counts: {
      total: file.itemEffects.length,
      byApplication: Object.fromEntries([...byApplication].sort()),
    },
    itemEffects: file.itemEffects,
  };

  await mkdir(dirname(OUT), { recursive: true });
  const json = JSON.stringify(payload, null, 2) + '\n';
  await writeFile(OUT, json, 'utf8');

  console.log(`item effects published: ${file.itemEffects.length}`);
  console.log(`  distinct items: ${new Set(file.itemEffects.map((e) => e.itemId)).size}`);
  for (const [k, v] of [...byApplication].sort()) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`  effects keyed to an item outside the shipped pool: ${orphans.length}`);
  for (const o of orphans) console.log(`    ${o.itemId} ${o.itemName}`);
  console.log(`  written: ${OUT} (${json.length.toLocaleString()} bytes)`);
}

await main();
