// THE SEQUENCE LANE NEVER PUSHES THE PAGE SIDEWAYS — the browser measurement, and the two
// declarations that produce it, pinned so neither can be edited away silently.
//
// ═══ WHAT WAS WRONG, MEASURED IN A REAL BROWSER ON 2026-08-16 ═══
//
// `.combo__lane--sequence` was `flex: 1 1 0`. A flex basis of ZERO means the lane asks for
// nothing, so `.combo__lanes` handed it whatever the shelf lane left over — 6.86px at a 520px
// viewport. `li.combo__step` is 138.16px and CANNOT shrink (`flex: 0 1 auto` plus the automatic
// `min-width: auto`, and its width is set by a row of three WCAG-sized buttons), so the card hung
// out of its lane, out of the panel and out of the DOCUMENT. SPECIFICATION §10 forbids that: a
// TABLE scrolling inside its own `.u-scroll-x` region is the design, the document scrolling is not.
//
// A basis of zero also meant the flex line never broke on the sequence's account, so no viewport
// was ever narrow enough to make the two lanes stack for this reason.
//
// ═══ WHAT THIS FILE CAN AND CANNOT DO, STATED PLAINLY ═══
//
// **IT CANNOT MEASURE THE OVERFLOW.** jsdom computes no layout — every box is zero by zero and
// `scrollWidth` is always 0, so nothing here can tell you the page fits. Every figure below is a
// BROWSER measurement, recorded here and in `combo.css` so the project keeps it.
//
// What it does instead is refuse the two edits that reopen the defect, and hold the record of what
// was measured next to them. Both edits are silent: the component renders, every name is right,
// every control still works, and the page scrolls sideways.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMBO = readFileSync(join(HERE, 'combo.css'), 'utf8');

/** combo.css with every comment removed — the measurements are prose and must not be matched. */
const RULES = COMBO.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declared value of one property inside one rule of combo.css. */
function declaration(selector: string, property: string): string {
  const rule = RULES.match(new RegExp(`(?:^|\\n)${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`));
  if (!rule) throw new Error(`combo.css has no rule for ${selector}`);
  const decl = rule[1]!.match(new RegExp(`(?:^|;|\\n)\\s*${property}:\\s*([^;]+);`));
  if (!decl) throw new Error(`${selector} declares no ${property}`);
  return decl[1]!.trim();
}

/**
 * The band, as data rather than as prose, so a later reader can diff it against a re-measurement
 * instead of re-reading a paragraph.
 *
 * `clientWidth` was read back INSIDE every measuring call and the reading discarded unless it
 * equalled its target — the browser pane is shared. Overflow is
 * `documentElement.scrollWidth − documentElement.clientWidth`, never anything involving
 * `innerWidth`, which includes the scrollbar and reads 0 over a page that genuinely overflows.
 * The scenario is the one the calculator opens on: Lux, a four-step combo, menu closed.
 */
const BAND = [
  { clientWidth: 320, asBuilt: 0, fixed: 0, laneAsBuilt: 238 },
  { clientWidth: 375, asBuilt: 0, fixed: 0, laneAsBuilt: 293 },
  { clientWidth: 400, asBuilt: 0, fixed: 0, laneAsBuilt: 318 },
  { clientWidth: 426, asBuilt: 84, fixed: 0, laneAsBuilt: 13.09 },
  { clientWidth: 440, asBuilt: 70, fixed: 0, laneAsBuilt: 27.09 },
  { clientWidth: 441, asBuilt: 69, fixed: 0, laneAsBuilt: 28.09 },
  { clientWidth: 481, asBuilt: 29, fixed: 0, laneAsBuilt: 68.09 },
  // 500 IS CLEAN IN THE MIDDLE OF THE BAND, and that is the whole reason the band was swept
  // densely rather than sampled. The shelf takes a line of its own here, so the sequence already
  // had the full 418px. A reading at 500 alone would have reported nothing wrong.
  { clientWidth: 500, asBuilt: 0, fixed: 0, laneAsBuilt: 418 },
  { clientWidth: 520, asBuilt: 90, fixed: 0, laneAsBuilt: 6.86 },
  { clientWidth: 560, asBuilt: 50, fixed: 0, laneAsBuilt: 46.86 },
  { clientWidth: 600, asBuilt: 10, fixed: 0, laneAsBuilt: 86.86 },
  { clientWidth: 640, asBuilt: 0, fixed: 0, laneAsBuilt: 126.86 },
  { clientWidth: 656, asBuilt: 0, fixed: 0, laneAsBuilt: 142.86 },
  { clientWidth: 800, asBuilt: 0, fixed: 0, laneAsBuilt: 286.86 },
  { clientWidth: 960, asBuilt: 0, fixed: 0, laneAsBuilt: 446.86 },
  { clientWidth: 1120, asBuilt: 0, fixed: 0, laneAsBuilt: 606.86 },
  { clientWidth: 1264, asBuilt: 0, fixed: 0, laneAsBuilt: 750.86 },
  { clientWidth: 1440, asBuilt: 0, fixed: 0, laneAsBuilt: 926.86 },
] as const;

