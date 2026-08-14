// AN EXCLUDED ABILITY, NAMED AND EXPLAINED — ON SCREEN, not only to a screen reader.
//
// ═══ THE DEFECT THIS EXISTS FOR, MEASURED ON THE LIVE PAGE ═══
//
// The "Excluded from these totals" lists rendered a bare `VerificationStatusMark` per entry. That
// component puts its glyph and its label in `aria-hidden` spans and its whole sentence — the
// ability's NAME and the REASON — into a `u-visually-hidden` span.
//
// Measured with Aatrox, who has two excluded abilities: the mark rendered at 97x15px reading only
// `○ Not yet modelled`, while the name and reason sat in a span of 1x1px with `clip-path`
// applied. **Both of his exclusions were visually identical.** A sighted reader could not tell
// which ability had been left out of the total, or why.
//
// SPECIFICATION §8 is explicit: "A result containing an incomplete ability states plainly which
// ability and why." It was stating it plainly to assistive technology alone.
//
// ═══ WHAT THIS RENDERS ═══
//
//   ○ Not yet modelled   R — World Ender
//   no source states what damage type this ability deals, and a figure without a type is a
//   figure without a resistance
//
// The mark keeps its own spoken sentence, so nothing is taken away from a screen reader. The
// visible name and reason are `aria-hidden`, or the same words would be announced twice.

import type { IncompleteReason } from '../../types/result';
import { VerificationStatusMark, incompleteDetailSuffix } from './VerificationStatusMark';
import './primitives.css';

export interface ExcludedAbilityProps {
  /** e.g. "R — World Ender". The ability, as every other row in the result names it. */
  sourceLabel: string;
  reason: IncompleteReason;
  /** Completes the spoken sentence, e.g. "contributes no damage". */
  spokenContext: string;
}

export function ExcludedAbility({ sourceLabel, reason, spokenContext }: ExcludedAbilityProps) {
  // `incompleteDetailSuffix` returns " — <reason>" so it can be concatenated into a sentence.
  // The separator is dropped here, because the reason is its own line rather than a clause.
  const detail = incompleteDetailSuffix(reason).replace(/^\s*—\s*/, '');

  return (
    <span className="excluded">
      <span className="excluded__head">
        <VerificationStatusMark
          status="incomplete"
          reason={reason}
          spokenSubject={`${sourceLabel}, ${spokenContext}`}
        />
        {/* aria-hidden: the mark above already announces the label inside its own sentence, and
            a screen reader hearing the ability named twice in a row reads as a stutter. */}
        <span className="excluded__label" aria-hidden="true">
          {sourceLabel}
        </span>
      </span>
      {detail ? (
        <span className="excluded__why" aria-hidden="true">
          {detail}
        </span>
      ) : null}
    </span>
  );
}
