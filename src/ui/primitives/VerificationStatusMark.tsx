// The verification status mark — glyph plus label, never a colour.
//
// SPECIFICATION §8 defines FOUR statuses in the data (`verified` / `derived` /
// `incomplete` / `no-damage`) and requires that `incomplete` be shown two different ways
// depending on whether the missing fact is PENDING (nobody has extracted it yet) or
// PERMANENT (no source states it, so nobody ever can). That makes FIVE display states, and
// DESIGN.md §6 now carries a glyph and a label for all five.
//
// TWO RULES THIS COMPONENT EXISTS TO HOLD:
//
// 1. NEVER COLOURED. DESIGN.md §1 reserves hue for damage data, and §6 admits no exception
//    for status: "a verified figure and a derived figure must never differ by turning
//    something green or amber." All five states share one colour and one type role. Every
//    distinction between them is glyph and label, so they are fully readable in greyscale.
//
// 2. DERIVED IS THE NORMAL STATE AND IS STYLED AS SUCH. Same size, weight and colour as
//    Verified — no italic, no parenthesis, no caution mark, nothing that reads as a
//    shortfall (DESIGN.md §6, SPECIFICATION §8). There is deliberately no per-state CSS
//    rule in primitives.css, which is what makes that structural rather than a promise.
//
// A note on what the accessible name carries. For four of the five states the label IS the
// accessible name — short, and repeated once per row in a dense table, so padding it with
// evidence prose would make the table unusable with a screen reader. The exception is
// "Cannot be completed", where SPECIFICATION §8 requires the note to name the missing fact
// rather than warn generically: there, and only there, the accessible name is extended
// with WHY no source settles it.

import type { IncompleteReason, VerificationStatus } from '../../types';
import './primitives.css';

/** The five display states. Four come from the data; `incomplete` splits into two. */
export type VerificationDisplayState =
  | 'verified'
  | 'derived'
  | 'incomplete-pending'
  | 'incomplete-permanent'
  | 'no-damage';

interface StateStyle {
  glyph: string;
  label: string;
}

/**
 * DESIGN.md §6, read literally. The dot's FILL is the evidence scale and nothing else may
 * be added to that axis; `–` takes no dot at all because there is nothing to have evidence
 * about.
 *
 * `⊘` (U+2298) carries its own strike as part of the character, so the permanent state
 * needs no text-decoration, no second element and no font weight — it survives greyscale
 * and 11px on the strength of the glyph alone.
 */
export const STATE_STYLE: Record<VerificationDisplayState, StateStyle> = {
  verified: { glyph: '●', label: 'Verified' }, // ● filled dot
  derived: { glyph: '◐', label: 'Derived' }, // ◐ half dot
  'incomplete-pending': { glyph: '○', label: 'Not yet modelled' }, // ○ open dot
  'incomplete-permanent': { glyph: '⊘', label: 'Cannot be completed' }, // ⊘ struck
  'no-damage': { glyph: '–', label: 'No damage' }, // – en dash, no dot
};

/**
 * Which of the five display states a data status resolves to.
 *
 * The split comes straight off the frozen contract: `InstanceResult.incompleteReason` and
 * `DotSource.incompleteReason` carry `kind: 'pending' | 'permanent'` (src/types/result.ts),
 * which is the difference between "nobody has got to it yet" and "nobody can ever finish
 * it". An `incomplete` entry with no reason at all is treated as pending, because that is
 * the weaker of the two claims and it is not this component's place to assert the stronger
 * one on missing evidence.
 *
 * Throws if a reason arrives on a status other than `incomplete`. The contract states the
 * reason is present ONLY when `verification` is 'incomplete'; a caller that broke that
 * pairing would render a mark claiming the wrong thing, so it fails loudly.
 */
