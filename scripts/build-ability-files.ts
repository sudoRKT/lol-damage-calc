// Build `public/data/abilities/{apiname}.json` for EVERY champion in the roster.
//
//   node --experimental-strip-types scripts/build-ability-files.ts
//
// ═══ WHY THIS EXISTS ═══
//
// The combo builder had icons for Lux and nothing else, because `public/data/abilities/` held
// exactly one file — hand-made for the vertical slice. Every other champion showed no abilities
// at all, which is the single largest thing between the interface and being usable.
//
// ═══ WHY IT IS AT `scripts/` ROOT AND NOT IN AN AREA ═══
//
// It joins two areas' outputs: the data pipeline's roster (`public/data/champions.json`) and the
// harvester's proposal (`build/proposed-curated/abilities/batch-01.json`). Neither area may write
// the other's directory, and the file it produces lives under `public/data/`. A path in no area
// belongs to the lead (CLAUDE.md, the partition), which is exactly what this is.
//
// It writes ONLY `public/data/abilities/`. It does not touch `champions.json`, `items.json` or
// the manifest, so it is safe to run while the data-pipeline area is working.
//
// ═══ WHAT IT DOES NOT DO ═══
//
// It does not harvest, judge or alter a single damage figure. Every entry is copied verbatim from
// the harvester's batch, INCLUDING its verification status and its `unresolvable` facts, and one
// field is added: the Data Dragon icon filename. A figure that was `incomplete` in the batch is
// `incomplete` here.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Champion, CuratedAbility } from '../src/types/data.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'public', 'data', 'abilities');
const ROSTER = join(ROOT, 'public', 'data', 'champions.json');
const BATCH = join(ROOT, 'build', 'proposed-curated', 'abilities', 'batch-01.json');

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn';
const USER_AGENT = 'LimitTest/0.1 (League of Legends damage calculator; https://limittest.site)';

/** Data Dragon's per-champion detail file — the only place the icon filenames live. */
interface ChampionDetail {
  data: Record<
    string,
    {
      passive: { image: { full: string } };
      spells: Array<{ image: { full: string } }>;
    }
  >;
}

const SPELL_SLOTS = ['Q', 'W', 'E', 'R'] as const;

