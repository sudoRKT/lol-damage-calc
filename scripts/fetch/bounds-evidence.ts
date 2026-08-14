// EVIDENCE FOR THE VALIDATION BOUNDS (SPECIFICATION §9).
//
// Run with:  node scripts/fetch/bounds-evidence.ts [numberOfPatches]
//
// A bound invented from taste is a bound nobody can defend. This script measures how far
// each field ACTUALLY moves between two consecutive real patches, so every number in
// `bounds.ts` can be stated as "larger than the largest genuine movement observed over N
// patch transitions", rather than as a guess.
//
// WHY DATA DRAGON AND NOT THE WIKI. Bounds are about MAGNITUDE OF MOVEMENT, not about which
// source wins a field (DATA-SOURCES §12, §15). Data Dragon is the only source that publishes
// a retrievable file per historic patch — the wiki module has one live revision and no
// per-patch URL — so it is the only place a patch-to-patch delta can be measured at all.
// Two fields are deliberately EXCLUDED because Data Dragon cannot state them:
//
//   - `ad_lvl` — reads 0 for every champion in every patch (DATA-SOURCES §3). Measuring its
//     movement here would measure Riot's structural fault, not a balance change.
//   - `as_ratio` — Data Dragon has no counterpart field at all.
//
// Their bounds are justified in `bounds.ts` from the live roster distribution instead, and
// that difference is stated there rather than hidden.
//
// This script fetches only. It writes nothing.

import { ddragonChampionsUrl, ddragonItemsUrl, fetchJson, VERSIONS_URL } from './sources.ts';

/** Data Dragon stat key -> the field name this project uses. */
const CHAMPION_FIELD_MAP: Record<string, string> = {
  hp: 'stats.hp_base',
  hpperlevel: 'stats.hp_lvl',
  mp: 'stats.mp_base',
  mpperlevel: 'stats.mp_lvl',
  armor: 'stats.arm_base',
  armorperlevel: 'stats.arm_lvl',
  spellblock: 'stats.mr_base',
  spellblockperlevel: 'stats.mr_lvl',
  attackdamage: 'stats.ad_base',
  attackspeed: 'stats.as_base',
  attackspeedperlevel: 'stats.as_lvl',
  attackrange: 'stats.range',
};

interface Movement {
  field: string;
  subject: string;
  from: number;
  to: number;
  absolute: number;
  fraction: number;
  transition: string;
}

interface DdChampions {
  data: Record<string, { key: string; name: string; stats: Record<string, number> }>;
}
interface DdItems {
  data: Record<
    string,
    { name?: string; gold?: { total?: number }; stats?: Record<string, number>; maps?: Record<string, boolean> }
  >;
}

function move(
  field: string,
  subject: string,
  from: number,
  to: number,
  transition: string,
): Movement | null {
  if (from === to) return null;
  const absolute = Math.abs(to - from);
  const fraction = from === 0 ? Number.POSITIVE_INFINITY : absolute / Math.abs(from);
  return { field, subject, from, to, absolute, fraction, transition };
}