export function resolveDisplayState(
  status: VerificationStatus,
  reason?: IncompleteReason,
): VerificationDisplayState {
  if (reason !== undefined && status !== 'incomplete') {
    throw new Error(
      `VerificationStatusMark: status '${status}' was given an incompleteReason. Only ` +
        `'incomplete' may carry one (src/types/result.ts). Fix the caller.`,
    );
  }

  switch (status) {
    case 'verified':
      return 'verified';
    case 'derived':
      return 'derived';
    case 'no-damage':
      return 'no-damage';
    case 'incomplete':
      return reason?.kind === 'permanent' ? 'incomplete-permanent' : 'incomplete-pending';
    default: {
      const never: never = status;
      throw new Error(`VerificationStatusMark: unknown verification status ${String(never)}`);
    }
  }
}

/**
 * The extra words an incomplete mark adds to its accessible name.
 *
 * SPECIFICATION §8 requires incomplete to be "presented as a deliberate refusal, naming
 * what is missing" — so BOTH kinds carry their detail, not just the permanent one. Pending
 * appends its `note`; permanent appends each missing fact.
 *
 * For a permanent reason it prefers each `Unresolvable.why` — plain-English prose written
 * for exactly this note. If an entry has no `why` it falls back to naming the missing
 * `field`, because a specific field path is still a named missing fact and a generic
 * warning is not. It returns an empty string only when the caller supplied neither, which
 * is a data defect rather than a state this component invents copy for.
 */
export function incompleteDetailSuffix(reason: IncompleteReason | undefined): string {
  if (!reason) return '';

  if (reason.kind === 'pending') {
    const note = reason.note?.trim();
    return note ? ` — ${note}` : '';
  }

  const facts = (reason.missingFacts ?? [])
    .map((u) => (u.why && u.why.trim() ? u.why.trim() : u.field && u.field.trim()))
    .filter((s): s is string => Boolean(s));
  return facts.length === 0 ? '' : ` — ${facts.join('; ')}`;
}

export interface VerificationStatusMarkProps {
  /** The status as the data records it (src/types/data.ts). */
  status: VerificationStatus;
  /**
   * Why the entry is incomplete, straight off `InstanceResult` / `DotSource`. `permanent`
   * selects the `⊘` state and its `missingFacts` become part of the accessible name;
   * `pending` selects `○` and its `note` does. Only valid with `incomplete`.
   */
  reason?: IncompleteReason;
  /** What the status is about, e.g. "W — Infernal Chains". Spoken, not shown. */
  spokenSubject?: string;
}

/**
 * Glyph plus label, in `--text-secondary`, for all five verification states.
 *
 * The glyph is `aria-hidden` because it duplicates the visible label; the label is real
 * text, so the accessible name needs no `aria-label` and cannot drift away from what is
 * on screen. There is no option to hide the label: DESIGN.md §6 specifies "a neutral glyph
 * plus a text label", and a glyph alone would be a shape-only signal.
 */
export function VerificationStatusMark({
  status,
  reason,
  spokenSubject,
}: VerificationStatusMarkProps) {
  const state = resolveDisplayState(status, reason);
  const { glyph, label } = STATE_STYLE[state];

  const suffix = incompleteDetailSuffix(reason);
  const subject = spokenSubject ? `${spokenSubject}: ` : '';

  // THE WHOLE ACCESSIBLE NAME IS ONE TEXT NODE.
  //
  // The obvious construction — leave the visible label exposed and add the missing fact in
  // a second hidden span — does not work, and this was measured rather than assumed. The
  // accessibility tree concatenates each descendant's text AFTER TRIMMING it, so
  // "Cannot be completed" + " — the source does not record whose armor this reads" was
  // announced as "Cannot be completed—the source does not record whose armor this reads",
  // with the words run together. Building the sentence once, here, is what makes it read
  // as a sentence.
  //
  // The visible label and the spoken name are both `STATE_STYLE[state].label`, so they
  // cannot drift apart; a test asserts the visible label is contained in the spoken name.
  const spokenName = `${subject}${label}${suffix}`;

  return (
    <span className="vstat" data-state={state}>
      <span className="vstat__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="vstat__label" aria-hidden="true">
        {label}
      </span>
      <span className="u-visually-hidden">{spokenName}</span>
    </span>
  );
}
