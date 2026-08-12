// Critical strike (SPECIFICATION §3.7, "Critical strike chance and critical damage,
// including item-specific critical modifiers").
//
// The specification does not state the multiplier, so it is taken from the League wiki,
// https://wiki.leagueoflegends.com/en-us/Critical_strike, read 2026-08-12:
//   - "A critical strike is a damage event that deals 200% of its normal value by default".
//   - Patch history: "From its inception, critical strikes did 200% damage before being
//     changed to 175% in V10.23. It would later be reverted to 200% again in V26.01."
//   - Bonus critical strike damage "stacks additively".
//   - "AverageDamage(DamageBase) = DamageBase x (1 + CritChance x (CritMod - 1))"
// Confirmed against https://wiki.leagueoflegends.com/en-us/V26.01 (released 2026-01-08,
// read 2026-08-12): "Base critical strike damage increased to 200% from 175%."
//
// NOTE for the lead: the frozen StatBlock in src/types/result.ts comments critDamage as
// "multiplier, e.g. 1.75", which was the pre-V26.01 value. The base is 2 as of the current
// patch. Nothing here depends on that comment — the multiplier is always passed in — but
// the example in the type may want revisiting.

/**
 * The base critical strike multiplier: a critical strike deals 200% of the normal figure.
 * Wiki, read 2026-08-12; set by V26.01 (2026-01-08).
 */
export const BASE_CRITICAL_STRIKE_MULTIPLIER = 2;

/**
 * The multiplier a critical strike is scaled by, given bonus critical strike damage from
 * items and other sources.
 *
 * Bonus critical strike damage stacks ADDITIVELY, so 35% and 10% together are +45% on top
 * of the base 200%, giving 245% — not 200% x 1.35 x 1.10. The caller adds its sources up
 * and passes one total.
 *
 * @param bonusCriticalDamage Total bonus critical strike damage as a fraction of 1
 *                            (35% is 0.35). Defaults to none.
 */
export function criticalStrikeMultiplier(bonusCriticalDamage = 0): number {
  return BASE_CRITICAL_STRIKE_MULTIPLIER + bonusCriticalDamage;
}

/**
 * Apply a critical strike to one damage figure.
 *
 * Deterministic on purpose: whether the instance crits is a decision the combo makes (the
 * Scenario allows a per-step `forceCrit` option), not a dice roll. The engine never
 * randomises.
 *
 * Full precision is kept; rounding happens once, in rounding.ts (SPECIFICATION §3.7).
 */
export function applyCriticalStrike(
  damage: number,
  isCriticalStrike: boolean,
  multiplier: number,
): number {
  return isCriticalStrike ? damage * multiplier : damage;
}

/**
 * The expected (average) damage of an instance that crits some of the time, from the wiki's
 * own formula: AverageDamage = DamageBase x (1 + CritChance x (CritMod - 1)).
 *
 * This is an average across many instances, not what any single instance deals. It must
 * never be presented as the damage of one hit.
 *
 * @param critChance Chance as a fraction of 1 (50% is 0.5).
 */
export function averageDamageWithCrit(
  damage: number,
  critChance: number,
  multiplier: number,
): number {
  return damage * (1 + critChance * (multiplier - 1));
}
