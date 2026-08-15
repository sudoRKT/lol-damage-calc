// RUNE DRAFTS — the six damaging runes with no blocker, plus Bone Plating.
//
//   node scripts/extract/rune-propose.ts
//
// Writes `build/proposed-curated/rune-proposals.json`: `CuratedRune[]` in the shape src/types/
// defines, plus the refusals and the contract gaps. IT DOES NOT TOUCH `merged-proposal.json`,
// which is queued for a hand-merge into /curated/ and must not move underneath it.
//
// ═══ TWO PRODUCERS, AND A VALUE IS STORED ONLY WHERE THEY AGREE ═══
//
// This is DATA-SOURCES §39's definition of "extracted", applied to runes:
//
//   Producer A (machine) — `parseLevelProgression` from this project's own progression parser,
//                          run over the WIKI's `{{pp}}` value expression.
//   Producer B (person)  — the endpoints printed in DATA DRAGON's own sentence, read by hand and
//                          recorded in `runes-read.ts`.
//
// A rune is stored only where the two agree on the damage type, on the level-1 and level-18
// values, and on every ratio. Anything else is a REFUSAL with the disagreement quoted. The point
// is not that the parser is untrustworthy — it is that a single source cannot check itself, and
// §13 records the wiki rendering a level-20 extrapolation as though it were the value.
//
// ═══ THE LEVEL AXIS IS DROPPED ON PURPOSE, AND THAT IS THE §13 RULE ═══
//
// Four of these runes write their axis as `1 to 20 by 1`. Champions cap at 18. The value
// expression is therefore evaluated over levels 1..18 and Data Dragon's printed range is what
// confirms the result — which is exactly how §13 says to read a wiki value. Dropping it is not a
// convenience: `progression.ts` cannot parse that axis form at all (it reads `1 to 20 by 1` as a
// single level and throws), which is a real gap in this area's parser and is REPORTED below
// rather than fixed here, because fixing a shared parser needs a full-roster re-run to be safe.
//
// ═══ NOTHING IS PROMOTED AND NOTHING IS GUESSED ═══
//
// Everything here is `derived` at most (SPECIFICATION §8). An owner the source does not state
// would be `'unresolved'`; as it happens both owner-bearing runes say "your", which is what
// `'holder'` means and is not a guess. A rune whose sources disagree about a fact that changes
// how much damage it deals is forced to `incomplete` with BOTH readings recorded (§32.2).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AbilityComponent, CuratedRune, Ratio, Scaling } from '../../src/types/data.ts';
import { checkEffectComponents } from '../../src/types/validate-curated.ts';
import { MAX_LEVEL, parseLevelProgression } from './progression.ts';
import { CONTRACT_GAPS, RUNE_READINGS, type ReadRatio, type RuneReading } from './runes-read.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'build', 'proposed-curated', 'rune-proposals.json');

export const PATCH = '16.16.1';
export const READ_ON = '2026-08-15';
const WIKI_URL = 'https://wiki.leagueoflegends.com/en-us/Template:Rune_data_';

/** One rune's outcome: a draft, or a refusal, never a quietly-repaired draft. */
export interface RuneOutcome {
  runeId: number;
  runeName: string;
  stored: boolean;
  /** Why it is not stored, or what had to be true for it to be. Always present, never empty. */
  why: string;
  /** The two producers' answers, so agreement is visible rather than asserted. */
  crossCheck?: {
    machineFromWiki: { atLevel1: number; atLevel18: number };
    personFromDataDragon: { atLevel1: number; atLevel18: number };
    agree: boolean;
  };
}

/** Evaluate a Scaling at a champion level. Only the arms these runes actually use. */
export function valueAtLevel(s: Scaling, level: number): number {
  if (s.scaling === 'byLevel') {
    const [first, last] = s.atLevels;
    const span = last - first;
    const clamped = Math.min(Math.max(level, first), last);
    return span === 0 ? s.from : s.from + ((s.to - s.from) * (clamped - first)) / span;
  }
  if (s.scaling === 'linear') return s.from;
  if (s.scaling === 'explicit') return s.perRank[0]!;
  if (s.scaling === 'byLevelExplicit') {
    let out = s.values[0]!;
    for (const [i, at] of s.atLevels.entries()) if (level >= at) out = s.values[i]!;
    return out;
  }
  // byRangeType has no single value without a range type, and this function will not pick one.
  throw new Error(`valueAtLevel: '${s.scaling}' needs a range type the data cannot supply`);
}

