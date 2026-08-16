// @vitest-environment jsdom
//
// ═══ WHICH BOX ACTUALLY RECEIVES THE CLICK — the ui-site area (shell/, pages/, landing/, coverage/)
//
// THE DEFECT THIS FILE EXISTS FOR IS NOT "a control is too small". It is **"the box that was
// measured is not the box that is clickable"**. `src/ui/target-size-register.test.ts` published
// 293.00 x 30.50px for `config/defences.css .defences__control` and passed it by spacing at
// 78.34px. That box was a `<div>` that accepted no pointer ANYWHERE — `elementFromPoint` returned
// the bare div at its centre, at its edges and in the gap beside it, and a click dispatched there
// changed nothing. The real target was an unrecorded 13 x 13px checkbox eleven pixels away, and
// the stylesheet's own comment claimed "the whole line is the target".
//
// A `getBoundingClientRect` figure is true of any element, interactive or not. Only
// `elementFromPoint` says what receives a click. So every entry below records BOTH: the box, and
// the element the browser handed back at eleven points inside and around it.
//
// ═══ WHAT WAS MEASURED, AND HOW ═══
//
// 2026-08-16, in a real browser (Chromium), on `/`, `/checks/` and `/report/`. Two viewport
// settings: **375 x 812** (the pane emulates a phone, overlay scrollbars, so
// `document.documentElement.clientWidth` reads exactly 375) and **1440 x 900** (a classic 15px
// scrollbar, so `clientWidth` reads **1425** — every "1440" figure below was taken at a measured
// client width of 1425 and is labelled that way rather than rounded up to the setting).
//
// `document.documentElement.clientWidth` was read back INSIDE the same call as every measurement,
// because the browser pane is shared between sessions in this build and was resized underneath
// this one. Any reading whose width was not the width set was discarded and retaken. Two readings
// were discarded that way: a 375px sweep of the landing page that still had the 1425px inline
// navigation mounted (`matchMedia` had not re-fired after the pane resize) was thrown out and
// retaken after a reload.
//
// Each control was probed at ELEVEN points — its centre, one pixel inside each of its four edges,
// its two diagonal corners one pixel in, and five to eight pixels OUTSIDE each of its four edges —
// and every returned element was resolved to its nearest interactive ancestor. `interiorHits`
// below is how many of the seven interior points resolved to the control itself; `gapsClean` is
// how many of the four exterior points correctly resolved to NO control at all.
//
// ═══ AND THE CLICK WAS DISPATCHED, NOT ONLY HIT-TESTED ═══
//
// For the two buttons, a full `pointerdown → mousedown → pointerup → mouseup → click` sequence was
// fired at the element `elementFromPoint` returned, and the resulting state change was read after
// React re-rendered. `.nav__toggle` flipped `aria-expanded` at ALL SEVEN interior points and at
// none of the three genuinely-outside ones. `.report__copy` was fired from its top-left corner —
// the least likely point to work — and the live region beneath it changed. React state is
// asynchronous, and reading the DOM in the same tick as the dispatch reports the OLD value; that
// mistake was made once here and produced a false "the click changed nothing".
//
// ═══ WHAT THE SWEEP FOUND ═══
//
// ZERO dead boxes. Every one of the nine controls owns its own interior at both widths. Nothing
// in this area repeats the `.defences__control` shape.
//
// TWO exterior points that hit something rather than nothing, both benign and both recorded on
// their entry: a `.nav__link` is 2.01px from the next `.nav__link` (so the probe below it lands on
// its neighbour, which is a real adjacent target), and the focused skip link OVERLAYS the wordmark
// (so the probe past its right edge lands on the wordmark beneath, 57.95px away centre-to-centre).
//
// ONE REAL DEFECT, which was not a target-size defect at all: the open navigation panel ran
// 114.64px off the RIGHT edge of the viewport at every width from 446px to 1279px. **IT WAS FIXED
// ON 2026-08-16 and `KNOWN_OVERFLOW` at the foot of this file is now empty** — the toggle is held
// against the end of the header by `margin-inline-start: auto` on `.nav`, so it no longer changes
// ends and the panel's end anchor is right at every width. Re-measured at client widths 320, 375,
// 426, 440, 446, 500, 753, 1264 and 1425 on `/` and `/checks/`, menu open and closed:
// `documentElement.scrollWidth − clientWidth` is **0 at every one of them**, and the panel's right
// edge is `clientWidth − 24` wherever the toggle is drawn. `shell/SiteNav.test.tsx` carries the
// before-and-after tables and pins both halves of the fix.
//
// ═══ WHAT THIS FILE CAN AND CANNOT ENFORCE ═══
//
// jsdom computes no layout, so nothing here re-measures a box. What it enforces is the half that
// went wrong before: **every entry names the element type its figure was measured against, and
// that type is checked against the rendered DOM on every run.** Had this existed,
// `.defences__control` claiming a measurement while rendering a `<div>` would have been red from
// the day it was written.
//
// `../target-size-register.test.ts` remains the interface-wide register and is the lead's file.
// **Eight of the nine controls below appear in it nowhere**, because its name pattern
// `/(control|remove|toggle|__btn|button|riser|shelf-button)/` matches only `.nav__toggle` out of
// this whole area — the same "a control named for its role is invisible to it" gap that file
// already records against `.defences__check`. This one is the ui-site area's own record and does
// not replace it.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PageShell } from './PageShell';
import { Landing } from '../landing/Landing';
import { ReportPage } from '../pages/ReportPage';

