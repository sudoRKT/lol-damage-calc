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
 */
const PAGES: PageLength[] = [
  {
    path: '/calculator/',
    width: 1440,
    height: 1100,
    scrollHeight: 5632,
    screens: 5.12,
    budget: 5.12,
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
    scrollHeight: 10386,
    screens: 12.79,
    budget: 12.79,
    measured:
      'Lead, 2026-08-15, dev server, default scenario. Was 23.94 screens before the length pass, ' +
      '11.07 after it, 12.79 now. No horizontal overflow: scrollWidth equals the 375 viewport ' +
      'exactly. THE PHONE FIGURE HAS NEVER MET ITS TARGET — 8 screens was asked for and 11.07 ' +
      'was what the pass achieved, which was reported at the time rather than rounded down to ' +
      'the target.',
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
