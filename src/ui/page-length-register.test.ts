// THE PAGE MAY NOT GET LONGER WITHOUT SOMEBODY SAYING SO.
//
// ═══ WHY THIS EXISTS ═══
//
// The calculator page's length has been fixed once and has drifted back twice.
//
//   2026-08-14  measured at 9.23 screens at 1440 and 23.94 at 375 — the burndown, which is the
//               signature element of the whole product, began 309px BELOW the fold.
//   2026-08-14  fixed, in one deliberate pass, to 4.37 and 11.07. The single largest cause was the
//               same 22-item exclusions list printed three times: 41.1% of the page.
//   2026-08-15  measured again at 5.12 and 12.79. Nobody added a long section; eight areas each
//               added a little, and no single change looked like a regression to the area making
//               it.
//
// **That is the failure mode this file addresses: length is a PRODUCT-WIDE property that no
// AREA owns.** Every partitioned area can grow the page slightly and be individually reasonable.
// Twelve reasonable additions are a page nobody can use.
//
// ═══ WHAT THIS FILE CAN AND CANNOT DO ═══
//
// **jsdom computes no layout, so nothing here measures a rendered page.** Every figure below is a
// browser measurement taken by a person, exactly as `target-size-register.test.ts` records target
// sizes and for the same reason. What is enforced mechanically is that the figures are RECORDED,
// that each carries the date and viewport it was taken at, and that a budget is stated rather than
// implied.
//
// The check that actually fails on growth has to run in a browser. Until that exists, this file is
// the pin: a person re-measures, and if the figure has moved past its budget, the entry cannot be
// updated without stating what grew and why. **Raising a budget is a decision, not a maintenance
// task** — the whole point is that drift has to be argued for rather than absorbed.

import { describe, expect, it } from 'vitest';

interface PageLength {
  /** Page path as served. */
  path: string;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
  /** `document.documentElement.scrollHeight`, in CSS pixels. */
  scrollHeight: number;
  /** scrollHeight / viewport height. The figure a reader feels. */
  screens: number;
  /** The most this page may be before someone has to argue for it. */
  budget: number;
  /** Who measured it, when, and anything that would change the number. */
  measured: string;
}

/**
 * THE PINNED MEASUREMENTS. Taken by the lead in a real browser on 2026-08-15, on the dev server,
 * default scenario (Lux against Garen, both level 18), no items and no runes selected.
 *
 * **The budgets are today's figures, deliberately.** Not the 4.37/11.07 target, because pinning a
 * budget the page already exceeds makes the check red on arrival and it gets disabled within a day.
 * Today's number is the ceiling; getting BACK under 4.37 and 11.07 is separate work, and when it
 * lands these budgets come down with it.
 *
 * ═══ WHAT A FOCUSED PASS ON 2026-08-16 ACTUALLY BOUGHT, AND WHERE THE PAGE REALLY IS ═══
 *
 * **Measured by structure at 375px before changing anything**, which is the step that decided the
 * pass:
 *
 *   app__head                140px    1.3%
 *   setup region           3,306px   31.8%   two config panels, items, runes, defences, combo
 *   result region          1,178px   11.3%   the burndown (853) plus its caption plate and notices
 *   **detail region        5,060px   48.7%**  breakdown 1,076 · curves 1,089 · curves 814 · row 2,033
 *
 * **THE DETAIL REGION IS HALF THE PAGE**, and it is four full panels stacked below the result.
 *
 * Two candidate causes were then measured by toggling them live and re-reading `scrollHeight`:
 *
 *   the burndown's `<ol>` axis carrying an unset `margin-block: 1em`      22px   TAKEN
 *   the breakdown's four repeated label stems, shortened                 215px
 *   the same column's state moved into the disclosure already in it      275px
 *
 * **A CORRECTION TO THE FRAMING THAT JUSTIFIED THIS PASS, which was mine.** The breakdown column
 * was described as "the same shape as the exclusions list printed three times". It is the same
 * SHAPE — repeated stems, 249 of 316 characters — and it is nothing like the same SIZE. The
 * exclusions list was **41.1%** of the page; this column is **2.6%** of it. Reporting the shape
 * without the size pointed a page-length pass at something that cannot move a page.
 *
 * **What is achievable, stated as arithmetic rather than as a promise.** 11.07 screens at 375px is
 * 8,989px. The page is 10,375px. That is **1,386px to remove**, and every cause identified above
 * put together comes to **297px — 21% of it**. The remaining 1,089px is not a defect anybody can
 * find; it is four detail panels each of which a reader may want. **Closing that gap is a design
 * decision about collapsing detail panels on a phone, not a bug to fix**, and it belongs to the
 * project owner rather than to a measurement pass.
 */
