// THE DOCUMENT-CLAIM REGISTRY.
//
// WHY THIS EXISTS. On 2026-08-13 a single session found SIX statements in CLAUDE.md,
// PLAN.md, SPECIFICATION.md and DATA-SOURCES.md that the code contradicted. Six in one
// session is a CLASS, not six incidents, and this project's standing rule for a class is to
// write the mechanical check that finds every other instance of it rather than to fix the
// instances by hand.
//
// The root cause was never a typo. It was that **a number in a document had nothing
// re-deriving it**, so the only way to notice it had gone stale was for a human to happen to
// re-measure the same quantity and notice the difference. Every one of the six was found that
// way, by luck, and each had a cost — the worst refused 53 damage rows in an engine session
// because a paragraph said a contract shape did not exist when it had existed for two commits.
//
// WHAT THIS FILE IS. A registry of claims. Each claim names:
//   - the document and a regular expression that locates the number IN that document,
//   - a function that RE-DERIVES the same quantity from code or committed data,
//   - the definition of what is being counted — because a count without a definition is not a
//     count, and two people counting "items" got 209 and 222 by counting different things.
//
// `document-claims.test.ts` reads each claim out of its document, re-derives it, and fails on
// any disagreement. It also fails when a claim's regular expression no longer matches, so
// rewording a sentence cannot silently switch the check off.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not check DATA-SOURCES.md's historical sections.
// That file is a record, and a superseded number inside a dated finding is SUPPOSED to stay
// where it is — overwriting history is how you lose the reason a number moved. Only the
// "current state" claims are checked, and those live in CLAUDE.md and PLAN.md.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

export function readDoc(name: string): string {
  return readFileSync(join(ROOT, name), 'utf8');
}

function json<T>(rel: string): T {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as T;
}

/** One checkable claim: a number in a document that something else can re-derive. */
export interface Claim {
  id: string;
  /** The document the claim is written in. */
  doc: string;
  /**
   * Locates the claim. MUST capture the number in group 1. Written to match the surrounding
   * words as well as the digits, so that a reworded sentence fails loudly rather than silently
   * matching some other number further down the file.
   */
  anchor: RegExp;
  /** Re-derives the same quantity from code or committed data. */
  derive: () => number;
  /** What is counted, and what is filtered out. Printed on failure. */
  definition: string;
}

/**
 * A claim nothing here can re-derive, declared explicitly WITH THE REASON.
 *
 * This list is the honest half of the check. A checker that silently covers six numbers out of
 * thirty reads exactly like one that covers all thirty, which is the failure this whole file
 * exists to prevent. Every uncovered number is named here, so the coverage ratio is a fact
 * rather than an impression.
 */
export interface Uncovered {
  id: string;
  doc: string;
  /** Why it cannot be re-derived here, and what would change that. */
  reason: string;
}

// ---------------------------------------------------------------------------------------
// Derivable claims
// ---------------------------------------------------------------------------------------

interface CensusFile {
  itemFilterStages: Record<string, number>;
  totals: { all: Record<string, number> };
  effects: Array<{ ownerRefs: Array<{ owner: string }> }>;
}

const census = (): CensusFile => json<CensusFile>('public/data/effect-census.json');

/**
 * ROSTER-WIDE ABILITY MEASUREMENTS, written by a full-roster batch run.
 *
 * This was the largest thing the checker could not cover: reproducing any of these figures means
 * harvesting 937 wiki pages over the network, which no test may do. The batch runner now records
 * what it measured (`writeMeasurements` in run-batch.ts) and these claims compare the documents
 * against that record.
 *
 * TWO GUARDS, because a measurement file is only as good as its provenance:
 *
 * - It is written ONLY by a full-roster run, and carries its own coverage. A five-champion batch
 *   writes nothing rather than overwriting the roster figures with numbers that would look like a
 *   catastrophic regression and invite someone to "correct" the documents to match.
 * - It carries its patch. A measurement is evidence about one revision of a wiki that edits
 *   daily. `measurementsAreCurrent` fails when the file's patch is not the manifest's, so the
 *   documents are never silently checked against last patch's roster.
 */
interface Measurements {
  patch: string;
  generatedOn: string;
  coverage: { championsMeasured: number; championsInRoster: number; fullRoster: boolean };
  abilityPages: number;
  storable: number;
  worklist: number;
  componentsStored: number;
  verification: { verified: number; derived: number; incomplete: number; noDamage: number };
  gate2: { confirmed: number; disagreed: number; noEvidence: number };
  gate7: { failures: number; underSum: number; overSum: number; ambiguous: number };
}

export function measurements(): Measurements {
  return json<Measurements>('verification/measurements.json');
}

