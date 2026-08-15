// A COLLAPSED SECTION THAT SAYS WHAT IT IS HIDING.
//
// ═══ WHY THIS EXISTS, MEASURED RATHER THAN ASSUMED (2026-08-15) ═══
//
// The calculator page was **23.94 screens tall on a phone** — `documentElement.scrollHeight`
// 19,442px against an 812px viewport at 375×812, default Lux vs Garen scenario. Measured on the
// live page, not estimated.
//
// The cause was not the data tables, which was the obvious guess and was wrong. It was the
// exclusions list: **the same 22-item list is printed THREE times on one page** — once by the
// per-instance breakdown and once by each of the two sweep curves — at 2,611px, 2,693px and
// 2,693px. **7,997px, or 41.1% of the whole page, is one list repeated.** The three texts are
// 5,971–5,972 characters each and 21 of their 22 items are identical.
//
// ═══ WHY COLLAPSED AND NOT REMOVED ═══
//
// The instinct is to print the list once for the page. That would be wrong twice over. The lists
// are NOT identical — a curve excludes one thing a single result does not — so merging them would
// silently drop a real exclusion. And every one of these blocks exists to satisfy SPECIFICATION
// §8: a reader must be able to see what a figure does not account for, beside that figure. A
// reader looking at the resistance curve must be able to learn what the resistance curve excludes
// without scrolling back to a different panel and taking it on trust that the two lists match.
//
// So nothing is removed. Each block keeps its own list, in its own panel, complete. It simply
// starts closed, with its item count on the button, and one click opens it.
//
// ═══ THE RULES IT FOLLOWS ═══
//
// It is a `button` with `aria-expanded` and `aria-controls`, matching the "Full state" control
// `InstanceBreakdown` has used since it was built — one pattern on the page, not two. The glyph is
// decorative and hidden from assistive technology; the spoken name is a full sentence built in one
// place, exactly as `riserName` builds a riser's.
//
// **THE COUNT IS ON THE BUTTON ON PURPOSE.** "Mechanics this result excludes" hides an unknown
// amount; "Mechanics this result excludes — 22" does not. A reader deciding whether to open
// something is entitled to know how much is behind it, and a collapsed section that conceals its
// own size is the thing that makes collapsing feel like hiding.
//
// It animates nothing, so it needs no `prefers-reduced-motion` block and the token audit passes.
// It introduces no colour, type or spacing value that is not already in DESIGN.md.

import { useId, useState, type ReactNode } from 'react';

export interface DisclosureProps {
  /** The heading, and the start of the spoken name. */
  label: string;
  /**
   * How many things are behind the control. Printed beside the label and spoken in the name.
   * Omit only where the content genuinely has no count — a paragraph rather than a list.
   */
  count?: number;
  /** What `count` counts, singular. "mechanic" gives "22 mechanics". */
  noun?: string;
  /** Open on first render. Default closed — see the header for why that is the right default. */
  defaultOpen?: boolean;
  /** The element type of the wrapper, so a block inside a `section` does not nest landmarks. */
  children: ReactNode;
  /** Class on the wrapping element, so each area keeps its own panel styling. */
  className?: string;
}

/** The whole spoken sentence for a disclosure control. One place, so it cannot drift. */
export function disclosureName(
  label: string,
  open: boolean,
  count?: number,
  noun = 'item',
): string {
  const what = count === undefined ? label : `${label}, ${count} ${noun}${count === 1 ? '' : 's'}`;
  return `${open ? 'Hide' : 'Show'} ${what}`;
}

export function Disclosure({
  label,
  count,
  noun = 'item',
  defaultOpen = false,
  children,
  className,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className={className ? `disclosure ${className}` : 'disclosure'}>
      <button
        type="button"
        className="disclosure__toggle"
        aria-expanded={open}
        aria-controls={id}
        aria-label={disclosureName(label, open, count, noun)}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="disclosure__label" aria-hidden="true">
          {label}
        </span>
        {count === undefined ? null : (
          <span className="disclosure__count" aria-hidden="true">
            {count}
          </span>
        )}
        <span className="disclosure__glyph" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {/* NOT `hidden` — the content is not rendered at all when closed, so a collapsed page costs
          nothing to lay out. The button's own count is what tells a reader it is there. */}
      {open ? (
        <div className="disclosure__body" id={id}>
          {children}
        </div>
      ) : (
        <div className="disclosure__body" id={id} hidden />
      )}
    </div>
  );
}