afterEach(cleanup);

const UI = join(dirname(fileURLToPath(import.meta.url)), '..');

// ===========================================================================================
// THE REGISTER
// ===========================================================================================

/** How a control meets WCAG 2.2 AA 2.5.8. All four routes below are legitimate. */
type Pass =
  /** At least 24px on both axes. */
  | { how: 'size' }
  /** Under 24px, but no other target's centre is within 24px. The separation is stated. */
  | { how: 'spacing'; separationPx: number }
  /**
   * 2.5.8's "Equivalent" exception: the function is available from another registered control on
   * the same page that meets the criterion. Used for a `<label>`, whose only effect is to put the
   * caret in a field the user can also click directly.
   */
  | { how: 'equivalent'; by: string };

interface Entry {
  /** The element type the browser figures were measured against. CHECKED against the DOM below. */
  tag: string;
  /**
   * [inline, block] in CSS px at the 1440px setting, where `clientWidth` measured 1425.
   * `null` means the control is NOT RENDERED at that width — which is a fact about the product,
   * not a gap in the measurement.
   */
  box1425: readonly [number, number] | null;
  /** [inline, block] in CSS px at the 375px setting, where `clientWidth` measured 375. */
  box375: readonly [number, number];
  /** What `elementFromPoint` returned at the box's own centre, resolved to its interactive owner. */
  clickOwner: string;
  /** How many of the SEVEN interior probe points resolved to `clickOwner`. Seven is the pass. */
  interiorHits: number;
  /** How many of the FOUR exterior probe points correctly resolved to no control at all. */
  gapsClean: number;
  /** Every exterior point that hit a control anyway, named. Empty when all four gaps were clean. */
  gapHits: readonly string[];
  /** Nearest OTHER target, centre to centre, in the densest state that renders. */
  nearestCentrePx: { at1425: number | null; at375: number };
  pass: Pass;
  /** A sentence a person can read. Dated, with the viewport and the page. */
  measured: string;
}

/**
 * Every interactive control the ui-site area renders, keyed by stylesheet and selector so an entry
 * can be found from the CSS that produced it.
 *
 * NOT INCLUDED, and why: links in running prose (`.prose__p a`, `.lede__aside a`,
 * `.foot__notice a`) are 14–20px tall and are covered by 2.5.8's own **Inline** exception — their
 * size is constrained by the line-height of the sentence around them. `coverage/` renders no
 * controls at all: it is two data modules and holds no component. `/checks/` adds NO control of its
 * own — swept in the browser it holds 19 interactive elements at 1425px and every one of them is
 * the shell, the footer or a prose link.
 */
