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
// ═══ IT READS THE PROTECTED OVERRIDE FILE, NOT THE DRAFT (changed 2026-08-14) ═══
//
// It read `build/proposed-curated/abilities/batch-01.json` — the harvester's DRAFT — until this
// date, which meant the site ran on the unguarded copy while the guarded one sat unserved. A
// source of truth nothing serves is a source of truth in name only.
//
// IT IS A RE-POINT, NOT A COPY. `curated/curated-data.json` is one file of 1,039,973 bytes; a
// visitor calculating one matchup must not download all 173 champions to do it. The per-champion
// split is why this script exists, so the split stays and only its INPUT moves.
//
// ═══ A REFUSED ENTRY IS NOT AN UNHARVESTED ONE ═══
//
// 18 ability entries are in the draft and not in the override file: gate 1 refused them (16 for
// two damage rows sharing a component id, 2 for a `stacks` ratio naming no counter). All 18 were
// already `incomplete` and an incomplete entry contributes no damage whatever it holds, so this
// change moves NO damage figure. What it would otherwise move is a sentence — from "incomplete,
// and here is why" to "nothing has been harvested for this slot", which is false.
//
// So the refusals are carried. Each is rebuilt from `merge-refusals.json`'s `identity` block —
// champion, slot, name, instance type, max rank, and NOTHING ELSE. No component, no ratio, no
// figure. The refused data itself is never republished; only the fact that it exists and was
// refused, with the gate's own reason.
//
// ═══ WHY IT IS AT `scripts/` ROOT AND NOT IN AN AREA ═══
//
// It joins the data pipeline's roster (`public/data/champions.json`), the lead's override file
// (`curated/`) and the harvester's refusal list. No area may write another's directory, and the
// file it produces lives under `public/data/`. A path in no area belongs to the lead (CLAUDE.md,
// the partition), which is exactly what this is.
//
// IT NEVER WRITES `/curated/`. It only reads it.
//
// It writes ONLY `public/data/abilities/`. It does not touch `champions.json`, `items.json` or
// the manifest, so it is safe to run while the data-pipeline area is working.
//
// ═══ WHAT IT DOES NOT DO ═══
//
// It does not harvest, judge or alter a single damage figure. Every entry is copied verbatim from
// the override file, INCLUDING its verification status and its `unresolvable` facts, and one
// field is added: the Data Dragon icon filename. A figure that was `incomplete` there is
// `incomplete` here.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Champion, CuratedAbility } from '../src/types/data.ts';

/** One row of `merge-refusals.json`. Only the fields this script reads are declared. */
interface RefusalRecord {
  area: string;
  key: string;
  why: string;
  identity?: {
    champion: string;
    slot: string;
    abilityName: string;
    instanceType: string;
    maxRank: number;
    form?: string;
    unresolvable?: Array<{ field: string; why: string }>;
  };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'public', 'data', 'abilities');
const ROSTER = join(ROOT, 'public', 'data', 'champions.json');
/** The protected override file. READ ONLY, ALWAYS — this script never writes it. */
const CURATED = join(ROOT, 'curated', 'curated-data.json');
/** Every entry the merge refused, with the gate's own reason. Carried, never dropped. */
const REFUSALS = join(ROOT, 'build', 'proposed-curated', 'merge-refusals.json');

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

/**
 * THE 18 ENTRIES GATE 1 REFUSED, REBUILT AS NAMED GAPS.
 *
 * Each carries its identity and the gate's own reason, and NO damage of any kind: `components`
 * is empty and `verification` is `incomplete`, so the engine gives it zero damage and the
 * interface prints the reason (SPECIFICATION §8). That is the same treatment any incomplete
 * entry gets — the difference is that the reason is true.
 *
 * WITHOUT THIS the ability would simply be absent, and `simulate` would say "nothing has been
 * harvested for this champion's E slot" — which is false, and the kind of plausible wrong
 * statement this project treats as worse than saying nothing.
 */
function refusedAsIncomplete(refusals: RefusalRecord[]): CuratedAbility[] {
  return refusals
    .filter((r) => r.area === 'ability' && r.identity)
    .map((r) => {
      const id = r.identity!;
      return {
        champion: id.champion,
        slot: id.slot as CuratedAbility['slot'],
        abilityName: id.abilityName,
        instanceType: id.instanceType as CuratedAbility['instanceType'],
        maxRank: id.maxRank,
        ...(id.form ? { form: id.form } : {}),
        // A FACT NO SOURCE STATES SURVIVES THE REFUSAL. It makes the entry PERMANENTLY
        // incomplete rather than pending, and dropping it would promise work nobody can do.
        // Blitzcrank R is the one refused entry carrying one.
        ...((id.unresolvable?.length ?? 0) > 0 ? { unresolvable: id.unresolvable } : {}),
        // NO COMPONENTS. The refused rows are never republished.
        components: [],
        verification: 'incomplete' as const,
        notes:
          `this ability was harvested but refused by the data gate, so its damage is not ` +
          `published: ${r.why} It is a known gap with a known cause, not an ability nobody ` +
          `has looked at.`,
        provenance: {
          source: 'build/proposed-curated/merge-refusals.json (gate 1 refusal)',
          url: 'https://wiki.leagueoflegends.com/en-us/',
          patch: 'see the file-level provenance',
          fetched: 'see the file-level provenance',
        },
      } satisfies CuratedAbility;
    });
}

