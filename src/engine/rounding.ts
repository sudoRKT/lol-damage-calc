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

/** The one order the three damage types are walked in here, so apportionment is deterministic. */
const SPLIT_ORDER = ['physical', 'magic', 'true'] as const;
type SplitKey = (typeof SPLIT_ORDER)[number];
export type DamageSplit = Record<SplitKey, number>;

/**
 * Round a per-type split AND its total so that **the three parts always sum to the whole**.
 *
 * ADDED 2026-08-13, AND IT FIXES A REAL INCONSISTENCY RATHER THAN ADDING A FEATURE. Rounding the
 * total and each type independently does not commute: a split of 166.5 / 166.5 / 167 rounds to
 * 167 / 167 / 167 = 501 under a total of 500. DESIGN.md §8 has the composition bar break the
 * total DOWN, so a bar whose segments sum to more than the number printed above it is the defect
 * §41.2 records — "the values and the tags were right and the bar said something else, which is
 * worse than no bar." The engine reported `burst.total` and `burst.byType` this way, and nothing
 * had run the audit over engine output to notice.
 *
 * THIS IS NOT A SECOND ROUNDING RULE AND IT DOES NOT WEAKEN §41.1. The total is still
 * `roundDamage` of the UNROUNDED sum — never a sum of rounded parts, so rounding still cannot
 * accumulate across a combo. What changes is only how the whole is divided for display: by the
 * largest-remainder method, which gives every type either the floor or the ceiling of its own
 * unrounded value and hands the leftover points to the types that came closest to earning one.
 * No type moves by as much as a full point from what it actually dealt.
 *
 * Ties go to the fixed type order above, so the same input always produces the same output.
 */
export function roundSplit(split: DamageSplit): { total: number; byType: DamageSplit } {
  const exact = split.physical + split.magic + split.true;
  const total = roundDamage(exact);

  const floors = SPLIT_ORDER.map((k) => Math.floor(split[k]));
  let leftover = total - (floors[0]! + floors[1]! + floors[2]!);

  // Hand out the leftover points to the largest fractional remainders first. `leftover` is 0..3
  // for any well-formed split; a negative one can only arise from a negative component, which
  // this engine does not produce, and is handled by taking points back the same way.
  const order = SPLIT_ORDER.map((k, i) => ({ i, remainder: split[k] - floors[i]! }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);

  const out = [...floors];
  for (const { i } of order) {
    if (leftover <= 0) break;
    out[i] = out[i]! + 1;
    leftover -= 1;
  }
  for (const { i } of [...order].reverse()) {
    if (leftover >= 0) break;
    out[i] = out[i]! - 1;
    leftover += 1;
  }

  return {
    total,
    byType: { physical: out[0]!, magic: out[1]!, true: out[2]! },
  };
}