const TARGETS: Record<string, Entry> = {
  'shell/nav.css .nav__toggle': {
    tag: 'button',
    box1425: null,
    box375: [84.47, 36.84],
    clickOwner: 'button.nav__toggle',
    interiorHits: 7,
    gapsClean: 4,
    gapHits: [],
    nearestCentrePx: { at1425: null, at375: 97.91 },
    measured:
      'THE LAST UNMEASURED CONTROL IN THE PRODUCT, now measured. 84.47 x 36.84px CLOSED and ' +
      '119.36 x 36.84px OPEN, at 375px on 2026-08-16, identical at 320px and identical on every ' +
      'page — it is one shell component. THE BOX CHANGES SIZE WITH ITS OWN LABEL: the accessible ' +
      'name goes from "Menu" to "Close menu", which is 34.89px wider, and both states clear 24px ' +
      'on both axes by a wide margin. It is NOT RENDERED at 1425px at all — `SiteNav` draws no ' +
      'button above 80rem rather than hiding one — so `box1425` is null on purpose; measured at a ' +
      'client width of 1264 it is 119.36 x 36.84px, the widest width at which it exists. ' +
      'All seven interior probes returned the button and all four gaps returned the header and no ' +
      'control. A full click sequence dispatched at each of those seven points flipped ' +
      '`aria-expanded` seven times out of seven; dispatched at the three genuinely-outside points ' +
      'it changed nothing. Nearest other target 97.91px, the wordmark (83.30px with the menu ' +
      'open, as the button grows toward it). Passes by SIZE and nothing was grown.',
    pass: { how: 'size' },
  },
  'shell/nav.css .nav__link': {
    tag: 'a',
    box1425: [58.97, 35.84],
    box375: [240, 34.84],
    clickOwner: 'a.nav__link',
    interiorHits: 7,
    gapsClean: 3,
    gapHits: ['below: a.nav__link — the next link, 2.01px away'],
    nearestCentrePx: { at1425: 75.24, at375: 36.84 },
    measured:
      'Six links. In the phone PANEL at 375px every one is 240.00 x 34.84px on a 36.84px pitch; ' +
      'as INLINE header links at 1425px they run 58.97 to 206.56px wide and 35.84 to 36.84px tall ' +
      '— the tall one is the `aria-current` link, whose 2px bone bottom border makes it 1.00px ' +
      'taller than its neighbours. The narrowest is recorded. 2026-08-16, measured on / and ' +
      '/checks/ and /report/ alike. All seven interior probes returned the link at both widths. ' +
      'THE PROBE BELOW IT RETURNS THE NEXT LINK rather than nothing, and that is correct: the ' +
      'panel gap is --space-0 (2px), so there is no dead strip between them to fall into. ' +
      'Separation 36.84px in the panel and 75.24px inline. Passes by SIZE at both widths.',
    pass: { how: 'size' },
  },
  'shell/shell.css .shell__skip': {
    tag: 'a',
    box1425: [170, 38.84],
    box375: [170, 38.84],
    clickOwner: 'a.shell__skip',
    interiorHits: 7,
    gapsClean: 3,
    gapHits: ['right: a.shell__wordmark — the masthead link the focused skip link overlays'],
    nearestCentrePx: { at1425: 57.95, at375: 57.95 },
    measured:
      'THE SPECIAL CASE, PROBED IN BOTH STATES. 170.00 x 38.84px at (8, 8) once focused, identical ' +
      'at 375px and 1425px, 2026-08-16. UNFOCUSED it parks at `inset-block-start: -64px` (bottom ' +
      'edge -25.16px, wholly above the viewport) and all ELEVEN probes return NONE — it is not ' +
      'merely invisible, it takes no pointer, which is exactly right for a control nobody can see. ' +
      'FOCUSED, all seven interior probes return the link, so a skip link that has been revealed ' +
      'can be clicked. It was focused by a REAL Tab keypress from a clean page load, not by ' +
      '`element.focus()`: `:focus-visible` is what moves it, and a scripted focus does not reliably ' +
      'match it — a first attempt on a page whose focus history was already polluted put the first ' +
      'Tab on the landing CTA instead, and was discarded and retaken after a reload. From a clean ' +
      'load it is the FIRST tab stop on every page tested. Activating it sets `location.hash` to ' +
      '`#main` and the next Tab lands inside `<main>`, so it really does skip the navigation. ' +
      'The probe past its right edge returns the wordmark UNDERNEATH it — the focused link sits at ' +
      'z-index 3 over the masthead — whose centre is 57.95px away. Passes by SIZE.',
    pass: { how: 'size' },
  },
  'shell/shell.css .shell__wordmark': {
    tag: 'a',
    box1425: [253.69, 37.69],
    box375: [253.69, 37.69],
    clickOwner: 'a.shell__wordmark',
    interiorHits: 7,
    gapsClean: 4,
    gapHits: [],
    nearestCentrePx: { at1425: 57.95, at375: 57.95 },
    measured:
      '253.69 x 37.69px at both 375px and 1425px — sized by its own two lines of text, not by the ' +
      'header — 2026-08-16. Every interior probe RAW-returns one of its two child spans and every ' +
      'one resolves to the anchor, which is the ordinary and correct shape for a link wrapping ' +
      'text; it is recorded because "the raw element is not the control" is the exact reading that ' +
      'went wrong on `.defences__control`, and here it comes out benign. All four gaps returned ' +
      'the header and no control. The nearest other target is the skip link WHILE FOCUSED, 57.95px ' +
      'away and lying over it; with the skip link parked the nearest is the menu button at 97.91px ' +
      'at 375px. Passes by SIZE.',
    pass: { how: 'size' },
  },
  'shell/shell.css .foot__links a': {
    tag: 'a',
    box1425: [35.11, 18.84],
    box375: [35.11, 18.84],
    clickOwner: 'a',
    interiorHits: 7,
    gapsClean: 4,
    gapHits: [],
    nearestCentrePx: { at1425: 54.57, at375: 29.35 },
    measured:
      'Eight links. The narrowest ("About") is 35.11 x 18.84px at BOTH widths — 5.16px under the ' +
      'minimum on the block axis — 2026-08-16, measured on / and /report/ and /checks/ alike. ' +
      'THEY ARE NOT GROWN, because they pass by SPACING and the margin was measured rather than ' +
      'assumed: at 1425px the row is one line and the tightest pair is 54.57px centre-to-centre; ' +
      'at 375px the row WRAPS TO THREE LINES, which is the dense case, and the tightest pair falls ' +
      'to 29.35px — still 5.35px clear of 24px. The vertical pitch is --space-2 (8px) over an ' +
      '18.84px line, giving 26.84px between rows. THIS IS THE TIGHTEST CONTROL IN THE AREA and the ' +
      'only one whose pass would not survive a larger footer type size, so the figure is here ' +
      'rather than in a transcript. All seven interior probes returned the anchor and all four ' +
      'gaps returned the list or the footer and no control. Probed only after scrolling the footer ' +
      'into view: `elementFromPoint` returns null for anything outside the viewport, and a first ' +
      'pass that forgot that reported eleven NONEs for a perfectly good link.',
    pass: { how: 'spacing', separationPx: 29.35 },
  },
  'landing/landing.css .lede__go': {
    tag: 'a',
    box1425: [198.41, 50.5],
    box375: [198.41, 50.5],
    clickOwner: 'a.lede__go',
    interiorHits: 7,
    gapsClean: 4,
    gapHits: [],
    nearestCentrePx: { at1425: 362.76, at375: 443.72 },
    measured:
      'The landing page\'s one call to action, "Open the calculator". 198.41 x 50.50px at both ' +
      '375px and 1425px — sized by --space-3/--space-4 padding around --type-display-m, so it does ' +
      'not move with the column — 2026-08-16. The largest control in the area and by a distance ' +
      'the most isolated: nearest other target 362.76px at 1425px and 443.72px at 375px. All seven ' +
      'interior probes returned the link; all four gaps returned the section or the paragraph ' +
      'around it and no control. Passes by SIZE.',
    pass: { how: 'size' },
  },
  'pages/pages.css .report__copy': {
    tag: 'button',
    box1425: [119.5, 36.84],
    box375: [119.5, 36.84],
    clickOwner: 'button.report__copy',
    interiorHits: 7,
    gapsClean: 4,
    gapHits: [],
    nearestCentrePx: { at1425: 312.96, at375: 112.01 },
    measured:
      'The report-a-wrong-number page\'s "Copy the report" button. 119.50 x 36.84px at both widths ' +
      '— sized by its own words — 2026-08-16 on /report/. All seven interior probes returned the ' +
      'button and all four gaps returned no control. A full click sequence dispatched at its ' +
      'TOP-LEFT CORNER, one pixel in, changed the live region beneath it from empty to "Copied. ' +
      'Paste it wherever suits you." — so the corner of the box is wired, not just its middle. ' +
      'Nearest other target 112.01px at 375px, where the prose below wraps closer, and 312.96px at ' +
      '1425px. Passes by SIZE.',
    pass: { how: 'size' },
  },
  'pages/pages.css .report__text': {
    tag: 'textarea',
    box1425: [666, 244.31],
    box375: [327, 244.31],
    clickOwner: 'textarea.report__text',
    interiorHits: 7,
    gapsClean: 4,
    gapHits: [],
    nearestCentrePx: { at1425: 186.92, at375: 140.75 },
    measured:
      'The readonly textarea holding the whole report. 666.00 x 244.31px at 1425px and 327.00 x ' +
      '244.31px at 375px — the block axis is `rows={14}` and does not move with the column — ' +
      '2026-08-16. All seven interior probes returned the textarea and all four gaps returned the ' +
      'section or the main column and no control. Passes by SIZE on both axes at both widths.',
    pass: { how: 'size' },
  },
  'pages/pages.css .report__label': {
    tag: 'label',
    box1425: [912, 13.19],
    box375: [327, 13.19],
    clickOwner: 'label.report__label',
    interiorHits: 7,
    gapsClean: 4,
    gapHits: [],
    nearestCentrePx: { at1425: 186.92, at375: 140.75 },
    measured:
      '912.00 x 13.19px at 1425px and 327.00 x 13.19px at 375px, 2026-08-16. 10.81px under the ' +
      'minimum on the block axis and NOT grown: this is a `<label htmlFor="report-text">` whose ' +
      'whole effect is to put the caret in the textarea beneath it, and that textarea is 244.31px ' +
      'tall and directly clickable — 2.5.8 Equivalent, the same route `picker/picker.css ' +
      '.picker__label` takes. All seven interior probes returned the label and all four gaps ' +
      'returned no control. IT IS WIDER THAN THE FIELD IT LABELS at 1425px — 912.00px against ' +
      '666.00px, because it is a block in the reading column while the textarea is clamped to ' +
      '--measure-prose-max — so a quarter of its box is blank label to the right of the field. ' +
      'That region is not dead: `elementFromPoint` returns the label there and the label resolves ' +
      'to the textarea. Label activation could NOT be confirmed by a dispatched click, because a ' +
      'synthetic MouseEvent does not run the browser\'s default label behaviour; the binding is ' +
      'confirmed instead by `label.control`, which returns the textarea itself. Nearest other ' +
      'target 140.75px at 375px.',
    pass: { how: 'equivalent', by: 'pages/pages.css .report__text' },
  },
};

