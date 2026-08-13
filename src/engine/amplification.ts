// DAMAGE AMPLIFICATION (SPECIFICATION §3.7: "Damage amplification, with additive and
// multiplicative amplification handled distinctly").
//
// Nothing here rounds. Rounding happens once, in rounding.ts.
//
// THE TWO KINDS ARE TWO MECHANICS, NOT TWO SETTINGS
// -------------------------------------------------
// https://wiki.leagueoflegends.com/en-us/Damage_modifier, read from the page's own wikitext
// through the MediaWiki API on 2026-08-13
// (api.php?action=query&prop=revisions&titles=Damage%20modifier&rvslots=main&rvprop=content):
//
//   "Damage dealt modifier ... The RAW value from the attack or ability is increased or
//    decreased by the modifier and then applied to the target. All damage modifiers stack
//    ADDITIVELY."
//   "Damage received modifier ... The FINAL value from the attack or ability is increased or
//    decreased by the modifier and then directly applied to the target's health."
//   "Damage reduction from armor and magic resistance and from any other sources stack
//    MULTIPLICATIVELY."
//   Patch history, V26.09: "Undocumented: Modifiers to damage dealt now stack additively
//    instead of multiplicatively." / "Modifiers to damage received still stack
//    multiplicatively."
//   "Damage modifiers may also only affect specific damage sub-types (physical, magic, or
//    true)."
//
// So the two kinds differ in BOTH respects, and the difference is the point: the same two
// figures, 20% and 15%, give 1.35 on the attacker's side and 1.38 on the defender's.
//
// WHERE EACH IS APPLIED, which is a consequence of the quotes above rather than a choice:
//   dealt    -> multiplies the RAW figure, alongside critical strike, before mitigation.
//   received -> joins the multiplicative percentage step that produces `afterReductions`,
//               after armor or magic resistance and before post-mitigation flat reduction.
//
// TWO THINGS THIS FILE DOES NOT DO, both stated rather than guessed:
//   - It does not know Ignite and Smite are exempt. The article lists them under "Exceptions:
//     The following sources of damage are not affected by damage modifiers". That is a fact
//     about a SOURCE of damage, which reaches the engine as data, so the layer above simply
//     does not attach a modifier to those instances.
//   - It does not model V26.09's "Damage amplifiers are now dealt as a separate damage
//     instance". The engine models a combo as the instances the user built (§3.1); splitting
//     one instance into two would change what the interface shows for reasons no user stated.

import type { DamageType } from '../types';

/** A modifier on damage the ATTACKER deals. Signed: +0.2 is 20% more, -0.3 is 30% less. */
export interface DamageDealtModifier {
  /** Shown to the user, e.g. "Conqueror". */
  label: string;
  /** Fraction of 1, signed. */
  percent: number;
  /** Damage types this modifier touches. Absent means all three, true damage included. */
  damageTypes?: DamageType[];
}

/** A modifier on damage the DEFENDER receives. Same shape, different stacking rule. */
export interface DamageReceivedModifier {
  label: string;
  percent: number;
  damageTypes?: DamageType[];
}

function applies(
  modifier: { damageTypes?: DamageType[] },
  damageType: DamageType,
): boolean {
  return !modifier.damageTypes || modifier.damageTypes.includes(damageType);
}

/**
 * The attacker's amplification, as ONE multiplier on the raw figure. Additive across sources.
 *
 * The floor at zero is an ENGINE CONVENTION and is not sourced: the additive rule taken past a
 * 100% decrease gives a negative multiplier, and negative damage would be healing.
 */
export function dealtModifierMultiplier(
  modifiers: DamageDealtModifier[],
  damageType: DamageType,
): number {
  const sum = modifiers
    .filter((m) => applies(m, damageType))
    .reduce((total, m) => total + m.percent, 0);
  return Math.max(0, 1 + sum);
}

/**
 * The defender's amplification, as ONE multiplier on the post-resistance figure. Multiplicative
 * across sources, which is what the article says of everything in this family.
 *
 * Same unsourced floor at zero, for the same reason.
 */
export function receivedModifierMultiplier(
  modifiers: DamageReceivedModifier[],
  damageType: DamageType,
): number {
  return modifiers
    .filter((m) => applies(m, damageType))
    .reduce((product, m) => product * Math.max(0, 1 + m.percent), 1);
}
