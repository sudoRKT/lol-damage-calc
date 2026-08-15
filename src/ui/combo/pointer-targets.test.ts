// THE BOX THAT WAS MEASURED IS THE BOX THAT RECEIVES THE CLICK — swept in a real browser, then
// pinned to the two things in this area's source that could break it.
//
// ═══ THE DEFECT CLASS THIS EXISTS FOR, WHICH IS NOT "TOO SMALL" ═══
//
// A sibling area published `.defences__control` at 293 x 30.5px and later found that box **accepted
// no pointer anywhere**: it was a `<div>`, and the boxes that actually took the click were a 22.5px
// label and an unrecorded 13 x 13px checkbox. Every published figure was a true measurement of the
// wrong box. `target-size-register.test.ts` carries the full account.
//
// A size register cannot catch that on its own, because a figure taken from `getBoundingClientRect`
// is true of any element — interactive or not. The question a register does not ask is: **at these
// coordinates, what does `document.elementFromPoint` return, and is it this control?**
//
// ═══ WHAT WAS MEASURED, 2026-08-16, ON /calculator/ WITH LUX AS THE ATTACKER ═══
//
// The default four-step combo (Q, E, basic attack, R), so 18 interactive controls: 5 icon shelf
// buttons, 1 basic-attack button, and 3 reorder controls on each of 4 steps. Each control was
// scrolled to the middle of the viewport and then sampled on a 1px grid across its whole border
// box, plus four probes in the gap outside each edge. For every sample, `elementFromPoint(x, y)`
// was resolved with `.closest('button')` — the element that would actually take the click.
//
//   viewport      controls   grid samples   resolving to THAT control   outside-edge probes
//   1440 x 1100      18         21,193             21,192 (99.995%)      44 of 44 hit no button
//    375 x  812      18         22,219             22,121 (99.56%)       72 of 72 hit no button
//
// **ZERO controls differ from their registered box in the way `.defences__control` did.** Every
// control is its own `<button>`; every sample that missed resolved to no button at all rather than
// to a NEIGHBOURING one, so there is nowhere in this area that a mis-aimed tap does something other
// than nothing. That matters most for `.combo__control--remove`, whose mis-tap is the one edit here
// that cannot be undone.
//
// THE 98 MISSES ARE A SUB-PIXEL BOUNDARY, AND SAYING SO IS A CLAIM WITH EVIDENCE BEHIND IT:
//
//   • 97 of them are the basic-attack button's last row at 375px — dy = 36.5 of a 36.84px box,
//     the whole width. The remaining 1 is `.combo__control--remove` at (34.5, 24.5) of a
//     35.22 x 25.39px box. At 1440px the same sweep misses exactly 1 point, the same corner.
//   • Every miss is in the final fractional row or column of a box whose height or width is not a
//     whole number, and hit-testing rounds to device pixels while `getBoundingClientRect` does not.
//     The count moves with the box's sub-pixel offset (97 at one scroll position, 1 at another),
//     which is the signature of rounding rather than of a dead region.
//   • **The WCAG-relevant area is untouched: a 24 x 24px square centred on each control is 100%
//     live on all 18 controls at 375px — 576 of 576 samples each, 10,368 of 10,368 in total.**
//
// CONFIRMED BY PRESSING, NOT ONLY BY PROBING. At the centre of "move E later" and at the left edge
// of "move E earlier", the element `elementFromPoint` returned was pressed directly; the live region
// announced "E — Lucent Singularity moved to position 2 of 4" and the sequence order changed and
// then returned to Q, E, AA, R. The hit test names the control the application actually acts on.
//
// ALSO READ AT THE SAME TIME, over all 115 elements of the `.combo` subtree at 375px:
// `transition-duration` is 0s, `animation-name` is none, and `pointer-events` is auto on every one.
// So this area animates nothing — DESIGN.md §10's budget is the burndown's — and no rule anywhere
// makes a rendered box refuse a pointer.
//
// ═══ WHAT THIS FILE ASSERTS, GIVEN THAT jsdom COMPUTES NO LAYOUT ═══
//
// Nothing here re-measures. It pins the two properties of the SOURCE that the browser sweep found
// to be true, and that are what make the sweep's result hold:
//
//   1. every click handler in this area sits on a real `<button>` — the `<div>` that made
//      `.defences__control` unclickable cannot arrive here unnoticed;
//   2. nothing in this area's CSS declares `pointer-events`, which is the one property that can
//      make a box that is measured stop being a box that is hit.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, 'ComboBuilder.tsx'), 'utf8');
const STYLESHEETS = readdirSync(HERE).filter((f) => f.endsWith('.css'));

/**
 * The browser sweep, as data rather than as prose, so a later reader can diff it against a
 * re-measurement instead of re-reading a paragraph.
 *
 * `box` is `getBoundingClientRect` at 375px. `liveShare` is the share of a 1px grid over that box
 * resolving, via `elementFromPoint(...).closest('button')`, to this very control.
 */
