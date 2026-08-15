// The normaliser sweep — the live half.
//
// Run: node scripts/fetch/normaliser-sweep-run.ts
//
// WHAT IT DOES, in order:
//
//  1. Refuses to run if Data Dragon has moved past 16.16.1. Every stored figure in this project
//     is stated against that patch; a cross-patch measurement would be a different number wearing
//     the same name.
//  2. Runs check 1 — `damageTypeOnlyInMarkup` — over all 62 Data Dragon rune descriptions AND
//     over the 209-item pool's Data Dragon descriptions. The First Strike finding was made on
//     runes; nothing had asked whether items carry the same shape.
//  3. Runs check 2 — `namedArgumentsCarryingMeaning` — over every item effect wikitext, which is
//     read from public/data/effect-census.json rather than re-fetched. That file already holds
//     the module text verbatim, so this costs the wiki nothing at all.
//  4. Writes public/data/normaliser-sweep.json: the site inventory with its derived verdicts, and
//     both measured populations.
//
// IT DECIDES NOTHING. Check 1 fires on 3 texts across items and runes and in 2 of the 3 the tag
// is a colour on a stat grant rather than a damage type — so the output names candidates for a
// person to read, exactly as `READ_POPULATION` does for variable hit counts (CLAUDE.md).
//
// COURTESY: three Data Dragon requests, no wiki requests at all.

import { readFileSync, writeFileSync } from 'node:fs';

import type { Provenance } from '../../src/types/data.ts';
import {
  SITES,
  classifySite,
  damageTypeOnlyInMarkup,
  namedArgumentsCarryingMeaning,
  summariseSites,
  type MarkupOnlyTypeClaim,
} from './normaliser-sweep.ts';
import { MODE_VARIANT_ID_FLOOR, type RawItemMap } from './items.ts';
import { VERSIONS_URL, ddragonItemsUrl, ddragonRunesUrl, fetchJson } from './sources.ts';

/** The patch every stored figure in this project is stated against (DATA-SOURCES §8). */
const PINNED_PATCH = '16.16.1';

const CENSUS_FILE = 'public/data/effect-census.json';
const OUT_FILE = 'public/data/normaliser-sweep.json';

interface DdragonRune {
  id: number;
  name: string;
  longDesc: string;
}
interface DdragonTree {
  slots: { runes: DdragonRune[] }[];
}

interface CensusFile {
  effects: { source: 'item' | 'rune'; ownerName: string; key: string; text: string }[];
}

