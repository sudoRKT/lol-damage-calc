// SHIELDS, ALL THREE KINDS (SPECIFICATION §3.7: "Shields, separated into physical, magic, and
// general").
//
// Nothing here rounds. Rounding happens once, in rounding.ts.
//
// WHAT THE SOURCE SAYS. https://wiki.leagueoflegends.com/en-us/Shield, read from the page's own
// wikitext through the MediaWiki API on 2026-08-13
// (api.php?action=query&prop=revisions&titles=Shield&rvslots=main&rvprop=content):
//
//   "Shields are an addition of hit-points that absorb damage in place of actual health."
//   "The unit's resistances (armor and magic resistance) will still mitigate the damage before
//    being absorbed by shielding."
//   "Normal shields: They absorb all types of damage (physical, magic and true)."
//   "Magic shields: They only absorb magic damage."
//   "Physical shields: They only absorb physical damage."
//
// A SHIELD IS NOT A DAMAGE REDUCTION, and the difference shows on true damage: flat damage
// reduction "does not work against true damage" (Damage modifier article), while a normal
// shield absorbs it. Modelling one as the other would be wrong for every true-damage instance
// in the game.
//
// THE ONE THING THE SOURCE STATES AND THIS ENGINE CANNOT HONOUR
// ------------------------------------------------------------
// "When shielded from multiple sources, damage taken is mitigated by the shield that will
//  EXPIRE THE SOONEST, with the exceptions of Camille's Adaptive Defenses and Morgana's Black
//  Shield, which take priority over all other shields."
//
// Expiry is a TIME, and SPECIFICATION §3.2 fixes that this engine has no time dimension: "the
// engine models sequence, not elapsed time ... nothing decays between instances". There is
// therefore no way to evaluate "expires soonest" here, and inventing durations would be
// inventing data. Shields are spent in THE ORDER THE SCENARIO LISTS THEM — the user's own
// order, and the only ordering fact available. It is disclosed in `ENGINE_EXCLUSIONS` so a user
// sees that one part of their result rests on a convention. It only ever matters when two
// shields of DIFFERENT kinds are up at once and the damage breaks through the first.
//
// NOT MODELLED HERE, and named in `ENGINE_EXCLUSIONS` rather than approximated:
//   - Shield strength being raised by heal and shield power. That is a stat the frozen
//     `StatBlock` does not carry, so the caller states the shield's final strength.
//   - Shield reduction (Serpent's Fang) and shield destruction (Renekton's empowered W, and
//     executes). Both are effects on the shield rather than on the damage; the caller states
//     the remaining strength.

import type { DamageType } from '../types';

/** The three kinds the wiki names. `general` is the article's "normal" shield. */
export type ShieldKind = 'general' | 'physical' | 'magic';

/** One shield on the defender, with what it has left. Strength always comes from the caller. */
export interface ShieldPool {
  /** Shown to the user, e.g. "Barrier". */
  label: string;
  kind: ShieldKind;
  /** Points of damage it can still absorb. Never negative. */
  remaining: number;
}

/** What one call to `applyShields` did. */
export interface ShieldOutcome {
  /** Damage that reached health. */
  applied: number;
  /** Damage the shields took instead. */
  absorbed: number;
  /** The pools AFTER absorbing — a new array; the input is never modified. */
  pools: ShieldPool[];
  /** Itemised, so a breakdown can name which shield took what. */
  byShield: Array<{ label: string; absorbed: number }>;
}

/** Whether a shield of this kind stops damage of this type (the three quotes above). */
export function absorbsDamageType(kind: ShieldKind, damageType: DamageType): boolean {
  if (kind === 'general') return true;
  return kind === damageType;
}

/**
 * Absorb a post-mitigation damage figure through the defender's shields, in list order.
 *
 * `damage` must already have met armor or magic resistance — the wiki is explicit that
 * resistances mitigate first. The returned pools are new objects, so a snapshot taken against
 * an earlier instance keeps reading as that instance.
 */
export function applyShields(
  pools: ShieldPool[],
  damageType: DamageType,
  damage: number,
): ShieldOutcome {
  let remainingDamage = damage;
  const nextPools: ShieldPool[] = [];
  const byShield: Array<{ label: string; absorbed: number }> = [];

  for (const shield of pools) {
    if (remainingDamage <= 0 || shield.remaining <= 0 || !absorbsDamageType(shield.kind, damageType)) {
      nextPools.push({ ...shield });
      continue;
    }
    const absorbed = Math.min(shield.remaining, remainingDamage);
    remainingDamage -= absorbed;
    nextPools.push({ ...shield, remaining: shield.remaining - absorbed });
    byShield.push({ label: shield.label, absorbed });
  }

  return {
    applied: remainingDamage,
    absorbed: damage - remainingDamage,
    pools: nextPools,
    byShield,
  };
}

/** Total strength still standing across every shield. For the per-instance state snapshot. */
export function totalShieldRemaining(pools: ShieldPool[]): number {
  return pools.reduce((sum, shield) => sum + shield.remaining, 0);
}