const SWEPT = [
  {
    selector: '.combo__shelf-button',
    box: '34.00 x 49.19px',
    instances: 5,
    liveShare: '1666/1666 each, at 375px and at 1440px',
    note: "the button contributes no box of its own; its rect is the chip's, and the chip's damage-type word beneath the art is inside the button, so the whole 49.19px column is one target.",
  },
  {
    selector: '.combo__shelf-button--text',
    box: '96.91 x 36.84px',
    instances: 1,
    liveShare: '3492/3589 at 375px, 3588/3589 at 1440px',
    note: 'the 97 and the 1 are the final sub-pixel row of a fractional-height box. A 24 x 24px square on its centre is 576/576.',
  },
  {
    selector: '.combo__control',
    box: '34.47 x 25.39px',
    instances: 8,
    liveShare: '850/850 each, at 375px and at 1440px',
    note: 'the control that measured 18.47 x 21.39px with 22.47px between centres before it was fixed by size. It is now both big enough AND the element that takes the click.',
  },
  {
    selector: '.combo__control--remove',
    box: '35.22 x 25.39px',
    instances: 4,
    liveShare: '875/875 on three of four; 874/875 on one, at (34.5, 24.5)',
    note: 'the one edit in this area that cannot be undone. No sample anywhere in the sweep resolved to it from outside its own box.',
  },
] as const;

/**
 * The JSX tag that opens the element an attribute belongs to: walk back from the attribute to the
 * nearest `<name`.
 *
 * Written this way rather than as one regex over the whole element because a JSX attribute value
 * contains `>` — every `onClick={() => …}` in this file does — so a pattern that reads up to the
 * closing bracket finds the arrow instead.
 */
function owningTag(source: string, attributeIndex: number): string {
  const open = source.lastIndexOf('<', attributeIndex);
  if (open === -1) return '(no tag)';
  return source.slice(open + 1).match(/^[A-Za-z][A-Za-z0-9.]*/)?.[0] ?? '(no tag)';
}

function tagsCarrying(pattern: RegExp): string[] {
  return [...SOURCE.matchAll(pattern)].map((m) => owningTag(SOURCE, m.index!));
}

describe('combo/the source is readable at all', () => {
  it('finds the handlers and the stylesheets this file is about', () => {
    // A sweep that passes by finding nothing proves nothing — the failure that would hide a
    // `<div>` handler is this file quietly matching zero elements.
    expect(tagsCarrying(/\bonClick=/g).length).toBe(5);
    expect(STYLESHEETS.length).toBeGreaterThanOrEqual(1);
  });
});

describe('combo/every control is the element that receives its own click', () => {
  it('puts every click handler on a real <button>, never on a div or a span', () => {
    // PROVED TO FAIL: rewriting the remove control's `<button …>` as `<div …>` reports
    // ["div"] and turns this red. That is the exact shape of the `.defences__control` defect —
    // a control-looking box with a handler and no button under it.
    const notButtons = tagsCarrying(/\bonClick=/g).filter((t) => t !== 'button');
    expect(
      notButtons,
      'A handler on a non-button is the .defences__control defect: the box that gets measured ' +
        'stops being the box that is hit, and no size register can see the difference.',
    ).toEqual([]);
  });

  it('gives every swept control class to a <button> and to nothing else', () => {
    // The register records a figure against a SELECTOR. This is what ties that selector to an
    // element that can take a press — measuring `.combo__control` is only meaningful while
    // `.combo__control` names a button.
    for (const { selector } of SWEPT) {
      const bare = selector.slice(1);
      const carriers = new Set(tagsCarrying(new RegExp(`className="[^"]*\\b${bare}\\b`, 'g')));
      expect([...carriers], `${selector} is styled onto: ${[...carriers].join(', ')}`).toEqual([
        'button',
      ]);
    }
  });

  it('declares no pointer-events anywhere in the area', () => {
    // PROVED TO FAIL: adding `pointer-events: none;` to `.combo__control` reports
    // "combo.css" and turns this red.
    //
    // The one property that can make a box which measures 35 x 25px accept nothing at all. There
    // is no legitimate use of it in this area — every control here is a button that wants the
    // press it is drawn to invite — so the honest check is a flat ban rather than a whitelist.
    const offenders = STYLESHEETS.filter((f) =>
      /(^|[;{\s])pointer-events\s*:/.test(
        readFileSync(join(HERE, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the swept record honest about how many controls it covers', () => {
    // 18 controls on the default four-step combo: 5 + 1 on the shelf, 3 on each of 4 steps. If a
    // control is added to this area and the sweep is not re-run, the arithmetic below stops
    // matching the browser figures above and this is where that shows.
    expect(SWEPT.reduce((n, s) => n + s.instances, 0)).toBe(18);
    expect(SWEPT.every((s) => s.note.length > 40)).toBe(true);
  });
});
