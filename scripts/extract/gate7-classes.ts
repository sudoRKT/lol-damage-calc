// WHY AN ENTRY DOES NOT RECONCILE — the classifiers for gate 7's failures.
//
// Gate 7 asks one question: do the components we stored sum to the total the source itself
// states? It answers THAT an entry disagrees and deliberately not WHY. These detectors answer
// the why, and they exist as durable code for one reason: the classification was first done in
// a session scratchpad, and a finding that lives in a scratchpad is gone at the end of the day.
//
// THE RULE THEY EXIST TO SERVE (CLAUDE.md): when a defect is found, the work is not to fix that
// entry. It is to write the check that finds every other instance of it and run it across the
// whole roster. Each class below therefore carries a DEFINITION and produces a population, not
// a verdict on one ability.
//
// WHAT THESE ARE NOT. A class is a HYPOTHESIS about a cause, backed by arithmetic. It is not
// permission to change a stored number. U-MULT2 in particular flags coincidences — Briar E
// "solves" at 40 times a 2-damage term — and four entries admit two readings that both
// reconcile at every rank. Arithmetic cannot choose between them and neither may this file.
// An entry stays `incomplete` until a person reads the ability.

import type { TotalMismatchEvidence } from './harvest.ts';

export type Gate7Class =
  | 'U-MULT1'
  | 'U-MULT2'
  | 'O-SCOPE'
  | 'O-PAIR'
  | 'MULTIPLE-TOTALS'
  | 'RESIDUE';

export interface Gate7Finding {
  class: Gate7Class;
  /** Plain English, naming the evidence. Printed in the batch report. */
  detail: string;
  /** True when the arithmetic admits more than one reading, so no rule may settle it. */
  ambiguous?: boolean;
}

/** The wiki prints to two decimals, so N summed terms carry up to N/2 of the last place. */
function agrees(a: number, b: number, terms: number): boolean {
  return Math.abs(a - b) <= Math.max(0.005 * Math.max(terms, 1), 1e-6);
}

/** Ranks where both series carry a usable, non-zero value. */
function comparableRanks(stated: number[], got: number[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < Math.min(stated.length, got.length); i += 1) {
    if (stated[i]! > 0 && got[i]! > 0) ranks.push(i);
  }
  return ranks;
}

/**
 * Is `stated` the same whole number ≥2 times `got`, at EVERY comparable rank?
 *
 * Every rank matters. A whole-number ratio at one rank is a coincidence — that is exactly how
 * Briar E "solves" at 40 — while the same whole number at all five is the signature of a
 * multiplicity the source states in prose and we never stored.
 */
function constantWholeMultiple(stated: number[], got: number[]): number | null {
  const ranks = comparableRanks(stated, got);
  if (ranks.length === 0) return null;
  const first = stated[ranks[0]!]! / got[ranks[0]!]!;
  const k = Math.round(first);
  if (k < 2 || !agrees(first, k, 1)) return null;
  for (const r of ranks) {
    if (!agrees(stated[r]! / got[r]!, k, 1)) return null;
  }
  return k;
}

const additive = (e: TotalMismatchEvidence) =>
  e.components.filter((c) => !c.alternative && c.series !== null);

function summed(e: TotalMismatchEvidence): number[] {
  const rows = additive(e);
  const len = Math.max(0, ...rows.map((r) => r.series!.length));
  return Array.from({ length: len }, (_, i) =>
    rows.reduce((n, r) => n + (r.series![i] ?? 0) * r.hits, 0),
  );
}

/**
 * Classify one gate-7 failure.
 *
 * Order matters: MULTIPLE-TOTALS is checked first because when the source prints more than one
 * qualifying total, gate 7 picked one arbitrarily and every other class would be reasoning about
 * the wrong number. 16 pages roster-wide print more than one, and on three of them the one gate 7
 * takes is the narrow damage-over-time total rather than the whole ability.
 */
