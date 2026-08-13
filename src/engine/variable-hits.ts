// RESOLVING A VARIABLE HIT COUNT — the one place the user's stated count becomes instances.
//
// Some abilities have no fixed hit count to store. How many of Ziggs's mines a champion contacts,
// how many of Yuumi's waves catch them before they walk out, how many of Zac's bounces reach
// them — the number is a property of the situation, not of the ability, and no source states it
// (DATA-SOURCES §38). The data records the ceiling and the rate; the count arrives from the
// scenario, exactly as entry state does (SPECIFICATION §3.3).
//
// THE DEFAULT IS THE MINIMUM AND IS NOT A TUNING KNOB. Absent means one full instance and no
// repeats, because that is the only count true whenever the ability connects at all. A higher
// default would assert positioning the user never stated, and this product's promise is that a
// figure is absent rather than wrong. The cost is accepted and named: a minimum default
// understates "does my combo kill", which is why the interface makes the control prominent and
// prints the maximum beside it rather than quietly assuming a bigger number.

import type { VariableHitCount } from '../types/data';

/** What a resolved count means for the engine, and what the result has to say about it. */
export interface ResolvedHits {
  /** Instances at the component's full value. 0 or 1 for both shapes today. */
  fullInstances: number;
  /** Instances at the reduced value. Always 0 for the full-rate shape. */
  reducedInstances: number;
  /** Fraction of full that each reduced instance deals. 1 when there are none. */
  reducedRate: number;
  /**
   * The multiplier to apply to the component's per-instance value:
   * `fullInstances + reducedInstances * reducedRate`.
   */
  multiplier: number;
  /** The largest count the source allows, for the interface to show beside the control. */
  maximum: number;
  /** The count the user actually stated, or the default. */
  stated: number;
  /** True when the count came from the default rather than from the user. */
  usedDefault: boolean;
  /** Plain English for the result line — SPECIFICATION §11 requires the count be stated. */
  explanation: string;
}

/**
 * The minimum count, which is also the default.
 *
 * Shape A: one full instance, zero additional. Shape B: one instance.
 * Both are "the ability connected once", which is the least the user can mean by including it in
 * a combo at all.
 */
export const MINIMUM_STATED_COUNT = 0;

function clampToRange(stated: number, maximum: number): { value: number; clamped: boolean } {
  if (!Number.isFinite(stated)) return { value: MINIMUM_STATED_COUNT, clamped: true };
  const whole = Math.floor(stated);
  if (whole < 0) return { value: 0, clamped: true };
  if (whole > maximum) return { value: maximum, clamped: true };
  return { value: whole, clamped: whole !== stated };
}

/**
 * Turn a variable-hit shape plus the user's stated count into instance counts.
 *
 * @param shape  What the source says: the ceiling, and for shape A the reduced rate.
 * @param stated The user's count from `ComboStep.hitCounts`, or undefined for the default.
 */
export function resolveVariableHits(
  shape: VariableHitCount,
  stated: number | undefined,
): ResolvedHits {
  if (shape.kind === 'repeatsAtReducedRate') {
    // The number the user states is ADDITIONAL instances; the first is always full.
    const maximum = shape.maxAdditional;
    const usedDefault = stated === undefined;
    const { value: additional } = clampToRange(stated ?? MINIMUM_STATED_COUNT, maximum);
    const multiplier = 1 + additional * shape.rate;
    return {
      fullInstances: 1,
      reducedInstances: additional,
      reducedRate: shape.rate,
      multiplier,
      maximum,
      stated: additional,
      usedDefault,
      explanation:
        additional === 0
          ? `1 full instance, no repeats${usedDefault ? ' (the default — the source allows up to ' + maximum + ' more, each at ' + Math.round(shape.rate * 100) + '%)' : ''}`
          : `1 full instance plus ${additional} at ${Math.round(shape.rate * 100)}% (the source allows up to ${maximum})`,
    };
  }

  // Shape B: every instance is full, and the user states how many landed — including zero,
  // which is a real scenario (the ability missed) and contributes no damage.
  const maximum = shape.maxInstances;
  const usedDefault = stated === undefined;
  const { value: instances } = clampToRange(stated ?? 1, maximum);
  return {
    fullInstances: instances,
    reducedInstances: 0,
    reducedRate: 1,
    multiplier: instances,
    maximum,
    stated: instances,
    usedDefault,
    explanation:
      instances === 0
        ? 'no instances landed — this ability contributes nothing'
        : `${instances} full instance${instances === 1 ? '' : 's'}${usedDefault ? ` (the default — the source allows up to ${maximum})` : ` of up to ${maximum}`}`,
  };
}