/** The step card, at every one of the eighteen widths above, with and without the fix. */
const STEP_CARD = { inline: 138.16, block: 100.58 };

/**
 * The distance from the sequence lane's right edge to the right edge of the viewport: the panel's
 * `--space-4` padding, its 1px border and the page's `--space-5` gutter. Measured at three widths
 * and the same at all of them — the lane's right edge sits at clientWidth − 41 at 440, 520 and 640.
 * It is what a card spilling out of its lane has to cross before the DOCUMENT scrolls.
 */
const RIGHT_GUTTER = 41;

/**
 * The pointer sweep of 2026-08-16, RE-RUN after the fix, because the fix moves the cards.
 *
 * Each of the 18 controls was scrolled to the middle of the viewport and sampled on a 1px grid
 * over its whole border box; every sample was resolved with
 * `elementFromPoint(x, y).closest('button')` and compared against the control itself. `wcag` is a
 * 24 x 24px square centred on each control — the area WCAG 2.2 AA 2.5.8 is about.
 */
const POINTER_SWEEP = [
  {
    clientWidth: 375,
    note: 'the fix changes no layout here — the lanes already stacked. The control column is the same as the original sweep.',
    controls: 18,
    samples: 22578,
    hits: 22551,
    misses: 27,
    missesResolvingToAnotherButton: 0,
    wcagSquares: '10368/10368',
    outsideEdgeProbes: '72/72 hit no button',
  },
  {
    clientWidth: 520,
    note: 'the width where the fix bites hardest — the lane goes 6.86px → 438px and the cards relay out two per row.',
    controls: 18,
    samples: 22644,
    hits: 22621,
    misses: 23,
    missesResolvingToAnotherButton: 0,
    wcagSquares: '10368/10368',
    outsideEdgeProbes: '72/72 hit no button',
  },
] as const;

describe('combo/the record is about something', () => {
  it('swept a band, not two convenient widths', () => {
    // A sweep at 375 and 1440 alone reports a clean page. That is how this survived every check
    // this area owns, and it is why the population is asserted rather than assumed.
    expect(BAND).toHaveLength(18);
    expect(BAND.filter((w) => w.asBuilt > 0)).toHaveLength(7);
    expect(BAND.some((w) => w.clientWidth === 375 && w.asBuilt === 0)).toBe(true);
    expect(BAND.some((w) => w.clientWidth === 1440 && w.asBuilt === 0)).toBe(true);
  });

  it('reports zero overflow at every width after the fix', () => {
    expect(BAND.filter((w) => w.fixed !== 0)).toEqual([]);
  });

  it('reproduces every measured overflow from the lane width alone', () => {
    // THE TWO MEASURED COLUMNS AGREE WITH EACH OTHER BY ARITHMETIC, at all eighteen widths, which
    // is what makes this a cause rather than a correlation: a card that cannot shrink starts at
    // the lane's left edge and ends 138.16px later, so it reaches
    //   (clientWidth − 41 − lane) + 138.16
    // and the document scrolls by whatever that is past clientWidth. `scrollWidth` is an integer,
    // so the fraction is floored.
    //
    // It also explains the one row a reader would otherwise call inconsistent: at 640 the lane is
    // 126.86px and the card DOES hang out of it, by 11.3px — but the gutter is 41px wide, so the
    // spill lands in the panel's own padding and the document never moves. The defect is visible
    // at 600 and invisible at 640 for that reason, not because the layout is sound there.
    for (const w of BAND) {
      const predicted = Math.max(0, Math.floor(STEP_CARD.inline - RIGHT_GUTTER - w.laneAsBuilt));
      expect(predicted, `clientWidth ${w.clientWidth}`).toBe(w.asBuilt);
    }
  });
});

