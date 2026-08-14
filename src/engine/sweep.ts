// THE SHARED SHAPES BEHIND SPECIFICATION §11's THREE COMPARATIVE OUTPUTS.
//
// §11 asks for three things beyond a single result: a damage-versus-armor curve, a
// damage-versus-level curve, and a build comparison. All three are the same operation — run the
// engine repeatedly with one input moved, and report the answers side by side — so the part
// that decides what an answer LOOKS LIKE lives here, once.
//
// ═══ THE ONE DESIGN DECISION THAT MATTERS: A SWEPT POINT CAN REFUSE ═══
//
// `simulate` refuses a scenario it cannot model, and it refuses by NAME rather than by returning
// a smaller number. A curve is that function evaluated across a range, so some points in a range
// can refuse while their neighbours compute. What a curve does with those points is the whole
// safety question:
//
//   - Dropping them silently draws a smooth line through a hole. A reader sees a continuous
//     curve and has no way to know that a third of it was never computed.
//   - Writing 0 for them draws a cliff that looks like a game mechanic.
//   - Writing null draws whatever the charting library does with null, which on most is a
//     straight line between the neighbours — the first failure again, wearing a disguise.
//
// So a point is a DISCRIMINATED UNION and the refused arm has no damage field of any kind. Not a
// zero, not a null, not an optional: the key is absent from the object and from the type. A
// renderer that reaches for `point.summary.burst.total` on a refused point gets a TypeScript
// error at compile time and `undefined` at run time. It cannot get a number.
//
// `contiguousSegments` below is the second half of the same defence. It is the ONLY helper this
// module offers for turning a series into something drawable, and it returns a LIST OF RUNS of
// consecutive computed points. Draw one line per run and a hole is a visible gap, without the
// renderer having to remember anything. There is deliberately no `computedPoints(series)`
// helper, because that is exactly the shape that invites one polyline through the whole range.
//
// ═══ THE SECOND DECISION: A POINT CARRIES A SUMMARY, NOT THE WHOLE RESULT ═══
//
// A `Result` is large — it echoes the entire Scenario, every instance with its state snapshot,
// every excluded mechanic — and a sweep produces up to a few hundred of them. Size is the small
// reason. The real reason is that a curve view needs ONE figure per point, and handing a
// renderer the whole Result at every point invites it to derive that figure itself, differently
// at each call site, from the rounded per-instance column that src/types/result.ts explicitly
// says must never be added up. `PointSummary` is the figure, computed once, here.
//
// The escape hatch is stated rather than implied: every sweep takes `include: 'result'`, which
// attaches the full Result to each computed point for a caller that genuinely needs it (a
// "click a point to see the full breakdown" view). It is opt-in because the default should be
// the shape that cannot be misused.
//
// ═══ THE THIRD DECISION: THERE IS NO "BURST PLUS DOT" DAMAGE FIGURE ═══
//
// SPECIFICATION §3.8 is explicit that damage over time is never folded into the burst total, and
// the rounding rule (src/types/result.ts) forbids feeding rounded output back into arithmetic —
// `burst.total + dot.total` is exactly that, two rounded figures added. So the summary carries
// burst and DoT as two figures and the survival verdict TWICE, which is what §3.8 asks for. A
// caller wanting "everything that landed" reads `verdict.burstPlusDot.damageApplied`, which the
// engine computed from unrounded values and rounded once.

import type { VerificationStatus } from '../types';
import type { DamageTotals, Result } from '../types/result';
import type { SimulationRefusal } from './simulate';

/** One survival verdict, reduced to the fields a comparative view draws. */
export interface VerdictSummary {
  lethal: boolean;
  /** 1-based instance the defender's health was crossed at, or null. */
  lethalAtInstance: number | null;
  remainingHp: number;
  /** Damage that actually reached health, rounded once by the engine from unrounded values. */
  damageApplied: number;
  healingApplied: number;
}

/**
 * What one computed point of a sweep is worth.
 *
 * Everything here is copied from a `Result`; nothing is recomputed and nothing is re-rounded.
 */
export interface PointSummary {
  /** Burst damage, with its per-type split. The split always sums to the total (rounding.ts). */
  burst: DamageTotals;
  /** Damage over time, over its full duration — NEVER added into burst (SPECIFICATION §3.8). */
  dot: DamageTotals;
  /** The verdict twice: burst alone, and burst plus full DoT resolution (§3.8). */
  verdict: { burstOnly: VerdictSummary; burstPlusDot: VerdictSummary };
  attackerLevel: number;
  defenderLevel: number;
  /** The health the verdict was measured against, at this point of the sweep. */
  defenderHp: number;
  /** The worst verification status among everything that contributed. */
  verification: VerificationStatus;
  /**
   * TRUE WHEN SOMETHING WAS LEFT OUT of this point's figures.
   *
   * A partial point is a FLOOR on the damage, not the damage. It is a separate flag from
   * `verification` because a reader scanning a curve needs one boolean, not a four-valued
   * status they have to interpret.
   */
  partial: boolean;
  /** The labels of everything excluded from this point's totals, sorted, never dropped (§8). */
  incompleteContributors: readonly string[];
}

/** A point the engine computed. `applied` describes what was swept TO at this point. */
export interface ComputedSweepPoint<Applied> {
  x: number;
  /** How the x value reads to a person, e.g. "150 armor" or "level 12". */
  label: string;
  applied: Applied;
  status: 'computed';
  summary: PointSummary;
  /** Present only when the sweep was asked for `include: 'result'`. */
  result?: Result;
}

