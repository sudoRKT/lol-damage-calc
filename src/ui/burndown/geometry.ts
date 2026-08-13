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
  kind: 'burst' | 'dot';
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

function zeroByType(): DamageByType {
  return { physical: 0, magic: 0, true: 0 };
}

/**
 * Y-axis ticks at rounded HP intervals (DESIGN.md §7).
 *
 * Picks the smallest "nice" step (1, 2, 2.5 or 5 × a power of ten) that puts at most
 * `maxIntervals` gaps under `maxHp`, then adds the axis top as a final label when it is far
 * enough from the last tick not to collide with it (half a step).
 */
export function niceTicks(maxHp: number, maxIntervals = 5): number[] {
  if (!(maxHp > 0)) return [0];
  const rough = maxHp / maxIntervals;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => maxHp / s <= maxIntervals) ??
    10 * magnitude;

  const ticks: number[] = [];
  for (let v = 0; v <= maxHp + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  const last = ticks[ticks.length - 1]!;
  if (maxHp - last >= step / 2) ticks.push(maxHp);
  return ticks;
}

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
  const cumulativeByType: DamageByType[] = [];
  const running = zeroByType();

  result.perInstance.forEach((instance, i) => {
    const cumBefore = i === 0 ? 0 : (result.runningTotal[i - 1] ?? 0);
    const cumAfter = result.runningTotal[i] ?? cumBefore;
    const damage = cumAfter - cumBefore;

    const hpBefore = Math.max(0, startHp - cumBefore);
    const hpAfter = Math.max(0, startHp - cumAfter);

    running[instance.damageType] += damage;
    cumulativeByType.push({ ...running });

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
      riserBottom: frac(hpAfter),
      damageType: instance.damageType,
      segments: [],
      verification: instance.verification,
      incompleteReason: instance.incompleteReason,
      crit: instance.crit,
      instance,
    });
  });

  const burstColumnCount = columns.length;
  const hasDot = result.dot.total > 0;

  if (hasDot) {
    // DESIGN.md §7 colours the tail by "the DoT source's damage hue". A DoT total that spans
    // more than one type has no single hue, so it is drawn as one hatched segment per
    // non-zero type, stacked — the same construction as the composition bar, and each
    // segment keeps its own P/M/T tag. Raised as an open point; not invented silently.
    const hpBefore = Math.max(0, startHp - result.burst.total);
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

  const byType = zeroByType();
  result.perInstance.forEach((inst, i) => {
    const delta = (result.runningTotal[i] ?? 0) - (i === 0 ? 0 : (result.runningTotal[i - 1] ?? 0));
    if (!near(delta, inst.final)) {
      f.push({
        kind: 'delta-disagrees-with-final',
        detail: `instance ${inst.index} (${inst.sourceLabel}): runningTotal delta ${delta} but final ${inst.final}`,
      });
    }
    byType[inst.damageType] += inst.final;

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

  const last = result.runningTotal[result.runningTotal.length - 1] ?? 0;
  if (!near(last, result.burst.total)) {
    f.push({
      kind: 'running-total-tail',
      detail: `runningTotal ends at ${last} but burst.total is ${result.burst.total}`,
    });
  }

  for (const t of DAMAGE_TYPES) {
    if (!near(byType[t], result.burst.byType[t])) {
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
    if (v.lethal !== applied >= v.defenderHp) {
      f.push({
        kind: 'verdict-lethal',
        detail: `${scope} verdict says lethal=${v.lethal} for ${applied} against ${v.defenderHp} HP`,
      });
    }
    const remaining = Math.max(0, v.defenderHp - applied);
    if (!near(v.remainingHp, remaining)) {
      f.push({
        kind: 'verdict-remaining',
        detail: `${scope} verdict says ${v.remainingHp} HP remains; ${remaining} does`,
      });
    }
  };

  checkVerdict('burst', result.verdict.burstOnly, result.burst.total);
  checkVerdict('burst+dot', result.verdict.burstPlusDot, result.burst.total + result.dot.total);

  const firstCrossing =
    result.runningTotal.findIndex((c) => c >= hp) === -1
      ? null
      : result.runningTotal.findIndex((c) => c >= hp) + 1;
  if (result.verdict.burstOnly.lethalAtInstance !== firstCrossing) {
    f.push({
      kind: 'lethal-instance',
      detail:
        `verdict says the burst kills at instance ${String(result.verdict.burstOnly.lethalAtInstance)} ` +
        `but runningTotal first reaches ${hp} HP at ${String(firstCrossing)}`,
    });
  }

  return f;
}