/** True when a full-roster measurement exists AND was taken on the patch now shipping. */
export function measurementsAreCurrent(): { ok: boolean; why: string } {
  let m: Measurements;
  try {
    m = measurements();
  } catch {
    return {
      ok: false,
      why: 'verification/measurements.json does not exist. Run a full-roster batch to create it.',
    };
  }
  if (!m.coverage.fullRoster) {
    return {
      ok: false,
      why: `the measurement file covers ${m.coverage.championsMeasured} of ${m.coverage.championsInRoster} champions`,
    };
  }
  const patch = json<{ patch: string }>('public/data/manifest.json').patch;
  if (m.patch !== patch) {
    return {
      ok: false,
      why:
        `the measurement file was taken on patch ${m.patch} and the data now shipping is ` +
        `${patch}. Re-run the full-roster batch; do NOT compare the documents against it.`,
    };
  }
  return { ok: true, why: `full roster, patch ${m.patch}, measured ${m.generatedOn}` };
}

export const CLAIMS: Claim[] = [
  {
    id: 'item-pool-size',
    doc: 'SPECIFICATION.md',
    anchor: /corrected pool of (\d+) distinct items is presented to the user/,
    derive: () => json<unknown[]>('public/data/items.json').length,
    definition:
      'Distinct classic Summoner\'s Rift items after the DATA-SOURCES §5 filter: map 11, ' +
      'purchasable, gold > 0, id < 200000, deduplicated by name keeping the canonical low id. ' +
      'NOT the count of distinct names before the id cutoff, which is 222.',
  },
  {
    id: 'item-pool-size-type-comment',
    doc: 'src/types/data.ts',
    anchor: /The pool is the corrected \*\*(\d+)\*\* distinct items/,
    derive: () => json<unknown[]>('public/data/items.json').length,
    definition: 'Same population as item-pool-size. The contract comment must not drift from it.',
  },
  {
    id: 'effect-entries',
    doc: 'DATA-SOURCES.md',
    anchor: /\*\*(\d+) effect entries: \d+ item \+ \d+ rune\.\*\*/,
    derive: () => census().totals.all.effects,
    definition:
      'One effect is one keyed entry (pass/pass2/pass3/act/consume) in the wiki item module, ' +
      'plus one per rune longDesc. description2 is a rider clause on the same effect, not a ' +
      'second effect.',
  },
  {
    id: 'effects-in-scope',
    doc: 'DATA-SOURCES.md',
    anchor: /\| \*\*In scope\*\* \| \*\*(\d+) of \d+\*\* \|/,
    derive: () => census().totals.all.inScopeAfterAudit!,
    definition:
      'Effects that deal damage OR modify a stat that can change a damage number or the ' +
      'survival verdict, AFTER the hand audit of the candidate bucket. NOT the machine\'s ' +
      'pre-audit upper bound, which counts every undecided sentence as damaging and gives 183.',
  },
  {
    id: 'effects-damaging',
    doc: 'DATA-SOURCES.md',
    anchor: /\| — deal damage \| \*\*(\d+)\*\* \| \d+ item, \d+ rune \|/,
    derive: () => census().totals.all.damagingAfterAudit!,
    definition:
      'Effects whose own text deals damage: classifier instances plus candidates the hand ' +
      'audit confirmed. An unread candidate is NOT counted — an unread sentence is not ' +
      'evidence of damage.',
  },
  {
    id: 'effect-owner-refs',
    doc: 'DATA-SOURCES.md',
    anchor: /\| \*\*Total\*\* \| \*\*(\d+)\*\* \| 27 \| 11 \| \*\*82\*\* \|/,
    derive: () => census().totals.all.ownerRefs,
    definition:
      'One reference is one mention of one of the ten owner-required stats within one ' +
      'effect\'s prose; longest phrasing wins; compound stats that merely contain a stat word ' +
      '(health regeneration, armor penetration) are different stats and are NOT counted.',
  },
  {
    id: 'effect-owner-unstated',
    doc: 'DATA-SOURCES.md',
    anchor: /\| \*\*Total\*\* \| \*\*\d+\*\* \| 27 \| 11 \| \*\*(\d+)\*\* \|/,
    derive: () =>
      census()
        .effects.flatMap((e) => e.ownerRefs)
        .filter((r) => r.owner === 'unstated').length,
    definition:
      'Owner-required stat references the source does not attribute to anyone. These are ' +
      'unresolvable — a property of the source, not a worklist.',
  },
  {
    id: 'item-filter-distinct-names-before-cutoff',
    doc: 'SPECIFICATION.md',
    anchor: /filter yields 248 entries but only (\d+) distinct items/,
    derive: () => census().itemFilterStages.distinctNamesBeforeIdCutoff,
    definition:
      'Distinct item NAMES surviving the map-11 + purchasable + gold filter but BEFORE the id ' +
      'cutoff. This number is real and is not the item pool; conflating the two is the error ' +
      'that put 222 into the specification.',
  },
  // ---- Roster-wide ability figures, from verification/measurements.json ----
  {
    id: 'ability-pages-plan',
    doc: 'PLAN.md',
    anchor: /\| \*\*Total ability pages\*\* \| \*\*(\d+)\*\* \|/,
    derive: () => measurements().abilityPages,
    definition:
      'Distinct wiki ability pages after alias dedupe by revision id. A name redirecting to a ' +
      'page another name already reached is counted once — without that, second-cast rows are ' +
      'stored as separate abilities and their damage is counted twice.',
  },
  {
    id: 'storable-plan',
    doc: 'PLAN.md',
    anchor: /\| — storable \| \*\*(\d+)\*\* \|/,
    derive: () => measurements().storable,
    definition: 'Ability pages carrying at least one stored damage component.',
  },
  {
    id: 'worklist-plan',
    doc: 'PLAN.md',
    anchor: /\| — worklist \| \*\*(\d+)\*\* \|/,
    derive: () => measurements().worklist,
    definition:
      'Entries that stored nothing and that at least one source says deal damage. NOT the same ' +
      'as no-damage, which is silence from every source.',
  },
  {
    id: 'no-damage-plan',
    doc: 'PLAN.md',
    anchor: /\| — `no-damage` \| \*\*(\d+)\*\* \|/,
    derive: () => measurements().verification.noDamage,
    definition:
      'Entries whose own template declares no damage type AND about which the wiki damage module ' +
      'is also silent. Claimed only when two independent sources are silent together.',
  },
  {
    id: 'components-stored-plan',
    doc: 'PLAN.md',
    anchor: /\*\*Damage components stored: (\d+)\*\*/,
    derive: () => measurements().componentsStored,
    definition:
      'Damage components surviving the summary-row, non-champion and unreadable-row filters, ' +
      'over all distinct ability pages. Counted AFTER dropping, so it is strictly smaller than ' +
      'the damage-row count.',
  },
  {
    id: 'confirmed-by-gate2-plan',
    doc: 'PLAN.md',
    anchor: /\| \*\*Of the \d+ storable:\*\* confirmed by gate 2 \| \*\*(\d+)\*\* \|/,
    derive: () => measurements().gate2.confirmed,
    definition:
      'Storable entries where at least one of the THREE round-trips compared something against ' +
      "the wiki's own rendering and none disagreed. NOT `verified`, which additionally requires " +
      'an independent re-derivation recorded in the gate-5 ledger.',
  },
  {
    id: 'verified-plan',
    doc: 'PLAN.md',
    anchor: /\| — \*\*verified\*\* \| \*\*(\d+)\*\* \|/,
    derive: () => measurements().verification.verified,
    definition:
      'Entries the gate-5 ledger records an independent re-derivation for AND whose gate-2 ' +
      'agreement the batch runner confirmed. The ledger is the only route in. This is a small ' +
      'honest set and is never a target to maximise.',
  },
  {
    id: 'verified-claude-md',
    doc: 'CLAUDE.md',
    anchor: /\*\*(\d+) entries are `verified`, measured over a full/,
    derive: () => measurements().verification.verified,
    definition: 'Same population as verified-plan. The two documents must not drift apart.',
  },
  {
    id: 'components-stored-data-sources',
    doc: 'DATA-SOURCES.md',
    anchor: /\| \*\*damage components stored\*\* \| \*\*(\d+)\*\* \|/,
    derive: () => measurements().componentsStored,
    definition: 'Same population as components-stored-plan.',
  },
  {
    id: 'champion-roster-size',
    doc: 'DATA-SOURCES.md',
    anchor: /Measured over all (\d+) roster champions/,
    derive: () => json<unknown[]>('public/data/champions.json').length,
    definition:
      'Champions offered to the user: gated on Data Dragon asset availability, not on the ' +
      'wiki, so a champion with wiki stats but no portrait is withheld (SPECIFICATION §7.1).',
  },
];

