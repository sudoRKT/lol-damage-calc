// The HP burndown's MODEL — every number the chart draws, computed here, with no DOM and
// no React, so it can be tested as arithmetic (CLAUDE.md: "large parts are deterministic
// arithmetic that can be tested without the game").
//
// TWO RULES THIS FILE HOLDS, both of them about not inventing numbers.
//
// 1. **The chart is drawn from `runningTotal`, not from the per-instance `final` values.**
//    `Result.runningTotal` is the engine's own statement of the cumulative damage after each
//    instance, and it is what the verdict and the burst total are consistent with. Deriving
//    the plateaus from it means the staircase can never disagree with the total printed
//    above it. Where an instance's `final` disagrees with its delta, that is a defect in the
//    Result and `auditResult` below reports it — the chart does not silently pick a winner.
//
// 2. **Nothing here rounds.** Rounding is fixed at a single documented point in the engine
//    (CLAUDE.md). A chart that rounded again would be a second, undocumented rounding point.

import type {
  DamageByType,
  DamageType,
  IncompleteReason,
  InstanceResult,
  Result,
  VerificationStatus,
} from '../../types';

const DAMAGE_TYPES: DamageType[] = ['physical', 'magic', 'true'];

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** One hatched sub-riser of the `+DoT` column: a damage-over-time type and its total. */
export interface DotSegment {
  damageType: DamageType;
  damage: number;
  /** Fraction of the plot height (0..1) this segment's top sits at. */
  topFraction: number;
  /** Fraction of the plot height (0..1) this segment's bottom sits at. */
  bottomFraction: number;
}

/**
 * One column of the plot. X is SEQUENCE, not time (SPECIFICATION §3.2) — every column is
 * the same width whatever the instance was, and there is no elapsed-time axis anywhere in
 * this file.
 */
export interface BurndownColumn {
  /**
   * `'heal'` is the UNPLACED-HEALING column, and it sits BEFORE instance 1.
   *
   * DEVIATION FROM THE APPROVED PROPOSAL, STATED RATHER THAN SLIPPED IN. The proposal put the
   * unplaced column after the last burst column, beside `+DoT`. The engine counts unplaced
   * healing as available from the START of the walk (`ComboPlan.unplacedSustain`), so drawing it
   * last would have put the chart and the verdict back into disagreement — which is the whole
   * defect this work exists to close. The chart follows the arithmetic.
   */
  kind: 'burst' | 'dot' | 'heal';
  /** 1-based position on the x axis, counting the `+DoT` column as the last one. */
  position: number;
  /** The x-axis label, e.g. `inst 1` or `+DoT`. */
  axisLabel: string;
  /** What did the damage, e.g. "Q — The Darkin Blade (1st cast)". */
  sourceLabel: string;
  /** Damage applied in this column. For a burst column this is the `runningTotal` delta. */
  damage: number;
  /** Remaining health at the left of the column — the tread's height. */
  hpBefore: number;
  /** Remaining health at the right of the column, never below zero. */
  hpAfter: number;
  /** Fraction of the plot height (0..1) the tread sits at. */
  treadFraction: number;
  /** Fractions of the plot height the riser spans. `riserTop >= riserBottom`. */
  riserTop: number;
  riserBottom: number;
  /** Burst columns carry exactly one type. The `+DoT` column carries one segment per type. */
  damageType: DamageType | null;
  segments: DotSegment[];
  /** `null` only when there is nothing to make a claim about (a DoT column with no sources). */
  verification: VerificationStatus | null;
  incompleteReason?: IncompleteReason;
  crit: boolean;
  /** The instance this column came from — burst columns only. */
  instance: InstanceResult | null;
  /**
   * THE GROUP THIS COLUMN BELONGS TO. Added 2026-08-14.
   *
   * An on-hit or Spellblade item effect is its own instance and its own column, which is what
   * keeps its resistance working and its crit correct (DATA-SOURCES §53.3). But a reader
   * watching a health bar sees ONE drop when a basic attack carrying three on-hit effects lands.
   * A group brackets those columns under one axis label WITHOUT the engine merging anything.
   *
   * `groupId` is the carrier's `stepId`, shared by the carrier and everything that rode on it.
   * `null` for a column that stands alone, which is most of them. `groupIndex` is the column's
   * 1-based place within its group, and `groupSize` the group's total — so the first column can
   * draw the bracket and the rest need no special case.
   */
  groupId: string | null;
  groupIndex: number;
  groupSize: number;
  /** The group's own label: what the reader sees under the bracket, e.g. `inst 3`. */
  groupLabel: string | null;
  /**
   * HEALTH THE DEFENDER REGAINED IN THIS COLUMN, after its damage. Added 2026-08-14.
   *
   * Absent (0) on every column of a scenario with no healing, so the chart is unchanged for
   * them. Where it is non-zero the column carries a SECOND riser that goes UP — see
   * `healRiserTop` / `healRiserBottom`. DESIGN.md §7's trace only ever fell before this, so a
   * healing defender's last tread ended at one number while the verdict beside it read another.
   */
  healing: number;
  /**
   * HEALING THAT DID NOT FIT. `healing` minus what the cap at maximum health allowed.
   *
   * Reported rather than hidden: overhealing is a fact a theorycrafter wants, and a silently
   * clamped riser would show a smaller heal than the source states with nothing to say why.
   */
  healingWasted: number;
  /** Fractions of the plot height the healing riser spans. `healRiserTop >= healRiserBottom`,
   *  and both are 0 when nothing healed here. */
  healRiserTop: number;
  healRiserBottom: number;
}

