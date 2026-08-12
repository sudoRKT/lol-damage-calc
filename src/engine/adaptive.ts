// Adaptive force resolution (SPECIFICATION §3.7, "Adaptive force resolution, selecting
// between bonus attack damage and ability power").
//
// The specification does not state the rule, so it is taken from the League wiki's
// mechanics article, https://wiki.leagueoflegends.com/en-us/Adaptive_force, read
// 2026-08-12:
//   - "1 point of Adaptive Force provides 0.6 bonus AD or 1 AP."
//   - Which of the two is granted depends on "the current amount of bonus attack damage and
//     ability power of the champion": higher bonus AD grants attack damage, higher AP
//     grants ability power.
//   - "If the bonus attack damage and the ability power of the unit are equal, the stat
//     granted depends on the adaptive type of the champion."

import type { AdaptiveType } from '../types';

/** 1 point of adaptive force is 0.6 bonus attack damage (wiki, read 2026-08-12). */
export const ADAPTIVE_BONUS_AD_PER_POINT = 0.6;

/** 1 point of adaptive force is 1 ability power (wiki, read 2026-08-12). */
export const ADAPTIVE_AP_PER_POINT = 1;

/** The two stats compared to decide which way adaptive force resolves. */
export interface AdaptiveComparison {
  /** BONUS attack damage only — base attack damage is not part of the comparison. */
  bonusAttackDamage: number;
  abilityPower: number;
}

/** What a quantity of adaptive force resolved into. */
export interface AdaptiveResolution {
  /** Which side won the comparison: 'Physical' means attack damage, 'Magic' means AP. */
  granted: AdaptiveType;
  /** Bonus attack damage granted — zero when the resolution went to ability power. */
  bonusAttackDamage: number;
  /** Ability power granted — zero when the resolution went to attack damage. */
  abilityPower: number;
}

/**
 * Resolve a quantity of adaptive force into either bonus attack damage or ability power.
 *
 * @param adaptiveForce  Points of adaptive force to convert.
 * @param comparison     The champion's current bonus attack damage and ability power. The
 *                       caller decides what goes in here, because the wiki notes that stats
 *                       granted by passive effects do not count toward the comparison
 *                       (with named exceptions). That exclusion list is per-item data and
 *                       belongs in the curated layer, not in this arithmetic.
 * @param adaptiveType   The champion's own adaptive type, used only to break an exact tie.
 */
export function resolveAdaptiveForce(
  adaptiveForce: number,
  comparison: AdaptiveComparison,
  adaptiveType: AdaptiveType,
): AdaptiveResolution {
  let granted: AdaptiveType;

  if (comparison.bonusAttackDamage > comparison.abilityPower) {
    granted = 'Physical';
  } else if (comparison.abilityPower > comparison.bonusAttackDamage) {
    granted = 'Magic';
  } else {
    // Exactly equal — including the 0 / 0 case for a champion with neither stat.
    granted = adaptiveType;
  }

  if (granted === 'Physical') {
    return {
      granted,
      bonusAttackDamage: adaptiveForce * ADAPTIVE_BONUS_AD_PER_POINT,
      abilityPower: 0,
    };
  }

  return {
    granted,
    bonusAttackDamage: 0,
    abilityPower: adaptiveForce * ADAPTIVE_AP_PER_POINT,
  };
}
