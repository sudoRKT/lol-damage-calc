// Armor and magic resistance: the damage multiplier, and the fixed four-step order in
// which resistance-modifying effects apply (SPECIFICATION §3.6).
//
// Nothing in this file rounds. Rounding happens once, in rounding.ts (SPECIFICATION §3.7).

import type { DamageType } from '../types';

/**
 * The multiplier a damage figure is scaled by, given the target's EFFECTIVE resistance —
 * that is, the resistance left after `effectiveResistance` below has applied reduction and
 * penetration.
 *
 * SPECIFICATION §3.6, quoted literally:
 *   "Physical damage against positive armor resolves at a multiplier of 100 / (100 + armor).
 *    Against negative armor it resolves at 2 - 100 / (100 - armor). Magic damage resolves
 *    identically against magic resistance. True damage bypasses both."
 *
 * Confirmed against https://wiki.leagueoflegends.com/en-us/Armor (read 2026-08-12), which
 * gives the same piecewise formula.
 *
 * The two branches agree at zero (both give exactly 1), and the negative branch is bounded:
 * it approaches, but never reaches, double damage.
 */
export function resistanceMultiplier(
  damageType: DamageType,
  effectiveResistanceValue: number,
): number {
  // True damage ignores both resistances entirely (SPECIFICATION §3.6).
  if (damageType === 'true') return 1;

  if (effectiveResistanceValue >= 0) {
    return 100 / (100 + effectiveResistanceValue);
  }
  return 2 - 100 / (100 - effectiveResistanceValue);
}

/**
 * Apply the resistance multiplier to a raw damage figure.
 *
 * `rawDamage` is pre-mitigation damage; `effectiveResistanceValue` is the resistance left
 * after reduction and penetration. The result keeps full precision on purpose.
 */
export function applyResistance(
  rawDamage: number,
  damageType: DamageType,
  effectiveResistanceValue: number,
): number {
  return rawDamage * resistanceMultiplier(damageType, effectiveResistanceValue);
}

/**
 * The four resistance-modifying effects, as magnitudes.
 *
 * Percentages are fractions of 1: 30% reduction is `percentReduction: 0.3`.
 * Every field is a positive magnitude — a 20-point reduction is `flatReduction: 20`, not
 * -20. Omitted fields mean "this effect is not present".
 */
export interface ResistanceModifiers {
  /** Flat armor / magic resistance reduction, e.g. Black Cleaver's shred. */
  flatReduction?: number;
  /** Percentage armor / magic resistance reduction, as a fraction of 1. */
  percentReduction?: number;
  /** Percentage penetration, as a fraction of 1. */
  percentPenetration?: number;
  /** Flat penetration — lethality on the armor side. */
  flatPenetration?: number;
}

/**
 * Resolve a target's effective armor or magic resistance by applying the four modifier
 * types in the FIXED order the specification mandates (§3.6):
 *
 *   1. Flat reduction
 *   2. Percentage reduction
 *   3. Percentage penetration
 *   4. Flat penetration (lethality)
 *
 * That order is non-negotiable and must not be rearranged; `resistance-order.test.ts`
 * pins it with a case that produces a different number under every detectable permutation.
 *
 * The floors below come from the wiki's penetration articles, read 2026-08-12:
 *   https://wiki.leagueoflegends.com/en-us/Armor_penetration
 *   https://wiki.leagueoflegends.com/en-us/Magic_penetration
 * Both articles list exactly this four-step order, and state:
 *   - "Flat armor reduction can reduce a target's armor below zero."
 *   - percentage reduction "is ignored if the target's armor is 0 or less".
 *   - percentage penetration "is ignored if the target's armor is 0 or less".
 *   - flat penetration "cannot be reduced below 0" — it stops at zero rather than pushing
 *     the value negative, and it cannot pull an already-negative value back up.
 * Their worked example: 80 magic resistance, minus 20 flat, minus 30%, minus 35%
 * penetration, minus 10 flat penetration resolves to 17.3. Their second example: 18
 * resistance minus a 30 flat reduction is -12, and "is not affected by any further
 * calculations because it is less than 0".
 *
 * KNOWN GAP, raised rather than guessed: the wiki also documents a separate mechanic,
 * percentage *bonus* armor penetration, which applies only to the bonus portion of a
 * target's armor. Resolving it needs the target's base and bonus armor separately, and the
 * frozen StatBlock in src/types/ carries only a single `armor` figure. It is therefore NOT
 * implemented here.
 */
export function effectiveResistance(
  baseResistance: number,
  modifiers: ResistanceModifiers,
): number {
  let value = baseResistance;

  // Step 1 — flat reduction. This is the only step permitted to take the value below zero.
  if (modifiers.flatReduction) {
    value = value - modifiers.flatReduction;
  }

  // Step 2 — percentage reduction. Ignored entirely at zero or less.
  if (modifiers.percentReduction && value > 0) {
    value = value * (1 - modifiers.percentReduction);
  }

  // Step 3 — percentage penetration. Ignored entirely at zero or less.
  if (modifiers.percentPenetration && value > 0) {
    value = value * (1 - modifiers.percentPenetration);
  }

  // Step 4 — flat penetration (lethality). Stops at zero; never applied to a value that is
  // already zero or less, so it cannot claw a negative resistance back toward zero.
  if (modifiers.flatPenetration && value > 0) {
    value = Math.max(0, value - modifiers.flatPenetration);
  }

  return value;
}
