// ATTACK SPEED — a champion's base figure, its growth with level, its ratio, and the two caps.
//
// ═══ WHY THIS FILE EXISTS ═══
//
// Until 2026-08-15 the engine resolved attack speed as `as_base * (1 + itemBonus)`. That is wrong
// in three separate ways at once, and the first of them is wrong for every champion above level 1:
//
//   1. THERE WAS NO LEVEL TERM. `as_lvl` is fetched, schema-required, bounds-checked and watched by
//      the patch pipeline, and nothing in `src/` read it. A level-18 champion was shown its level-1
//      attack speed.
//   2. THE RATIO WAS IGNORED. Bonuses are multiplied by `as_ratio`, not by `as_base`. The two are
//      equal for most champions, which is exactly why ignoring it is easy to miss and impossible to
//      notice on screen.
//   3. NEITHER CAP WAS APPLIED.
//
// ═══ THE SOURCE ═══
//
// https://wiki.leagueoflegends.com/en-us/Attack_speed, read 2026-08-15. Quoted where used:
//
//   "Let: b be the unit's base attack speed, m be the unit's attack speed ratio, x be the sum of
//    all attack speed bonuses on the unit, y be the unit's total attack speed. Then the total
//    attack speed is calculated through the equation y=mx+b which is a linear equation of attack
//    speed in terms of its bonuses."
//
//   "The ratio, which modifies the effectiveness of all attack speed bonuses to the actual attack
//    speed by a percentage."
//
//   "The growth coefficient (gained by leveling up) which is uniquely considered bonus attack
//    speed."   ... "At level 10, he would have gained 2.5% × 9 × (0.7025 + 0.0175 × 9) = 19.35%
//    bonus attack speed."   [Twisted Fate, growth coefficient 2.5%]
//
//   "Most champions' base attack speed and attack speed ratio are equal, meaning m can be replaced
//    with b, resulting in the equation y=b(x+1)"
//
//   "The maximum attack speed that units can have is precisely 3.003, or 1 basic attack per 0.333
//    seconds. The minimum attack speed that units can have is precisely 0.2, or 1 basic attack per
//    5 seconds."
//
// ═══ THE TWO CONSEQUENCES THAT ARE EASIEST TO GET WRONG ═══
//
// - GROWTH IS A BONUS, NOT AN INCREASE TO THE BASE. It therefore goes into x, where the ratio
//   multiplies it, rather than being added to b. For a champion whose ratio differs from its base
//   these give different answers, and levelling is worth `ratio × growth`, never `base × growth`.
// - THE CAPS ARE ON THE TOTAL. The article states them as limits on what "units can have", i.e. on
//   y, so they are applied last — after level growth and items have been summed into x.
//
// ═══ WHAT THIS DELIBERATELY DOES NOT DO (SPECIFICATION §3.2) ═══
//
// Attack speed here is a DISPLAYED STATISTIC and nothing else. The engine models sequence, not
// elapsed time, so nothing in this file may be used to work out how many basic attacks fit into a
// window — no attacks per second times a duration, no attack counts, no ticking. Adding a term to
// the stat panel is not the same as opening that door, and it must not become it.

import { growthMultiplier } from './champion-stats';

/**
 * The highest attack speed a unit can have: "precisely 3.003, or 1 basic attack per 0.333 seconds"
 * (Attack speed, read 2026-08-15).
 */
export const ATTACK_SPEED_MAXIMUM = 3.003;

/**
 * The lowest attack speed a unit can have: "precisely 0.2, or 1 basic attack per 5 seconds"
 * (Attack speed, read 2026-08-15). It binds only when something slows attack speed; nothing in
 * this engine does yet, so today it is a guard rather than a live rule.
 */
export const ATTACK_SPEED_MINIMUM = 0.2;