/**
 * A point the engine refused. NOTE WHAT IS NOT HERE: no summary, no damage, no zero.
 *
 * `applied` is still present, because what the sweep was TRYING to evaluate is part of the
 * explanation for why it could not.
 */
export interface RefusedSweepPoint<Applied> {
  x: number;
  label: string;
  applied: Applied;
  status: 'refused';
  refusals: readonly SimulationRefusal[];
}

export type SweepPoint<Applied> = ComputedSweepPoint<Applied> | RefusedSweepPoint<Applied>;

export interface SweepSeries<Applied> {
  /** Which sweep produced this, e.g. 'resistance' or 'level'. */
  kind: string;
  /** The x axis in words, e.g. "target armor". */
  axisLabel: string;
  points: readonly SweepPoint<Applied>[];
  computedCount: number;
  refusedCount: number;
  /** True when any computed point left a contributor out. */
  anyPartial: boolean;
  /** Contributors excluded at EVERY computed point. */
  incompleteEverywhere: readonly string[];
  /** Contributors excluded at ONE OR MORE computed points. */
  incompleteSomewhere: readonly string[];
  /**
   * TRUE WHEN THE SET OF EXCLUDED CONTRIBUTORS IS NOT THE SAME AT EVERY POINT.
   *
   * This is a subtler hazard than a refused point and it has no visual signature at all: the
   * curve is continuous, every point is real, and yet the points are not comparable to each
   * other, because one end of the range is missing an ability the other end includes. A step in
   * such a curve is a data-coverage artefact wearing the costume of a mechanic.
   */
  incompleteSetVaries: boolean;
  /** The union of every mechanic the engine excluded at any point (§11: stated, never omitted). */
  excludedMechanics: readonly string[];
  /** Conventions this sweep applied, in plain English. Intended to be shown, not logged. */
  notes: readonly string[];
}

/**
 * Split a series into runs of CONSECUTIVE computed points.
 *
 * One line per run. A refused point ends the run it interrupts, so a hole in the range becomes a
 * visible gap without the renderer needing to know anything about refusals. Returns an empty
 * list when nothing computed — which draws nothing, rather than drawing a flat line at zero.
 */
export function contiguousSegments<A>(
  series: SweepSeries<A>,
): Array<ComputedSweepPoint<A>[]> {
  const segments: Array<ComputedSweepPoint<A>[]> = [];
  let current: ComputedSweepPoint<A>[] = [];

  for (const point of series.points) {
    if (point.status === 'computed') {
      current.push(point);
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * Reduce a `Result` to the figure a comparative view draws.
 *
 * Copies only. Nothing here recomputes a damage figure, so a summary can never disagree with the
 * Result it came from.
 */
export function summarise(result: Result): PointSummary {
  const contributors = result.incompleteContributors.map((c) => c.sourceLabel).sort();
  return {
    burst: result.burst,
    dot: { total: result.dot.total, byType: result.dot.byType },
    verdict: {
      burstOnly: verdictSummary(result.verdict.burstOnly),
      burstPlusDot: verdictSummary(result.verdict.burstPlusDot),
    },
    attackerLevel: result.attackerStats.level,
    defenderLevel: result.defenderStats.level,
    defenderHp: result.defenderStats.hp,
    verification: result.verificationSummary,
    partial: contributors.length > 0,
    incompleteContributors: contributors,
  };
}

function verdictSummary(v: Result['verdict']['burstOnly']): VerdictSummary {
  return {
    lethal: v.lethal,
    lethalAtInstance: v.lethalAtInstance,
    remainingHp: v.remainingHp,
    damageApplied: v.damageApplied,
    healingApplied: v.healingApplied,
  };
}

/**
 * Assemble a series from its points, computing the honesty fields nothing else can compute.
 *
 * `incompleteEverywhere` / `incompleteSomewhere` / `incompleteSetVaries` are derived here rather
 * than by each sweep, so all three of §11's views answer "is this curve comparable with itself?"
 * the same way.
 */
export function buildSeries<A>(opts: {
  kind: string;
  axisLabel: string;
  points: SweepPoint<A>[];
  /**
   * Every mechanic the engine excluded, at any point. Passed IN rather than read off the points,
   * because a point only carries its Result when the caller asked for one, and §11's "every
   * excluded mechanic is stated visibly" must not depend on that choice.
   */
  excludedMechanics?: Iterable<string>;
  notes?: string[];
}): SweepSeries<A> {
  const computed = opts.points.filter(
    (p): p is ComputedSweepPoint<A> => p.status === 'computed',
  );

  const everywhere = new Set<string>(computed[0]?.summary.incompleteContributors ?? []);
  const somewhere = new Set<string>();
  for (const point of computed) {
    const here = new Set(point.summary.incompleteContributors);
    for (const label of here) somewhere.add(label);
    for (const label of [...everywhere]) if (!here.has(label)) everywhere.delete(label);
  }

  const excluded = new Set<string>(opts.excludedMechanics ?? []);

  return {
    kind: opts.kind,
    axisLabel: opts.axisLabel,
    points: opts.points,
    computedCount: computed.length,
    refusedCount: opts.points.length - computed.length,
    anyPartial: computed.some((p) => p.summary.partial),
    incompleteEverywhere: [...everywhere].sort(),
    incompleteSomewhere: [...somewhere].sort(),
    incompleteSetVaries: everywhere.size !== somewhere.size,
    excludedMechanics: [...excluded],
    notes: opts.notes ?? [],
  };
}