// ---------------------------------------------------------------------------------------
// Claims nothing here can re-derive, named with the reason
// ---------------------------------------------------------------------------------------

export const UNCOVERED: Uncovered[] = [
  {
    id: 'gate7-class-populations',
    doc: 'DATA-SOURCES.md §36.4',
    reason:
      'The per-class populations — U-MULT1, U-MULT2, O-SCOPE, O-PAIR and the residue — are ' +
      'recorded in verification/measurements.json under gate7.byClass, but the prose in §36.4 ' +
      'states them inside a table whose rows are described rather than named, so no stable ' +
      'anchor exists to read them back. COVERING THEM MEANS giving that table machine-readable ' +
      'row labels, which is a documentation change and not a checker change. The aggregate ' +
      'gate-7 failure count IS covered.',
  },
  {
    id: 'historical-figures-in-data-sources',
    doc: 'DATA-SOURCES.md §19-§35',
    reason:
      'DELIBERATE, AND NOT A GAP TO CLOSE. Those sections are a dated record of what was ' +
      'measured when, and a superseded number inside a dated finding is SUPPOSED to stay where ' +
      'it is — overwriting history loses the reason a number moved, which is usually the most ' +
      'useful thing about it. Only current-state claims are checked.',
  },
  {
    id: 'design-token-values',
    doc: 'DESIGN.md',
    reason:
      'Contrast ratios and pixel sizes are design decisions, not measurements of the codebase. ' +
      'src/ui enforces the reverse direction — that no colour, size or radius is used which ' +
      'DESIGN.md does not define — which is the check that actually matters here.',
  },
];
