// Armor and magic resistance: the damage multiplier, and the fixed four-step order in
// which resistance-modifying effects apply (SPECIFICATION §3.6).
//
// Nothing in this file rounds. Rounding happens once, in rounding.ts (SPECIFICATION §3.7).

import type { DamageType } from '../types';
import type { ResistanceSteps } from '../types/result';

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
  /**
   * Percentage BONUS armor penetration, as a fraction of 1.
   *
   * A DIFFERENT EFFECT FROM `percentPenetration`, not a variant of it: it applies to the BONUS
   * portion of the target's resistance and leaves the base portion untouched. It therefore only
   * does anything when the caller states the base/bonus split, which is what
   * `resolveResistanceSteps` takes and the older single-figure `effectiveResistance` cannot.
   *
   * Magic resistance has no equivalent mechanic, and the frozen `StatBlock.penetration`
   * accordingly carries `percentBonusArmor` with no magic counterpart.
   */
  percentBonusPenetration?: number;
  /** Flat penetration — lethality on the armor side. */
  flatPenetration?: number;
}

/**
 * A target's resistance, split into the two portions the game calculates separately.
 *
 * "Base armor and bonus armor are calculated separately" —
 * https://wiki.leagueoflegends.com/en-us/Armor_penetration, read from the page's wikitext
 * through the MediaWiki API on 2026-08-13. The frozen `StatBlock` carries the same split on
 * both resistances (`armorBase`/`armorBonus`, `magicResistBase`/`magicResistBonus`) and a
 * validator rule requires the two to sum to the total.
 */
export interface SplitResistance {
  base: number;
  bonus: number;
}

/**
 * THE FIXED FOUR-STEP ORDER, REPORTED STEP BY STEP (SPECIFICATION §3.6).
 *
 * This is the one implementation of the order in the engine; `effectiveResistance` below is a
 * thin call into it, because two implementations of an ordering rule are two chances to
 * disagree. It returns the frozen `ResistanceSteps` of src/types/result.ts, which DESIGN.md §7
 * requires the burndown's popover to SHOW rather than describe.
 *
 * Everything it does is quoted from https://wiki.leagueoflegends.com/en-us/Armor_penetration,
 * read from that page's own wikitext through the MediaWiki API on 2026-08-13:
 *
 *   step 1  "Flat armor reduction stacks additively and is distributed PROPORTIONALLY between
 *            base armor and bonus armor", and it "can reduce a target's armor below zero".
 *   step 2  Percentage reduction "applies to both base and bonus armor", "stacks
 *            multiplicatively" and "is ignored if the target's armor is 0 or less".
 *   step 3  Percentage penetration applies to both portions on the same terms; percentage
 *            BONUS penetration "applies only to bonus armor", and where both are present
 *            "they stack multiplicatively" — so the bonus portion meets both factors and the
 *            base portion meets only the ordinary one.
 *   step 4  Flat penetration (lethality) "stacks additively" and "cannot be reduced below 0".
 *
 * ONE CONTRADICTION IN THE SOURCE, RESOLVED AND RECORDED. The article's lead says flat
 * reductions "affect the target's bonus amount first, then their base amount once the bonus
 * amount reaches 0 (unless noted otherwise)", while its own flat-armor-reduction section says
 * "distributed proportionally". The article's full worked example settles it: 30 flat reduction
 * against 100 base / 200 bonus armor gives "90 base and 180 bonus armor", which is proportional
 * and not bonus-first. Proportional is implemented, and `resistance-steps.test.ts` pins the
 * choice with a case where the two readings give different answers (30 against 32.5).
 */
export function resolveResistanceSteps(
  resistance: SplitResistance,
  modifiers: ResistanceModifiers,
): ResistanceSteps {
  let base = resistance.base;
  let bonus = resistance.bonus;
  const starting = base + bonus;

  // Step 1 — flat reduction, distributed proportionally. The only step permitted to take the
  // value below zero. With nothing to distribute across (a starting total of zero or less) the
  // whole subtraction lands on the base portion; there is no proportion to honour, and dropping
  // it would silently discard a reduction the caller stated.
  if (modifiers.flatReduction) {
    if (starting > 0) {
      base -= modifiers.flatReduction * (base / starting);
      bonus -= modifiers.flatReduction * (bonus / starting);
    } else {
      base -= modifiers.flatReduction;
    }
  }
  const afterFlatReduction = base + bonus;

  // Step 2 — percentage reduction. Ignored entirely at zero or less.
  if (modifiers.percentReduction && afterFlatReduction > 0) {
    base *= 1 - modifiers.percentReduction;
    bonus *= 1 - modifiers.percentReduction;
  }
  const afterPercentReduction = base + bonus;

  // Step 3 — percentage penetration, then percentage BONUS penetration on the bonus portion
  // alone. Ignored entirely at zero or less, on the same terms as step 2.
  if (afterPercentReduction > 0) {
    if (modifiers.percentPenetration) {
      base *= 1 - modifiers.percentPenetration;
      bonus *= 1 - modifiers.percentPenetration;
    }
    if (modifiers.percentBonusPenetration) {
      bonus *= 1 - modifiers.percentBonusPenetration;
    }
  }
  const afterPercentPenetration = base + bonus;

  // Step 4 — flat penetration (lethality). Stops at zero; never applied to a value that is
  // already zero or less, so it cannot claw a negative resistance back toward zero. The
  // base/bonus split is not carried past here because nothing reads it again.
  const afterFlatPenetration =
    modifiers.flatPenetration && afterPercentPenetration > 0
      ? Math.max(0, afterPercentPenetration - modifiers.flatPenetration)
      : afterPercentPenetration;

  return {
    starting,
    afterFlatReduction,
    afterPercentReduction,
    afterPercentPenetration,
    afterFlatPenetration,
    // Physical and magic resolve identically against their own resistance (§3.6), so the
    // multiplier needs no damage type — only the figure it is taken against.
    multiplier: resistanceMultiplier('physical', afterFlatPenetration),
  };
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
 * PERCENTAGE **BONUS** ARMOR PENETRATION IS NOT RESOLVABLE THROUGH THIS ENTRY POINT, and that
 * is a property of its argument rather than a gap in the engine. It applies to the bonus
 * portion of a target's armor alone, so a caller holding one total figure has not said how much
 * of it is bonus. `resolveResistanceSteps` above takes the split and resolves it in full;
 * passing `percentBonusPenetration` here correctly does nothing, rather than being quietly
 * applied to base armor as well.
 */
export function effectiveResistance(
  baseResistance: number,
  modifiers: ResistanceModifiers,
): number {
  // ONE implementation of the order, called two ways. A whole figure with no stated bonus
  // portion is all base, which is exactly what "we were not told" means here.
  return resolveResistanceSteps({ base: baseResistance, bonus: 0 }, modifiers).afterFlatPenetration;
}
