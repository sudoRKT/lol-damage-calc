// Normalising a number AT THE POINT OF INPUT.
//
// WHY THIS EXISTS. JavaScript has two zeros, `0` and `-0`, and they are indistinguishable
// on screen — both render as "0". JSON cannot tell them apart either: `JSON.stringify(-0)`
// is `"0"`. Area F's scenario↔URL encoder found the consequence: a scenario containing a
// -0 anywhere cannot round-trip exactly, so sharing it is refused. Nobody types -0 on
// purpose and nobody can see that they have.
//
// THE DECISION (project owner, 2026-08-13): the fix belongs where the value ENTERS the
// product, not where it leaves. Area F's refusal stays exactly as it is — it is the
// backstop that proves this clamp is working. Nothing downstream normalises.
//
// So: every numeric value a user types, steps, pastes or drags into this interface passes
// through `parseNumericInput` before it can reach a Scenario, and -0 becomes 0 there.

/**
 * Turn -0 into 0. Every other value, including NaN and the infinities, is returned
 * untouched — this function has exactly one job.
 *
 * `Object.is` is the only reliable test: `-0 === 0` is true, so `===` cannot see it.
 */
export function clampNegativeZero(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}

/** What reading a numeric input produced. */
export type NumericInputParse =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'not-a-number' };

/**
 * Read the raw string out of a numeric field and turn it into a number fit to store.
 *
 * Three behaviours, all tested:
 *   • `-0` (and `-0.0`, `-0e5`, and a stepped-down zero) becomes `0`.
 *   • An empty field is NOT a number and is reported as such, rather than being silently
 *     stored as 0 — a field a user has cleared is not a field holding zero.
 *   • Anything that does not parse finitely is refused rather than stored as NaN, which
 *     would render as "NaN" and poison every total downstream.
 */
export function parseNumericInput(raw: string): NumericInputParse {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, reason: 'not-a-number' };
  return { ok: true, value: clampNegativeZero(n) };
}