// ===========================================================================================
// THE OVERFLOW QUARANTINE — EMPTY SINCE 2026-08-16, AND KEPT
//
// Kept in the tree rather than in a transcript, and kept as a list rather than deleted with its
// entry, for the reason `KNOWN_DRIFT` exists: a red suite blocks every merge, so a found-but-
// unfixed defect needs somewhere honest to sit. The test below asserts every entry is STILL REAL
// by re-reading the stylesheet — so the day somebody fixes one, this file goes red and the entry
// has to be removed deliberately rather than rotting here as a stale claim.
//
// **THAT IS EXACTLY WHAT HAPPENED.** The one entry — `.nav__panel` running 114.64px off the right
// edge from 446px to 1279px — was fixed on 2026-08-16, its `inset-inline-start: 0` rule went, and
// the check below went red and named it. The entry was removed and the list is now empty. An empty
// quarantine is the state this list should be in; the tests below hold vacuously and are written
// to, so the next entry inherits the same discipline rather than a deleted section.
// ===========================================================================================

interface Overflow {
  /** The stylesheet declaration that causes it. Re-read on every run. */
  file: string;
  rule: RegExp;
  /** How far off the viewport, in CSS px, and at which measured client widths. */
  overflowPx: number;
  atClientWidths: readonly number[];
  found: string;
}

