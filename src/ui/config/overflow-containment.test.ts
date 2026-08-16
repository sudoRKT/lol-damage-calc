// THE OVERFLOW-CONTAINMENT REGISTER for the configuration area — `config/`, `picker/`, `items/`
// and `inputs/`.
//
// ═══ WHY THIS FILE EXISTS ═══
//
// DESIGN-AUDIT.md §6.5 records a SPECIFICATION §10 violation: at a 375px viewport the calculator's
// `document.documentElement.scrollWidth` measured 579px, so the page scrolled sideways on a phone.
// The cause named there was the per-instance breakdown table, and the fix was to confine that
// table's scroll to its own region (`../primitives/TableScroller.tsx`, `.u-scroll-x`).
//
// **THAT FIX IS INCOMPLETE, AND THIS FILE IS WHERE THE MEASUREMENT THAT SHOWS IT LIVES.** The
// remeasurement below was taken on 2026-08-16 in a real Chrome. It found the page still scrolls
// sideways — by up to 702px — and that NONE of it comes from this area. The register is kept here
// because this area was sent to measure it; the defect it names belongs to files this area may not
// write, and is reported rather than fixed (CLAUDE.md, "one writer per file").
//
// ═══ HOW EVERY FIGURE BELOW WAS TAKEN ═══
//
// DEFINITION — document overflow: `document.documentElement.scrollWidth` minus
// `document.documentElement.clientWidth`, both read in the same expression, on `/calculator/`
// served by `npm run dev`.
//
// **`clientWidth`, NEVER `innerWidth`.** `innerWidth` counts the vertical scrollbar and
// `scrollWidth` does not, so `scrollWidth - innerWidth` reads 0 on a page that genuinely overflows.
// That subtraction has already produced one wrong "no overflow" answer on this project.
//
// The viewport was produced by an off-screen `<iframe>` of a stated pixel width rather than by
// resizing the browser window, because the browser pane is shared between concurrent agents and a
// window resize under another agent's measurement is how DESIGN-AUDIT's 375-vs-404 disagreement
// arose. The iframe carries a 15px classic scrollbar, so an iframe of 390px yields an inner
// `clientWidth` of exactly 375px. Every reading below is stated at its inner `clientWidth`.
//
// ═══ MEASUREMENT 1 — THE DEFAULT SCENARIO IS CLEAN, WHICH IS WHY THIS WAS MISSED ═══
//
// Lux vs Garen, level 6, no items, the 4 combo instances the page opens on, nothing expanded:
//
//   clientWidth 375 · scrollWidth 375 · overflow **0px**
//
// 104 elements do extend to x=552, and every one of them is inside a `.u-scroll-x` region, which
// is the design. A session that measures the default scenario and stops finds nothing wrong.
//
// ═══ MEASUREMENT 2 — THE OVERFLOW IS STATE-DEPENDENT, AND THE STATE IS ORDINARY ═══
//
// Same page, same viewport, one thing at a time added:
//
//   | state (clientWidth 375 throughout)                     | overflow |
//   |--------------------------------------------------------|---------:|
//   | default — 4 combo instances                            |      0px |
//   | 12 combo instances                                     |     12px |
//   | + 4 items on the attacker, 3 on the defender           |     30px |
//   | + a full 6-of-6 rune page on the attacker              |     30px |
//   | + every disclosure on the page opened                  |  **667px** |
//
// Adding items and a full rune page moved the figure by NOTHING, which is the finding this area
// was sent for: **the configuration panels do not overflow at any width measured.** The jumps come
// from the combo sequence and from the disclosures.
//
// ═══ MEASUREMENT 3 — THE CAUSE, PROVED BY TOGGLING RATHER THAN ASSERTED ═══
//
// `.u-scroll-x` is `overflow-x: auto` and nothing else (`../primitives/primitives.css`). It is
// `position: static`. **An overflow container clips an absolutely positioned descendant only when
// it is that descendant's containing block, and a static element never is.** `.u-visually-hidden`
// is `position: absolute` (same file). So every screen-reader-only span inside a scrolling table
// escapes the region entirely and lands at its static position — hundreds of pixels to the right of
// the phone — where it extends the DOCUMENT's scrollable area.
//
//   151 absolutely positioned `.u-visually-hidden` spans escape 5 of the 6 scroll regions.
//   The furthest sits at x = 1042.4 in a 375px viewport. 1042.4 − 375 = 667.4 = the overflow.
//
// Proved two ways, both by injecting a rule and removing it again in the same expression:
//
//   `.u-scroll-x .u-visually-hidden { position: static }`  →  overflow 12px → 0px → 12px restored
//   `.u-scroll-x { position: relative }`                   →  overflow 667px → 0px → 667px restored
//
// Across viewports, with every disclosure open and 10 combo instances:
//
//   | clientWidth | as built | with `.u-scroll-x { position: relative }` |
//   |------------:|---------:|-----------------------------------------:|
//   |         320 |    702px |                                     **0px** |
//   |         360 |    662px |                                     **0px** |
//   |         375 |    647px |                                     **0px** |
//   |         400 |    622px |                                     **0px** |
//
// The four scroll regions still scroll by exactly the same amounts with the rule applied as without
// it (0 / 254 / 45 / 53px), so the containment costs the feature nothing.
//
// **THIS IS ONE DECLARATION IN `../primitives/primitives.css`, WHICH IS LEAD-ONLY. IT IS NOT MADE
// HERE.** It is reported, with the measurement above, for the lead to apply.
//
// ═══ MEASUREMENT 4 — A SECOND, INDEPENDENT DEFECT THAT THE ABOVE DOES NOT CLOSE ═══
//
// Between roughly 440px and 640px the containment fix leaves a residue. `.combo__sequence`'s
// `li.combo__step` items measure 138.2px and cannot shrink (`flex: 0 1 auto`, `min-width: auto`),
// while `.combo__lanes` is a flex row that hands the sequence lane whatever the shelf lane leaves:
//
//   | clientWidth | sequence lane | step | residual overflow after the containment fix |
//   |------------:|--------------:|-----:|--------------------------------------------:|
//   |      ≤ 400  |      full width |138.2px|                                        0px |
//   |         441 |        28.1px |138.2px|                                       69px |
//   |         481 |        68.1px |138.2px|                                       29px |
//   |         520 |         6.9px |138.2px|                                   **90px** |
//   |         560 |        46.9px |138.2px|                                       50px |
//   |         600 |        86.9px |138.2px|                                       10px |
//   |         640 |       126.9px |138.2px|                                        0px |
//
// Below 400px the lanes stack and the sequence lane is full width, so it does not arise on a phone.
// **`src/ui/combo/` is another area's and this is reported, not fixed.**
//
// ═══ WHAT THIS FILE THEN CHECKS, WHICH IS ONLY WHAT THIS AREA OWNS ═══
//
// A measurement is evidence about one revision of one page. The durable half is the defect CLASS:
// **a scroll container that is not a containing block does not contain what it appears to.** This
// area declares exactly one scroll container — `.picker__list` — and it is already correct, because
// it is `position: absolute` in the same rule. The check below is what keeps that true, and what
// refuses a second scroll container added here without it.
//
// LIMIT, STATED PLAINLY: this sweeps FOUR DIRECTORIES, not the product. The product-wide form of it
// belongs in `../responsive-overflow.test.tsx`, which is lead-only and is reported to rather than
// edited. It also reads declarations out of the file — it computes no layout, so it can prove the
// construction is right and can never prove the page fits a phone. That is a real-browser
// measurement and the four tables above are it.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(HERE, '..');