/**
 * The bonus attack speed a champion has gained purely from levelling, as a FRACTION.
 *
 * `growthPercentPerLevel` is the champion's `as_lvl`, stated in PERCENTAGE POINTS — 2.5 means 2.5%.
 * Two independent confirmations of that unit, since reading it as a fraction would understate every
 * champion by a hundredfold:
 *   - the article's worked example multiplies the coefficient 2.5 straight into a percentage
 *     ("2.5% × 9 × (…) = 19.35% bonus attack speed");
 *   - the article states growth coefficients "range from 0.5% to 6% in champions", and the
 *     fetcher's own bounds evidence records the stored roster spread as 0 to 6 with the unit
 *     "attack speed growth (percent per level)" (scripts/fetch/bounds.ts, read 2026-08-15).
 *
 * The bracket is the SAME non-linear growth every per-level statistic uses — see champion-stats.ts.
 * The article writes it out in full for attack speed, so this is the article's own arithmetic and
 * not an assumption carried over from health.
 */
export function bonusAttackSpeedFromLevel(growthPercentPerLevel: number, level: number): number {
  // A level outside 1..18 is refused rather than extrapolated, matching `championStatAtLevel`,
  // which is where every other per-level statistic is refused. The check lives here because
  // `growthMultiplier` itself does no range checking — a first draft of this function said it did,
  // and the test above is what said otherwise.
  if (!Number.isInteger(level) || level < 1 || level > 18) {
    throw new RangeError(`champion level must be an integer 1..18, got ${level}`);
  }
  return (growthPercentPerLevel / 100) * growthMultiplier(level);
}

/** Everything needed to resolve one champion's attack speed. */
export interface AttackSpeedInput {
  /** `as_base` — b, the champion's base attack speed. */
  base: number;
  /** `as_ratio` — m, the multiplier applied to every bonus. Not always equal to `base`. */
  ratio: number;
  /** `as_lvl` — the growth coefficient, in percentage points per level. */
  growthPercentPerLevel: number;
  /** 1..18. */
  level: number;
  /**
   * Every OTHER source of bonus attack speed, summed, as a fraction — items today, runes and
   * abilities when they are modelled. Data Dragon states `PercentAttackSpeedMod` as a fraction
   * already (0.25 for a 25% item), which is the unit this expects.
   */
  bonusFromSources: number;
}

/** A resolved attack speed, with the working left visible. */
export interface ResolvedAttackSpeed {
  /** y, after the caps. This is the figure a user is shown. */
  total: number;
  /** y before the caps, kept so a capped build can be told it is capped rather than just clipped. */
  uncapped: number;
  /**
   * x — the sum of every bonus, as a fraction, level growth included.
   *
   * NAMED AND RETURNED DELIBERATELY. "Bonus attack speed" in an ability's text is this percentage,
   * not the difference between two attack-speed figures — so an ability reading "per 100% bonus
   * attack speed" reads x, and anything computing it as `total - base` would be wrong by a factor
   * of the ratio. Nothing consumes it yet; it exists so that whoever wires such an ability does not
   * have to decide what the phrase means.
   */
  bonus: number;
  /** Which cap bound, if either. */
  capped: 'maximum' | 'minimum' | null;
}

/**
 * A champion's total attack speed: y = mx + b, capped to [0.2, 3.003].
 *
 * EFFECTS THAT RAISE OR REMOVE THE CEILING ARE NOT MODELLED. The article notes that "some effects
 * are allowed to modify these values" and names a handful of champion abilities and one rune. None
 * of them is harvested, so a build carrying one is shown 3.003 where the game would show more.
 */
export function resolveAttackSpeed(input: AttackSpeedInput): ResolvedAttackSpeed {
  const bonus = bonusAttackSpeedFromLevel(input.growthPercentPerLevel, input.level)
    + input.bonusFromSources;

  // y = mx + b. The ratio multiplies the bonuses only; the base is added afterwards and is never
  // scaled by anything.
  const uncapped = input.base + input.ratio * bonus;

  if (uncapped > ATTACK_SPEED_MAXIMUM) {
    return { total: ATTACK_SPEED_MAXIMUM, uncapped, bonus, capped: 'maximum' };
  }
  if (uncapped < ATTACK_SPEED_MINIMUM) {
    return { total: ATTACK_SPEED_MINIMUM, uncapped, bonus, capped: 'minimum' };
  }
  return { total: uncapped, uncapped, bonus, capped: null };
}