async function main(): Promise<void> {
  const roster = JSON.parse(await readFile(ROSTER, 'utf8')) as Champion[];
  const curated = JSON.parse(await readFile(CURATED, 'utf8')) as {
    patch: string;
    fetched: string;
    abilities: CuratedAbility[];
  };
  const refusalFile = JSON.parse(await readFile(REFUSALS, 'utf8')) as { refusals: RefusalRecord[] };
  const carried = refusedAsIncomplete(refusalFile.refusals);
  const patch = roster[0]?.provenance.patch ?? curated.patch;

  const abilities = [...curated.abilities, ...carried];

  console.log(`roster: ${roster.length} champions, patch ${patch}`);
  console.log(`override file: ${curated.abilities.length} ability entries`);
  console.log(`refused entries carried as named gaps: ${carried.length}`);
  console.log(`total to publish: ${abilities.length}`);

  // THE JOIN, AND WHERE IT COULD LOSE DATA SILENTLY. The override file keys abilities by the
  // DISPLAY name ("Nunu & Willump"); the roster and Data Dragon use the apiname ("Nunu"). A join
  // on the wrong key produces a champion with no abilities, which looks exactly like a champion
  // nobody has harvested. So the join goes through the roster, and both directions are counted.
  const byDisplayName = new Map<string, CuratedAbility[]>();
  for (const ability of abilities) {
    const list = byDisplayName.get(ability.champion) ?? [];
    list.push(ability);
    byDisplayName.set(ability.champion, list);
  }

  const rosterDisplayNames = new Set(roster.map((c) => c.name));
  const inBatchNotInRoster = [...byDisplayName.keys()].filter((n) => !rosterDisplayNames.has(n));
  const inRosterNotInBatch = roster.filter((c) => !byDisplayName.has(c.name)).map((c) => c.name);

  console.log(`\njoin, by display name:`);
  console.log(`  champions in the data but NOT in the roster: ${inBatchNotInRoster.length}`);
  for (const name of inBatchNotInRoster) console.log(`    ${name}`);
  console.log(`  champions in the roster but NOT in the data: ${inRosterNotInBatch.length}`);
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
        `${champion.name} ability entries, joined from the protected override file with ` +
        `Data Dragon icon filenames. Entries the data gate refused are present too, named and ` +
        `marked incomplete, so a known gap never reads as an ability nobody harvested.`,
      provenance: {
        source:
          'curated/curated-data.json (the protected override file), plus the gate-1 refusals ' +
          'from build/proposed-curated/merge-refusals.json carried as named gaps',
        patch,
        fetched: curated.fetched,
        extractedOn: new Date().toISOString().slice(0, 10),
        warning:
          'These come from the protected override file, which is where this project keeps its ' +
          'hand-authored numbers. Every figure is DERIVED at best unless its entry says ' +
          'otherwise, and each entry states its own verification status — the interface shows ' +
          'that status on screen and must never present a derived figure as settled. An entry ' +
          'marked incomplete contributes NO damage (SPECIFICATION §8). Until 2026-08-14 this ' +
          'warning said these files were harvester drafts; the input moved to the override file ' +
          'and that sentence is deleted rather than softened, because it would now be false.',
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
  console.log(`  ability entries carried: ${entriesWritten} of ${abilities.length} to publish`);
  console.log(`  entries with NO icon: ${entriesWithNoIcon}${noIcon.length ? ` (${noIcon.join(', ')})` : ''}`);
  console.log(`  champions whose file has ZERO abilities: ${withoutAbilities.length}`);
  for (const name of withoutAbilities) console.log(`    ${name}`);
  console.log(`\n--- VERIFICATION STATUS of the entries carried ---`);
  console.log(`  DEFINITION: each entry's own status, copied verbatim from the override file;`);
  console.log(`  the ${carried.length} carried refusals are 'incomplete' by construction.`);
  for (const [status, count] of [...statuses.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(12)} ${count}`);
  }

  if (failures.length > 0 || entriesWithNoIcon > 0) {
    process.exitCode = 1;
    console.log(`\nFAILED: the run is incomplete. Nothing above is a partial success.`);
  }
}

await main();