/** The §5 pool, rebuilt here from the raw file so the sweep measures what the product ships. */
function poolIds(raw: RawItemMap): { id: number; name: string }[] {
  const kept = Object.keys(raw).filter((id) => {
    const item = raw[id]!;
    return (
      item.maps?.['11'] === true &&
      item.gold?.purchasable === true &&
      (item.gold?.total ?? 0) > 0 &&
      Number(id) < MODE_VARIANT_ID_FLOOR
    );
  });
  const byName = new Map<string, number[]>();
  for (const id of kept) {
    const name = raw[id]!.name ?? `Unnamed item ${id}`;
    const list = byName.get(name);
    if (list) list.push(Number(id));
    else byName.set(name, [Number(id)]);
  }
  return [...byName.entries()]
    .map(([name, ids]) => ({ name, id: Math.min(...ids) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

async function main(): Promise<void> {
  const versions = await fetchJson<string[]>(VERSIONS_URL);
  const patch = versions[0]!;
  if (patch !== PINNED_PATCH) {
    throw new Error(
      `Data Dragon is serving ${patch}, not ${PINNED_PATCH}. Every population this sweep reports ` +
        `is stated against ${PINNED_PATCH}; re-measuring against a different patch and filing it ` +
        `under the same name would be the exact confusion this project is built to avoid. Stop, ` +
        `and re-state the pinned patch deliberately.`,
    );
  }

  const trees = await fetchJson<DdragonTree[]>(ddragonRunesUrl(patch));
  const itemFile = await fetchJson<{ data: RawItemMap }>(ddragonItemsUrl(patch));

  // ---- check 1, runes -------------------------------------------------------------------
  const runes: DdragonRune[] = [];
  for (const tree of trees) for (const slot of tree.slots) for (const rune of slot.runes) runes.push(rune);
  const runeHits: MarkupOnlyTypeClaim[] = [];
  for (const rune of runes) {
    const hit = damageTypeOnlyInMarkup(rune.name, rune.longDesc ?? '');
    if (hit) runeHits.push(hit);
  }

  // ---- check 1, items -------------------------------------------------------------------
  const pool = poolIds(itemFile.data);
  const itemHits: MarkupOnlyTypeClaim[] = [];
  for (const item of pool) {
    const hit = damageTypeOnlyInMarkup(item.name, itemFile.data[String(item.id)]?.description ?? '');
    if (hit) itemHits.push(hit);
  }

  // ---- check 2, item effect wikitext ------------------------------------------------------
  const census = JSON.parse(readFileSync(CENSUS_FILE, 'utf8')) as CensusFile;
  const itemEffects = census.effects.filter((e) => e.source === 'item');
  const namedArgumentHits = itemEffects
    .map((effect) => ({
      effect: `${effect.ownerName} [${effect.key}]`,
      facts: namedArgumentsCarryingMeaning(effect.text ?? ''),
    }))
    .filter((row) => row.facts.length > 0);

  const attributesAnOwnerOfARequiredStat = namedArgumentHits.filter((row) =>
    row.facts.some((f) => f.attributesAnOwner && f.ownerRequiredStat !== null),
  );
  const namesARequiredStat = namedArgumentHits.filter((row) =>
    row.facts.some((f) => f.ownerRequiredStat !== null),
  );

  const provenance: Provenance = {
    source:
      'Riot Data Dragon runesReforged.json and item.json (raw markup, tags intact); wiki ' +
      'Module:ItemData/data effect text as already stored verbatim in ' +
      'public/data/effect-census.json',
    url: ddragonItemsUrl(patch),
    patch,
    fetched: new Date().toISOString(),
  };

  const summary = summariseSites();
  const report = {
    provenance,
    whatThisIs:
      'Every place in scripts/fetch/ where text or a value is altered before something is ' +
      'compared against it, with what the alteration removes, whether that can carry meaning, ' +
      'what the comparison is between, and BOTH failure directions — a disagreement invented, and ' +
      'a disagreement hidden. Written after the First Strike finding of 2026-08-15, where the ' +
      'pipeline stripped the tag that carried the damage type and then reported a conflict it had ' +
      'created itself.',
    membershipRule:
      'A site is counted when a value is altered — markup stripped, case folded, whitespace ' +
      'collapsed, templates peeled, a number rounded or parsed — AND the altered value is then an ' +
      'operand of an equality test, a substring or regex test, or a numeric tolerance test. A ' +
      'normaliser whose output is only ever printed is not a site.',
    verdictRule:
      'safe: nothing it removes can carry meaning, OR an exact comparison decides first and the ' +
      'fold only classifies the miss. dangerous: a meaning-carrying removal feeding a comparison ' +
      'between two sources, or between a source and a pattern standing in for what the source ' +
      'says. watched: a meaning-carrying removal feeding a comparison against our own stored ' +
      'value or our own previous run.',
    counts: {
      sites: summary.sites,
      dangerous: summary.dangerous.length,
      watched: summary.watched.length,
      safe: summary.safe.length,
      withALiveDefect: summary.liveDefects.length,
      withADefectSinceFIXED: summary.fixedDefects.length,
      couldInventADisagreement: summary.canInvent.length,
      couldHideADisagreement: summary.canHide.length,
    },
    byVerdict: {
      dangerous: summary.dangerous,
      watched: summary.watched,
      safe: summary.safe,
    },
    defects: {
      live: summary.liveDefects,
      // Fixed 2026-08-15. A site stays `dangerous` after its defect is corrected, and that is
      // deliberate: the verdict describes the NORMALISER, which is still there and can still
      // manufacture the next disagreement. Only the instance is closed.
      fixed: summary.fixedDefects,
    },
    sites: SITES.map((site) => ({ ...site, verdict: classifySite(site) })),
    checks: {
      damageTypeStatedOnlyInMarkup: {
        definition:
          "Data Dragon's markup asserts exactly one damage type and that type survives nowhere in " +
          'the stripped text. Anything reading the stripped text alone has lost a fact the source ' +
          'stated. IT PROPOSES: the tag is also used as a COLOUR on stat text, so a hit is a ' +
          'candidate for a person to read, never a damage type to store.',
        runesChecked: runes.length,
        runeHits,
        itemsChecked: pool.length,
        itemHits,
      },
      meaningInsideANamedTemplateArgument: {
        definition:
          "`plainText` drops every `name=value` template argument as formatting. `type=` on the " +
          "wiki's {{pp}} progression template is not formatting — it states WHICH stat the " +
          'progression reads and, where it carries a possessive, WHOSE. Counted when the value ' +
          'names one of the ELEVEN owner-required stats or contains a possessive. It was the ten ' +
          'until 2026-08-15, when level was added to OWNER_REQUIRED_STATS; against the ten this ' +
          'check reported 10 / 5 / 2 where it now reports 12 / 12 / 7, and the three items ' +
          "stating `type=target's level` were the reason level was added at all.",
        itemEffectsChecked: itemEffects.length,
        effectsCarryingSuchAnArgument: namedArgumentHits.length,
        effectsNamingAnOwnerRequiredStat: namesARequiredStat.length,
        effectsWhereTheWikiATTRIBUTESAnOwnerRequiredStat: attributesAnOwnerOfARequiredStat.length,
        hits: namedArgumentHits,
      },
    },
  };

  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2) + '\n');

  console.log(`patch ${patch}`);
  console.log(`\nSITES: ${summary.sites}`);
  console.log(`  dangerous ${summary.dangerous.length}  ${summary.dangerous.join(', ')}`);
  console.log(`  watched   ${summary.watched.length}  ${summary.watched.join(', ')}`);
  console.log(`  safe      ${summary.safe.length}  ${summary.safe.join(', ')}`);
  console.log(`  with a LIVE defect: ${summary.liveDefects.length} — ${summary.liveDefects.join(', ')}`);
  console.log(`  could INVENT a disagreement: ${summary.canInvent.length}`);
  console.log(`  could HIDE a disagreement:   ${summary.canHide.length}`);

  console.log(`\nCHECK 1 — damage type stated only in markup`);
  console.log(`  runes checked ${runes.length}, hits ${runeHits.length}`);
  for (const hit of runeHits) console.log(`    ${hit.subject}: <${hit.type}damage> wraps "${hit.wraps}"`);
  console.log(`  pool items checked ${pool.length}, hits ${itemHits.length}`);
  for (const hit of itemHits) console.log(`    ${hit.subject}: <${hit.type}damage> wraps "${hit.wraps}"`);

  console.log(`\nCHECK 2 — meaning inside a named template argument`);
  console.log(`  item effects checked ${itemEffects.length}`);
  console.log(`  carrying such an argument ${namedArgumentHits.length}`);
  console.log(`  naming an owner-required stat ${namesARequiredStat.length}`);
  console.log(
    `  where the WIKI ATTRIBUTES an owner-required stat ${attributesAnOwnerOfARequiredStat.length}`,
  );
  for (const row of namedArgumentHits) {
    console.log(`    ${row.effect}`);
    for (const f of row.facts) {
      console.log(
        `        ${f.argument}=${f.states}   [stat: ${f.ownerRequiredStat ?? 'none'}` +
          `, owner stated: ${f.attributesAnOwner ? 'yes' : 'no'}]`,
      );
    }
  }
  console.log(`\nwritten: ${OUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