const KNOWN_OVERFLOW: Record<string, Overflow> = {};

/**
 * THE ENTRY THAT WAS HERE, KEPT AS PROSE BECAUSE THE MEASUREMENT IS WORTH MORE THAN THE DIFF.
 *
 * `shell/nav.css .nav__panel ran off the RIGHT edge from 446px to 1279px` — 114.64px, at client
 * widths 446, 500, 753 and 1264, caused by `.nav__panel { … inset-inline-start: 0 }`. Fixed
 * 2026-08-16; re-measured at nine client widths on two pages and the overflow is 0 at every one.
 * The fix is `margin-inline-start: auto` on `.nav`, which stops the toggle changing ends of the
 * header, plus the end anchor the panel had before 2026-08-15. Its reasoning is in `nav.css` and
 * its before-and-after tables are in `SiteNav.test.tsx`.
 *
 * The sentence it carried, kept verbatim because it is what a reader needs to understand why one
 * edge could not simply be swapped for the other:
 *
 * "FIXING IT IS A LAYOUT DECISION, NOT A TYPO … neither `inset-inline-start: 0` nor
 * `inset-inline-end: 0` works at both ends of the range, because the button itself moves from one
 * end of the header to the other. The options are (a) anchor the panel to the HEADER rather than
 * to `.nav`, which puts it on screen at every width but detaches it from the button on a laptop,
 * (b) give `.nav` the same wrap test the header does and swap the edge, which needs a measurement
 * React currently avoids on purpose, or (c) accept the overflow below 80rem."
 *
 * ═══ THE OPTION TAKEN WAS A FOURTH, AND IT IS WHY THE THREE ABOVE ARE KEPT ═══
 *
 * All three accept that the button moves and compensate for it. The fourth REMOVES the movement:
 * `margin-inline-start: auto` on `.nav` absorbs the free space on the nav's own line — wrapped or
 * not, one item on the line or two — so the nav's end edge is the header's content end at every
 * width, and the panel's end anchor is then correct everywhere by one piece of arithmetic.
 *
 * It beats (a) because (a) detaches the panel from its button at the widths where the header
 * wraps: with the panel on the header's end edge and the button at left 24, at a 375px client
 * width the two boxes would not even overlap horizontally, and a menu that does not touch the
 * control that opened it is a comprehension defect traded for a layout one. It beats (b) because
 * (b) needs a resize measurement in React, which `SiteNav` deliberately does not do (it watches
 * `matchMedia`, which fires when the ANSWER changes, not on every pixel of a drag) and which no
 * stylesheet sweep in this project can see. It beats (c) because the project owner ruled against
 * (c) on 2026-08-16: "I rule for the option that works at both ends even if it costs symmetry. An
 * 833px band where a menu runs off screen is worse than an asymmetric header."
 *
 * ITS PRICE, paid rather than hidden: below 446px the header wraps and the menu button now sits at
 * the RIGHT of its own line beneath a left-aligned wordmark. That is the asymmetry the ruling
 * bought, and it is the whole of what changed at 320 and 375, which were never the defect.
 */

