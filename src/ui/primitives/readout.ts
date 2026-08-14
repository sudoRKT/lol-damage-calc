// DISPLAY ROUNDING FOR A READOUT — and never for a damage figure.
//
// ═══ WHAT WENT WRONG, AND WHERE ═══
//
// Loading the composed page in a real browser on 2026-08-14 put these in front of a reader:
//
//     Armor                     41.540000000000006 (41.540000000000006 + 0)
//     State at this point       … Defender current hp 1019.1803996452423 …
//     (spoken, riser)           … Health 625.95 down to 217.95000000000005 of 1549.95 …
//     (spoken, stat block)      129.98874999999998, 49.988749999999996 base plus 80 bonus
//
// Every one of them is the engine's own working value, printed raw. None is arithmetically wrong:
// they are the exact binary results of sums like `21.6 + 4 × 4.985`. That is what makes them
// dangerous — fourteen digits of floating-point noise in a product whose only claim is that its
// numbers are right reads as either a bug or fake precision, and a reader cannot tell which.
//
// **THREE COMPONENTS HAD THE SAME DEFECT AND NO TEST SAW ANY OF THEM**, because every UI test in
// this area ran against `MOCK_RESULT`, whose figures are whole numbers by construction. A fixture
// tidier than the data hides exactly the class of defect untidy data produces. Two of the four
// sites were in SPOKEN strings, which no amount of looking at the page would ever have caught.
//
// So the rule lives in ONE place, every readout goes through it, and
// `../app/rendered-figures.test.tsx` sweeps all 173 champions' rendered result surfaces for any
// figure that did not.
//
// ═══ WHAT THIS IS NOT ═══
//
// **IT IS NOT THE ENGINE'S ROUNDING POINT AND IT NEVER TOUCHES A DAMAGE FIGURE.** Damage is
// rounded exactly once, in the engine, and `DamageValue` / `AggregateTotal` still print what they
// are given without rounding (§41.1). This governs READOUTS ONLY: resolved statistics, the state
// snapshot, and the health figures spoken beside a burndown riser. The underlying values the
// engine calculates with are untouched.

/**
 * Decimal places a readout is printed to.
 *
 * TWO, NOT ZERO: champion growth statistics are genuinely fractional — armor 41.54, attack speed
 * 0.669 — and rounding them to integers would print numbers the game does not use.
 */
export const READOUT_DECIMALS = 2;

/** The value a readout should print, as a number. */
export function roundReadout(value: number): number {
  const factor = 10 ** READOUT_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * The value a readout should print, as a plain string with NO thousands grouping.
 *
 * Grouping is left out deliberately: this is the form used in spoken strings, and the visible
 * form's thin space between thousands can be read by a screen reader as a pause or as two
 * separate numbers. A visible readout composes `formatDamage(roundReadout(v))` instead, so the
 * grouping rule still has exactly one implementation.
 */
export function formatReadout(value: number): string {
  return String(roundReadout(value));
}
