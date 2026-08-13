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
import { gateEffect, type GateResult } from './effect-values-gate.ts';
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
  console.log('\n--- WHOSE STAT: DOES THE OTHER SOURCE SAY? (reported, NOT applied) ---');
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
    },
    counts: {
      effectsInPopulation: rows.length,
      structurallyStatedDamaging: structural.length,
      needsAPersonToRead: needsAPerson.length,
      gated: gated.length,
      stored: stored.length,
      storedComplete: stored.filter((s) => !s.hasUnresolvedOwner).length,
      storedWithUnresolvedOwner: stored.filter((s) => s.hasUnresolvedOwner).length,
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
    /** §12's per-field question, asked of the OTHER source. Reported, never applied. */
    whoseStatDoesTheOtherSourceSay: {
      whatThisIs:
        "DATA-SOURCES §37.3 measured the unattributed stat references over the wiki's item " +
        'module alone, and calls the effects carrying one permanently unresolvable. This asks a ' +
        "DIFFERENT field's question: does Data Dragon's own item description attribute the same " +
        'stat? It is a measurement handed to the lead, not a resolution. Nothing in this file ' +
        "acts on it, and the ratios stored above still carry owner 'unresolved'.",
      itemOwnerReferencesTheWikiLeavesUnstated: unstatedItemRefs,
      ofThoseDataDragonAttributes: ownerCrossChecks.length,
      distinctEffects: crossCheckedEffects.size,
      rows: ownerCrossChecks,
    },
    /** One row per effect, refusals included, each carrying the sentence it was read from. */
    effects: gated,
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
  {
    gap: 'A melee/ranged value pair',
    reason: 'melee-ranged-split',
    effectsBlocked: 12,
    detail:
      'The wiki writes {{rd|melee|ranged}} and the item genuinely has two values. ' +
      'AbilityComponent holds one. `ChampionBaseStats.rangetype` already exists, so this could ' +
      'resolve at evaluation time exactly as RatioOwner "holder" does.',
  },
  {
    gap: 'A way to say an ITEM effect is damage over time',
    reason: 'damage-over-time',
    effectsBlocked: 7,
    detail:
      'CuratedAbility has instanceType "dot-application"; CuratedItemEffect has only kind ' +
      '"passive" | "active". SPECIFICATION §3.8 requires DoT on a separate line, so a burn ' +
      'stored as an ordinary component would be folded into the burst total.',
  },
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
    detail: 'RatioStat has no arm for either. Bastionbreaker, Umbral Glaive, Essence Reaver.',
  },
  {
    gap: 'CuratedItemEffect cannot record an `unresolvable`',
    reason: 'none',
    effectsBlocked: 0,
    detail:
      'CuratedAbility carries `unresolvable: Unresolvable[]`; CuratedItemEffect does not. ' +
      "DATA-SOURCES §37.3 measures 56 effects carrying a stat no source attributes, and " +
      'SPECIFICATION §8 requires the interface to present those as "cannot be completed" rather ' +
      'than "not yet modelled". Today they can only be an undifferentiated `incomplete`.',
  },
  {
    gap: 'CuratedItemEffect cannot say HOW an effect reaches its target',
    reason: 'none',
    effectsBlocked: 0,
    detail:
      'On-hit, on-attack, after-an-ability (Spellblade), on-damaging-an-ability, item active. ' +
      'InstanceType exists on CuratedAbility only. 20 of the 28 stored effects are on-hit or ' +
      'Spellblade, and a combo builder cannot sequence them without knowing which.',
  },
];

await run();