// ===========================================================================================
// THE HARNESS — every registered control, in one document, in the state it was measured in
// ===========================================================================================

/**
 * The whole area in one tree: the shell (skip link, wordmark, navigation, footer), the landing
 * page's call to action, and the report page's three controls.
 *
 * `inlineNavOverride={false}` draws the hamburger — jsdom implements `matchMedia` as always-false,
 * so without it the desktop layout would be the only one ever seen. The menu is then OPENED,
 * because `.nav__link` does not exist in the document until it is: a test that queried the links
 * without opening would find nothing and pass by finding nothing.
 */
function renderArea(): HTMLElement {
  const { container } = render(
    <PageShell current="report" inlineNavOverride={false}>
      <Landing />
      <ReportPage />
    </PageShell>,
  );
  fireEvent.click(screen.getByRole('button', { name: /^(Menu|Close menu)$/ }));
  return container;
}

/** The CSS selector an entry's key carries, e.g. `.foot__links a`. */
const selectorOf = (key: string) => key.slice(key.indexOf(' ') + 1);

describe('ui-site/pointer targets', () => {
  it('the sweep really rendered something — every registered selector is in the document', () => {
    // THE TRIPWIRE ON THE TRIPWIRE. Every assertion below is of the form "the element at this
    // selector is what the register claims", and `querySelector` returning null would make all of
    // them vacuous. This one refuses that.
    const container = renderArea();
    const absent = Object.keys(TARGETS).filter((k) => !container.querySelector(selectorOf(k)));
    expect(absent).toEqual([]);
  });

  it('EVERY REGISTERED FIGURE WAS MEASURED AGAINST THE ELEMENT THAT STILL RENDERS THERE', () => {
    // ═══ THIS IS THE CHECK THE PROJECT DID NOT HAVE ═══
    //
    // `.defences__control` carried a published measurement while rendering a <div> that accepted
    // no pointer. No test could contradict it, because no test knew what the register thought it
    // was measuring. This one does: change the element type without re-measuring and it goes red
    // and names the selector.
    const container = renderArea();
    const wrong: string[] = [];
    for (const [key, entry] of Object.entries(TARGETS)) {
      const tag = container.querySelector(selectorOf(key))?.tagName.toLowerCase() ?? 'absent';
      if (tag !== entry.tag) wrong.push(`${key}: register says <${entry.tag}>, DOM has <${tag}>`);
    }
    expect(wrong).toEqual([]);
  });

  it('every control is a real control — never a div with a handler and a pointer cursor', () => {
    // The narrower half of the same defect. `.defences__control` was a <div> styled with
    // `cursor: pointer`, which is a visual claim to be a target that the DOM did not honour.
    const container = renderArea();
    const notReal: string[] = [];
    for (const key of Object.keys(TARGETS)) {
      const el = container.querySelector(selectorOf(key));
      if (!el?.matches('a[href], button, input, select, textarea, label')) notReal.push(key);
    }
    expect(notReal).toEqual([]);
  });

  it('the label is bound to a real control, so its "equivalent" pass leads somewhere', () => {
    const container = renderArea();
    const notBound: string[] = [];
    for (const [key, entry] of Object.entries(TARGETS)) {
      if (entry.tag !== 'label') continue;
      const el = container.querySelector(selectorOf(key)) as HTMLLabelElement | null;
      const bound = el?.htmlFor
        ? container.querySelector(`#${CSS.escape(el.htmlFor)}`)
        : (el?.querySelector('input, select, textarea') ?? null);
      if (!bound) notBound.push(key);
    }
    expect(notBound).toEqual([]);
  });

  it('EVERY CONTROL OWNS ITS OWN INTERIOR — all seven points, at both widths', () => {
    // The whole reason this file exists. An entry recording fewer than seven interior hits is an
    // entry describing a box that is not entirely clickable, and it must not sit here quietly.
    const notOwned = Object.entries(TARGETS)
      .filter(([, e]) => e.interiorHits !== 7)
      .map(([k, e]) => `${k}: ${e.interiorHits}/7 interior points resolved to ${e.clickOwner}`);
    expect(notOwned).toEqual([]);
  });

  it('every exterior probe that hit a control anyway is named, never left as a bare count', () => {
    // A clean gap is the default. Four out of four is silence; anything less has to say what it
    // hit, because "something is there" and "the wrong control is there" are different findings.
    const unexplained = Object.entries(TARGETS)
      .filter(([, e]) => e.gapsClean + e.gapHits.length !== 4)
      .map(([k, e]) => `${k}: ${e.gapsClean} clean gaps but ${e.gapHits.length} named hits`);
    expect(unexplained).toEqual([]);
  });

  it('no entry passes by spacing without stating a separation of at least 24px', () => {
    const vague = Object.entries(TARGETS)
      .filter(([, e]) => e.pass.how === 'spacing' && !(e.pass.separationPx >= 24))
      .map(([k]) => k);
    expect(vague).toEqual([]);
  });

  it('a stated separation is never larger than the nearest target actually measured', () => {
    // A spacing pass is only as good as the DENSEST state it was measured in. This refuses an
    // entry that claims more room than its own measurement found.
    const overclaimed = Object.entries(TARGETS)
      .filter(([, e]) => e.pass.how === 'spacing')
      .filter(([, e]) => {
        const claim = (e.pass as { separationPx: number }).separationPx;
        const measuredMin = Math.min(e.nearestCentrePx.at375, e.nearestCentrePx.at1425 ?? Infinity);
        return claim > measuredMin;
      })
      .map(([k]) => k);
    expect(overclaimed).toEqual([]);
  });

  it('a control under 24px takes a route that leads to a registered control passing by size', () => {
    // `spacing` and `equivalent` are the only two ways an under-24px box may stand here, and
    // `equivalent` is a claim ABOUT ANOTHER ENTRY. An unchecked cross-reference is how a chain of
    // passes ends at nothing.
    const broken: string[] = [];
    for (const [key, entry] of Object.entries(TARGETS)) {
      const boxes = [entry.box375, ...(entry.box1425 ? [entry.box1425] : [])];
      if (!boxes.some((b) => b[0] < 24 || b[1] < 24)) continue;
      if (entry.pass.how === 'spacing') continue;
      if (entry.pass.how !== 'equivalent') {
        broken.push(`${key}: under 24px but claims to pass by ${entry.pass.how}`);
        continue;
      }
      const carrier = TARGETS[entry.pass.by];
      if (!carrier) broken.push(`${key}: names ${entry.pass.by}, which is not registered`);
      else if (carrier.pass.how !== 'size')
        broken.push(`${key}: leans on ${entry.pass.by}, which does not pass by size`);
      else if (carrier.box375[1] < 24 || (carrier.box1425?.[1] ?? 24) < 24)
        broken.push(`${key}: leans on ${entry.pass.by}, whose own block axis is under 24px`);
    }
    expect(broken).toEqual([]);
  });

  it('every entry names its click owner and carries a dated measurement sentence', () => {
    // A figure without an owner is the exact shape of the claim that went wrong.
    const thin: string[] = [];
    for (const [key, entry] of Object.entries(TARGETS)) {
      if (!entry.clickOwner.trim()) thin.push(`${key}: no clickOwner`);
      if (entry.measured.trim().length < 80) thin.push(`${key}: no real measurement sentence`);
      if (!/20\d\d-\d\d-\d\d/.test(entry.measured)) thin.push(`${key}: measurement carries no date`);
    }
    expect(thin).toEqual([]);
  });

  it('an entry with no 1425px box says in words why it has none', () => {
    // `null` must mean "not rendered there", never "nobody looked". The only way to tell those
    // apart is the sentence, so the sentence is required to say so.
    const silent = Object.entries(TARGETS)
      .filter(([, e]) => e.box1425 === null)
      .filter(([, e]) => !/NOT RENDERED/.test(e.measured))
      .map(([k]) => k);
    expect(silent).toEqual([]);
  });
});