export async function gatherEvidence(patchCount: number): Promise<Movement[]> {
  const versions = await fetchJson<string[]>(VERSIONS_URL);
  const patches = versions.slice(0, patchCount);
  console.log(`measuring ${patches.length} patches: ${patches.join(' ')}`);

  const movements: Movement[] = [];

  // Champions.
  let previous: DdChampions | null = null;
  let previousPatch = '';
  for (const patch of [...patches].reverse()) {
    const current = await fetchJson<DdChampions>(ddragonChampionsUrl(patch));
    if (previous) {
      const transition = `${previousPatch} -> ${patch}`;
      let changedFields = 0;
      for (const [apiname, entry] of Object.entries(current.data)) {
        const before = previous.data[apiname];
        if (!before) continue; // a new champion is an addition, not a movement
        for (const [ddKey, field] of Object.entries(CHAMPION_FIELD_MAP)) {
          const from = before.stats[ddKey];
          const to = entry.stats[ddKey];
          if (typeof from !== 'number' || typeof to !== 'number') continue;
          const m = move(field, apiname, from, to, transition);
          if (m) {
            movements.push(m);
            changedFields += 1;
          }
        }
      }
      console.log(`  champions ${transition}: ${changedFields} field movements`);
    }
    previous = current;
    previousPatch = patch;
  }

  // Items. Only the pool the product actually ships is interesting, so apply the same
  // map-11 / id cutoff the item filter uses (DATA-SOURCES §5) before comparing.
  let previousItems: DdItems | null = null;
  previousPatch = '';
  for (const patch of [...patches].reverse()) {
    const current = await fetchJson<DdItems>(ddragonItemsUrl(patch));
    if (previousItems) {
      const transition = `${previousPatch} -> ${patch}`;
      let changedFields = 0;
      for (const [id, entry] of Object.entries(current.data)) {
        if (Number(id) >= 200000) continue;
        if (entry.maps?.['11'] !== true) continue;
        const before = previousItems.data[id];
        if (!before) continue;
        const goldMove = move(
          'gold.total',
          `${entry.name ?? id} (${id})`,
          before.gold?.total ?? 0,
          entry.gold?.total ?? 0,
          transition,
        );
        if (goldMove) {
          movements.push(goldMove);
          changedFields += 1;
        }
        const keys = new Set([...Object.keys(before.stats ?? {}), ...Object.keys(entry.stats ?? {})]);
        for (const key of keys) {
          const from = before.stats?.[key];
          const to = entry.stats?.[key];
          if (typeof from !== 'number' || typeof to !== 'number') continue;
          const m = move(`stats.${key}`, `${entry.name ?? id} (${id})`, from, to, transition);
          if (m) {
            movements.push(m);
            changedFields += 1;
          }
        }
      }
      console.log(`  items ${transition}: ${changedFields} field movements`);
    }
    previousItems = current;
    previousPatch = patch;
  }

  return movements;
}

function report(movements: Movement[]): void {
  const byField = new Map<string, Movement[]>();
  for (const m of movements) {
    const list = byField.get(m.field);
    if (list) list.push(m);
    else byField.set(m.field, [m]);
  }

  console.log('');
  console.log('LARGEST GENUINE MOVEMENT PER FIELD (this is what the bounds must clear)');
  console.log('field | movements | largest absolute (who) | largest fraction (who)');
  for (const field of [...byField.keys()].sort()) {
    const list = byField.get(field)!;
    const byAbsolute = [...list].sort((a, b) => b.absolute - a.absolute)[0]!;
    const finite = list.filter((m) => Number.isFinite(m.fraction));
    const byFraction = [...finite].sort((a, b) => b.fraction - a.fraction)[0];
    console.log(
      `${field} | ${list.length} | ${byAbsolute.absolute} (${byAbsolute.subject} ${byAbsolute.from}->${byAbsolute.to}, ${byAbsolute.transition}) | ` +
        (byFraction
          ? `${(byFraction.fraction * 100).toFixed(1)}% (${byFraction.subject} ${byFraction.from}->${byFraction.to}, ${byFraction.transition})`
          : 'n/a'),
    );
  }

  const zeroed = movements.filter((m) => m.to === 0);
  const unzeroed = movements.filter((m) => m.from === 0);
  console.log('');
  console.log(`movements that ZEROED a non-zero value: ${zeroed.length}`);
  for (const m of zeroed.slice(0, 20)) {
    console.log(`  ${m.field} ${m.subject}: ${m.from} -> 0 (${m.transition})`);
  }
  console.log(`movements that raised a ZERO to non-zero: ${unzeroed.length}`);
  for (const m of unzeroed.slice(0, 20)) {
    console.log(`  ${m.field} ${m.subject}: 0 -> ${m.to} (${m.transition})`);
  }
  console.log('');
  console.log(`total field movements observed: ${movements.length}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const count = Number(process.argv[2] ?? 12);
  gatherEvidence(count)
    .then(report)
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.stack : error);
      process.exitCode = 1;
    });
}