/** The four directories that travel together as this area (CLAUDE.md, "The guards"). */
const AREA = ['config', 'picker', 'items', 'inputs'];

const STYLESHEETS = AREA.flatMap((dir) =>
  readdirSync(join(UI_DIR, dir))
    .filter((f) => f.endsWith('.css'))
    .map((f) => join(UI_DIR, dir, f)),
);

const rel = (f: string) => relative(UI_DIR, f);
const stripCss = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Flat CSS into { selector, body } pairs. These stylesheets have no nesting. */
function rules(css: string): Array<{ selector: string; body: string }> {
  return [...stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));
}

/** Does this rule turn its element into a scroll container on either axis? */
function scrolls(body: string): boolean {
  return /(?:^|[\s;])overflow(?:-x|-y|-inline|-block)?:\s*(auto|scroll|hidden)/.test(body);
}

/**
 * Does this rule make its element a containing block for absolutely positioned descendants?
 *
 * `position: static` does not, and that is the whole defect. `relative`, `absolute`, `fixed` and
 * `sticky` all do. So do `contain: paint`/`layout` and a `transform`/`filter`, but none of those
 * appear in this area and admitting them here would widen the check on a guess rather than on a
 * measurement — CLAUDE.md's rule about widening a detector.
 */
function containsAbsolutes(body: string): boolean {
  return /(?:^|[\s;])position:\s*(relative|absolute|fixed|sticky)/.test(body);
}