export interface BurndownModel {
  /** Y axis top. DESIGN.md §7: "the defender's effective max HP at the top". */
  maxHp: number;
  /** Where the trace starts. May be below `maxHp` — the defender can enter already damaged. */
  startHp: number;
  columns: BurndownColumn[];
  burstColumnCount: number;
  hasDot: boolean;
  /** Y-axis tick values, ascending, always including 0. */
  ticks: number[];
  /** Cumulative burst damage by type after each burst instance. Drives the odometer. */
  cumulativeByType: DamageByType[];
  burst: { total: number; byType: DamageByType };
  /** 1-based burst instance at which the burst kills, or null. Taken from the Result. */
  lethalAtInstance: number | null;
  /** Fraction across the plot (0..1) of the solid LETHAL rule, or null when it survives. */
  lethalRuleFraction: number | null;
  /** Fraction across the plot of the DASHED rule: burst survived, burst + DoT does not. */
  dotLethalRuleFraction: number | null;
  burstVerdictText: string;
  dotVerdictText: string;
}

/**
 * BRACKET EACH CARRIER WITH WHAT RODE ON IT — the drawing's answer to a real objection.
 *
 * A basic attack carrying three on-hit item effects is FOUR instances in the engine and ONE
 * moment in the game. Keeping four instances is what preserves each one's resistance working and
 * keeps the riders out of the carrier's critical strike (DATA-SOURCES §53.3); showing four
 * unrelated columns is what misrepresents the health bar, which drops once.
 *
 * So the grouping happens HERE, in the geometry, and nowhere else. It is strictly additive:
 * remove every line of it and every number in the chart is identical.
 *
 * A group is (carrier, everything whose `carriedBy` names it). It is deliberately built from
 * ADJACENCY as well as identity — a rider is emitted immediately after its carrier, and a group
 * that could jump a gap would bracket columns that are not next to each other, which cannot be
 * drawn as one bracket and would not mean anything if it could.
 *
 * The axis label of a group is the CARRIER's. A reader looking at the bracket is looking at the
 * moment the attack landed, not at the third effect that rode along with it.
 */
export function groupColumns(columns: BurndownColumn[]): void {
  let i = 0;
  while (i < columns.length) {
    const carrier = columns[i]!;
    // Only a burst column can carry, and a column that rode on something is never itself a
    // carrier — riders do not nest.
    if (carrier.kind !== 'burst' || carrier.instance?.carriedBy) {
      i += 1;
      continue;
    }
    const carrierStepId = carrier.instance?.stepId;
    if (!carrierStepId) {
      i += 1;
      continue;
    }
    // Walk forward while the next column rode on THIS carrier. Stops at the first that did not,
    // which is what keeps a group contiguous.
    let end = i + 1;
    while (
      end < columns.length &&
      columns[end]!.kind === 'burst' &&
      columns[end]!.instance?.carriedBy === carrierStepId
    ) {
      end += 1;
    }
    const size = end - i;
    // A carrier with nothing riding on it is not a group. Bracketing one column says there is
    // something to group when there is not.
    if (size > 1) {
      for (let j = i; j < end; j += 1) {
        const column = columns[j]!;
        column.groupId = carrierStepId;
        column.groupIndex = j - i + 1;
        column.groupSize = size;
        column.groupLabel = carrier.axisLabel;
      }
    }
    i = end;
  }
}