describe('combo/the sequence lane asks for one card before it shares a line', () => {
  it('never carries a flex basis of zero', () => {
    // PROVED TO FAIL: restoring `flex: 1 1 0` here reports "1 1 0" and turns this red. That one
    // token is the whole defect — it is what let the lane be handed 6.86px.
    const flex = declaration('.combo__lane--sequence', 'flex');
    const basis = flex.split(/\s+/).at(-1)!;
    expect(basis, `.combo__lane--sequence { flex: ${flex} }`).not.toMatch(/^0(px|rem|%)?$/);
  });

  it('takes its basis from the content, so no pixel threshold is written down', () => {
    // `min-content` resolves to the widest thing the lane holds, which IS one step card. A card
    // that changes width carries the threshold with it, and nothing here needs re-measuring.
    expect(declaration('.combo__lane--sequence', 'flex')).toBe('1 1 min-content');
  });

  it('keeps the wrapping that turns that basis into a stacked layout', () => {
    // PROVED TO FAIL: `flex-wrap: nowrap` on `.combo__lanes` reports "nowrap" and turns this red.
    // The basis and the wrap are ONE fix in two declarations — without wrapping, a lane that asks
    // for 138.16px and cannot get it is shrunk instead, and the card hangs out exactly as before.
    //
    // PROVED IN THE BROWSER TOO, not only asserted: with `nowrap` and the new basis in place, a
    // 440px viewport gives a 72.56px lane and 25px of document overflow. With `wrap` it is a 358px
    // lane and 0px. The declaration that stops the page scrolling is the pair, not the basis.
    expect(declaration('.combo__lanes', 'display')).toBe('flex');
    expect(declaration('.combo__lanes', 'flex-wrap')).toBe('wrap');
  });

  it('adds no width query — DESIGN.md §4b spends the one it has on the burndown', () => {
    // §4b: "@media (max-width: 30rem) is the only width query this product may write", and what it
    // governs is the burndown's riser labels, exhaustively. This area writes none at all, and the
    // fix above is why it does not need one: `min-content` is intrinsic sizing, not a design value.
    expect(RULES).not.toMatch(/@media[^{]*\((?:min|max)-width/);
  });
});

describe('combo/the fix did not buy the page width out of the controls', () => {
  it('leaves the step card at the size it was measured at', () => {
    // The other way to close this defect is to let the card shrink, which means squeezing the
    // three controls — and `.combo__control` is the reason `--target-min` exists at all. Measured
    // with the fix at all eighteen widths: the card is 138.16 x 100.58px, `.combo__control` is
    // 34.47 x 25.39px and `.combo__control--remove` 35.22 x 25.39px, every figure identical to
    // the pre-fix build. The declarations those figures come from are asserted in
    // `./target-size.test.ts`; what is asserted HERE is that this area still holds the floor.
    expect(declaration('.combo__control', 'min-inline-size')).toBe('var(--target-min)');
    expect(declaration('.combo__control', 'min-block-size')).toBe('var(--target-min)');
    expect(STEP_CARD).toEqual({ inline: 138.16, block: 100.58 });
  });

  it('declares nothing on the step that would make it shrink to fit', () => {
    // A `min-inline-size: 0` or an `overflow: hidden` on the card would also stop the page
    // scrolling — by clipping a control instead of moving the lane. That is the trade DESIGN.md §8
    // names in general form: move the thing that does not fit, never resize the data.
    const card = RULES.match(/\n\.combo__step\s*\{([^}]*)\}/)![1]!;
    expect(card).not.toMatch(/min-inline-size|min-width|overflow/);
  });

  it('keeps the pointer sweep it re-ran, with the two counts that matter', () => {
    // 2.5.8 is about the 24 x 24px square, and no sample anywhere resolved to a NEIGHBOURING
    // control — which is the property that makes a mis-aimed tap do nothing rather than remove a
    // combo step. All 23 misses at 520px are the final fractional row or column of a box whose
    // height is 25.39px, which is hit-testing rounding to device pixels.
    for (const sweep of POINTER_SWEEP) {
      expect(sweep.controls).toBe(18);
      expect(sweep.missesResolvingToAnotherButton).toBe(0);
      expect(sweep.wcagSquares).toBe('10368/10368');
      expect(sweep.hits + sweep.misses).toBe(sweep.samples);
    }
    expect(POINTER_SWEEP.map((s) => s.clientWidth)).toEqual([375, 520]);
  });
});
