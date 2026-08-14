// BUILD COMPARISON (SPECIFICATION §11).
//
// "Build comparison — two attacker configurations evaluated against the same defender side by
// side."
//
// ═══ WHAT "THE SAME DEFENDER" MEANS, AND WHY IT IS ENFORCED RATHER THAN ASSUMED ═══
//
// Two scenarios each carry their own defender, so a comparison could be handed two different
// ones. The rule here is the strictest one available and it is the only one that needs no guess:
// the two defender CONFIGURATIONS must be identical, field for field — champion, level, ranks,
// items, runes, persistent accumulations and entry state. Anything else refuses, naming every
// field that differs.
//
// The alternatives were considered and each invents something: taking scenario A's defender
// silently discards half of what the caller asked for; merging the two produces a defender
// neither scenario states; comparing against both defenders and reporting two deltas answers a
// question nobody asked. A refusal that names `defender.level: 11 against 13` is a thing a user
// can act on in one click.
//
// NOTE WHAT THIS RULE DOES NOT REQUIRE. The defender's state DURING the two combos will diverge —
// one build shreds more armor, one build lands more instances, one kills before the other. That
// divergence is the result being measured, not a violation of "the same defender". What must
// match is the state the two runs START from.
//
// ═══ THE DELTA IS HIDDEN WHEN IT WOULD MEASURE THE WRONG THING ═══
//
// A comparison's headline is one number: build B does N more damage than build A. That number is
// only about the builds when both sides modelled the same abilities. If build A's Q is harvested
// and build B's is `incomplete`, the difference is mostly a fact about this project's data
// coverage wearing the costume of a build finding — the exact "plausible wrong number" failure
// CLAUDE.md names.
//
// So `delta` is present ONLY when the comparison is clean. When it is confounded, the same
// figures are returned under `confounded.delta` alongside the reasons, which a renderer has to
// destructure differently and therefore cannot print by accident. `caveats` is the softer
// channel: things that are true and worth saying, but that do not make the number mean something
// other than what it says.

import type { DamageByType } from '../types/result';
import type { ChampionConfig, Scenario } from '../types/scenario';
import { simulate, type Catalogue, type SimulationRefusal } from './simulate';
import { summarise, type PointSummary } from './sweep';

/** One side of a comparison. Refused carries no summary — same rule as a swept point. */
export type ComparisonSide =
  | { status: 'computed'; summary: PointSummary; result?: import('../types/result').Result }
  | { status: 'refused'; refusals: readonly SimulationRefusal[] };

export interface BuildDelta {
  /** B minus A. Positive means the second build deals more. */
  burstTotal: number;
  burstByType: DamageByType;
  /** Damage over time, kept separate from burst exactly as §3.8 requires. */
  dotTotal: number;
  /** Whether each side's burst killed the defender. */
  burstOnlyLethal: { a: boolean; b: boolean };
  /** Whether each side's burst plus full damage over time killed the defender. */
  burstPlusDotLethal: { a: boolean; b: boolean };
}

export type BuildComparison =
  | { ok: false; kind: 'different-defender'; differences: string[] }
  | {
      ok: true;
      /** The defender both sides were evaluated against — identical by construction. */
      defender: ChampionConfig;
      sides: { a: ComparisonSide; b: ComparisonSide };
      /** Present ONLY when both sides computed and nothing confounds the difference. */
      delta?: BuildDelta;
      /** Present INSTEAD of `delta` when the difference partly measures missing data. */
      confounded?: { reasons: string[]; delta: BuildDelta };
      /** True, worth saying, and not enough to invalidate the delta. */
      caveats: string[];
      notes: string[];
    };

export interface BuildComparisonOptions {
  include?: 'summary' | 'result';
  patch?: string;
}

/**
 * Two scenarios in, one comparison out.
 *
 * `a` and `b` are whole Scenarios rather than two attacker configurations, because a combo
 * belongs to the attacker who runs it: comparing two builds of different champions, or the same
 * champion with a different combo, is a legitimate question and one attacker config plus one
 * shared combo could not express it. What that costs is the check above — the defenders have to
 * be proved identical rather than being identical by construction.
 */
export function compareBuilds(
  a: Scenario,
  b: Scenario,
  catalogue: Catalogue,
  options: BuildComparisonOptions = {},
): BuildComparison {
  const differences = defenderDifferences(a.defender, b.defender);
  if (differences.length > 0) return { ok: false, kind: 'different-defender', differences };

  const sideA = runSide(a, catalogue, options);
  const sideB = runSide(b, catalogue, options);

  const caveats = collectCaveats(a, b, sideA, sideB);
  const notes = [
    'Both builds were run against the same defender configuration, from the same entry state. ' +
      'What the defender’s state becomes DURING each combo differs, and that difference is part ' +
      'of what is being measured.',
    'Burst and damage over time are reported separately (SPECIFICATION §3.8); there is no ' +
      'combined figure, and the survival verdict is given for each.',
  ];

  if (sideA.status !== 'computed' || sideB.status !== 'computed') {
    // NO DELTA AT ALL when a side refused. Not a zero, and not the working side's own figure:
    // there is nothing to subtract from.
    return { ok: true, defender: a.defender, sides: { a: sideA, b: sideB }, caveats, notes };
  }

  const delta = computeDelta(sideA.summary, sideB.summary);
  const confounds = collectConfounds(sideA.summary, sideB.summary);

  return {
    ok: true,
    defender: a.defender,
    sides: { a: sideA, b: sideB },
    ...(confounds.length > 0 ? { confounded: { reasons: confounds, delta } } : { delta }),
    caveats,
    notes,
  };
}

