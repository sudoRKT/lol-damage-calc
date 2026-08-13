// Extracting the VALUES of the item and rune effects whose source states them structurally.
//   node scripts/fetch/values.ts
//
// It fetches the same four live sources the census does, rebuilds the identical 291-effect
// population, and puts each of the 63 structurally-stated damaging effects through the gate in
// `effect-values-gate.ts`. It writes ONE file: public/data/effect-values.json.
//
// THAT FILE IS A PROPOSAL, NOT CURATED DATA. Merging it into /curated/ is a lead action. No
// script in this directory may write /curated/, and none does.
//
// Everything printed is an observed number, so the run is the report.

import { mkdir, writeFile } from 'node:fs/promises';
// `join` is the item↔wiki join below; the path helper is aliased so neither shadows the other.
import { dirname, join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Provenance } from '../../src/types/data.ts';
import { CANDIDATE_AUDIT } from './effect-census-audit.ts';
import { classifyEffect, type EffectClassification } from './effect-census.ts';
import {
  buildItemEffectRecords,
  buildRuneEffectRecords,
  type RawRuneTreeForCensus,
} from './effect-population.ts';
import {
  ddragonAttributes,
  ddragonEffectProse,
  ddragonRestatesNumbers,
} from './effect-owner-crosscheck.ts';
import { extractItemEffect, type RefusalReason } from './effect-values.ts';
import { gateEffect, proposedItemEffect, type GateResult } from './effect-values-gate.ts';
import { READ_POPULATION, readingFor } from './effect-values-read.ts';
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
const OUT_DIR = joinPath(HERE, '..', '..', 'public', 'data');