function zeroByType(): DamageByType {
  return { physical: 0, magic: 0, true: 0 };
}

/**
 * Y-axis ticks at rounded HP intervals (DESIGN.md §7).
 *
 * MOVED TO `../plot` on 2026-08-14 and re-exported here, so existing callers are untouched. It
 * was always generic — it takes a maximum and a tick budget and knows nothing about health — and
 * the curve charts need the identical rule. Two copies is how two charts come to put their
 * gridlines in different places, which is the one thing a reader compares across charts.
 */
import { niceTicks } from '../plot';

export { niceTicks };

/** Where a vertical rule at fraction `f` must be nudged so its stroke stays inside the plot. */
export function ruleShift(fraction: number): string {
  if (fraction >= 1) return 'translateX(-100%)';
  if (fraction <= 0) return 'translateX(0)';
  return 'translateX(-50%)';
}

/**
 * Build the whole model from a Result.
 *
 * `hpBefore` for instance 1 is the defender's health AT ENTRY, which may be below max — the
 * scenario is a moment in time (SPECIFICATION §3.3), and the mock enters at 800 of 1850.
 */
export function buildBurndownModel(result: Result): BurndownModel {
  const maxHp = result.defenderStats.maxHp;
  const startHp = result.defenderStats.hp;
  const scale = maxHp > 0 ? maxHp : 1;
  const frac = (hp: number) => hp / scale;

  const columns: BurndownColumn[] = [];
  // THE SPLIT IS READ, NOT RE-DERIVED (changed 2026-08-13). This used to re-accumulate the
  // per-type running split from each instance's `final` and `byType`, which made the chart a
  // SECOND source of truth for a figure the engine already states. §41.1 fixes `runningTotal` as
  // the authoritative one precisely because the rounded per-instance column does not sum to it;
  // re-deriving the split from that column reintroduced the arithmetic the rule forbids.
  // `auditResult` still checks the two against each other, so a disagreement is reported rather
  // than reconciled by whichever code path ran last.
  const cumulativeByType: DamageByType[] = result.runningTotal.map((p) => ({ ...p.byType }));

  // ═══ THE TRACE NOW WALKS HEALTH, NOT CUMULATIVE DAMAGE (2026-08-14) ═══
  //
  // It used to be `startHp - cumulativeDamage`, which can only fall. A defender who heals made
  // the last tread end at one number while the verdict printed beside it read another — the
  // §41.2 defect, in the signature element. The walk below applies damage then healing, in the
  // instance's own position, capped at maximum health and STOPPING at death, which is exactly
  // what the engine's verdict does. Neither is derived from the other; `auditResult` compares.
  const healingAt = (instanceNumber: number | null): number =>
    result.sustain.sources
      .filter((x) => x.restoresTo === 'defender' && x.fromInstance === instanceNumber)
      .reduce((n, x) => n + x.amount, 0);

  let hp = startHp;

  const unplacedHealing = healingAt(null);
  if (unplacedHealing > 0) {
    const applied = Math.min(unplacedHealing, Math.max(0, maxHp - hp));
    columns.push({
      kind: 'heal',
      position: 0,
      axisLabel: 'heal',
      // The unplaced-healing and +DoT columns never group: neither rode on anything.
      groupId: null,
      groupIndex: 1,
      groupSize: 1,
      groupLabel: null,
      sourceLabel: 'Healing the sequence cannot place',
      damage: 0,
      hpBefore: hp,
      hpAfter: hp + applied,
      treadFraction: frac(hp),
      riserTop: frac(hp),
      riserBottom: frac(hp),
      damageType: null,
      segments: [],
      verification: null,
      crit: false,
      instance: null,
      healing: unplacedHealing,
      healingWasted: unplacedHealing - applied,
      healRiserTop: frac(hp + applied),
      healRiserBottom: frac(hp),
    });
    hp += applied;
  }

  result.perInstance.forEach((instance, i) => {
    const cumBefore = i === 0 ? 0 : (result.runningTotal[i - 1]?.total ?? 0);
    const cumAfter = result.runningTotal[i]?.total ?? cumBefore;
    const damage = cumAfter - cumBefore;

    const hpBefore = hp;
    const hpAfterDamage = Math.max(0, hpBefore - damage);

    // A HEAL AFTER THE KILL IS NOT DRAWN, for the same reason it is not counted: dead is dead
    // at the crossing (src/engine/combo.ts, `verdict`).
    const wanted = hpAfterDamage <= 0 ? 0 : healingAt(i + 1);
    const healed = Math.min(wanted, Math.max(0, maxHp - hpAfterDamage));
    const hpAfter = hpAfterDamage + healed;
    hp = hpAfter;

    columns.push({
      kind: 'burst',
      position: i + 1,
      axisLabel: `inst ${i + 1}`,
      sourceLabel: instance.sourceLabel,
      damage,
      hpBefore,
      hpAfter,
      treadFraction: frac(hpBefore),
      riserTop: frac(hpBefore),
      // The DAMAGE riser stops where the damage stopped, not where the healing left the trace.
      riserBottom: frac(hpAfterDamage),
      // The riser's hue. Null for a mixed or no-damage instance: DESIGN.md §8 renders a
      // multi-type figure bone and untagged with a composition bar, and a no-damage instance has
      // no figure to colour.
      damageType:
        instance.damageType === 'mixed' || instance.damageType === 'none'
          ? null
          : instance.damageType,
      segments: [],
      verification: instance.verification,
      incompleteReason: instance.incompleteReason,
      crit: instance.crit,
      instance,
      // Filled by `groupColumns` below, once every column exists — a group is a fact about
      // neighbours, so it cannot be decided while walking one column at a time.
      groupId: null,
      groupIndex: 1,
      groupSize: 1,
      groupLabel: null,
      healing: wanted,
      healingWasted: wanted - healed,
      healRiserTop: frac(hpAfter),
      healRiserBottom: frac(hpAfterDamage),
    });
  });

  groupColumns(columns);

  const burstColumnCount = columns.filter((c) => c.kind === 'burst').length;
  const hasDot = result.dot.total > 0;

  if (hasDot) {
    // DESIGN.md §7 colours the tail by "the DoT source's damage hue". A DoT total that spans
    // more than one type has no single hue, so it is drawn as one hatched segment per
    // non-zero type, stacked — the same construction as the composition bar, and each
    // segment keeps its own P/M/T tag. Raised as an open point; not invented silently.
    // FROM THE WALKED HEALTH, not `startHp - burst.total`: with healing in the sequence those
    // are different numbers, and the tail has to start where the trace actually ended.
    const hpBefore = Math.max(0, hp);
    const hpAfter = Math.max(0, hpBefore - result.dot.total);

    const segments: DotSegment[] = [];
    let cursor = hpBefore;
    for (const t of DAMAGE_TYPES) {
      const amount = result.dot.byType[t];
      if (amount === 0) continue;
      const next = Math.max(0, cursor - amount);
      segments.push({
        damageType: t,
        damage: amount,
        topFraction: frac(cursor),
        bottomFraction: frac(next),
      });
      cursor = next;
    }

    const single = segments.length === 1 ? segments[0]!.damageType : null;

    columns.push({
      kind: 'dot',
      position: burstColumnCount + 1,
      axisLabel: '+DoT',
      // The unplaced-healing and +DoT columns never group: neither rode on anything.
      groupId: null,
      groupIndex: 1,
      groupSize: 1,
      groupLabel: null,
      sourceLabel: result.dot.sources.map((s) => s.label).join(', ') || 'Damage over time',
      damage: result.dot.total,
      hpBefore,
      hpAfter,
      treadFraction: frac(hpBefore),
      riserTop: frac(hpBefore),
      riserBottom: frac(hpAfter),
      damageType: single,
      segments,
      verification: worstOf(result.dot.sources.map((s) => s.verification)),
      incompleteReason: result.dot.sources.find((s) => s.incompleteReason)?.incompleteReason,
      crit: false,
      instance: null,
      // NOTHING HEALS AFTER THE TRAILING LINE. §3.8 puts damage over time "following the combo",
      // and there is no instance left to carry a heal — the same rule the engine's verdict uses.
      healing: 0,
      healingWasted: 0,
      healRiserTop: 0,
      healRiserBottom: 0,
    });
  }

  const totalColumns = columns.length || 1;
  const lethalAtInstance = result.verdict.burstOnly.lethalAtInstance;
  const lethalRuleFraction =
    result.verdict.burstOnly.lethal && lethalAtInstance !== null
      ? lethalAtInstance / totalColumns
      : null;

  // The dashed rule exists ONLY in the case DESIGN.md §7 names: burst alone survives, burst
  // plus DoT kills. When the burst already killed there is no second crossing to mark.
  const dotLethalRuleFraction =
    !result.verdict.burstOnly.lethal && result.verdict.burstPlusDot.lethal && hasDot
      ? 1
      : null;

  return {
    maxHp,
    startHp,
    columns,
    burstColumnCount,
    hasDot,
    ticks: niceTicks(maxHp),
    cumulativeByType,
    burst: { total: result.burst.total, byType: result.burst.byType },
    lethalAtInstance,
    lethalRuleFraction,
    dotLethalRuleFraction,
    burstVerdictText: verdictText('Burst', result.verdict.burstOnly),
    dotVerdictText: verdictText('Burst + DoT', result.verdict.burstPlusDot),
  };
}