/** Every field of the two defender configurations that differs, in a form a person can read. */
function defenderDifferences(a: ChampionConfig, b: ChampionConfig): string[] {
  const differences: string[] = [];
  const compare = (field: string, left: unknown, right: unknown) => {
    // Structural comparison by JSON, which is exact for these shapes: they hold only strings,
    // numbers, booleans, arrays and plain objects. Key ORDER is not normalised, so two configs
    // written with keys in a different order report as different — a false alarm that names the
    // field, which is far safer than a missed difference that silently changes the defender.
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      differences.push(`defender.${field}: ${JSON.stringify(left)} against ${JSON.stringify(right)}`);
    }
  };
  // apiname and level are quoted bare, because they read better in a message than as JSON.
  if (a.apiname !== b.apiname) {
    differences.push(`defender.apiname: ${a.apiname} against ${b.apiname}`);
  }
  if (a.level !== b.level) differences.push(`defender.level: ${a.level} against ${b.level}`);
  compare('abilityRanks', a.abilityRanks, b.abilityRanks);
  compare('items', a.items, b.items);
  compare('runes', a.runes, b.runes);
  compare('persistent', a.persistent, b.persistent);
  compare('entryState', a.entryState, b.entryState);
  return differences;
}

function runSide(
  scenario: Scenario,
  catalogue: Catalogue,
  options: BuildComparisonOptions,
): ComparisonSide {
  const outcome = simulate(scenario, catalogue, options.patch ? { patch: options.patch } : {});
  if (!outcome.ok) return { status: 'refused', refusals: outcome.refusals };
  return {
    status: 'computed',
    summary: summarise(outcome.result),
    ...(options.include === 'result' ? { result: outcome.result } : {}),
  };
}

function computeDelta(a: PointSummary, b: PointSummary): BuildDelta {
  return {
    // A DIFFERENCE OF TWO ROUNDED FIGURES IS NOT A ROUNDING OF A DIFFERENCE, and here that is
    // correct rather than a compromise: the two sides are separate runs against separate stat
    // blocks, so there is no unrounded common quantity to subtract. The figures being differenced
    // are the ones the interface shows, which is what makes the delta check out on screen.
    burstTotal: b.burst.total - a.burst.total,
    burstByType: {
      physical: b.burst.byType.physical - a.burst.byType.physical,
      magic: b.burst.byType.magic - a.burst.byType.magic,
      true: b.burst.byType.true - a.burst.byType.true,
    },
    dotTotal: b.dot.total - a.dot.total,
    burstOnlyLethal: { a: a.verdict.burstOnly.lethal, b: b.verdict.burstOnly.lethal },
    burstPlusDotLethal: {
      a: a.verdict.burstPlusDot.lethal,
      b: b.verdict.burstPlusDot.lethal,
    },
  };
}

/** Reasons the difference measures something other than the builds. */
function collectConfounds(a: PointSummary, b: PointSummary): string[] {
  const onlyA = a.incompleteContributors.filter((x) => !b.incompleteContributors.includes(x));
  const onlyB = b.incompleteContributors.filter((x) => !a.incompleteContributors.includes(x));
  const reasons: string[] = [];
  if (onlyA.length > 0) {
    reasons.push(
      `the first build excludes ${onlyA.join(', ')} and the second does not, so part of this ` +
        'difference is data this project has not modelled rather than a build difference',
    );
  }
  if (onlyB.length > 0) {
    reasons.push(
      `the second build excludes ${onlyB.join(', ')} and the first does not, so part of this ` +
        'difference is data this project has not modelled rather than a build difference',
    );
  }
  return reasons;
}

/** True and worth saying, but the delta still means what it says. */
function collectCaveats(
  a: Scenario,
  b: Scenario,
  sideA: ComparisonSide,
  sideB: ComparisonSide,
): string[] {
  const caveats: string[] = [];
  if (a.attacker.apiname !== b.attacker.apiname) {
    caveats.push(
      `the two builds are different champions (${a.attacker.apiname} against ` +
        `${b.attacker.apiname}), so the difference is not only a build difference — and the ` +
        'defender’s entry state may mean something to one of them and nothing to the other',
    );
  }
  if (a.attacker.level !== b.attacker.level) {
    caveats.push(
      `the two builds are at different levels (${a.attacker.level} against ${b.attacker.level})`,
    );
  }
  if (!sameCombo(a, b)) {
    caveats.push(
      'the two builds run different combos, so the difference includes the sequence as well as ' +
        'the build',
    );
  }
  if (
    sideA.status === 'computed' &&
    sideB.status === 'computed' &&
    sideA.summary.incompleteContributors.length > 0 &&
    sameList(sideA.summary.incompleteContributors, sideB.summary.incompleteContributors)
  ) {
    caveats.push(
      `both builds exclude ${sideA.summary.incompleteContributors.join(', ')}, so both figures ` +
        'are floors rather than totals — the difference between them is still a like-for-like one',
    );
  }
  return caveats;
}

function sameCombo(a: Scenario, b: Scenario): boolean {
  const shape = (s: Scenario) =>
    JSON.stringify(s.combo.map((step) => [step.kind, step.ref, step.options ?? null]));
  return shape(a) === shape(b);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