function table(rows: [string, string | number][]): string {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`).join('\n');
}

/** Counted with its definition, per CLAUDE.md — never a bare number. */
function tally<T>(rows: T[], keyOf: (row: T) => string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) for (const k of keyOf(row)) out[k] = (out[k] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
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

  const itemFile = await fetchJson<{ data: RawItemMap }>(ddragonItemsUrl(patch));
  const { items } = filterItems(itemFile.data, itemProvenance, (full) =>
    itemIconUrl(patch, full),
  );
  const moduleEnvelope = await fetchJson<unknown>(WIKI_ITEM_MODULE_URL);
  const itemModule = parseLuaModule(extractWikiContent(moduleEnvelope));
  const join = buildItemEffectRecords(
    items.map((i) => ({ id: i.id, name: i.name })),
    itemModule,
  );
  const runeTrees = await fetchJson<RawRuneTreeForCensus[]>(ddragonRunesUrl(patch));
  const runeRecords = buildRuneEffectRecords(runeTrees);

  const records = [...join.records, ...runeRecords];
  const rows: EffectClassification[] = records.map(classifyEffect);
  const structural = rows.filter((r) => r.damage === 'instance');
  const auditedDamaging = new Set(
    CANDIDATE_AUDIT.filter((v) => v.dealsDamage).map((v) => `${v.ownerName}|${v.key}`),
  );
  const needsAPerson = rows.filter(
    (r) => r.damage === 'candidate' && auditedDamaging.has(`${r.ownerName}|${r.key}`),
  );

  console.log(
    table([
      ['item pool (DATA-SOURCES §5 filter)', `${items.length} distinct classic-SR items`],
      ['effect entries (items + runes)', `${rows.length} = ${join.records.length} + ${runeRecords.length}`],
      ['damaging: value stated structurally (§37.2 says 63)', structural.length],
      ['damaging: needs a person to read (§37.2 says 18)', needsAPerson.length],
      ['read population recorded in effect-values-read.ts', READ_POPULATION.length],
    ]),
  );

  // A live count that disagrees with DATA-SOURCES is a FINDING, not something to absorb.
  const findings: string[] = [];
  if (structural.length !== 63) {
    findings.push(
      `DATA-SOURCES §37.2 records 63 structurally-stated damaging effects; this run observed ` +
        `${structural.length}.`,
    );
  }
  const structuralKeys = new Set(structural.map((r) => `${r.id}|${r.key}`));
  const unread = structural.filter((r) => !readingFor(r.id, r.key));
  const staleReadings = READ_POPULATION.filter((r) => !structuralKeys.has(`${r.id}|${r.key}`));
  if (unread.length > 0) {
    findings.push(
      `${unread.length} structurally-stated effects have no recorded reading and were reported, ` +
        `never stored: ${unread.map((u) => `${u.ownerName} [${u.key}]`).join(', ')}`,
    );
  }
  if (staleReadings.length > 0) {
    findings.push(
      `${staleReadings.length} recorded readings no longer match a structurally-stated effect — ` +
        `the source wording has drifted: ${staleReadings
          .map((s) => `${s.ownerName} [${s.key}]`)
          .join(', ')}`,
    );
  }

  // ---- the gate -----------------------------------------------------------
  const gated: GateResult[] = structural.map((row) =>
    gateEffect(
      {
        source: row.source,
        ownerName: row.ownerName,
        id: row.id,
        key: row.key,
        effectName: row.effectName,
        text: row.text,
      },
      extractItemEffect,
    ),
  );
  const stored = gated.filter((g) => g.outcome === 'stored');
  const refused = gated.filter((g) => g.outcome === 'refused');

  console.log('\n--- THE 63, THROUGH THE GATE ---');
  const rangeSplit = stored.filter((s) =>
    JSON.stringify(s.components ?? []).includes('byRangeType'),
  );
  const recurring = stored.filter((s) => s.overTime);
  console.log(
    table([
      ['effects put through the gate', gated.length],
      ['STORED (parser and reading agree, in full)', stored.length],
      ['  of those, carrying a stat NO source attributes (forces incomplete)', stored.filter((s) => s.hasUnresolvedOwner).length],
      ['  of those, complete (verification: derived)', stored.filter((s) => !s.hasUnresolvedOwner).length],
      ['REFUSED', refused.length],
      ['  items / runes', `${refused.filter((r) => r.source === 'item').length} / ${refused.filter((r) => r.source === 'rune').length}`],
    ]),
  );

  console.log('\n--- THE SHAPES THE CONTRACT PASS RELEASED ---');
  console.log(
    table([
      ['stored with a melee/ranged pair (Scaling.byRangeType)', rangeSplit.length],
      ['  ', rangeSplit.map((s) => `${s.ownerName} [${s.key}]`).join(', ')],
      ['stored as damage over time (CuratedItemEffect.overTime)', recurring.length],
      ['  of those, with an instance count the SOURCE states', recurring.filter((s) => s.overTime?.totalInstances !== undefined).length],
      ['  of those, with no count stated — one instance is all that is claimed', recurring.filter((s) => s.overTime?.totalInstances === undefined).length],
      ['stored carrying a named `unresolvable`', stored.filter((s) => s.unresolvable).length],
    ]),
  );

  const appliesTally = tally(stored, (s) => [s.appliesAs ?? 'NO CONTRACT ARM (reported, absent)']);
  console.log('\n--- HOW THE STORED EFFECTS REACH THEIR TARGET (CuratedItemEffect.appliesAs) ---');
  console.log(table(Object.entries(appliesTally) as [string, number][]));
  const noArm = stored.filter((s) => !s.appliesAs);
  if (noArm.length > 0) {
    console.log(
      '  no arm exists for: ' +
        noArm.map((s) => `${s.ownerName} ("${s.appliesAsSays}")`).join('; '),
    );
  }

  // §39 recorded 28 stored / 35 refused; §41.3 predicted "19 of the 35 refusals are releasable,
  // taking the extracted set from 28 toward 47". Both are checked against what this run observed.
  if (stored.length !== 28) {
    findings.push(
      `DATA-SOURCES §39 records 28 stored effects; this run observed ${stored.length}. ` +
        `§41.3 predicted the contract pass would release 19 of the 35 refusals, taking the set ` +
        `"toward 47". THE PREDICTION DOUBLE-COUNTS. The 12 melee/ranged and 7 damage-over-time ` +
        `refusals overlap in one effect (Bastionbreaker pass2), so they are 18 distinct effects, ` +
        `not 19; and 8 of those 18 carry a SECOND blocker the contract pass did not touch — ` +
        `five cleave items that damage only OTHER enemies, two that scale on lethality, one ` +
        `wards-only. Only 10 were ever releasable, and this run released ${stored.length - 28}.`,
    );
  }

  const reasons = tally(refused, (r) => [...new Set(r.refusals.map((f) => f.reason))]);
  console.log('\n--- WHY THE REFUSALS REFUSED (an effect can carry more than one) ---');
  console.log(table(Object.entries(reasons) as [string, number][]));

  // ---- every refusal class swept over the WHOLE population ----------------
  // Standing rule (CLAUDE.md): a defect found on one entry becomes a check run over all of them.
  const sweep: Record<string, string[]> = {};
  const add = (cls: string, row: EffectClassification) => {
    (sweep[cls] ??= []).push(`${row.ownerName} [${row.key}]`);
  };
  for (const row of rows) {
    const text = row.text;
    if (/\{\{\s*rd\s*\|/i.test(text)) add('mentions a melee/ranged split anywhere in its text', row);
    if (/\blethality\b/i.test(text)) add('mentions lethality', row);
    if (/critical strike chance/i.test(text)) add('mentions critical strike chance', row);
    if (/\bevery\s+(?:[\d.{}|fdap]+\s*)?seconds?\b|\bper\s+(?:tick|second)\b|\bover\s+[\d.{}|fd]+\s+seconds\b/i.test(text))
      add('states an interval at which something recurs', row);
    if (/\badaptive\s+damage\b/i.test(text)) add('deals damage the source calls adaptive', row);
    if (/to other enemies|not the main target/i.test(text)) add('names enemies OTHER than the target', row);
    if (/against \[?\[?minions|to wards|against a \{\{tip\|turret|against structures/i.test(text))
      add('names a non-champion target', row);
  }
  console.log('\n--- EACH REFUSAL CLASS, SWEPT OVER ALL ' + rows.length + ' EFFECTS ---');
  console.log(
    table(
      Object.entries(sweep)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([k, v]) => [k, v.length] as [string, number]),
    ),
  );

  // ---- where the parser fires OUTSIDE the read population -----------------
  // These are candidates for someone to read. They are NOT stored, and saying so is the point.
  const outside = rows
    .filter((r) => r.source === 'item' && !structuralKeys.has(`${r.id}|${r.key}`))
    .map((r) => ({ row: r, out: extractItemEffect(r) }))
    .filter((x) => x.out.component !== null);
  console.log(
    `\nthe parser also produced a clean value on ${outside.length} effects OUTSIDE the 63. ` +
      'They are REPORTED for reading, never stored:',
  );
  if (outside.length > 0) {
    console.log('  ' + outside.map((x) => `${x.row.ownerName} [${x.row.key}]`).join(', '));
  }

  // ---- does the OTHER source restate the same numbers? --------------------
  const corroboration = stored.map((s) => {
    const raw = itemFile.data[String(s.id)];
    const prose = raw ? ddragonEffectProse(String(raw.description ?? '')) : '';
    const component = s.components![0]!;
    const numbers: number[] = [];
    if (component.base.scaling === 'explicit') {
      if (component.base.perRank[0]! !== 0) numbers.push(component.base.perRank[0]!);
    } else if (component.base.scaling === 'byLevel') {
      numbers.push(component.base.from, component.base.to);
    }
    for (const r of component.ratios) {
      if (r.scaling === 'explicit') numbers.push(r.perRank[0]!);
    }
    const { restated, absent } = ddragonRestatesNumbers(prose, numbers);
    return {
      ownerName: s.ownerName,
      key: s.key,
      numbers,
      restatedByDataDragon: restated,
      absentFromDataDragon: absent,
      dataDragonProse: prose,
    };
  });
  const fullyRestated = corroboration.filter(
    (c) => c.numbers.length > 0 && c.absentFromDataDragon.length === 0,
  );
  const noNumbersAtAll = corroboration.filter(
    (c) => c.restatedByDataDragon.length === 0 && c.numbers.length > 0,
  );
  console.log('\n--- SECOND SOURCE: DOES DATA DRAGON RESTATE THE SAME NUMBERS? ---');
  console.log(
    table([
      ['stored effects', stored.length],
      ['  every number restated by Data Dragon prose', fullyRestated.length],
      ['  Data Dragon states none of the numbers', noNumbersAtAll.length],
      ['  partially restated', stored.length - fullyRestated.length - noNumbersAtAll.length],
      [
        '  some numbers restated, some absent (NOT a disagreement — see below)',
        corroboration.filter(
          (c) => c.restatedByDataDragon.length > 0 && c.absentFromDataDragon.length > 0,
        ).length,
      ],
    ]),
  );
  console.log(
    '  confirmed by both: ' + fullyRestated.map((c) => `${c.ownerName} [${c.key}]`).join(', '),
  );

  // ---- does the OTHER source say whose stat it is? ------------------------
  // §37.3's 82 unattributed references were measured over the wiki module alone. This asks the
  // separate question §12 requires to be asked per field: does Data Dragon's own item prose
  // attribute the same stat? It RESOLVES NOTHING — see effect-owner-crosscheck.ts.
  const ownerCrossChecks: {
    ownerName: string;
    key: string;
    stat: string;
    wikiSays: 'unstated';
    ddragonSays: string;
    quotingDataDragon: string;
    quotingTheWiki: string;
  }[] = [];
  let unstatedItemRefs = 0;
  for (const row of rows) {
    if (row.source !== 'item') continue;
    const raw = itemFile.data[String(row.id)];
    const prose = raw ? ddragonEffectProse(String(raw.description ?? '')) : '';
    for (const ref of row.ownerRefs) {
      if (ref.owner !== 'unstated') continue;
      unstatedItemRefs++;
      const hit = ddragonAttributes(prose, ref.stat);
      if (hit) {
        ownerCrossChecks.push({
          ownerName: row.ownerName,
          key: row.key,
          stat: ref.stat,
          wikiSays: 'unstated',
          ddragonSays: hit.ddragonSays,
          quotingDataDragon: hit.says,
          quotingTheWiki: ref.quote,
        });
      }
    }
  }
  const crossCheckedEffects = new Set(ownerCrossChecks.map((c) => `${c.ownerName}|${c.key}`));
  console.log('\n--- WHOSE STAT: DOES THE OTHER SOURCE SAY? (measured here; APPLIED where a row of DATA_DRAGON_ATTRIBUTIONS names it) ---');
  console.log(
    table([
      ['item owner references the WIKI leaves unstated', unstatedItemRefs],
      ['  of those, Data Dragon attributes the same stat outright', ownerCrossChecks.length],
      ['  distinct effects that covers', crossCheckedEffects.size],
    ]),
  );
  for (const c of ownerCrossChecks) {
    console.log(
      `    ${c.ownerName} [${c.key}] ${c.stat}: Data Dragon says "${c.quotingDataDragon}" ` +
        `(${c.ddragonSays}); the wiki says "${c.quotingTheWiki.trim()}"`,
    );
  }

  if (findings.length > 0) {
    console.log('\n--- FINDINGS (a live count disagreeing with the record is a finding) ---');
    for (const f of findings) console.log('  * ' + f);
  }

  const payload = {
    provenance: {
      source:
        'Riot Data Dragon item.json + runesReforged.json (which items and runes exist); ' +
        'wiki Module:ItemData/data (item effect prose and values)',
      // `url` is the single field the frozen `Provenance` shape carries: the source that
      // GOVERNS these values. The full set of four endpoints follows it.
      url: WIKI_ITEM_MODULE_URL,
      patch,
      fetched,
      urls: {
        patch: VERSIONS_URL,
        items: ddragonItemsUrl(patch),
        itemEffects: WIKI_ITEM_MODULE_URL,
        runes: ddragonRunesUrl(patch),
      },
    },
    whatThisIs:
      'A PROPOSAL. Every stored component was produced twice — once by a parser reading the ' +
      "wikitext and once by a person reading the item's own sentence — and is written only " +
      'where the two agree. Nothing here is `verified`: no value was re-derived from a ' +
      'documented formula or a published worked example (CLAUDE.md). Merging it into /curated/ ' +
      'is a lead action; no script in scripts/fetch/ writes that directory.',
    definitions: {
      population:
        'The 63 effects DATA-SOURCES §37.2 measures as stating their damage value structurally ' +
        '— the source wraps the damage type and the number together. The other 18 damaging ' +
        'effects need a person to read the sentence and are NOT in this run.',
      stored:
        'The wikitext parser and the recorded hand reading produced the same damage type, the ' +
        'same flat base, the same ratios in the same order, and the same owner for every ratio.',
      refused:
        'Any other outcome: the reading refuses the effect, the parser refuses it, nobody has ' +
        'read it, or the two disagree. A refusal is a result.',
      unresolvedOwner:
        'A ratio reads a stat both champions possess and no source says whose. Permanent, not ' +
        'pending (DATA-SOURCES §37.3, SPECIFICATION §8). It forces verification: incomplete.',
      ratioUnit:
        'Percentage POINTS, per the `Ratio` contract: (+ 15% AP) is stored as 15, never 0.15.',
      constantScaling:
        'An item effect has no ranks, so a constant is stored as { scaling: "explicit", ' +
        'perRank: [v] } — a literal list used verbatim. NOT { linear, from: v, to: v }, which ' +
        'would claim a rank progression the item does not have.',
      byRangeType:
        'The source states two values, one for a melee holder and one for a ranged holder ' +
        '({{rd|melee|ranged}}). BOTH are stored, in the two arms of Scaling.byRangeType, and ' +
        'neither is a default for the other: the engine refuses to evaluate one without being ' +
        'told the holder\'s range type. Storing the melee arm alone would overstate every ' +
        'ranged champion, and the ranged arm alone would understate every melee one.',
      overTime:
        'The source states that this damage RECURS. What is stored in `components` is ONE ' +
        'instance; `overTime.totalInstances` says how many land over the full duration, and it ' +
        'is present ONLY where the source states the count. Two of the six state a total as ' +
        'well as a per-instance figure, and the count is believed only because three ' +
        'independently-written numbers agree: tick x count = total. The other four state a ' +
        'per-second figure and a duration, and dividing one by the other is arithmetic on ' +
        'elapsed time, which this engine does not model (SPECIFICATION §3.2). No interval is ' +
        'recorded anywhere.',
      appliesAsAbsent:
        'A stored effect with no `appliesAs` is NOT one whose trigger the source omits. It is ' +
        'one whose trigger the contract enum has no arm for — see contractGapsRaised. Setting ' +
        "'unstated' there would claim the source is silent when it is not.",
    },
    counts: {
      effectsInPopulation: rows.length,
      structurallyStatedDamaging: structural.length,
      needsAPersonToRead: needsAPerson.length,
      gated: gated.length,
      stored: stored.length,
      storedComplete: stored.filter((s) => !s.hasUnresolvedOwner).length,
      storedWithUnresolvedOwner: stored.filter((s) => s.hasUnresolvedOwner).length,
      storedWithRangeSplit: rangeSplit.map((s) => `${s.ownerName} [${s.key}]`),
      storedAsDamageOverTime: recurring.map((s) => ({
        effect: `${s.ownerName} [${s.key}]`,
        totalInstances: s.overTime?.totalInstances ?? null,
        sourceSays: s.overTime?.sourceSays ?? '',
      })),
      appliesAs: appliesTally,
      appliesAsWithNoContractArm: noArm.map((s) => `${s.ownerName}: ${s.appliesAsSays}`),
      refused: refused.length,
      refusalsByReason: reasons,
      classSweptOverWholePopulation: Object.fromEntries(
        Object.entries(sweep).map(([k, v]) => [k, { count: v.length, effects: v }]),
      ),
      parserFiredOutsideReadPopulation: outside.map((x) => `${x.row.ownerName} [${x.row.key}]`),
    },
    findings,
    /** The only cross-check available: does Riot's other file restate the same numbers? */
    secondSourceCorroboration: {
      whatThisIs:
        "Each stored number looked for in Data Dragon's own item description, which Riot writes " +
        'independently of the wiki. Where the number is present the two agree. Where Data Dragon ' +
        'states no number at all, NOTHING is claimed — absence is not agreement.',
      storedEffects: stored.length,
      everyNumberRestated: fullyRestated.length,
      dataDragonStatesNoNumbers: noNumbersAtAll.length,
      rows: corroboration,
    },
    /** §12's per-field question, asked of the OTHER source. Measured over every effect; APPLIED
     *  only to the references a hand-read row of `DATA_DRAGON_ATTRIBUTIONS` names. */
    whoseStatDoesTheOtherSourceSay: {
      whatThisIs:
        "DATA-SOURCES §37.3 measured the unattributed stat references over the wiki's item " +
        'module alone, and calls the effects carrying one permanently unresolvable. This asks a ' +
        "DIFFERENT field's question: does Data Dragon's own item description attribute the same " +
        'stat? DATA-SOURCES §41.1 ADOPTED the answer as a source stating a fact rather than an ' +
        'inference from convention, and §42.7 applied it: the rows below are the whole ' +
        'measurement, and the ones that reach a STORED damage ratio are applied through the ' +
        'hand-read table `DATA_DRAGON_ATTRIBUTIONS` in effect-values-gate.ts. That is one row ' +
        'today — Heartsteel maxHP, now owner `holder`. The other four attribute stats this ' +
        'extraction does not store as damage ratios, so adopting them changes no stored number. ' +
        'A measurement is never applied wholesale: every applied row quotes the words it rests ' +
        'on, because a pattern that finds candidates is not a pattern that can decide them.',
      itemOwnerReferencesTheWikiLeavesUnstated: unstatedItemRefs,
      ofThoseDataDragonAttributes: ownerCrossChecks.length,
      distinctEffects: crossCheckedEffects.size,
      rows: ownerCrossChecks,
    },
    /** One row per effect, refusals included, each carrying the sentence it was read from. */
    effects: gated,
    /**
     * The same stored effects in the shape `CuratedFile.itemEffects` takes, so what the lead
     * merges is the contract's own shape rather than a translation of a report. Provenance is
     * added here because it is a property of the RUN, not of the effect.
     */
    proposedItemEffects: stored
      .map((s) => {
        const row = structural.find((r) => r.id === s.id && r.key === s.key);
        const proposal = proposedItemEffect(s, row?.effectName ?? s.key);
        return proposal
          ? {
              ...proposal,
              provenance: {
                source: 'wiki Module:ItemData/data',
                url: WIKI_ITEM_MODULE_URL,
                patch,
                fetched,
              },
            }
          : null;
      })
      .filter((p) => p !== null),
    contractGapsRaised: CONTRACT_GAPS,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const text = JSON.stringify(payload, null, 2) + '\n';
  await writeFile(joinPath(OUT_DIR, 'effect-values.json'), text, 'utf8');
  console.log(`\nwrote public/data/effect-values.json (${(text.length / 1024).toFixed(0)} KiB)`);
}

/**
 * Shapes the frozen contract cannot express, each measured rather than asserted.
 *
 * RAISED, NOT MADE. `src/types/` is lead-owned and frozen; this list is the request.
 */
export const CONTRACT_GAPS: {
  gap: string;
  reason: RefusalReason | 'none';
  effectsBlocked: number;
  detail: string;
}[] = [
  // FOUR GAPS CLOSED on 2026-08-13 by the contract pass (DATA-SOURCES §41) and removed from this
  // list: the melee/ranged pair (`Scaling.byRangeType`), damage over time
  // (`CuratedItemEffect.overTime`), `CuratedItemEffect.unresolvable`, and
  // `CuratedItemEffect.appliesAs`. What follows is what is still open, each measured.
  {
    gap: 'Adaptive damage',
    reason: 'adaptive-damage-type',
    effectsBlocked: 3,
    detail:
      'DamageType is physical | magic | true. Three of the five structurally-stated rune ' +
      'effects deal what the source calls "adaptive damage" (and so do several of the 18 that ' +
      'need reading: Press the Attack, Lethal Tempo, Shield Bash).',
  },
  {
    gap: 'Lethality and critical strike chance as ratio stats',
    reason: 'scales-on-lethality',
    effectsBlocked: 4,
    detail:
      'RatioStat has no arm for either. Bastionbreaker (both effects), Umbral Glaive pass3, ' +
      'Essence Reaver. Umbral Glaive pass3 is the costly one: it damages CHAMPIONS, it is ' +
      'otherwise clean, and storing its flat 50 alone would understate it on exactly the builds ' +
      'that buy the item.',
  },
  {
    gap: 'A stack counter as the axis of a BASE, not just of a ratio',
    reason: 'scales-on-stacks',
    effectsBlocked: 2,
    detail:
      "Dead Man's Plate is 0 to 40 flat AND 0 to 100% base AD, both walking Momentum stacks; " +
      'Dark Harvest adds a flat 11 per soul. `Scaling` walks ability rank or champion level, ' +
      "and `Ratio.stacks` stores percentage points of a stat, so \"+11 damage per soul\" has no " +
      'home either.',
  },
  {
    gap: 'An amplifier on the item effect\'s OWN damage',
    reason: 'conditional-additional-damage',
    effectsBlocked: 2,
    detail:
      "Kraken Slayer is increased by up to 75% by the target's missing health; Luden's Echo " +
      'redirects unspent stacks onto the primary target, doubling it in a two-champion fight. ' +
      'Neither is a ratio — each multiplies the whole component by a quantity the scenario knows.',
  },
  {
    gap: '`appliesAs` has no arm for "on dealing damage to an enemy champion"',
    reason: 'none',
    effectsBlocked: 0,
    detail:
      'MEASURED ON THE 38 STORED EFFECTS: 5 state a trigger the enum cannot name — Hextech ' +
      'Alternator, Scout\'s Slingshot and Elixir of Sorcery fire on DEALING DAMAGE (by any ' +
      "means, not on an attack), Zaz'Zak's Realmspike on dealing ABILITY damage, and Stormsurge " +
      'is a delayed strike that follows a mark. `appliesAs` is left ABSENT on all five rather ' +
      "than set to 'unstated', which would claim the source is silent when it is not. The " +
      'combo builder cannot sequence those five without an arm for them.',
  },
  {
    gap: 'A range-split value whose arms are themselves level progressions',
    reason: 'range-split-has-named-arguments',
    effectsBlocked: 1,
    detail:
      'THE CONTRACT ALREADY HOLDS THIS — each arm of `byRangeType` is itself a `Scaling`. The ' +
      'blocker is this parser, which does not read the formula the wiki writes inside ' +
      '{{rd|…|levels=1;9 to 20|pp=true}}. Kraken Slayer only, and it is refused for a second, ' +
      'independent reason as well.',
  },
];

await run();
