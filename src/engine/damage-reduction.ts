// POST-MITIGATION DAMAGE REDUCTION on the defender (SPECIFICATION §3.7, §5).
//
// This runs on a figure that has ALREADY met armor or magic resistance. It is the step
// between `InstanceResult.afterResistances` and `InstanceResult.afterReductions` in the frozen
// result contract, and it is the mechanism SPECIFICATION §5 names for Bone Plating, which
// "reduces damage from the first three instances an attacker delivers" and therefore
// "resolves against the instance counter directly".
//
// Nothing here rounds. Rounding happens once, in rounding.ts (SPECIFICATION §3.7).
//
// WHAT THE SOURCE SAYS
// --------------------
// https://wiki.leagueoflegends.com/en-us/Damage_reduction (read 2026-08-13):
//   - "Flat damage reduction does not work against true damage."
//   - "Some flat damage reductions are factored in after armor or magic resistance."
//     The page's "Flat Damage Reduction" section is split into "Pre-mitigation" and
//     "Post-mitigation" subsections.
//   - "Damage reduction from armor and magic resistance and from any other sources stack
//      multiplicatively."
//
// WHAT IS NOT MODELLED, AND WHY IT IS SAID OUT LOUD
// -------------------------------------------------
// 1. PRE-MITIGATION flat reduction — Fizz's Nimble Fighter, Amumu's Tantrum, Leona's Eclipse.
//    The wiki documents it as a distinct category applied BEFORE resistances. The frozen
//    `InstanceResult` carries `raw` -> `afterResistances` -> `afterReductions` -> `final`,
//    which has no field between the ability's raw output and the resistance step, so there is
//    nowhere honest to put it. Folding it into `raw` would make `raw` stop meaning "the
//    ability's pre-mitigation damage". RAISED TO THE LEAD; not implemented, and named in the
//    engine's `excludedMechanics` so a user sees it.
// 2. Damage AMPLIFICATION (§3.7 asks for additive and multiplicative kinds handled distinctly).
//    Out of scope for the first combo-runner deliverable; also named in `excludedMechanics`.
//
// TWO CHOICES THAT ARE ENGINE CONVENTIONS RATHER THAN SOURCED RULES. Both are reported:
//   A. The order of percentage reduction against post-mitigation flat reduction. The wiki
//      states neither order. Percentage is applied FIRST here, because the wiki groups
//      percentage modifiers with the resistance multiplier ("stack multiplicatively") and
//      describes post-mitigation flat reduction as a later, separate subtraction. On a
//      200-damage figure with 25% and 30 flat, the two readings give 120 and 127.5.
//   B. The floor at zero. Nothing states it, but negative damage would be healing, which is
//      certainly wrong. This is NOT the "minimum damage floor" that CLAUDE.md records as
//      having been investigated and not found (DATA-SOURCES §14) — that would be a floor
//      ABOVE zero, and none is applied.

import type { DamageType } from '../types';

/**
 * One post-mitigation damage-reduction rule on the defender.
 *
 * The NUMBERS always come from the caller's data. This file holds no item, rune or champion
 * value of its own.
 */
export interface DefenderDamageReduction {
  /** Shown to the user, e.g. "Bone Plating". */
  label: string;
  /** Points removed after resistances. Never applied to true damage (wiki, above). */
  flat?: number;
  /** Fraction of 1 removed after resistances: 25% is 0.25. */
  percent?: number;
  /** Damage types this rule touches. Absent means all three. */
  damageTypes?: DamageType[];
  /**
   * 1-based inclusive window, counted in DAMAGING instances. Absent means every instance.
   * Bone Plating is `{ firstInstance: 1, lastInstance: 3 }` (SPECIFICATION §5).
   *
   * Damaging, not positional: SPECIFICATION §3.4 says a non-damaging ability "occupies a
   * position in the sequence", and Bone Plating's wording is "damage from the first three
   * instances". A non-damaging ability therefore occupies a position without spending one of
   * the three. `state.ts` keeps the two counters apart for this reason.
   */
  firstInstance?: number;
  lastInstance?: number;
}

/**
 * Whether one rule applies to this instance and this damage type.
 *
 * `instanceNumber` is `null` for damage over time, which is delivered "following the combo"
 * (§3.8) and is not an instance. A rule with an instance window therefore does not reach it;
 * a rule without one does.
 */
export function reductionApplies(
  rule: DefenderDamageReduction,
  instanceNumber: number | null,
  damageType: DamageType,
): boolean {
  if (rule.damageTypes && !rule.damageTypes.includes(damageType)) return false;

  const windowed = rule.firstInstance !== undefined || rule.lastInstance !== undefined;
  if (!windowed) return true;
  if (instanceNumber === null) return false;
  if (rule.firstInstance !== undefined && instanceNumber < rule.firstInstance) return false;
  if (rule.lastInstance !== undefined && instanceNumber > rule.lastInstance) return false;
  return true;
}

/**
 * Apply every applicable reduction to a post-resistance damage figure.
 *
 * Order, per the header: percentage reductions (combined multiplicatively) first, then flat
 * reductions (summed) subtracted, then a floor at zero.
 */
export function applyDamageReductions(
  afterResistances: number,
  rules: DefenderDamageReduction[],
  instanceNumber: number | null,
  damageType: DamageType,
): number {
  const applicable = rules.filter((rule) => reductionApplies(rule, instanceNumber, damageType));

  // Percentage: multiplicative across sources. 30% and 25% leave 0.70 x 0.75 = 0.525.
  const remainingFraction = applicable.reduce(
    (product, rule) => product * (1 - (rule.percent ?? 0)),
    1,
  );

  // Flat: additive across sources, and never against true damage.
  const flatTotal =
    damageType === 'true'
      ? 0
      : applicable.reduce((sum, rule) => sum + (rule.flat ?? 0), 0);

  return Math.max(0, afterResistances * remainingFraction - flatTotal);
}