async function fetchDetail(apiname: string, patch: string): Promise<Map<string, string>> {
  const url = `${DDRAGON}/${patch}/data/en_US/champion/${apiname}.json`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${apiname}: ${response.status} from ${url}`);
  const body = (await response.json()) as ChampionDetail;
  const entry = body.data[apiname];
  if (!entry) throw new Error(`${apiname}: Data Dragon returned no entry under that key`);

  const icons = new Map<string, string>();
  icons.set('P', entry.passive.image.full);
  SPELL_SLOTS.forEach((slot, i) => {
    const spell = entry.spells[i];
    // A champion with fewer than four spells would otherwise silently lose a slot's icon. None
    // is known, so this throws rather than shipping a champion with a missing chip.
    if (!spell) throw new Error(`${apiname}: Data Dragon lists no spell in slot ${slot}`);
    icons.set(slot, spell.image.full);
  });
  return icons;
}

/** Fetch in small concurrent batches — courteous to a public CDN, and fast enough at 173. */
async function fetchAll(
  champions: Champion[],
  patch: string,
): Promise<{ icons: Map<string, Map<string, string>>; failures: string[] }> {
  const icons = new Map<string, Map<string, string>>();
  const failures: string[] = [];
  const BATCH_SIZE = 8;

  for (let i = 0; i < champions.length; i += BATCH_SIZE) {
    const slice = champions.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      slice.map(async (c) => [c.apiname, await fetchDetail(c.apiname, patch)] as const),
    );
    for (const [j, outcome] of settled.entries()) {
      if (outcome.status === 'fulfilled') icons.set(outcome.value[0], outcome.value[1]);
      // A FAILURE IS COLLECTED AND REPORTED, never skipped silently. An earlier scan in this
      // project covered 759 of 937 pages because its fetch errors were caught and ignored
      // (DATA-SOURCES §38.2); "silence is not success" applies to this script too.
      else failures.push(`${slice[j]!.apiname}: ${String(outcome.reason)}`);
    }
    process.stderr.write(`\r  icons: ${icons.size}/${champions.length}`);
  }
  process.stderr.write('\n');
  return { icons, failures };
}

async function main(): Promise<void> {
  const roster = JSON.parse(await readFile(ROSTER, 'utf8')) as Champion[];
  const batch = JSON.parse(await readFile(BATCH, 'utf8')) as {
    patch: string;
    fetched: string;
    abilities: CuratedAbility[];
  };
  const patch = roster[0]?.provenance.patch ?? batch.patch;

  console.log(`roster: ${roster.length} champions, patch ${patch}`);
  console.log(`harvester batch: ${batch.abilities.length} ability entries`);

  // THE JOIN, AND WHERE IT COULD LOSE DATA SILENTLY. The batch keys abilities by the champion's
  // DISPLAY name ("Nunu & Willump"); the roster and Data Dragon use the apiname ("Nunu"). A join
  // on the wrong key produces a champion with no abilities, which looks exactly like a champion
  // nobody has harvested. So the join goes through the roster, and both directions are counted.
  const byDisplayName = new Map<string, CuratedAbility[]>();
  for (const ability of batch.abilities) {
    const list = byDisplayName.get(ability.champion) ?? [];
    list.push(ability);
    byDisplayName.set(ability.champion, list);
  }

  const rosterDisplayNames = new Set(roster.map((c) => c.name));
  const inBatchNotInRoster = [...byDisplayName.keys()].filter((n) => !rosterDisplayNames.has(n));
  const inRosterNotInBatch = roster.filter((c) => !byDisplayName.has(c.name)).map((c) => c.name);

  console.log(`\njoin, by display name:`);
  console.log(`  champions in the batch but NOT in the roster: ${inBatchNotInRoster.length}`);
  for (const name of inBatchNotInRoster) console.log(`    ${name}`);
  console.log(`  champions in the roster but NOT in the batch: ${inRosterNotInBatch.length}`);
  for (const name of inRosterNotInBatch) console.log(`    ${name}`);

  console.log(`\nfetching Data Dragon icon filenames for ${roster.length} champions…`);
  const { icons, failures } = await fetchAll(roster, patch);
  if (failures.length > 0) {
    console.log(`  FETCH FAILURES: ${failures.length}`);
    for (const f of failures) console.log(`    ${f}`);
  }

  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  let entriesWritten = 0;
  let entriesWithNoIcon = 0;
  const noIcon: string[] = [];
  const statuses = new Map<string, number>();
  const withoutAbilities: string[] = [];

  for (const champion of roster) {
    const championIcons = icons.get(champion.apiname);
    if (!championIcons) continue; // its failure is already reported above
    const abilities = byDisplayName.get(champion.name) ?? [];
    if (abilities.length === 0) withoutAbilities.push(champion.apiname);

    const withIcons = abilities.map((ability) => {
      const icon = championIcons.get(ability.slot);
      if (!icon) {
        entriesWithNoIcon += 1;
        noIcon.push(`${champion.apiname}/${ability.slot}`);
      }
      statuses.set(ability.verification, (statuses.get(ability.verification) ?? 0) + 1);
      // Verbatim, plus the icon. Nothing here judges a damage figure.
      return { ...ability, ...(icon ? { icon } : {}) };
    });
    entriesWritten += withIcons.length;

    const file = {
      what:
        `${champion.name} ability entries, joined from the harvester's full-roster batch with ` +
        `Data Dragon icon filenames.`,
      provenance: {
        source: 'build/proposed-curated/abilities/batch-01.json, produced by scripts/extract/run-batch.ts',
        patch,
        fetched: batch.fetched,
        extractedOn: new Date().toISOString().slice(0, 10),
        warning:
          'THESE ARE HARVESTER DRAFTS, NOT THE CURATED FILE. /curated/ holds no ability entries ' +
          'yet. Every figure here is derived at best, and each entry states its own verification ' +
          'status — the interface shows that status on screen and must never present these as ' +
          'settled. An entry marked incomplete contributes NO damage (SPECIFICATION §8).',
        regenerate: 'node --experimental-strip-types scripts/build-ability-files.ts',
      },
      abilities: withIcons,
      art: {
        note:
          'Data Dragon icon filenames, fetched from the champion detail file so the page does ' +
          'not depend on a live data call at render time. The images themselves load from the ' +
          'Data Dragon CDN, which SPECIFICATION §15 permits.',
        source: `${DDRAGON}/${patch}/data/en_US/champion/${champion.apiname}.json`,
        spellIconBase: `${DDRAGON}/${patch}/img/spell`,
        passiveIconBase: `${DDRAGON}/${patch}/img/passive`,
        portraitBase: `${DDRAGON}/${patch}/img/champion`,
      },
    };

    await writeFile(join(OUT_DIR, `${champion.apiname}.json`), JSON.stringify(file, null, 2) + '\n', 'utf8');
    written += 1;
  }

  console.log(`\n--- WRITTEN ---`);
  console.log(`  files: ${written} of ${roster.length} champions in the roster`);
  console.log(`  ability entries carried: ${entriesWritten} of ${batch.abilities.length} in the batch`);
  console.log(`  entries with NO icon: ${entriesWithNoIcon}${noIcon.length ? ` (${noIcon.join(', ')})` : ''}`);
  console.log(`  champions whose file has ZERO abilities: ${withoutAbilities.length}`);
  for (const name of withoutAbilities) console.log(`    ${name}`);
  console.log(`\n--- VERIFICATION STATUS of the entries carried ---`);
  console.log(`  DEFINITION: each entry's own status, copied verbatim from the batch.`);
  for (const [status, count] of [...statuses.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(12)} ${count}`);
  }

  if (failures.length > 0 || entriesWithNoIcon > 0) {
    process.exitCode = 1;
    console.log(`\nFAILED: the run is incomplete. Nothing above is a partial success.`);
  }
}

await main();
