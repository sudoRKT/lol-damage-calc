// @vitest-environment jsdom
//
// `.breakdown__state-toggle` — IS THE BOX THAT WAS MEASURED THE BOX THAT TAKES THE CLICK?
//
// ═══ WHY THIS WAS ASKED ═══
//
// `src/ui/target-size-register.test.ts` records this control as passing WCAG 2.5.8 by SPACING:
// "87.2 x 15.2px at 375px, 2026-08-15. One per table row, far apart", separation 155.5px. A
// sibling area then found that one of ITS controls registered as passing by spacing had been
// measured on a box that accepted no clicks at all — the real target was an unrecorded 13x13px
// checkbox 11px away. A register entry is a claim about the thing a finger lands on, so the box
// and the target have to be the same box or the entry is measuring scenery.
//
// ═══ WHAT WAS MEASURED, IN A REAL BROWSER, ON /calculator/ ═══
//
// `document.elementFromPoint` at ten probes around the first toggle, at 1440x900 and at 375x812
// (device emulation on; `documentElement.clientWidth` asserted inside the same call, because the
// browser pane is shared and another session resized it three times mid-run):
//
//   centre, and 1px inside each of the four edges .... the toggle, every time, both widths
//   4px and 11px into the gap on its left ........... `td.breakdown__state` / the sibling label
//   4px past its right edge ......................... the cell, then the panel
//   4px above / 4px below ........................... the sibling label, and the cell
//
// **THE FINDING IS THE OPPOSITE OF THE SIBLING AREA'S.** There is no second box. The thing that
// receives the click IS `.breakdown__state-toggle`, at its centre and at every edge, and nothing
// in the 11px beside it takes a click at all. The register entry is measuring the real target.
//
// TWO FIGURES THE PROBE ADDED THAT THE REGISTER DOES NOT CARRY:
//
//   • THE HIT AREA IS SLIGHTLY TALLER THAN THE BORDER BOX, NEVER SHORTER. Scanned in 0.25px
//     steps at 1440px, the region that activates the toggle is 87.5 x 17.5px against a border box
//     of 87.23 x 15.19px. The extra is the label span's own line box — `--lh-eyebrow` gives it
//     17.00px against the button's 15.19px, so it overflows 1.00px above and 0.81px below. It is
//     a DESCENDANT of the button, so a hit on the overflow still fires the button. 15.2px is
//     therefore the conservative figure, which is the right way round for a register to be wrong.
//   • THE NEAREST OTHER TARGET IS THE NEXT ROW'S OWN TOGGLE, at 155.52px centre-to-centre at
//     375px — exactly one body row (rows 2–4 measure 155.52px each). Re-measured independently
//     here and it agrees with the register's 155.5 to the pixel. 155.52 >> 24, so 2.5.8 passes
//     by spacing with 6.5x the margin the criterion asks for, and NOTHING NEEDS GROWING.
//
// ═══ THE PANEL'S RENDERED HEIGHT — MEASURED ONLY, DELIBERATELY UNCHANGED ═══
//
// Asked for alongside, because the page is long and this panel is explicitly NOT the point of the
// page (the chart is). Four instances, all rows collapsed:
//
//                                 1440x900        375x812
//   panel height ................ 557.08px        1074.52px   (0.62 / 1.32 screens)
//   share of the whole page ..... 9.9%            10.3%       (page 5,641px / 10,466px)
//   the table inside it ......... 235.16px        586.28px
//   vertical gaps between parts . 108.99px 19.6%  109.01px 10.1%
//   body rows ................... 39/39.5/63/63   62.67 then 155.52 x3
//
// The gap figure is the panel's own padding (16px top, 17px bottom) plus the five margins between
// its six children (12/12/12/16/24px) — it is IDENTICAL at both widths, so none of the extra
// 517px at 375px is whitespace. All of it is text wrapping.
//
// WHAT THE EXTRA HEIGHT ACTUALLY IS. The "Changed since the combo began" column is 111.23px wide
// at 375px and its annotation wraps to EIGHT line boxes, 121.73px, on each of rows 2–4 — 394.58px
// of the 529.23px of body rows. The Source cell in those same rows is 54.69–73.53px, so the
// annotation alone sets the height of every row it is on.
//
// HOW MUCH OF IT IS REPEATED. Of the 316 characters in rows 2–4's annotations, 249 (78.8%) are
// four label stems repeated verbatim on every row — "Instance number", "Damaging instance
// number", "Instances resolved before", "Defender current hp" — and 67 are the figures that
// actually differ. The disclosure label is repeated too: 4 buttons, 1 distinct string,
// "Full state ▾".
//
// **NOT CHANGED, AND NOT TO BE CHANGED FROM HERE.** Page length is handled separately and
// `src/ui/page-length-register.test.ts` is lead-only. This paragraph is the measurement, not a
// proposal.
//
// ═══ ONE THING MEASURED IN PASSING THAT IS NOT THIS AREA'S, RECORDED SO IT IS NOT LOST ═══
//
// At a 375px device width the LAYOUT viewport is 404px, not 375: `documentElement.clientWidth` is
// 375 and `scrollWidth` is 404, so the page overflows sideways by 29px. **It is not this panel.**
// `.breakdown-panel` measures 327px wide and its right edge sits at x=351, inside 375, and its
// table is inside a `.u-scroll-x` container that scrolls within the panel rather than pushing the
// page. `document.body.scrollWidth` is 375 as well, so the 29px arrives above body level. This is
// DESIGN-AUDIT item 5 (the mobile horizontal overflow), which is outstanding, and it was handed to
// the lead rather than reached across for.
//
// It matters to anyone re-running the figures above: `innerWidth` reads 404 at a 375px device
// width, so a measurement pass that guards on `innerWidth === 375` will abort forever. Guard on
// `documentElement.clientWidth`, which is what media queries see.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MOCK_RESULT } from '../../types';
import { InstanceBreakdown } from './InstanceBreakdown';

