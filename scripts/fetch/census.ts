// The item and rune effect census. Run with:  node scripts/fetch/census.ts
//
// It fetches four live sources, classifies every item and rune effect with the pure modules
// beside it, and writes ONE file: public/data/effect-census.json. It writes no effect values
// and no curated data — this is a measurement of the work, not the work.
//
// Everything it prints is an observed number, so the run itself is the report.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Provenance } from '../../src/types/data.ts';
import { CANDIDATE_AUDIT, reconcileAudit } from './effect-census-audit.ts';
import { classifyEffect, summarise, type EffectClassification } from './effect-census.ts';
import {
  buildItemEffectRecords,
  buildRuneEffectRecords,
  type RawRuneTreeForCensus,
} from './effect-population.ts';
import { filterItems, type RawItemMap } from './items.ts';
import { parseLuaModule } from './lua-table.ts';
import {
  ddragonItemsUrl,
  ddragonRunesUrl,
  extractWikiContent,
  fetchJson,
  itemIconUrl,
  VERSIONS_URL,
  WIKI_ITEM_MODULE_URL,
} from './sources.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', '..', 'public', 'data');

function table(rows: [string, string | number][]): string {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`).join('\n');
}

export async function run(): Promise<void> {
  const fetched = new Date().toISOString();

  const versions = await fetchJson<string[]>(VERSIONS_URL);
  const patch = versions[0];
  if (!patch) throw new Error('versions.json returned an empty list');
  console.log(`patch (versions.json[0]): ${patch}`);

  const itemProvenance: Provenance = {
    source: 'Riot Data Dragon item.json',
    url: ddragonItemsUrl(patch),
    patch,
    fetched,
  };

  // 1. The item pool — Data Dragon, corrected §5 filter.
  const itemFile = await fetchJson<{ data: RawItemMap }>(ddragonItemsUrl(patch));
  const { items, stages } = filterItems(itemFile.data, itemProvenance, (full) =>
    itemIconUrl(patch, full),
  );
  console.log(
    `item pool: ${items.length} distinct classic-SR items ` +
      `(${stages.distinctNamesBeforeIdCutoff} distinct names before the id cutoff)`,
  );

  // 2. Item effect TEXT — the wiki module.
  const moduleEnvelope = await fetchJson<unknown>(WIKI_ITEM_MODULE_URL);
  const itemModule = parseLuaModule(extractWikiContent(moduleEnvelope));
  const join = buildItemEffectRecords(
    items.map((i) => ({ id: i.id, name: i.name })),
    itemModule,
  );
  console.log(
    `wiki module: ${Object.keys(itemModule).length} item entries; ` +
      `${join.matched}/${items.length} pool items matched by id, ` +
      `${join.unmatched.length} unmatched, ${join.withoutEffects.length} with no effects block`,
  );

  // 3. Runes — Data Dragon prose. There is no wiki rune data module (DATA-SOURCES §6).
  const runeTrees = await fetchJson<RawRuneTreeForCensus[]>(ddragonRunesUrl(patch));
  const runeRecords = buildRuneEffectRecords(runeTrees);
  console.log(`runes: ${runeRecords.length} across ${runeTrees.length} trees`);

  const itemRows = join.records.map(classifyEffect);
  const runeRows = runeRecords.map(classifyEffect);
  const all: EffectClassification[] = [...itemRows, ...runeRows];

  const itemTotals = summarise(itemRows);
  const runeTotals = summarise(runeRows);
  const allTotals = summarise(all);

  for (const [label, totals] of [
    ['ITEMS', itemTotals],
    ['RUNES', runeTotals],
    ['BOTH', allTotals],
  ] as const) {
    console.log(`\n--- ${label} ---`);
    console.log(
      table([
        ['effect entries', totals.effects],
        ['cross-references to another item', totals.crossReferences],
        ['deal damage: source states the value (instance)', totals.damageInstances],
        ['deal damage: a person must read the sentence (candidate)', totals.damageCandidates],
        ['modify a stat (any stat)', totals.modifiesStat],
        ['modify a damage-relevant stat', totals.modifiesDamageRelevantStat],
        ['conditional', totals.conditional],
        ['always-active', totals.alwaysActive],
        ['IN SCOPE (damage or damage-relevant stat)', totals.inScope],
        ['out of scope', totals.outOfScope],
        ['  in scope, machine-reachable (R1+R2)', totals.reachableInScope],
        ['  in scope, needs a person (H1+H2)', totals.hardInScope],
        ['owner-required stat references', totals.ownerRefs],
        ['  owner stated: the holder', totals.ownerHolder],
        ['  owner stated: the other champion', totals.ownerOpponent],
        ['  owner NOT stated', totals.ownerUnstated],
        ['    ...of those, a verb implies the holder (NOT resolved)', totals.unstatedWithHolderVerb],
        ['  resolved only by a coordinated possessive', totals.ownerByCoordination],
        ['  of which health pools', totals.healthPoolRefs],
        ['  of which armor / MR / mana', totals.resistanceAndManaRefs],
        ['bare "health"/"mana" mentions (not counted above)', totals.barePoolMentions],
      ]),
    );
  }

  // The candidate bucket is a superset on purpose. Reconcile it against the hand audit so a
  // sentence nobody has read is visible as such, and so a stale verdict is reported rather
  // than assumed still true.
  const audit = reconcileAudit(all);
  console.log(`\n--- HAND AUDIT of the ${allTotals.damageCandidates} candidates ---`);
  console.log(
    table([
      ['audited entries', audit.audited],
      ['of those, confirmed to deal damage', audit.dealsDamage],
      ['of those, confirmed to deal none (the damage was a trigger)', audit.dealsNoDamage],
      ['candidates nobody has read yet', audit.unaudited.length],
      ['audit entries that have drifted (no longer candidates)', audit.notCandidateAnyMore.length],
      [
        'EFFECTS THAT DEAL DAMAGE (instances + audited candidates)',
        allTotals.damageInstances + audit.dealsDamage,
      ],
    ]),
  );
  if (audit.unaudited.length > 0) {
    console.log(
      '  unread: ' + audit.unaudited.map((u) => `${u.ownerName} [${u.key}]`).join(', '),
    );
  }
  if (audit.notCandidateAnyMore.length > 0) {
    console.log(
      '  drifted: ' +
        audit.notCandidateAnyMore.map((u) => `${u.ownerName} [${u.key}] -> ${u.nowIs}`).join(', '),
    );
  }

  // The scope figures ABOVE count every candidate as damage, because the classifier cannot
  // tell. These are the same figures after the hand audit has removed the 22 whose damage
  // turned out to be the trigger. This is the number the plan should be sized against.
  const auditedDamage = new Map(CANDIDATE_AUDIT.map((v) => [`${v.ownerName}|${v.key}`, v.dealsDamage]));
  const dealsDamage = (row: EffectClassification): boolean =>
    row.damage === 'instance' ||
    (row.damage === 'candidate' && auditedDamage.get(`${row.ownerName}|${row.key}`) === true);
  const damaging = all.filter(dealsDamage);
  const statOnly = all.filter((r) => !dealsDamage(r) && r.modifiesDamageRelevantStat);
  const unstated = (r: EffectClassification) => r.ownerRefs.some((o) => o.owner === 'unstated');
  const afterAudit = {
    dealDamage: damaging.length,
    dealDamageItems: damaging.filter((r) => r.source === 'item').length,
    dealDamageRunes: damaging.filter((r) => r.source === 'rune').length,
    dealDamageValueMachineReadable: damaging.filter((r) => r.damage === 'instance').length,
    dealDamageValueNeedsAPerson: damaging.filter((r) => r.damage === 'candidate').length,
    dealDamageWithUnstatedOwner: damaging.filter(unstated).length,
    statOnlyDamageRelevant: statOnly.length,
    statOnlyConditional: statOnly.filter((r) => r.conditional).length,
    statOnlyAlwaysActive: statOnly.filter((r) => !r.conditional).length,
    statOnlyWithUnstatedOwner: statOnly.filter(unstated).length,
    inScope: damaging.length + statOnly.length,
    outOfScope: all.length - damaging.length - statOnly.length,
  };
  console.log('\n--- SCOPE, AFTER THE HAND AUDIT ---');
  console.log(
    table([
      ['effects that deal damage', afterAudit.dealDamage],
      ['  items / runes', `${afterAudit.dealDamageItems} / ${afterAudit.dealDamageRunes}`],
      ['  value machine-readable', afterAudit.dealDamageValueMachineReadable],
      ['  value needs a person to read the sentence', afterAudit.dealDamageValueNeedsAPerson],
      ['  carrying a stat whose owner NO source states', afterAudit.dealDamageWithUnstatedOwner],
      ['effects that only modify a damage-relevant stat', afterAudit.statOnlyDamageRelevant],
      ['  conditional / always-active', `${afterAudit.statOnlyConditional} / ${afterAudit.statOnlyAlwaysActive}`],
      ['  carrying a stat whose owner NO source states', afterAudit.statOnlyWithUnstatedOwner],
      ['IN SCOPE', afterAudit.inScope],
      ['out of scope', afterAudit.outOfScope],
    ]),
  );

  const payload = {
    provenance: {
      source:
        'Data Dragon item.json + runesReforged.json (pool, rune prose); ' +
        'wiki Module:ItemData/data (item effect prose)',
      patch,
      fetched,
      urls: {
        patch: VERSIONS_URL,
        items: ddragonItemsUrl(patch),
        itemEffects: WIKI_ITEM_MODULE_URL,
        runes: ddragonRunesUrl(patch),
      },
    },
    definitions: {
      itemPool:
        'The 209 distinct classic Summoner\'s Rift items of DATA-SOURCES §5 — maps["11"] && ' +
        'gold.purchasable && gold.total > 0 && id < 200000, then dedupe by name keeping the ' +
        'lowest id. NOT 222: 222 is the count of distinct names the broken three-part filter ' +
        'leaves before the id cutoff.',
      itemEffect:
        'One keyed entry under an item\'s `effects` table in Module:ItemData/data — pass, ' +
        'pass2, pass3, act or consume. Its text is `description` plus description2/3 where ' +
        'present; those are rider clauses on the same effect, not separate effects.',
      runeEffect:
        'One rune from runesReforged.json, text = longDesc with HTML stripped. Stat shards ' +
        'are excluded: they appear in no source at all (DATA-SOURCES §7).',
      dealsDamage:
        'The effect itself causes damage. Items: an {{as|…}} run that names a damage type ' +
        'AND carries a value, with runs disqualified when the preceding 80 characters make ' +
        'the value a shield, heal or restore, or when the text reads "damage taken/reduction/' +
        'amp". Runes: a labelled "Damage:" line, or a sentence with a dealing verb, a damage ' +
        'noun and a number.',
      modifiesStat:
        'The text names a stat AND a granting/reducing verb. Broad reading of SPECIFICATION ' +
        '§4 "a stat modification" — includes movement speed, haste, tenacity, gold.',
      modifiesDamageRelevantStat:
        'The narrower reading: the stat named can change a damage number or the survival ' +
        'verdict. Excludes movement speed, attack speed, ability haste, cooldowns, tenacity, ' +
        'gold and vision, because the engine models sequence, not elapsed time (CLAUDE.md).',
      conditional:
        'The effect states a trigger (dealing/taking/hitting/killing/when/while/after/against ' +
        '…) or a state (stacks, a duration, a cooldown, a health threshold). An effect with ' +
        'neither applies simply because the item is held — SPECIFICATION §5 "always-active".',
      inScope: 'dealsDamage OR modifiesDamageRelevantStat. This is the harvest population.',
      reach:
        'The DATA-SOURCES §26.3 split, applied to effects. R1: the source wraps the quantity ' +
        'and its value together (adjacent {{as}} blocks; a labelled rune line). R2: the same ' +
        'with exactly one bounded connective (as / of / equal to) between them. H1: the ' +
        'quantity is named but its value is not structurally attached — a person must read ' +
        'the sentence to decide which reading applies. H2: the source never labels the number.',
      ownerReference:
        'One mention of one of the ten stats DATA-SOURCES §16 refuses without an owner: the ' +
        'four health pools, armor and bonus armor, magic resistance and bonus magic ' +
        'resistance, maximum and current mana. Longest phrasing wins, so "bonus health" is ' +
        'never also counted as "health". A bare "health"/"mana" with no pool qualifier is ' +
        'counted separately and never merged in.',
      owner:
        'holder = the source states the stat belongs to the item holder / rune owner ("your", ' +
        '"his"). opponent = it states the other champion ("the target\'s", "their"). unstated ' +
        '= the source names the stat and says whose it is nowhere in the effect text. ' +
        'unstated is a PERMANENT state, not a to-do (DATA-SOURCES §16, SPECIFICATION §8).',
    },
    itemFilterStages: stages,
    join: {
      poolItems: items.length,
      matchedInWikiModule: join.matched,
      unmatched: join.unmatched,
      withoutEffectsBlock: join.withoutEffects.length,
      withoutEffectsBlockNames: join.withoutEffects.map((i) => i.name),
    },
    totals: { items: itemTotals, runes: runeTotals, all: allTotals },
    handAudit: {
      whatItIs:
        'One person reading each `candidate` sentence once, on 2026-08-13, recorded with the ' +
        'words the verdict rests on. NOT a verification: nothing here is independently ' +
        're-derived and no entry may claim better than `derived` because of it.',
      reconciliation: audit,
      verdicts: CANDIDATE_AUDIT,
      scopeAfterAudit: afterAudit,
    },
    effects: all,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const target = join_(OUT_DIR, 'effect-census.json');
  const text = JSON.stringify(payload, null, 2) + '\n';
  await writeFile(target, text, 'utf8');
  console.log(`\nwrote public/data/effect-census.json (${(text.length / 1024).toFixed(0)} KiB)`);
}

// `join` is taken by the item-join result above; alias the path helper rather than rename it
// at every call site.
function join_(...parts: string[]): string {
  return join(...parts);
}

await run();