describe('ui-site/the overflow quarantine', () => {
  it('NAMES EVERY ENTRY OUT LOUD ON EVERY RUN — a finding, not a failure', () => {
    // EMPTY SINCE 2026-08-16, so this prints nothing and the check below holds vacuously. That is
    // deliberate: the assertion was `length > 0` while an entry sat here, which would have turned
    // the file red for the crime of having nothing wrong with it. What is worth checking is not
    // that a defect EXISTS but that any entry claiming to be one is fully stated — a bare count
    // with no measurement behind it is how a quarantine list becomes folklore.
    const thin: string[] = [];
    for (const [what, o] of Object.entries(KNOWN_OVERFLOW)) {
      console.warn(
        `\n  ${what}\n    ${o.overflowPx}px off the viewport at client widths ` +
          `${o.atClientWidths.join(', ')}.\n    ${o.found}\n`,
      );
      if (!(o.overflowPx > 0)) thin.push(`${what}: no overflow figure`);
      if (o.atClientWidths.length === 0) thin.push(`${what}: no client width it was measured at`);
      if (!/20\d\d-\d\d-\d\d/.test(o.found)) thin.push(`${what}: the finding carries no date`);
    }
    expect(thin).toEqual([]);
  });

  it('every entry still in the list is still real, checked against the stylesheet', () => {
    // The rule `KNOWN_DRIFT` follows: a quarantine list nobody prunes becomes a list of things
    // that used to be true. When the anchoring changes, this goes red and the entry must go.
    const stale: string[] = [];
    for (const [what, o] of Object.entries(KNOWN_OVERFLOW)) {
      const css = readFileSync(join(UI, o.file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (!o.rule.test(css)) stale.push(`${what}: the declaration that caused it is gone`);
    }
    expect(stale).toEqual([]);
  });

  it('THE HEADER STILL WRAPS, which is why the auto margin in nav.css is load-bearing', () => {
    // Named separately because the fix lives in TWO files and reading either alone makes the other
    // look redundant. `.shell__head` is a WRAPPING row: `justify-content: space-between` puts the
    // nav at the end while two items share a line, and does nothing at all on the narrow widths
    // where the nav gets a line to itself. `margin-inline-start: auto` on `.nav` is what covers
    // the second case — so anyone who deletes it because "the header already right-aligns the nav"
    // has read this rule and not the wrap.
    //
    // This asserts the wrap is still there rather than that it is gone: if the header ever stops
    // wrapping, the auto margin stops being the load-bearing half and this comment stops being
    // true, which is a change that must be made deliberately.
    const css = readFileSync(join(UI, 'shell/shell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const head = /\.shell__head \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(head).toMatch(/justify-content:\s*space-between/);
    expect(head).toMatch(/flex-wrap:\s*wrap/);

    const nav = readFileSync(join(UI, 'shell/nav.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/\n\.nav \{([\s\S]*?)\n\}/.exec(nav)?.[1] ?? '').toMatch(/margin-inline-start:\s*auto/);
  });
});