afterEach(cleanup);

const mount = () => render(<InstanceBreakdown result={MOCK_RESULT} />);

/**
 * Everything a pointer or a keyboard can land on. Kept deliberately wider than "button" so that a
 * checkbox, a link or a `role="button"` span smuggled into the state cell is caught rather than
 * skipped — that is the exact shape of the defect this file exists to rule out.
 */
const INTERACTIVE = 'a[href],button,input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])';

describe('breakdown/the disclosure is the thing that takes the click', () => {
  it('is a native button, not a label paired with a smaller real control', () => {
    // PROVED TO FAIL: changing the element to `<span role="button">` in InstanceBreakdown.tsx
    // reports "SPAN" and turns this red.
    //
    // A native <button> is what makes the whole border box — and every descendant of it — a
    // single hit target. The sibling area's defect was a caption element that looked like the
    // control while a 13x13px checkbox took the clicks; that cannot arise from this shape.
    mount();
    const toggles = document.querySelectorAll<HTMLElement>('.breakdown__state-toggle');
    expect(toggles.length).toBe(MOCK_RESULT.perInstance.length);
    for (const t of toggles) {
      expect(t.tagName, 'the disclosure must be a native button').toBe('BUTTON');
      expect((t as HTMLButtonElement).disabled).toBe(false);
      expect(t.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('is the ONLY thing in its cell that a pointer can land on', () => {
    // PROVED TO FAIL: adding a second `<button>` to the state cell reports 2 and turns this red.
    //
    // This is the assertion that would have caught the sibling area's defect. If a second target
    // ever appears in this cell, the register entry's 155.5px separation stops being true the
    // moment it lands, and the 24px spacing rule has to be re-measured against the NEW neighbour.
    mount();
    for (const cell of document.querySelectorAll<HTMLElement>('td.breakdown__state')) {
      const targets = cell.querySelectorAll(INTERACTIVE);
      expect(targets.length, 'one target per state cell — see the 155.5px separation record').toBe(1);
      expect(targets[0]!.className).toContain('breakdown__state-toggle');
    }
  });

  it('activates when the click lands on the label span rather than the button', () => {
    // PROVED TO FAIL: moving the onClick handler from the button to an inner wrapper leaves the
    // outer element inert and turns this red.
    //
    // THIS IS THE MECHANISM BEHIND THE 17.5px HIT AREA MEASURED ABOVE. The label span's line box
    // overflows the button by 1.00px above and 0.81px below, so a real browser hands
    // `elementFromPoint` the SPAN for those slivers, not the button. It still works because the
    // span is inside the button and the event bubbles. jsdom computes no layout, so the geometry
    // cannot be asserted here — but the bubbling that makes the geometry harmless can be, and if
    // that ever stops holding the measured hit area shrinks silently.
    mount();
    const toggle = document.querySelector<HTMLElement>('.breakdown__state-toggle')!;
    const label = toggle.firstElementChild as HTMLElement;
    expect(label.tagName, 'the label is a span INSIDE the button').toBe('SPAN');
    expect(toggle.contains(label)).toBe(true);

    fireEvent.click(label);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(label);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('separates its neighbours by row, so no two toggles share a row', () => {
    // The structural half of the 155.52px measurement: the separation holds because there is
    // exactly one disclosure per row, never two side by side. If a second one ever joins a row,
    // the spacing pass is void whatever the register says.
    mount();
    const rows = screen.getAllByRole('row');
    const withToggle = rows.filter((r) => within(r).queryAllByRole('button').length > 0);
    expect(withToggle.length).toBe(MOCK_RESULT.perInstance.length);
    for (const r of withToggle) {
      expect(r.querySelectorAll('.breakdown__state-toggle').length).toBe(1);
    }
  });
});