const STATUS_RANK: Record<VerificationStatus, number> = {
  verified: 0,
  derived: 1,
  'no-damage': 2,
  incomplete: 3,
};

/**
 * The worst status in a set — the same "worst wins" rule `Result.verificationSummary` uses.
 *
 * Returns `null` for an empty set rather than a status. An empty set is "nothing to make a
 * claim about", and the natural identity for a worst-wins fold would be `verified` — the
 * strongest claim in the product, invented out of no evidence at all. That is exactly the
 * plausible wrong answer this project exists to prevent, so it is not returned.
 */
export function worstOf(statuses: VerificationStatus[]): VerificationStatus | null {
  let worst: VerificationStatus | null = null;
  for (const s of statuses) {
    if (worst === null || STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  }
  return worst;
}

/**
 * Both verdicts, as the sentence DESIGN.md §7 prints verbatim:
 * `Burst: SURVIVES 512 HP` / `Burst + DoT: LETHAL`.
 */
export function verdictText(
  scope: string,
  v: { lethal: boolean; remainingHp: number },
): string {
  return v.lethal ? `${scope}: LETHAL` : `${scope}: SURVIVES ${v.remainingHp} HP`;
}

// ---------------------------------------------------------------------------
// The odometer (DESIGN.md §10: 300ms, linear)
// ---------------------------------------------------------------------------

/** DESIGN.md §10 — "Burndown trace drawing in (per step, staggered): 120ms per step". */
export const STEP_MS = 120;
/** DESIGN.md §10 — "Rolling total odometer: 300ms, linear". */
export const ODOMETER_MS = 300;
/** DESIGN.md §10 — "Recent-damage ghost fade: 600ms". */
export const GHOST_MS = 600;
/** DESIGN.md §10 — "LETHAL rule strike-in: 180ms". */
export const LETHAL_MS = 180;

/** When the whole playback has settled, in milliseconds. */
export function playbackDurationMs(steps: number): number {
  if (steps <= 0) return 0;
  return (steps - 1) * STEP_MS + ODOMETER_MS;
}

/**
 * The odometer's value at `elapsed` ms.
 *
 * Step k lands at `k * STEP_MS` and the total rolls to the new cumulative figure over
 * `ODOMETER_MS`, linearly (DESIGN.md §10). The three type components are interpolated with
 * the same t and the total is then their SUM — not interpolated separately — because
 * `AggregateTotal` refuses to render a composition bar that disagrees with the figure above
 * it, and it is right to.
 */
export function odometerAt(
  elapsedMs: number,
  cumulative: DamageByType[],
): { total: number; byType: DamageByType } {
  if (cumulative.length === 0) return { total: 0, byType: zeroByType() };

  const landed = Math.min(cumulative.length, Math.max(0, Math.floor(elapsedMs / STEP_MS) + 1));
  if (landed <= 0) return { total: 0, byType: zeroByType() };

  const to = cumulative[landed - 1]!;
  const from = landed >= 2 ? cumulative[landed - 2]! : zeroByType();
  const startedAt = (landed - 1) * STEP_MS;
  const t = Math.min(1, Math.max(0, (elapsedMs - startedAt) / ODOMETER_MS));

  // MID-ROLL FRAMES ARE ROUNDED TO WHOLE NUMBERS; the settled value never is.
  //
  // An odometer that spun through 240.53333 is unreadable, but rounding a SETTLED figure
  // would be a second, undocumented rounding point (CLAUDE.md), so the two cases are kept
  // apart: `t < 1` is a frame of an animation, `t === 1` is the engine's number and is
  // passed through untouched.
  const step = (a: number, b: number) => {
    const v = a + (b - a) * t;
    return t < 1 ? Math.round(v) : v;
  };
  const byType: DamageByType = {
    physical: step(from.physical, to.physical),
    magic: step(from.magic, to.magic),
    true: step(from.true, to.true),
  };
  return { total: byType.physical + byType.magic + byType.true, byType };
}

// ---------------------------------------------------------------------------
// The consistency audit — THE CHECK, not the fix
// ---------------------------------------------------------------------------

export interface ResultFinding {
  kind: string;
  detail: string;
}

/**
 * Every internal disagreement a Result can carry that the burndown would otherwise draw as a
 * plausible-looking picture.
 *
 * CLAUDE.md's standing instruction: when a defect is found, write the check that finds every
 * other instance of it. This is that check. It runs over any Result — the mock today, the
 * engine's output once it is wired — and it is what stops the chart quietly reconciling two
 * numbers that disagree.
 */
export function auditResult(result: Result): ResultFinding[] {
  const f: ResultFinding[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;

  if (result.runningTotal.length !== result.perInstance.length) {
    f.push({
      kind: 'running-total-length',
      detail: `runningTotal has ${result.runningTotal.length} entries for ${result.perInstance.length} instances`,
    });
  }

  // EVERY RUNNING-TOTAL POINT CARRIES ITS OWN SPLIT, and the split has to hold on its own terms
  // (added 2026-08-13 with the shape change). A point whose three types do not sum to its total
  // would render a composition bar that disagrees with the number printed beside it — DESIGN.md
  // §7's tags say one thing and the bar another, which §41.2 records as worse than no bar.
  result.runningTotal.forEach((point, i) => {
    const sum = point.byType.physical + point.byType.magic + point.byType.true;
    if (!near(sum, point.total)) {
      f.push({
        kind: 'running-total-split-sum',
        detail: `runningTotal[${i}] byType sums to ${sum} but its total is ${point.total}`,
      });
    }
  });

  // ═══ THESE TWO COMPARISONS CARRY A ONE-POINT TOLERANCE, AND IT IS THE DOCUMENTED RULE ═══
  //
  // WIDENED 2026-08-14, after the end-to-end seam check ran the interface's assertions over
  // `simulate`'s output on real champion data for the first time. Three of Lux's four instances
  // were flagged: "runningTotal delta 86 but final 87".
  //
  // Neither figure is wrong. §41.1 fixes the rounding rule: every figure is rounded ONCE from an
  // unrounded quantity, never summed from figures already rounded. So `final` is that instance's
  // damage rounded, and the running total is the CUMULATIVE damage rounded — and the difference
  // between two consecutive rounded cumulative figures need not equal the separately rounded
  // instance. **"The per-instance column may be off by a point or two from its own sum, and must
  // never be presented as something to add up"** is the rule the interface itself prints under
  // the table. This check was demanding the opposite.
  //
  // It passed for eight months of fixtures because every one of them used whole numbers. Real
  // champion data does not.
  //
  // THE TOLERANCE IS EXACTLY WHAT ROUNDING CAN PRODUCE AND NOT A POINT MORE: two roundings can
  // move a delta by at most 1, and a per-type sum by at most half a point per instance. Any real
  // disagreement — a dropped instance, a double count, a mis-assigned type — is far larger and
  // is still caught.
  const ROUNDING_SLACK = 1;
  const byType = zeroByType();
  result.perInstance.forEach((inst, i) => {
    const delta =
      (result.runningTotal[i]?.total ?? 0) - (i === 0 ? 0 : (result.runningTotal[i - 1]?.total ?? 0));
    if (Math.abs(delta - inst.final) > ROUNDING_SLACK + 1e-6) {
      f.push({
        kind: 'delta-disagrees-with-final',
        detail: `instance ${inst.index} (${inst.sourceLabel}): runningTotal delta ${delta} but final ${inst.final}`,
      });
    }
    if (inst.damageType === 'mixed') {
      const split = inst.byType ?? { physical: 0, magic: 0, true: 0 };
      byType.physical += split.physical;
      byType.magic += split.magic;
      byType.true += split.true;
    } else if (inst.damageType !== 'none') {
      byType[inst.damageType] += inst.final;
    }

    // SPECIFICATION §8: "An incomplete ability contributes no damage to a result."
    if (inst.verification === 'incomplete' && inst.final !== 0) {
      const named = result.incompleteContributors.some((c) => c.sourceLabel === inst.sourceLabel);
      f.push({
        kind: 'incomplete-instance-contributes-damage',
        detail:
          `instance ${inst.index} (${inst.sourceLabel}) is incomplete but contributes ${inst.final} ` +
          `to the totals` +
          (named
            ? `, and is ALSO listed in incompleteContributors, which the contract describes as ` +
              `"every ability excluded from the totals above"`
            : ''),
      });
    }
  });

  const last = result.runningTotal[result.runningTotal.length - 1]?.total ?? 0;
  if (!near(last, result.burst.total)) {
    f.push({
      kind: 'running-total-tail',
      detail: `runningTotal ends at ${last} but burst.total is ${result.burst.total}`,
    });
  }

  // Half a point per instance, for the reason given above: this sums figures that were each
  // rounded once, against a figure rounded once from the unrounded whole.
  const typeSlack = Math.max(ROUNDING_SLACK, result.perInstance.length * 0.5);
  for (const t of DAMAGE_TYPES) {
    if (Math.abs(byType[t] - result.burst.byType[t]) > typeSlack + 1e-6) {
      f.push({
        kind: 'burst-by-type',
        detail: `instances sum to ${byType[t]} ${t} but burst.byType.${t} is ${result.burst.byType[t]}`,
      });
    }
  }

  const burstSum =
    result.burst.byType.physical + result.burst.byType.magic + result.burst.byType.true;
  if (!near(burstSum, result.burst.total)) {
    f.push({
      kind: 'burst-split-sum',
      detail: `burst.byType sums to ${burstSum} but burst.total is ${result.burst.total}`,
    });
  }

  const dotSum = result.dot.byType.physical + result.dot.byType.magic + result.dot.byType.true;
  if (!near(dotSum, result.dot.total)) {
    f.push({
      kind: 'dot-split-sum',
      detail: `dot.byType sums to ${dotSum} but dot.total is ${result.dot.total}`,
    });
  }

  const hp = result.defenderStats.hp;
  if (hp > result.defenderStats.maxHp) {
    f.push({
      kind: 'hp-above-max',
      detail: `defender hp ${hp} exceeds maxHp ${result.defenderStats.maxHp}`,
    });
  }

  const checkVerdict = (
    scope: string,
    v: Result['verdict']['burstOnly'],
    applied: number,
  ) => {
    if (!near(v.defenderHp, hp)) {
      f.push({
        kind: 'verdict-hp',
        detail: `${scope} verdict measured against ${v.defenderHp} HP but defenderStats.hp is ${hp}`,
      });
    }
    if (!near(v.damageApplied, applied)) {
      f.push({
        kind: 'verdict-damage',
        detail: `${scope} verdict applies ${v.damageApplied} but the totals give ${applied}`,
      });
    }
    // HEALING IS PART OF THE VERDICT, NOT A NOTE BESIDE IT (added 2026-08-13). A defender who
    // healed 90 and is reported as though they had not is a wrong number, so `healingApplied`
    // enters both the lethality test and the remaining figure. It is 0 in every result the
    // engine produces today, so this reduces to the previous arithmetic until sustain data lands.
    const survivable = v.defenderHp + v.healingApplied;
    if (v.lethal !== applied >= survivable) {
      f.push({
        kind: 'verdict-lethal',
        detail:
          `${scope} verdict says lethal=${v.lethal} for ${applied} against ${v.defenderHp} HP ` +
          `plus ${v.healingApplied} healed`,
      });
    }
    // The remaining figure cannot be recomputed from three numbers any more: healing resolves
    // in sequence, capped per step and cut off at the kill, so it takes the whole walk. What
    // CAN be checked without redoing the walk is that it is bounded correctly, and — below —
    // that the chart's own walk lands on the same number.
    if (v.lethal && v.remainingHp !== 0) {
      f.push({
        kind: 'verdict-remaining',
        detail: `${scope} verdict is lethal but leaves ${v.remainingHp} HP`,
      });
    }
    if (!v.lethal && v.remainingHp <= 0) {
      f.push({
        kind: 'verdict-remaining',
        detail: `${scope} verdict is not lethal but leaves ${v.remainingHp} HP`,
      });
    }
    if (v.remainingHp > survivable + 1e-6) {
      f.push({
        kind: 'verdict-remaining',
        detail:
          `${scope} verdict leaves ${v.remainingHp} HP, more than the ${survivable} the ` +
          `defender entered with plus everything they healed`,
      });
    }
    // NOT AN EQUALITY (changed 2026-08-14). `sustain.defenderHealing` is what the SOURCES state;
    // `healingApplied` is what actually entered this verdict's arithmetic, and the two differ
    // legitimately in two ways — healing beyond the kill did not happen, and healing past
    // maximum health did not fit. What may never happen is the verdict claiming MORE healing
    // than any source offered.
    if (v.healingApplied > result.sustain.defenderHealing + 1e-6) {
      f.push({
        kind: 'verdict-healing',
        detail:
          `${scope} verdict nets ${v.healingApplied} healing but the sustain sources only ` +
          `offer ${result.sustain.defenderHealing}`,
      });
    }
    if (v.remainingHp > result.defenderStats.maxHp + 1e-6) {
      f.push({
        kind: 'verdict-remaining-above-max',
        detail:
          `${scope} verdict leaves ${v.remainingHp} HP, above the defender's maximum of ` +
          `${result.defenderStats.maxHp}`,
      });
    }
  };

  checkVerdict('burst', result.verdict.burstOnly, result.burst.total);
  checkVerdict('burst+dot', result.verdict.burstPlusDot, result.burst.total + result.dot.total);

  // The kill lands where cumulative damage first reaches the health the defender actually has to
  // lose — their entry health plus anything they healed back.
  const survivableHp = hp + result.verdict.burstOnly.healingApplied;
  const crossingIndex = result.runningTotal.findIndex((c) => c.total >= survivableHp);
  const firstCrossing = crossingIndex === -1 ? null : crossingIndex + 1;
  if (result.verdict.burstOnly.lethalAtInstance !== firstCrossing) {
    f.push({
      kind: 'lethal-instance',
      detail:
        `verdict says the burst kills at instance ${String(result.verdict.burstOnly.lethalAtInstance)} ` +
        `but runningTotal first reaches ${survivableHp} HP at ${String(firstCrossing)}`,
    });
  }

  // ═══ THE CHART AND THE VERDICT MUST LAND ON THE SAME HEALTH ═══
  //
  // This is the check the whole healing change exists for. `buildBurndownModel` walks health
  // independently of `verdict()` — neither reads the other — so if the two rules ever drift, the
  // last tread and the words printed beside it say different things, which §41.2 records as
  // worse than drawing nothing. Before 2026-08-14 they DID drift: the trace ended at 30 while
  // the verdict read 120.
  if (result.perInstance.length > 0 && !result.verdict.burstOnly.lethal) {
    const model = buildBurndownModel(result);
    const burstColumns = model.columns.filter((c) => c.kind !== 'dot');
    const traceEndsAt = burstColumns[burstColumns.length - 1]?.hpAfter ?? result.defenderStats.hp;
    if (Math.abs(traceEndsAt - result.verdict.burstOnly.remainingHp) > 1) {
      f.push({
        kind: 'trace-disagrees-with-verdict',
        detail:
          `the burndown trace ends at ${traceEndsAt} HP but the burst verdict says ` +
          `${result.verdict.burstOnly.remainingHp} HP remains`,
      });
    }
  }

  // SUSTAIN'S TOTALS ARE THE SUM OF ITS SOURCES, PER SIDE. Two figures that can disagree will,
  // and a healing total that does not match the lines under it is the sustain-side version of
  // the mock defect §41.2 and the incomplete-contributor defect both came from.
  for (const side of ['attacker', 'defender'] as const) {
    const summed = result.sustain.sources
      .filter((s) => s.restoresTo === side)
      .reduce((n, s) => n + s.amount, 0);
    const stated = side === 'attacker'
      ? result.sustain.attackerHealing
      : result.sustain.defenderHealing;
    if (!near(summed, stated)) {
      f.push({
        kind: 'sustain-side-sum',
        detail: `sustain sources restore ${summed} to the ${side} but the total states ${stated}`,
      });
    }
  }

  return f;
}
