// WHAT ACTUALLY RECEIVES THE CLICK ON A RISER — measured in Chrome, recorded here.
//
// ═══ WHY THIS FILE EXISTS ═══
//
// `../target-size-register.test.ts` records the SIZE of every interactive control in the product.
// A `getBoundingClientRect` figure is true of any element, interactive or not; it says how big a
// box is and nothing at all about whether a pointer landing in it reaches the control. Only
// `document.elementFromPoint` says that.
//
// On 2026-08-15 `config/defences.css .defences__control` was registered at 293 x 30.5px, and a
// pointer landing anywhere in that box — centre, edges, gap beside it — reached NOTHING. The
// stylesheet's own comment claimed the whole line was the target. It was false, and no size
// measurement could have caught it.
//
// This file asks the same question of `.burn__riser`, which is the only interactive control in
// `src/ui/burndown/`. The answer was that the register's figure was right about the box and
// wrong about the target.
//
// ═══ WHAT WAS MEASURED, AND HOW ═══
//
// METHOD. Chrome, via the preview tools, on `/calculator/` — never a screenshot, never a
// judgement. `document.documentElement.clientWidth` was read back inside the same call as every
// measurement and any reading at the wrong width was discarded (the browser pane is shared, and
// it WAS resized and reloaded underneath this session more than once). Each riser's border box
// was then probed on a 1px grid across its whole area with `document.elementFromPoint`, and each
// hit resolved to its nearest interactive ancestor via `closest('button')`. A point counts as
// LIVE only when that ancestor is the riser whose box the point is inside.
//
// DEFINITIONS, because every count below needs one:
//   - GRID POINT — one `elementFromPoint` probe at a 1px pitch, offset 0.5px, inside a riser's
//     border box. A riser 16 x 24px contributes 384 of them.
//   - LIVE — the probe resolved to THAT riser's own button.
//   - FULLY DEAD RISER — a riser with zero live points. This is the `.defences__control` defect.
//   - DEAD CENTRE — the probe at the exact centre of the border box is not live. The centre is
//     where a person aims, so it is counted separately from the area.
//   - STRAY — the probe resolved to a DIFFERENT riser's button. A tap inside one instance's box
//     opens another instance's popover.
//
// ═══ THE FIGURES (2026-08-16) ═══
//
// THE DEFAULT SCENARIO — Lux, the four columns the page opens on, verdict SURVIVES.
// Identical at clientWidth 375 and clientWidth 1440, to the point:
//
//   | state              | live / grid points | fully dead | dead centres | stray |
//   |--------------------|--------------------|-----------:|-------------:|------:|
//   | before             | 1,598 / 2,192      |          0 |       3 of 4 |     0 |
//   | after `z-index: 1` | 2,192 / 2,192      |          0 |            0 |     0 |
//
// Per riser, before: #0 222/384, #1 168/384, #2 168/384, #3 1,040/1,040. The three 16 x 24px
// risers were live over 8 x 24px of their 16 x 24px box — the left half. The dead half is the
// half that overhangs the column boundary, and it contains the centre. #0 is 222 rather than 168
// because 6.77px of its box sits ABOVE the plot area, where there is no next column to cover it.
// #3 is the LAST column, has no successor, and was 100% live: 3 of 4 failed and the one that
// passed was the one with nothing after it.
//
// Confirmed behaviourally as well as by hit test, with a real pointer moved by the browser: a
// hover at CSS x=427.4 inside riser #0's live half opened the resistance popover; the same
// riser's box at x=432.9 is `li.burn__col`.
//
// A 17-COLUMN LETHAL COMBO at clientWidth 375 — a column is 11.94px there, which is DESIGN.md
// §4b's own worst case, and the verdict draws the in-plot LETHAL callout:
//
//   | state              | live / grid points | fully dead | dead centres | stray |
//   |--------------------|--------------------|-----------:|-------------:|------:|
//   | before             | 3,182 / 8,256      |          2 |     16 of 17 |   885 |
//   | after `z-index: 1` | 7,251 / 8,256      |          0 |            0 | 1,005 |
//
// The occluders before, counted: `li.burn__col` 2,272 points, `span.burn__chip--lethal` 1,600,
// another riser 885, `div.burn__rule-stroke--lethal` 150. **Risers #1 and #2 were fully dead —
// 0 of 384 points each** — under the LETHAL chip, which is 203 x 77.59px at that width and
// covers the top of the plot where the first instances sit. At clientWidth 1440 the same two
// were fully dead under `div.burn__callout`, the 1,268 x 48.8px row the chip is right-aligned
// inside. So on any combo that kills, the first instances' popovers could not be opened.
//
// THE GAPS. Probes 3, 8 and 20px outside all four edges of every riser, at both widths on the
// default scenario: no probe outside a riser resolved to any riser. They return `burn__ghost`,
// `burn__label`, `li.burn__col`, `burn__plot` — no interactive ancestor, no click taken. A
// mis-aimed tap beside a riser does nothing, which is the right outcome.
//
// THE POPOVER STEALS NOTHING, OPEN OR CLOSED. With `.burn__pop` open the live counts were
// unchanged, and a probe at the popover's own centre returned `section.app__resulthead` —
// the element BENEATH it. `.burn__popbar { pointer-events: none }` is what does that, and the
// test below pins it, because it is load-bearing and looks like a tidy-up.
//
// ═══ WHAT IS STILL OPEN, RAISED RATHER THAN RESOLVED ═══
//
// At 11.94px per column the 16px-wide risers OVERLAP EACH OTHER, and 1,005 of 8,256 points
// inside one riser's box fire its neighbour. The same measurement gives 11.94px between centres
// against the 24px WCAG 2.2 AA 2.5.8 needs for its spacing exception — so the register's
// `separationPx` holds for the scenario it was measured on and not for a dense one. Both facts
// are the geometry, and the register forbids changing the geometry. This belongs to the lead.
//
// Separately: the register says 52.3px between centres at 375px and this session measured 50.75px
// on the default scenario at the same width. Both are far clear of 24px; the discrepancy is
// recorded rather than reconciled, because nothing here can say which scenario produced 52.3.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Comments stripped first — this file's own prose contains every string the checks below look
// for, and a stylesheet is what it declares, never what it says about itself.
const css = readFileSync(new URL('./burndown.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const block = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(m, `no rule for ${selector} in burndown.css`).not.toBeNull();
  return m![1]!;
};

describe('the riser is the thing at its own coordinates', () => {
  // THE FIX, AND IT IS ONE DECLARATION. Delete it and the default scenario drops from
  // 2,192/2,192 live grid points to 1,598, three of four centres stop taking a pointer, and a
  // lethal combo loses two risers entirely. Proved by deleting it: this test was run red before
  // it was trusted.
  it('.burn__riser carries the z-index that keeps it above the next column', () => {
    expect(block('.burn__riser')).toMatch(/z-index:\s*1\s*;/);
  });

  // NOTHING WAS GROWN. The register records that this control passes 2.5.8 by SPACING and must
  // not be grown, because 24px wide would change the burndown's column geometry to satisfy a
  // rule it already meets. These three declarations ARE that geometry. If a later session
  // "fixes" the hit area by widening the box instead, this fails and says so.
  it('the geometry the register forbids changing is unchanged', () => {
    const riser = block('.burn__riser');
    expect(riser).toMatch(/inset-inline-end:\s*calc\(var\(--space-2\)\s*\*\s*-1\)/);
    expect(riser).toMatch(/inline-size:\s*var\(--space-4\)/);
    expect(riser).toMatch(/min-block-size:\s*var\(--space-5\)/);
  });

  // WHY THE Z-INDEX IS ENOUGH, AND WHAT WOULD SILENTLY UNDO IT. It works because nothing else
  // painted over the plot declares a higher one. `.burn__pop` declares the same 1 and wins on
  // DOM order, which is correct and harmless — its row is pointer-transparent. A `z-index: 2`
  // arriving on the callout, the chip or a rule stroke would kill the risers again exactly as
  // before, and it would look like a paint fix rather than an accessibility regression.
  it('no rule in this stylesheet outranks the riser', () => {
    const values = [...css.matchAll(/z-index:\s*(-?\d+)/g)].map((m) => Number(m[1]));
    expect(values.length).toBeGreaterThan(0);
    expect(Math.max(...values)).toBe(1);
  });

  // MEASURED, NOT ASSUMED: with the popover open the live counts did not move, and a probe at
  // the popover's own centre returned the element beneath it. This declaration is the reason.
  it('.burn__popbar stays transparent to the pointer, so an open popover steals nothing', () => {
    expect(block('.burn__popbar')).toMatch(/pointer-events:\s*none/);
  });

  // The alternative that was measured and rejected: on its own it changed nothing at all
  // (1,598/2,192, unmoved), and alongside the z-index it added nothing (7,251/8,256, identical).
  // It would also have cost the reader the ability to select the chip's text. If it turns up
  // later, someone has re-derived a fix that was measured as inert.
  it('the callout is NOT made pointer-transparent — it was measured as inert', () => {
    expect(block('.burn__callout')).not.toMatch(/pointer-events/);
  });
});
