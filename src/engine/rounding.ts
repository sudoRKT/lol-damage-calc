// THE single rounding point (SPECIFICATION §3.7).
//
// §3.7: "Rounding behaviour is fixed and documented at a single point in the engine, so
// that accumulated rounding across a multi-instance combo remains consistent with
// in-client values."
//
// This file is that single point. Nothing else in the engine may round, truncate, or
// otherwise reduce the precision of a damage figure.
//
// WHAT THE GAME ACTUALLY DOES, AND WHAT IS NOT KNOWN
// -------------------------------------------------
// The League wiki documents that the game holds these values as decimals and rounds only
// for DISPLAY, and that the display rule differs per statistic — health rounds up, mana
// rounds down, and armor / magic resistance / attack damage / ability power round to the
// nearest integer (https://wiki.leagueoflegends.com/en-us/Champion_statistic and
// https://wiki.leagueoflegends.com/en-us/Health, both read 2026-08-12).
//
// No single, game-wide rule for rounding a DAMAGE figure is documented anywhere on the
// wiki's damage or mechanics articles. Searched on 2026-08-12:
//   https://wiki.leagueoflegends.com/en-us/Damage
//   https://wiki.leagueoflegends.com/en-us/Damage_modifier
// The "Calculating mitigation" and "Calculating applied damage" sections of the Damage
// article contain no formula at all — they are cross-references to Armor, Magic resistance
// and Shields.
//
// So the DIRECTION of rounding below is an engine convention, not a sourced game rule. Per
// CLAUDE.md that makes any figure whose value depends on it `derived`, never `verified`.
// The convention is deliberately conservative in two ways:
//   1. It is applied ONLY at the reporting boundary. Rounded output is never fed back into
//      further arithmetic, so rounding cannot accumulate across a combo.
//   2. It rounds half away from zero, which is what a person doing the arithmetic on paper
//      does, rather than banker's rounding, which would surprise a reader comparing the
//      engine against a hand calculation.

/**
 * Round a damage figure to whole points, half away from zero.
 *
 * This is the ONLY place the engine reduces precision. Call it once, at the moment a
 * figure is put into a Result for display; never in the middle of a calculation.
 *
 * Examples: 826.44 -> 826, 826.6 -> 827, 2.5 -> 3.
 */
export function roundDamage(value: number): number {
  // Math.round in JavaScript rounds half UP (toward positive infinity), so for a negative
  // half-value it would give -2.5 -> -2 rather than -3. Damage figures are not negative in
  // this engine, but the sign is handled explicitly so the rule holds whatever is passed.
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