export function classifyGate7(e: TotalMismatchEvidence): Gate7Finding {
  const rows = additive(e);
  const got = summed(e);
  const terms = rows.reduce((n, r) => n + r.hits, 0);

  if (e.howManyWholeAbilityTotals > 1) {
    return {
      class: 'MULTIPLE-TOTALS',
      detail:
        `the source prints ${e.howManyWholeAbilityTotals} rows that all qualify as a ` +
        `whole-ability total, and gate 7 compared against the first. Which one is the whole ` +
        `ability is not decidable from the labels alone`,
      ambiguous: true,
    };
  }

  const under = got.length > 0 && e.stated[0]! > got[0]!;

  if (under) {
    // U-MULT1 — one component, and the total is a constant whole multiple of it. A missing
    // multiplicity: the ability lands N times and the source says so only in its prose.
    if (rows.length === 1) {
      const k = constantWholeMultiple(e.stated, got);
      if (k !== null) {
        return {
          class: 'U-MULT1',
          detail:
            `the stated total is exactly ${k}x our single component "${rows[0]!.label}" at every ` +
            `rank, so the ability lands ${k} times and we store it landing ${rows[0]!.hits}. ` +
            `CONFIRM AGAINST THE SOURCE'S OWN PROSE before storing a count — the arithmetic ` +
            `proposes the multiplier, it does not establish it`,
        };
      }
    }

    // U-MULT2 — several components; dropping one leaves a constant whole multiple. A DETECTOR
    // ONLY. Two different droppings can both reconcile, and then nothing here may choose.
    if (rows.length > 1) {
      const solutions: string[] = [];
      for (const drop of rows) {
        const rest = rows.filter((r) => r !== drop);
        if (rest.length === 0) continue;
        const len = Math.max(0, ...rest.map((r) => r.series!.length));
        const restSum = Array.from({ length: len }, (_, i) =>
          rest.reduce((n, r) => n + (r.series![i] ?? 0) * r.hits, 0),
        );
        const k = constantWholeMultiple(e.stated, restSum);
        if (k !== null) solutions.push(`drop "${drop.label}" and multiply the rest by ${k}`);
      }
      if (solutions.length === 1) {
        return {
          class: 'U-MULT2',
          detail:
            `one reading reconciles at every rank: ${solutions[0]}. A DETECTOR, NOT A FIX — a ` +
            `whole-number ratio can be a coincidence, so a person must read the ability`,
          ambiguous: true,
        };
      }
      if (solutions.length > 1) {
        return {
          class: 'U-MULT2',
          detail:
            `${solutions.length} DIFFERENT readings each reconcile at every rank (${solutions.join('; ')}). ` +
            `The arithmetic cannot choose between them and neither may any rule. This is the ` +
            `one-at-full-plus-N-reduced shape the contract cannot express — it stays incomplete`,
          ambiguous: true,
        };
      }
    }
  } else {
    // O-SCOPE — the total equals ONE repeating component times its hit count. The total's scope
    // is that component, not the ability, and its label does not say so.
    for (const r of rows) {
      if (r.hits < 2) continue;
      const alone = r.series!.map((v) => v * r.hits);
      const ranks = comparableRanks(e.stated, alone);
      if (ranks.length > 0 && ranks.every((i) => agrees(e.stated[i]!, alone[i]!, r.hits))) {
        return {
          class: 'O-SCOPE',
          detail:
            `the stated total equals "${r.label}" x${r.hits} exactly at every rank, so the ` +
            `total covers that component alone rather than the whole ability. The label does ` +
            `not say so, which is why gate 7 accepted it as whole-ability`,
        };
      }
    }

    // O-PAIR — a Maximum row whose Minimum sibling carries no qualifier, so the pairing step
    // never matched them and both were summed.
    const maxRow = rows.find((r) => /\bmax(imum)?\b/i.test(r.label));
    if (maxRow) {
      const stem = maxRow.label.replace(/\bmax(imum)?\b/i, '').trim().toLowerCase();
      const sibling = rows.find(
        (r) => r !== maxRow && !/\bmin(imum)?\b/i.test(r.label) && r.label.toLowerCase().includes(stem),
      );
      if (sibling) {
        return {
          class: 'O-PAIR',
          detail:
            `"${maxRow.label}" and "${sibling.label}" are the two arms of one figure, but the ` +
            `second carries no "Minimum", so the pairing step never matched them and both were ` +
            `summed`,
        };
      }
    }
  }

  return {
    class: 'RESIDUE',
    detail:
      `no mechanical class fits: the source states ${e.stated[0]} at rank 1 and ${rows.length} ` +
      `additive component(s) sum to ${Math.round(got[0]! * 1000) / 1000} over ${terms} term(s). ` +
      `Needs a person`,
  };
}

/** Roll a run's findings up into populations. A count, with what it counts stated beside it. */
export function summariseGate7Classes(
  findings: Array<{ entry: string; finding: Gate7Finding }>,
): Array<{ class: Gate7Class; entries: number; ambiguous: number; examples: string[] }> {
  const by = new Map<Gate7Class, { entries: string[]; ambiguous: number }>();
  for (const f of findings) {
    const slot = by.get(f.finding.class) ?? { entries: [], ambiguous: 0 };
    slot.entries.push(f.entry);
    if (f.finding.ambiguous) slot.ambiguous += 1;
    by.set(f.finding.class, slot);
  }
  return [...by.entries()]
    .map(([cls, v]) => ({
      class: cls,
      entries: v.entries.length,
      ambiguous: v.ambiguous,
      examples: v.entries.slice(0, 5),
    }))
    .sort((a, b) => b.entries - a.entries);
}
