// THE HORIZONTAL SCROLL REGION — the one place in this product a thing is allowed to be wider
// than the screen, and the only way it is allowed to be.
//
// ═══ WHY IT EXISTS ═══
//
// SPECIFICATION §10: "The interface is fully responsive. Layouts adapt for mobile, where a
// significant share of usage occurs." DESIGN-AUDIT.md §6.5 measured the built page at a 375×812
// viewport and found `document.documentElement.scrollWidth` of 579px against a 375px viewport —
// 204px of horizontal overflow on the WHOLE PAGE, caused by one element: the per-instance
// breakdown table, whose six columns have a combined minimum width no phone can hold. Every other
// panel fitted.
//
// ═══ WHICH OF §6.5'S TWO OPTIONS THIS IS, AND WHY ═══
//
// §6.5 named two honest options and refused to pick one in passing:
//   (a) a horizontally scrolling container around the TABLE ALONE — keeps every column, confines
//       the scroll to the thing that is genuinely too wide;
//   (b) a stacked per-instance layout below some width — loses column alignment.
//
// THIS IS (a), for three reasons, and the third is the one that decides it:
//   1. DESIGN.md §0 describes this product as "closer to a fighting-game frame-data table or an
//      oscilloscope than to the League client… dense on purpose". Column alignment IS the
//      readout. A stacked card repeats the header on every row and destroys the vertical
//      alignment of the damage column, which is the column a reader scans.
//   2. (b) needs a phone breakpoint, and DESIGN.md defines exactly ONE width in the whole file —
//      the ~1280px rail breakpoint of §7a. A mobile breakpoint would be a value invented locally,
//      which the design file forbids in its preamble. (a) needs no width at all: it scrolls when
//      it does not fit and does nothing when it does, at every viewport.
//   3. **The overflow is confined rather than removed either way — the question is WHAT scrolls.**
//      Today the whole page scrolls sideways, which drags the burndown, the configuration panels
//      and the headline total out of view together. After this, only the table moves, and the page
//      itself is fixed to the viewport.
//
// ═══ THE ACCESSIBILITY HALF, WHICH IS NOT OPTIONAL ═══
//
// A `div` with `overflow-x: auto` and nothing else is a layout fix that creates an accessibility
// defect: content only a mouse or a touch drag can reach. Three things prevent that, and all three
// are asserted by `../responsive-overflow.test.tsx`:
//   • `tabIndex={0}` — the region takes keyboard focus, so arrow keys scroll it. Browsers are
//     inconsistent about focusing scrollers on their own; this does not depend on that.
//   • `role="region"` with an accessible NAME — a screen reader announces it as a named region
//     rather than as an unlabelled group, and it appears in a landmark list.
//   • The name SAYS IT SCROLLS. A keyboard user who lands on a region needs to be told why they
//     are there; "Per-instance breakdown" alone does not tell them.
//
// THE COST, STATED RATHER THAN HIDDEN: this adds one tab stop per table, on every viewport,
// including wide ones where the table fits and the region does not scroll. The alternative —
// adding `tabindex` only when `scrollWidth > clientWidth` — needs live layout measurement, which
// jsdom cannot produce, so nothing in this suite could verify it and it would be a behaviour
// nobody has checked. A dead tab stop is a known, small cost; an unverifiable one is not.

import type { ReactNode } from 'react';
import './primitives.css';

/**
 * Appended to every scroll region's accessible name, in one place so every region says it the
 * same way. `../responsive-overflow.test.tsx` asserts that every region in the area carries it.
 */
export const SCROLL_REGION_SUFFIX = ' — scrolls sideways if it is wider than the screen';

export interface TableScrollerProps {
  /**
   * What the region is, in the words the surrounding page uses — "Per-instance breakdown".
   * The scrolling half of the name is added here, so no caller can forget it or word it
   * differently. Must be non-empty: a region with no name is a region a screen reader
   * announces as nothing.
   */
  label: string;
  children: ReactNode;
}

export function TableScroller({ label, children }: TableScrollerProps) {
  if (label.trim() === '') {
    throw new Error(
      'TableScroller: a scroll region must have a name. An unnamed region is announced as ' +
        '"region" and tells a screen-reader user nothing about what they have landed on.',
    );
  }

  return (
    <div
      className="u-scroll-x"
      role="region"
      aria-label={`${label}${SCROLL_REGION_SUFFIX}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