const PAGES: PageLength[] = [
  {
    path: '/calculator/',
    width: 1440,
    height: 1100,
    scrollHeight: 5619,
    screens: 5.11,
    budget: 5.11,
    measured:
      'Lead, 2026-08-15, dev server, default scenario. Was 9.23 screens before the 2026-08-14 ' +
      'length pass, 4.37 after it, and 5.12 now — drift from eight areas, none of which added a ' +
      'long section. scrollWidth 1425 against a 1440 viewport, so no horizontal overflow. ' +
      'Re-measured after --elev-1 was applied and then removed: a box-shadow cannot affect ' +
      'layout and an A/B toggling it confirmed every box identical to the thousandth of a pixel.',
  },
  {
    path: '/calculator/',
    width: 375,
    height: 812,
    scrollHeight: 10375,
    screens: 12.78,
    budget: 12.78,
    measured:
      'Lead, 2026-08-15, dev server, default scenario. Was 23.94 screens before the length pass, ' +
      '11.07 after it, 12.79 now. THE PHONE FIGURE HAS NEVER MET ITS TARGET — 8 screens was ' +
      'asked for and 11.07 was what the pass achieved, which was reported at the time rather ' +
      'than rounded down to the target. ' +
      '═══ HORIZONTAL OVERFLOW: MEASURE IT WITH clientWidth, NEVER innerWidth. ═══ ' +
      'This entry originally read "no horizontal overflow: scrollWidth equals the 375 viewport ' +
      'exactly", derived from `scrollWidth - innerWidth`. **That subtraction cannot detect ' +
      'overflow when a scrollbar is present**, because innerWidth INCLUDES the scrollbar and ' +
      'scrollWidth does not — the two grow together and the difference stays 0. The ui-breakdown ' +
      'area hit exactly this on 2026-08-16, reading clientWidth 375 against scrollWidth 404: a ' +
      '29px overflow that the innerWidth form reports as zero. ' +
      'RE-MEASURED with clientWidth by the lead, same session: 375 / 375 / 375 on the default ' +
      'scenario AND with all four breakdown disclosures opened, so **no overflow reproduced ' +
      'here**. 104 elements do extend to x=552, and every one is inside a `.u-scroll-x` ' +
      'container doing its job — the table scrolls in its own region, which is the design. ' +
      "The 404 reading is NOT dismissed: that agent's tab was resized under it three times and " +
      'its scenario changed from 4 combo instances to 5 mid-run, so a state exists that this ' +
      'measurement did not cover. DESIGN-AUDIT item 5 (mobile horizontal overflow) remains ' +
      'OPEN, and the next person to chase it should vary the instance count first.',
  },
  // ═══ THE LANDING PAGE, RESCUED FROM A COMMIT MESSAGE 2026-08-16 ═══
  //
  // An audit of every commit message in this repository for measurements that never reached a file
  // found 21 across 6 commits. `1.44 screens` for the landing page was one of them: this register
  // existed and covered only `/calculator/`, so a figure with an obvious home had nowhere to go.
  //
  // NOT re-typed from that message. Re-measured in a browser, and it does not agree with it — the
  // page is 1.62 screens at 1440 now, not 1.44. The old figure described a page that has since
  // changed, which is exactly why a number in a commit message is not a record: nobody could tell
  // whether it had drifted, because nothing was checking.
  {
    path: '/',
    width: 1440,
    height: 1100,
    scrollHeight: 1783,
    screens: 1.62,
    budget: 1.62,
    measured:
      'Lead, 2026-08-16, dev server. Rescued from commit 18f08e9, which stated 1.44 screens in its ' +
      'message and in no file; re-measured rather than re-typed, and it had drifted to 1.62. No ' +
      'horizontal overflow, measured with clientWidth (1425 against 1425).',
  },
  {
    path: '/',
    width: 375,
    height: 812,
    scrollHeight: 3052,
    screens: 3.76,
    budget: 3.76,
    measured:
      'Lead, 2026-08-16, dev server. The landing page is the first thing a stranger sees and it is ' +
      'a fifth of the calculator on a phone (3.76 screens against 12.78). No horizontal overflow, ' +
      'measured with clientWidth. Its bundle claim — 6.2 kB of JavaScript against the calculator\'s ' +
      '83.9 kB — is a SEPARATE figure from the same commit and is still unrecorded: no bundle-size ' +
      'check exists anywhere in this project. That is a gap, not an oversight in this file.',
  },
];

describe('page length/the figures are recorded, not remembered', () => {
  it('every pinned page states a real measurement and not a placeholder', () => {
    for (const p of PAGES) {
      expect(p.measured.length, `${p.path} at ${p.width}`).toBeGreaterThan(60);
      expect(p.scrollHeight).toBeGreaterThan(0);
    }
  });

  it('the stated screens figure is the arithmetic of the stated boxes', () => {
    // The defect this catches is a hand-edited `screens` that no longer follows from its own
    // scrollHeight — the same class as a count whose name stopped matching its definition.
    for (const p of PAGES) {
      const derived = +(p.scrollHeight / p.height).toFixed(2);
      expect(derived, `${p.path} at ${p.width}: ${p.scrollHeight}/${p.height}`).toBe(p.screens);
    }
  });

  it('NO PAGE EXCEEDS ITS BUDGET', () => {
    // Today this passes by equality at both widths, because the budget IS today's figure. The next
    // person to grow the page has to come here and argue the number up.
    const over = PAGES.filter((p) => p.screens > p.budget).map(
      (p) => `${p.path} at ${p.width}px: ${p.screens} screens against a budget of ${p.budget}`,
    );
    expect(over).toEqual([]);
  });

  it('NAMES THE DISTANCE STILL TO GO — a worklist, not a failure', () => {
    // Deliberately not asserted. The targets are 4.37 at 1440 and 11.07 at 375, which the page met
    // once and has drifted from. Asserting them today would be red on arrival.
    const TARGET: Record<number, number> = { 1440: 4.37, 375: 11.07 };
    const behind = PAGES.filter((p) => p.screens > (TARGET[p.width] ?? Infinity));
    if (behind.length > 0) {
      console.warn(
        `\n  ${behind.length} page measurement(s) are above the figure the 2026-08-14 length pass ` +
          `achieved:\n` +
          behind
            .map(
              (p) =>
                `    - ${p.path} at ${p.width}px: ${p.screens} screens, target ${TARGET[p.width]}` +
                ` (${(p.screens - TARGET[p.width]!).toFixed(2)} screens of drift)`,
            )
            .join('\n') +
          `\n  jsdom computes no layout. Re-measuring these needs a real browser.\n`,
      );
    }
    expect(PAGES.length).toBeGreaterThanOrEqual(2);
  });
});