/**
 * A scroll container in this area permitted to be `position: static`, with the reason its
 * absolutely positioned descendants cannot escape it. "It looks fine" is not an entry — a reason
 * must say why no absolutely positioned descendant exists or why one could not reach the viewport
 * edge. THE LIST IS EMPTY, and an empty list is the correct state.
 */
const STATIC_SCROLLER_ALLOWLIST: Array<{ rule: string; reason: string }> = [];

describe('overflow-containment/population', () => {
  it('is looking at this area’s four stylesheets and not at nothing', () => {
    expect(STYLESHEETS.length).toBeGreaterThanOrEqual(5);
    for (const dir of AREA) {
      expect(STYLESHEETS.some((f) => rel(f).startsWith(dir + '/'))).toBe(true);
    }
  });

  it('this area really does declare a scroll container — the sweep cannot pass by finding none', () => {
    // If this ever goes to zero the check below becomes vacuous, and a vacuous check that reports
    // green is worse than no check. `.picker__list` is the one, and it is named so that removing
    // it is a deliberate act rather than a silent loss of coverage.
    const found = STYLESHEETS.flatMap((f) =>
      rules(readFileSync(f, 'utf8'))
        .filter((r) => scrolls(r.body))
        .map((r) => `${rel(f)} ${r.selector}`),
    );
    expect(found).toEqual(['picker/picker.css .picker__list']);
  });
});

describe('overflow-containment/a scroll container contains what it appears to', () => {
  it('every scroll container in this area is also a containing block', () => {
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const r of rules(readFileSync(f, 'utf8'))) {
        if (!scrolls(r.body)) continue;
        if (containsAbsolutes(r.body)) continue;
        if (STATIC_SCROLLER_ALLOWLIST.some((a) => r.selector.includes(a.rule))) continue;
        offenders.push(
          `${rel(f)} ${r.selector} — scrolls but is position: static, so an absolutely ` +
            `positioned descendant escapes it and extends the DOCUMENT instead. Measured on ` +
            `.u-scroll-x 2026-08-16: 667px of overflow in a 375px viewport, from 151 ` +
            `screen-reader spans. Add position: relative, or allow-list it with a reason.`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the allow-list holds no dead entries', () => {
    const seen = STYLESHEETS.flatMap((f) =>
      rules(readFileSync(f, 'utf8'))
        .filter((r) => scrolls(r.body))
        .map((r) => r.selector),
    );
    const dead = STATIC_SCROLLER_ALLOWLIST.filter((a) => !seen.some((s) => s.includes(a.rule)));
    expect(dead.map((d) => d.rule)).toEqual([]);
  });

  it('the check FAILS on the construction it exists to refuse — proved, not assumed', () => {
    // The measured defect, written out as CSS. If this does not trip, the green result above is
    // worth nothing. `.u-scroll-x`'s real declaration is the first case; `.picker__list`'s real
    // declaration, with its position removed, is the second.
    const defective = `
      .u-scroll-x { overflow-x: auto; }
      .something-else { overflow-y: scroll; display: block; }
    `;
    const tripped = rules(defective).filter((r) => scrolls(r.body) && !containsAbsolutes(r.body));
    expect(tripped.map((r) => r.selector)).toEqual(['.u-scroll-x', '.something-else']);

    // And it does NOT trip on the same rules once they are containing blocks, so it is testing the
    // containment and not merely the word "overflow".
    const sound = `
      .u-scroll-x { position: relative; overflow-x: auto; }
      .picker__list { position: absolute; overflow-y: auto; }
    `;
    expect(rules(sound).filter((r) => scrolls(r.body) && !containsAbsolutes(r.body))).toEqual([]);
  });

  it('the real .picker__list rule is the sound case and not the defective one', () => {
    // Read from the file rather than restated, so this cannot drift away from what ships.
    const picker = rules(readFileSync(join(UI_DIR, 'picker', 'picker.css'), 'utf8')).find((r) =>
      r.selector.includes('.picker__list'),
    );
    expect(picker).toBeDefined();
    expect(scrolls(picker!.body)).toBe(true);
    expect(containsAbsolutes(picker!.body)).toBe(true);
  });
});