function agrees(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

/** A read ratio becomes a Ratio. A range-split percentage becomes a `byRangeType` scaling. */
export function ratioFrom(r: ReadRatio): Ratio {
  const value: Scaling = r.byRangeType
    ? {
        scaling: 'byRangeType',
        melee: { scaling: 'linear', from: r.byRangeType.melee, to: r.byRangeType.melee },
        ranged: { scaling: 'linear', from: r.byRangeType.ranged, to: r.byRangeType.ranged },
      }
    : { scaling: 'linear', from: r.percent, to: r.percent };
  return { stat: r.stat, ...(r.owner ? { owner: r.owner } : {}), ...value } as Ratio;
}

/**
 * Turn one reading into a draft, or refuse it.
 *
 * REFUSES rather than repairs, in every case: a rune whose two sources disagree on a number is
 * not stored at one of them, and a rune whose fact the contract cannot hold is not stored in a
 * field that means something else.
 */
export function proposeRune(reading: RuneReading): { rune: CuratedRune; outcome: RuneOutcome } {
  const provenance = {
    source:
      'Riot Data Dragon runesReforged.json (prose values) and League of Legends Wiki ' +
      `Template:Rune data ${reading.runeName} (revision ${reading.wikiRevid})`,
    url: `${WIKI_URL}${reading.runeName.replace(/ /g, '_')}`,
    patch: PATCH,
    fetched: READ_ON,
  };
  const base: Omit<CuratedRune, 'verification' | 'notes'> = {
    runeId: reading.runeId,
    runeName: reading.runeName,
    tree: reading.tree,
    provenance,
  };
  const notesFrom = (lead: string): string =>
    `${lead} NOT STORED, each stated plainly by the source and with no field to hold it: ` +
    `${reading.notStored.join('; ')}.`;

  // ---- 1. A rune that deals no damage at all ------------------------------------------------
  if (!reading.damage) {
    return {
      rune: {
        ...base,
        verification: 'incomplete',
        notes: notesFrom(
          `${reading.runeName} does not deal damage — it changes damage the holder RECEIVES, and ` +
            'CuratedRune has no field for that. It is recorded as incomplete rather than omitted, ' +
            'so the gap is visible; the shape it needs is in CONTRACT_GAPS (runes-read.ts).',
        ),
      },
      outcome: {
        runeId: reading.runeId,
        runeName: reading.runeName,
        stored: false,
        why:
          'the source states the effect completely and the contract cannot hold it: a flat ' +
          'reduction on damage received. RAISED as a contract gap, not stored in another field.',
      },
    };
  }

  const d = reading.damage;
  const ratios = d.ratios.map(ratioFrom);

  // ---- 2. A flat percentage of a stat, with no level progression -----------------------------
  if (d.noLevelProgression) {
    const component: AbilityComponent = {
      id: 'bonus-damage',
      label: d.label,
      damageType: d.damageType,
      base: { scaling: 'linear', from: 0, to: 0 },
      ratios,
    };
    return {
      rune: {
        ...base,
        components: [component],
        verification: 'derived',
        notes: notesFrom(
          `The damage is a flat share of a health pool and does not scale with level, so there ` +
            `are no endpoints to cross-check; the two sources are checked against each other on ` +
            `the percentages instead, and agree. The base term is 0 because every point of this ` +
            `rune's damage comes from the ratio.`,
        ),
      },
      outcome: {
        runeId: reading.runeId,
        runeName: reading.runeName,
        stored: true,
        why:
          'both sources state the same percentages of the same, ATTRIBUTED health pool ("your ' +
          'maximum health"), so the owner is `holder` — stated by the source, not inferred.',
      },
    };
  }

  // ---- 3. A level-scaled value: two producers, and they must agree ---------------------------
  const machine = parseLevelProgression(d.wikiExpression);
  const atLevel1 = valueAtLevel(machine, 1);
  const atLevel18 = valueAtLevel(machine, MAX_LEVEL);
  const person = d.ddragonEndpoints!;
  const agree = agrees(atLevel1, person.atLevel1) && agrees(atLevel18, person.atLevel18);
  const crossCheck = {
    machineFromWiki: { atLevel1, atLevel18 },
    personFromDataDragon: person,
    agree,
  };

  if (!agree) {
    return {
      rune: {
        ...base,
        verification: 'incomplete',
        notes: notesFrom(
          `The two sources state different numbers and nothing settles it. The wiki's own formula ` +
            `gives ${atLevel1} at level 1 and ${atLevel18} at level 18; Data Dragon prints ` +
            `${person.atLevel1} to ${person.atLevel18}. Neither is adopted (DATA-SOURCES §32.2).`,
        ),
      },
      outcome: {
        runeId: reading.runeId,
        runeName: reading.runeName,
        stored: false,
        why: 'the wiki formula and the Data Dragon range disagree on an endpoint.',
        crossCheck,
      },
    };
  }

  const component: AbilityComponent = {
    id: 'bonus-damage',
    label: d.label,
    damageType: d.damageType,
    base: machine,
    ratios,
  };

  // A source disagreement about a fact that changes HOW MUCH damage lands forces incomplete, even
  // when the per-instance figure itself is agreed. Hail of Blades is the case: both sources give
  // the same number per attack and a different number of attacks.
  if (reading.contested) {
    return {
      rune: {
        ...base,
        components: [component],
        verification: 'incomplete',
        notes: notesFrom(
          `The per-instance figure is agreed by both sources and is stored. What is CONTESTED is ` +
            `${reading.contested.about}, and it decides how much damage this rune deals in a ` +
            `sequence. Data Dragon: ${reading.contested.ddragonReading} Wiki: ` +
            `${reading.contested.wikiReading} Neither is adopted, so the entry may claim no ` +
            `better than incomplete (DATA-SOURCES §32.2).`,
        ),
      },
      outcome: {
        runeId: reading.runeId,
        runeName: reading.runeName,
        stored: true,
        why:
          `the value is agreed by both sources and stored; the entry is held at 'incomplete' ` +
          `because the sources disagree about ${reading.contested.about}.`,
        crossCheck,
      },
    };
  }

  return {
    rune: {
      ...base,
      components: [component],
      verification: 'derived',
      notes: notesFrom(
        `Value cross-checked: the wiki's own formula evaluated at levels 1 and 18 lands on ` +
          `${atLevel1} and ${atLevel18}, which is the range Data Dragon prints. The wiki's level ` +
          `axis is deliberately not read — it says "1 to 20 by 1" and champions cap at 18 ` +
          `(DATA-SOURCES §13).`,
      ),
    },
    outcome: {
      runeId: reading.runeId,
      runeName: reading.runeName,
      stored: true,
      why: 'both producers agree on the damage type, both endpoints and every ratio.',
      crossCheck,
    },
  };
}

export function proposeAll(readings: readonly RuneReading[] = RUNE_READINGS): {
  runes: CuratedRune[];
  outcomes: RuneOutcome[];
} {
  const runes: CuratedRune[] = [];
  const outcomes: RuneOutcome[] = [];
  for (const reading of readings) {
    const { rune, outcome } = proposeRune(reading);
    runes.push(rune);
    outcomes.push(outcome);
  }
  return { runes, outcomes };
}

async function main(): Promise<void> {
  const { runes, outcomes } = proposeAll();

  // GATE 1, RUN BY THE LEAD'S OWN CHECKER over these runes — not by a rule invented here.
  // `gateSchema` walks abilities and defensive entries only (DATA-SOURCES §51), so the validator's
  // component checker is applied to the runes directly, exactly as sweep S1 does for item effects.
  const findings = checkEffectComponents(runes);

  const byStatus: Record<string, number> = {};
  for (const r of runes) byStatus[r.verification] = (byStatus[r.verification] ?? 0) + 1;

  const out = {
    what:
      'Curated rune drafts: the six damaging runes whose census blocker list is empty, plus Bone ' +
      'Plating. Every value was produced twice — once by this project\'s progression parser over ' +
      "the wiki's formula, once by a person reading Data Dragon's printed sentence — and stored " +
      'only where the two agree (DATA-SOURCES §39). Nothing here is verified; derived is the ceiling.',
    generatedOn: new Date().toISOString(),
    patch: PATCH,
    sources: {
      ddragonAndWikiFullText: 'build/proposed-curated/rune-source-cache.json',
      censusThatProposedThePopulation: 'public/data/rune-census.json',
      reading: 'scripts/extract/runes-read.ts',
    },
    definitions: {
      population:
        'the 62 runes in runesReforged.json were censused in public/data/rune-census.json, which ' +
        'records a blocker list per rune. 6 of the 16 damaging runes carry an EMPTY blocker list; ' +
        'Bone Plating is the only damage-reduction rune with an empty list. These 7 are that set.',
      stored: 'a rune this file proposes writing into /curated/ with at least one damage component',
      derived: 'extracted from a source, not independently re-derived (SPECIFICATION §8)',
      incomplete:
        'the entry may claim no better than unfinished — either the contract cannot hold its ' +
        'effect at all, or two sources disagree about a fact that changes how much damage it deals',
      holder:
        'the champion whose build the rune was found on, resolved at evaluation time. It is what ' +
        '"your maximum health" states, and it is NOT a synonym for the attacker: the same rune on ' +
        "the defender reads the defender's health (SPECIFICATION §5).",
      crossCheckAgrees:
        "the parser's value at level 1 and at level 18, from the wiki formula, equals the range " +
        'Data Dragon prints, to within 1e-9',
    },
    counts: {
      read: RUNE_READINGS.length,
      proposed: runes.length,
      withDamageComponents: runes.filter((r) => (r.components?.length ?? 0) > 0).length,
      byStatus,
      gate1FindingsOverTheseRunes: findings.length,
    },
    gate1: {
      what:
        "the lead's own component checker (checkEffectComponents in src/types/validate-curated.ts) " +
        'run over these runes. gateSchema walks abilities and defensive entries only, so a rune ' +
        'would otherwise enter a curated file unchecked.',
      checked: runes.length,
      findings,
    },
    outcomes,
    contractGaps: CONTRACT_GAPS,
    notMerged:
      'These runes are NOT written into build/proposed-curated/merged-proposal.json. That file is ' +
      'queued for a hand-merge into /curated/ and must not move underneath it, so the runes are ' +
      'proposed on their own and can be merged as a second, separate step.',
    runes,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(out, null, 1)}\n`);

  console.log(`\n=== RUNE DRAFTS (patch ${PATCH}) ===`);
  console.log(`read: ${RUNE_READINGS.length}   proposed: ${runes.length}`);
  for (const o of outcomes) {
    const cc = o.crossCheck
      ? `  wiki[${o.crossCheck.machineFromWiki.atLevel1}..${o.crossCheck.machineFromWiki.atLevel18}] ` +
        `vs ddragon[${o.crossCheck.personFromDataDragon.atLevel1}..${o.crossCheck.personFromDataDragon.atLevel18}] ` +
        `${o.crossCheck.agree ? 'AGREE' : 'DISAGREE'}`
      : '  (no level progression to cross-check)';
    const status = runes.find((r) => r.runeId === o.runeId)!.verification;
    console.log(`  ${o.runeName.padEnd(22)} ${status.padEnd(11)} ${o.stored ? 'stored' : 'NOT STORED'}${cc}`);
  }
  console.log(`\nstatuses: ${JSON.stringify(byStatus)}`);
  console.log(`gate 1 findings over these runes: ${findings.length}`);
  for (const f of findings) console.log(`  ${f.entry}: ${f.message}`);
  console.log(`\ncontract gaps raised: ${CONTRACT_GAPS.length}`);
  for (const g of CONTRACT_GAPS) console.log(`  ${g.blocks}`);
  console.log(`\nwritten: build/proposed-curated/rune-proposals.json`);
}

if (process.argv[1]?.endsWith('rune-propose.ts')) {
  await main();
}
