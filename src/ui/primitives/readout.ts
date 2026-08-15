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
// **IT IS NOT THE ENGINE'S ROUNDING POINT.** Damage is rounded exactly once, in the engine, and
// `DamageValue` / `AggregateTotal` still print what they are GIVEN without rounding (§41.1). The
// underlying values the engine calculates with are untouched, and nothing rounded here is ever
// fed back into arithmetic.
//
// ═══ WHAT IT GOVERNS — WIDENED 2026-08-14, AND THE OLD SENTENCE IS GONE BECAUSE IT WOULD NOW BE
// FALSE ═══
//
// This header used to say "**IT NEVER TOUCHES A DAMAGE FIGURE**" and list readouts only: resolved
// statistics, the state snapshot, and the health figures spoken beside a burndown riser. It now
// also governs the burndown popover's four MITIGATION CHECKPOINTS (`raw`, `afterResistances`,
// `afterReductions`, `final`), which are damage figures.
//
// The distinction the old sentence was reaching for is real, and it is this: two of those
// checkpoints are the engine's unrounded WORKING values, not its output. The popover printed
// `57.91960035475755 magic damage after resistances` at a reader — the same defect, from the same
// cause, in a surface the sweep had never opened. `final` arrives already rounded by the engine,
// so rounding it here is a no-op.
//
// **The rounding is applied AT THE CALL SITE, never inside `DamageValue`.** That is what keeps
// the structural guarantee intact: no component can round a damage figure a second time, because
// the rounding is visible in the caller that chose it.

/**
 * Decimal places a readout is printed to.
 *
 * TWO, NOT ZERO: champion growth statistics are genuinely fractional — armor 41.54, attack speed
 * 0.669 — and rounding them to integers would print numbers the game does not use.
 */
export const READOUT_DECIMALS = 2;

/**
 * ═══ ATTACK SPEED IS THE ONE EXCEPTION, AND IT IS NAMED RATHER THAN A WIDENING ═══
 *
 * Ruled 2026-08-15. **The blanket rule stays at two decimals for every other figure** — it exists
 * to stop floating-point noise reaching a reader, and a third decimal on a damage total or a
 * resistance would be noise.
 *
 * Attack speed is different for a reason that is checkable rather than a matter of taste:
 *
 * - **The game's own client shows three.** The cap is stated as precisely **3.003**, and at two
 *   decimals a capped build prints "3" — a figure the game does not use, which is exactly what
 *   `READOUT_DECIMALS` was set to 2 to avoid for growth statistics in the first place.
 * - **The second decimal is not noise here, it is the signal.** Attack speed climbs about 0.017
 *   per level, so at two decimals a champion's climb from level 1 to 18 compresses and several
 *   adjacent levels print the same number. A reader stepping the level control would see nothing
 *   move — the shape of the defect fixed today, in a smaller form.
 *
 * This is deliberately a NAMED constant used at named call sites, not a parameter with a default:
 * a third decimal must be asked for by a caller that knows why, and the sweep asserting no figure
 * carries more than two decimals stays otherwise intact.
 */
export const ATTACK_SPEED_DECIMALS = 3;

/** The value a readout should print, as a number. */
export function roundReadout(value: number, decimals: number = READOUT_DECIMALS): number {
  const factor = 10 ** decimals;
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
export function formatReadout(value: number, decimals: number = READOUT_DECIMALS): string {
  return String(roundReadout(value, decimals));
}
