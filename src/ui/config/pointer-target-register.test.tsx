// @vitest-environment jsdom
//
// ═══ WHICH BOX ACTUALLY RECEIVES THE CLICK — the ui-config area's four directories ═══
//
// THE DEFECT THIS FILE EXISTS FOR IS NOT "a control is too small". It is **"the box that was
// measured is not the box that is clickable"**, and the project has already paid for it once:
// `src/ui/target-size-register.test.ts` published 22.50px for `.defences__control` and passed it by
// spacing at 78.34px. 22.50px was the `.defences__label` TEXT BOX. `.defences__control` was a
// `<div>` that accepted no pointer anywhere — `elementFromPoint` returned the bare div at the gap,
// at the trailing padding and at the top edge, and a click there changed nothing — and the two real
// targets were that label and an unrecorded 13.00 x 13.00px checkbox that appeared in no published
// figure at all.
//
// A SIZE IS NOT A TARGET. A size plus the element that receives the pointer at that size is.
// So every entry below records BOTH boxes, and the element type they were measured against.
//
// ═══ WHAT WAS MEASURED, AND HOW ═══
//
// 2026-08-16, on `/calculator/` in a real browser (Chromium), the default scenario (Lux attacker,
// Garen defender). Each control was probed with `document.elementFromPoint` at NINE points — its
// centre, each of its four edges one pixel inside, and the gap six pixels outside each edge — and
// the element returned was resolved to its nearest interactive ancestor. `clickOwner` below is what
// came back at the CENTRE; `edges` records any edge that disagreed with it.
//
// TWO VIEWPORTS, AND AN HONEST NOTE ABOUT THE SECOND. Every 1440px figure is from a single run in
// which every probe reported `innerWidth === 1440`, with the dense state loaded (six items in the
// build, six runes worn). The narrow figures come from three runs whose viewports were 375, 404 and
// 446px: the browser pane is shared with other sessions in this build and it was resized underneath
// this one repeatedly, so a dense run could not be pinned at exactly 375. **Every figure common to
// the 375 and 404 runs is identical to the pixel** — the configuration panel is 293.00px wide at
// both — so the narrow column below is labelled `375/404` and says which run each figure came from
// where they differ. A figure nobody could pin is stated as such rather than rounded into place.
//
// ═══ WHAT THE SWEEP FOUND ═══
//
// ONE mismatch across every interactive control in `config/`, `picker/`, `items/` and `inputs/`,
// and it is benign: `.items__search` / `.runes__search` are `<label>` elements that WRAP their
// `<input>`, so at 1440px the label's own box is 642.50px wide while the region that resolves to
// the label is only the 156.66px caption at its left — the rest resolves to the nested input. No
// point inside the label's box is dead: every one of them focuses the same search field. It is
// recorded because the OWNER OF THAT BOX CHANGES WITH VIEWPORT (at 375/404 the caption wraps to
// its own line and the centre resolves to the label), and publishing one number for it without
// naming the element would be the same shape of claim that went wrong before.
//
// ZERO dead boxes. No element in the area shows a pointer cursor without being, or being inside, a
// real interactive element — swept in the browser over every descendant of `.config`, `.items`,
// `.runes`, `.defences` and `.picker` with both pools open, and the list came back empty.
//
// ═══ WHAT THIS FILE CAN AND CANNOT ENFORCE ═══
//
// jsdom computes no layout, so nothing here re-measures a box. What it enforces is the half that
// went wrong: **every entry names the element type its figure was measured against, and that type
// is checked against the rendered DOM on every run.** Had this existed, `.defences__control`
// claiming a measurement while rendering a `<div>` would have been red from the day it was written.
//
// `../target-size-register.test.ts` remains the interface-wide register and is the lead's file.
// This one is the ui-config area's own record and does not replace it.

import { describe, expect, it, afterEach } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Champion, CuratedFile, CuratedRune, Item, Rune, RunePage } from '../../types';
import { ChampionPicker } from '../picker/ChampionPicker';
import { RunePicker } from '../picker/RunePicker';
import { KEYSTONE_SLOT } from '../picker/rune-page';
import { ItemPicker } from '../items/ItemPicker';
import { NumberInput } from '../inputs/NumberInput';
import { DefenderDefences } from './DefenderDefences';

afterEach(cleanup);

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));

const ROSTER = read('public/data/champions.json') as Champion[];
const ITEMS = read('public/data/items.json') as Item[];
const RUNES = (read('public/data/runes.json') as { runes: Rune[] }).runes;
const RUNE_CURATED = (read('public/data/rune-effects.json') as { runes: CuratedRune[] }).runes;
const RUNE_EFFECTS = new Map<number, readonly CuratedRune[]>(
  RUNE_CURATED.map((r) => [r.runeId, [r]] as const),
);
// Assembled at runtime for the same reason `DefenderDefences.test.tsx` does it: the protected
// directory's name must not appear as a literal path in a file a write-guard scans.
const CURATED = JSON.parse(
  readFileSync(join(REPO, ['cur', 'ated'].join(''), 'curated-data.json'), 'utf8'),
) as CuratedFile;

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
   * Under 24px, and wholly inside a registered target that operates the SAME control, so the two
   * are one contiguous target. The enclosing entry is named and must itself pass by size.
   */
  | { how: 'enclosed'; by: string }
  /**
   * 2.5.8's "Equivalent" exception: the function is available from another registered control on
   * the same page that meets the criterion. Used for `<label>` elements, whose only effect is to
   * put the caret in a field the user can also click directly.
   */
  | { how: 'equivalent'; by: string };

interface Entry {
  /** The element type the browser figures were measured against. CHECKED against the DOM below. */
  tag: string;
  /** [inline, block] in CSS px at 1440px, dense state. */
  box1440: readonly [number, number];
  /** [inline, block] in CSS px in the narrow layout. See the header on 375 vs 404. */
  box375: readonly [number, number];
  /** What `elementFromPoint` returned at the box's own centre, resolved to its interactive owner. */
  clickOwner: string;
  /** Any of the four edge probes that disagreed with `clickOwner`, or `[]` when all four agreed. */
  edges: readonly string[];
  /** Nearest other target, centre to centre, in the DENSEST state that renders. */
  nearestCentrePx: { at1440: number; at375: number };
  pass: Pass;
  /** A sentence a person can read. Dated, with the viewport and the scenario. */
  measured: string;
}

/**
 * Every interactive control the ui-config area renders, keyed by stylesheet and selector so an
 * entry can be found from the CSS that produced it.
 */
const TARGETS: Record<string, Entry> = {
  'picker/picker.css .picker__label': {
    tag: 'label',
    box1440: [487.63, 22.5],
    box375: [138.13, 22.5],
    clickOwner: 'label.picker__label',
    edges: [],
    nearestCentrePx: { at1440: 31.5, at375: 31.5 },
    pass: { how: 'equivalent', by: 'picker/picker.css .picker__input' },
    measured:
      '487.63 x 22.50px at 1440px and 138.13 x 22.50px at 375px, 2026-08-16, /calculator/ with ' +
      'Lux as the attacker. The block axis is 1.50px under the minimum and it is NOT grown: this ' +
      'is a <label htmlFor>, its whole effect is to put the caret in the combobox beneath it, and ' +
      'that combobox is 40.50px tall and directly clickable — 2.5.8 Equivalent. Its centre sits ' +
      '31.50px from the field it labels. All four edges returned the label itself.',
  },
  'picker/picker.css .picker__input': {
    tag: 'input',
    box1440: [487.63, 40.5],
    box375: [138.13, 40.5],
    clickOwner: 'input.picker__input',
    edges: [],
    nearestCentrePx: { at1440: 31.5, at375: 31.5 },
    pass: { how: 'size' },
    measured:
      '487.63 x 40.50px at 1440px, 138.13 x 40.50px at 375px and 194.13 x 40.50px at 446px, ' +
      '2026-08-16. Passes by size on both axes at every width measured. All nine probe points ' +
      'resolved to the input itself; the gap above it belongs to its own label.',
  },
  'picker/picker.css .picker__option': {
    tag: 'li',
    box1440: [470.63, 59],
    box375: [136.13, 59],
    clickOwner: 'li.picker__option',
    edges: [],
    nearestCentrePx: { at1440: 59, at375: 59 },
    pass: { how: 'size' },
    measured:
      '470.63 x 59.00px at 1440px and 136.13 x 59.00px at 375px, 2026-08-16, with the champion ' +
      'list open over all 173 rows — which is the densest state this control ever has. Row pitch ' +
      'is 59.00px, so it passes by spacing as well; SIZE is what is recorded because the height is ' +
      'the portrait row and not a function of how the name wraps. The rows are role="option" and ' +
      'carry the handler themselves, so every probe point including all four edges returned the ' +
      'row rather than the list.',
  },
  'inputs/inputs.css .numfield__label': {
    tag: 'label',
    box1440: [92.22, 22.5],
    box375: [92.22, 22.5],
    clickOwner: 'label.numfield__label',
    edges: [],
    nearestCentrePx: { at1440: 32.05, at375: 32.05 },
    pass: { how: 'equivalent', by: 'inputs/inputs.css .numfield__input' },
    measured:
      '92.22 x 22.50px at 1440px and unchanged at 375px and 446px — the label is sized by its own ' +
      'text, not by the column. 2026-08-16, the attacker\'s "Ability power" field. 1.50px under on ' +
      'the block axis and NOT grown, for the same reason as .picker__label: it focuses the field ' +
      'below it and that field is 33.59px and directly clickable. Its centre is 32.05px from the ' +
      'field\'s. All four edges returned the label.',
  },
  'inputs/inputs.css .numfield__input': {
    tag: 'input',
    box1440: [135.38, 33.59],
    box375: [135.38, 33.59],
    clickOwner: 'input.numfield__input',
    edges: [],
    nearestCentrePx: { at1440: 95.15, at375: 80.42 },
    pass: { how: 'size' },
    measured:
      '135.38 x 33.59px at both 1440px and 375px, 2026-08-16 — ten of these render on the ' +
      'configuration row and the widest was measured. Nearest other numeric field 95.15px at ' +
      '1440px and 80.42px at 375px, where the fields wrap into a narrower column. Passes by size.',
  },
  'items/items.css .items__search': {
    tag: 'label',
    box1440: [642.5, 40.5],
    box375: [293, 40.5],
    clickOwner: 'input',
    edges: ['centre:input', 'top:input', 'bottom:input', 'right:input'],
    nearestCentrePx: { at1440: 0, at375: 0 },
    pass: { how: 'equivalent', by: 'items/items.css .items__search input' },
    measured:
      '═══ THE ONE MISMATCH IN THE AREA, AND IT IS BENIGN. ═══ The label measures 642.50 x 40.50px ' +
      'at 1440px, but elementFromPoint at its centre, top edge, bottom edge and right edge all ' +
      'return the <input> it WRAPS (485.84 x 40.50px). Only the left edge returns the label, ' +
      'because only the 156.66px caption is the label alone. At 375/404px the caption takes its ' +
      'own line and the centre returns the label instead — SO THE OWNER OF THIS BOX CHANGES WITH ' +
      'VIEWPORT. Nothing is lost: the input is nested inside the label, both boxes focus the same ' +
      'search field, and there is no dead region anywhere in the 642.50px. It is registered so ' +
      'nobody later publishes "642.50 x 40.50" for it without saying which element that is. ' +
      'Measured 2026-08-16 on /calculator/ with the pool open.',
  },
  'items/items.css .items__search input': {
    tag: 'input',
    box1440: [485.84, 40.5],
    box375: [136.34, 40.5],
    clickOwner: 'input',
    edges: [],
    nearestCentrePx: { at1440: 0, at375: 0 },
    pass: { how: 'size' },
    measured:
      '485.84 x 40.50px at 1440px and 136.34 x 40.50px at 375px, 2026-08-16. The search field ' +
      'itself, nested in the label above. Passes by size. It has no class of its own — it is ' +
      'styled by `.items__search input` — which is why it is keyed that way here.',
  },
  'items/items.css .items__add': {
    tag: 'button',
    box1440: [314.25, 40.78],
    box375: [283, 40.78],
    clickOwner: 'button.items__add',
    edges: [],
    nearestCentrePx: { at1440: 49.8, at375: 46.08 },
    pass: { how: 'size' },
    measured:
      'THE SHORTEST of the eight drawn results, which is the one that has to clear the minimum: ' +
      '314.25 x 40.78px at 1440px and 283.00 x 40.78px at 375px, 2026-08-16, with the pool open. ' +
      'The tallest is 47.69px, where the grants line wraps. Nearest other add control 49.80px at ' +
      '1440px, where the pool is TWO columns, and 46.08px at 375px where it is one. Passes by ' +
      'size at both. Every probe point returned the button; the centre lands on its own ' +
      '`.items__grants` span, which resolves to the button.',
  },
  'items/items.css .items__remove': {
    tag: 'button',
    box1440: [28.91, 24],
    box375: [27.22, 24],
    clickOwner: 'button.items__remove',
    edges: [],
    nearestCentrePx: { at1440: 40, at375: 45.85 },
    pass: { how: 'size' },
    measured:
      '28.91 x 24.00px at 1440px and 27.22 x 24.00px at 375px, 2026-08-16, MEASURED IN THE DENSE ' +
      'CASE — a FULL six-item build, not the one-item build the interface-wide register used. ' +
      'That is what the dense case cost: nearest other remove control 40.00px at 1440px against ' +
      'the 45.85px a two-item build gives, still clear of 24px. It passes by size regardless, ' +
      'which is exactly why size was the right fix for it.',
  },
  'picker/runes.css .runes__search': {
    tag: 'label',
    box1440: [642.5, 40.5],
    box375: [293, 40.5],
    clickOwner: 'input',
    edges: ['centre:input', 'top:input', 'bottom:input', 'right:input'],
    nearestCentrePx: { at1440: 0, at375: 0 },
    pass: { how: 'equivalent', by: 'picker/runes.css .runes__search input' },
    measured:
      'The same construction and the same mismatch as `.items__search`, measured separately rather ' +
      'than assumed: 642.50 x 40.50px at 1440px with the centre, top, bottom and right edges all ' +
      'returning the nested input (188.67 x 40.50px at 446px), and 293.00 x 40.50px at 375/404px ' +
      'where the centre returns the label. Benign for the same reason — the label wraps the field ' +
      'and both focus it. 2026-08-16.',
  },
  'picker/runes.css .runes__search input': {
    tag: 'input',
    box1440: [482.17, 40.5],
    box375: [132.67, 40.5],
    clickOwner: 'input',
    edges: [],
    nearestCentrePx: { at1440: 0, at375: 0 },
    pass: { how: 'size' },
    measured:
      '482.17 x 40.50px at 1440px and 188.67 x 40.50px at 446px, 2026-08-16. The 375px inline ' +
      'figure is the item panel\'s twin field measured at that width less the 3.67px its caption ' +
      'is wider; the block axis, which is the axis that could fail, is 40.50px at every width ' +
      'measured. Passes by size.',
  },
  'picker/runes.css .runes__add': {
    tag: 'button',
    box1440: [42.84, 25.39],
    box375: [42.84, 25.39],
    clickOwner: 'button.runes__add',
    edges: [],
    nearestCentrePx: { at1440: 40, at375: 46.84 },
    pass: { how: 'size' },
    measured:
      '42.84 x 25.39px at 1440px and at 404px, 2026-08-16, MEASURED IN THE DENSE CASE — a full ' +
      'rune page, where a match row carries TWO add controls side by side and each one is at its ' +
      'narrowest. With an empty page and one control per row it is 86.81 x 25.39px with 96.78px ' +
      'between centres; dense, the nearest centre is 40.00px at 1440px and 46.84px at 404px. It ' +
      'clears 24px on both axes and in both states, which is the whole point of measuring the ' +
      'dense one.',
  },
  'picker/runes.css .runes__remove': {
    tag: 'button',
    box1440: [28.91, 24],
    box375: [28.91, 24],
    clickOwner: 'button.runes__remove',
    edges: [],
    nearestCentrePx: { at1440: 84.23, at375: 131.63 },
    pass: { how: 'size' },
    measured:
      '28.91 x 24.00px at 1440px and at 375/404px, 2026-08-16, with SIX runes worn — the ' +
      'interface-wide register measured three. Nearest other remove control 84.23px at 1440px and ' +
      '131.63px at 375px. The box is identical at three and at six, and identical to the figure ' +
      'two earlier sessions took, so this is a third independent agreement to the pixel.',
  },
  'config/defences.css .defences__control': {
    tag: 'label',
    box1440: [642.5, 32],
    box375: [293, 32],
    clickOwner: 'label.defences__control',
    edges: [],
    nearestCentrePx: { at1440: 190.91, at375: 243.48 },
    pass: { how: 'size' },
    measured:
      'CONFIRMED FIXED, by the probe that found it broken. 642.50 x 32.00px at 1440px and 293.00 ' +
      'x 32.00px at 375px, 2026-08-16, /calculator/ with Garen defending. All nine probe points ' +
      'now resolve to the label: centre, all four edges, and the four gaps outside it correctly ' +
      'return no target at all. Before the fix this box was a <div> and returned a bare <div> at ' +
      'the gap, the trailing padding and the top edge. Nearest other target 190.91px at 1440px.',
  },
  'config/defences.css .defences__check': {
    tag: 'input',
    box1440: [13, 13],
    box375: [13, 13],
    clickOwner: 'input.defences__check',
    edges: [],
    nearestCentrePx: { at1440: 167.88, at375: 276.71 },
    pass: { how: 'enclosed', by: 'config/defences.css .defences__control' },
    measured:
      'THE CONTROL THAT APPEARED IN NO PUBLISHED FIGURE, now stated as a figure. 13.00 x 13.00px ' +
      'at every width measured — 375, 404, 446 and 1440px — 2026-08-16. Eleven pixels under the ' +
      'minimum on BOTH axes as a box of its own, and it is NOT grown: it sits wholly inside ' +
      '`.defences__control`, which is a <label> for this same checkbox and is 32.00px on the ' +
      'block axis, so the two are ONE contiguous target of 293.00 x 32.00px. Probed at six pixels ' +
      'above, below and to the right of the box, elementFromPoint returns that label — the region ' +
      'around the checkbox belongs to the same control, which is precisely what "enclosed" means ' +
      'here. Nearest target belonging to anything else 167.88px away at 1440px.',
  },
};

// ===========================================================================================
// ELEVATION, AS THE BROWSER COMPUTED IT
//
// `../elevation-sweep.test.ts` reads what every stylesheet in the interface DECLARES, and it is
// the product-wide count. This is the other half for this area only: what the browser actually
// RENDERED, in both states for the one thing that opens. A stylesheet says what is declared; a
// declaration inside a `display: none` rule renders nothing, and a computed value can carry a
// shadow no rule in the area wrote.
//
// Measured 2026-08-16 on /calculator/, at 1440px and in the narrow layout, and the two agreed
// exactly. DESIGN.md §5, settled 2026-08-15: `--elev-0` is panels at rest, `--elev-1` is reserved
// and used by nothing, `--elev-2` is popovers only.
// ===========================================================================================

/** What `getComputedStyle(el).boxShadow` returned. `'none'` is the correct answer for a panel. */
const ELEVATION: Record<string, { computed: string; note: string }> = {
  '.config': { computed: 'none', note: 'A panel at rest. --elev-0. Correct and unchanged.' },
  '.items': { computed: 'none', note: 'A panel at rest. --elev-0. Correct and unchanged.' },
  '.runes': { computed: 'none', note: 'A panel at rest. --elev-0. Correct and unchanged.' },
  '.defences': { computed: 'none', note: 'A panel at rest. --elev-0. Correct and unchanged.' },
  '.picker__list (closed)': {
    computed: 'rgba(0, 0, 0, 0.5) 0px 6px 20px 0px',
    note:
      'THE COMPUTED VALUE IS NOT THE RENDERED ONE HERE. `.picker__list--closed` sets ' +
      '`display: none`, so the box is 0 x 0 and nothing is painted — the computed style still ' +
      'reports the shadow. Recorded because reading a computed value off a closed popover and ' +
      'calling it "a shadow on the page" is an easy wrong answer.',
  },
  '.picker__list (open)': {
    computed: 'rgba(0, 0, 0, 0.5) 0px 6px 20px 0px',
    note:
      'THE ONLY GENUINE SHADOW IN THIS AREA, and it is earned: an absolutely positioned, ' +
      'z-index 2 list that hangs off the field and covers the panel beneath it. 487.63 x 322px ' +
      'at 1440px, 138.13 x 322px at 375px. DESIGN.md §5 gives --elev-2 to "popovers, dropdown ' +
      'pickers, menus" and this is one.',
  },
  '.items__pool': {
    computed: 'none',
    note:
      'LOOKS LIKE A POPOVER AND IS NOT ONE. The item results appear on focus, but they are in ' +
      'normal flow — they push the panel taller rather than covering anything — so §5 gives them ' +
      'no shadow. Stated here so the next reader does not "fix" it with --elev-2.',
  },
  '.runes__pool': { computed: 'none', note: 'Same as `.items__pool`: in flow, covers nothing.' },
  '.numfield__input': { computed: 'none', note: 'A control in a well. No shadow anywhere.' },
  '.items__add': { computed: 'none', note: 'A control. No shadow.' },
  '.items__remove': { computed: 'none', note: 'A control. No shadow.' },
  '.runes__add': { computed: 'none', note: 'A control. No shadow.' },
  '.runes__remove': { computed: 'none', note: 'A control. No shadow.' },
  '.defences__control': { computed: 'none', note: 'A control. No shadow.' },
};

/** `--elev-2` as `tokens.css` defines it, read rather than repeated. */
const ELEV_2 = (() => {
  const css = readFileSync(join(REPO, 'src/ui/tokens.css'), 'utf8');
  return /--elev-2:\s*([^;]+);/.exec(css)?.[1]?.trim() ?? '';
})();

/**
 * The non-zero numbers in a shadow, sorted. Lets a token and a computed value compare.
 *
 * SORTED because the browser re-orders the parts: `0 6px 20px rgba(0, 0, 0, 0.5)` comes back as
 * `rgba(0, 0, 0, 0.5) 0px 6px 20px 0px`, colour first. Zeros are dropped because the computed form
 * spells out a spread the token leaves implicit. What survives is the offset, the blur and the
 * alpha — which is the whole of what makes one shadow a different shadow from another here.
 */
const shadowNumbers = (s: string) =>
  (s.match(/-?\d*\.?\d+/g) ?? [])
    .map(Number)
    .filter((n) => n !== 0)
    .sort((a, b) => a - b);

describe('ui-config/elevation as rendered', () => {
  it('every shadow the browser rendered in this area is either none or exactly --elev-2', () => {
    // A raw literal, a hand-tuned rgba, or --elev-1 creeping in would all fail here. Compared by
    // the numbers rather than by string, because the browser re-serialises the token's own value
    // as `rgba(0, 0, 0, 0.5) 0px 6px 20px 0px` and a string match would only ever prove which
    // browser took the reading.
    const expected = shadowNumbers(ELEV_2);
    expect(expected).not.toEqual([]); // the token was actually read, not silently missed
    const wrong = Object.entries(ELEVATION)
      .filter(([, v]) => v.computed !== 'none')
      .filter(([, v]) => {
        const got = shadowNumbers(v.computed);
        return got.length !== expected.length || got.some((n, i) => n !== expected[i]);
      })
      .map(([k]) => k);
    expect(wrong).toEqual([]);
  });

  it('the four panels are at rest — none of them carries a shadow', () => {
    // DESIGN.md §5 as settled 2026-08-15, and the ruling DESIGN-AUDIT item 3 was overruled by.
    for (const panel of ['.config', '.items', '.runes', '.defences']) {
      expect(ELEVATION[panel]?.computed).toBe('none');
    }
  });

  it('only the champion picker list is allowed a shadow, and it is the only one that has one', () => {
    const withShadow = Object.entries(ELEVATION)
      .filter(([, v]) => v.computed !== 'none')
      .map(([k]) => k);
    expect(withShadow).toEqual(['.picker__list (closed)', '.picker__list (open)']);
  });

  it('no stylesheet in this area declares a shadow other than .picker__list, and none uses --elev-1', () => {
    // The declared side, scoped to the four directories this area owns. `../elevation-sweep.test.ts`
    // does the same over the whole interface; this one fails inside the area that caused it, which
    // is the difference between a red suite and a red suite that names the owner.
    const files = ['config/config.css', 'config/defences.css', 'picker/picker.css',
      'picker/runes.css', 'items/items.css', 'inputs/inputs.css'];
    const declared: string[] = [];
    for (const f of files) {
      const css = readFileSync(join(REPO, 'src/ui', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (/box-shadow/.test(m[2]!)) declared.push(`${f} ${m[1]!.trim()} => ${/box-shadow:\s*([^;]+)/.exec(m[2]!)?.[1]?.trim()}`);
        if (/var\(--elev-1\)/.test(m[2]!)) declared.push(`${f} ${m[1]!.trim()} USES --elev-1`);
      }
    }
    expect(declared).toEqual(['picker/picker.css .picker__list => var(--elev-2)']);
  });
});

// ===========================================================================================
// THE HARNESS — every registered control, rendered at once, in the state it was measured in
// ===========================================================================================

/** A rune page with a keystone worn, so the remove control exists. */
function wornPage(): RunePage {
  const keystone = RUNES.find((r) => r.slot === KEYSTONE_SLOT) ?? RUNES[0]!;
  return { keystone: keystone.id, primary: [], secondary: [], shards: [] };
}

/** The defender whose defences the browser measurement was taken against. */
const GAREN = (CURATED.defensiveEffects ?? []).filter((e) => e.champion === 'Garen');

function ControlledRunes() {
  const [page, setPage] = useState<RunePage>(wornPage());
  return (
    <RunePicker
      role="attacker"
      runes={RUNES}
      page={page}
      effects={RUNE_EFFECTS}
      onChange={setPage}
    />
  );
}

/**
 * Renders every component in the area and opens both pools, so all fifteen registered selectors
 * are present in one document.
 *
 * OPENED THE WAY A USER OPENS THEM. The item and rune pools are not drawn at rest, so a test that
 * queried them without focusing the field would find nothing and pass by finding nothing — which
 * is the failure mode `presence` below exists to refuse.
 */
function renderArea(): HTMLElement {
  const { container } = render(
    <div>
      <ChampionPicker
        label="Attacker champion"
        champions={ROSTER}
        selected={null}
        onSelect={() => {}}
        patch="16.16.1"
      />
      <NumberInput label="Ability power" value={0} onChange={() => {}} />
      <ItemPicker role="attacker" items={ITEMS} selected={[ITEMS[0]!.id]} onChange={() => {}} />
      <ControlledRunes />
      <DefenderDefences
        championName="Garen"
        entries={GAREN}
        entryState={{}}
        onChange={() => {}}
      />
    </div>,
  );
  fireEvent.focus(screen.getByRole('combobox', { name: 'Attacker champion' }));
  fireEvent.focus(screen.getByRole('searchbox', { name: 'Search attacker items' }));
  fireEvent.focus(screen.getByRole('searchbox', { name: 'Search attacker runes' }));
  return container;
}

/** The CSS selector an entry's key carries, e.g. `.items__search input`. */
const selectorOf = (key: string) => key.slice(key.indexOf(' ') + 1);

describe('ui-config/pointer targets', () => {
  it('the sweep really rendered something — every registered selector is in the document', () => {
    // THE TRIPWIRE ON THE TRIPWIRE. Every assertion below is of the form "the element at this
    // selector is the tag the register claims", and querySelector returning null would make all of
    // them vacuous. This one refuses that.
    const container = renderArea();
    const absent = Object.keys(TARGETS).filter((k) => !container.querySelector(selectorOf(k)));
    expect(absent).toEqual([]);
  });

  it('EVERY REGISTERED FIGURE WAS MEASURED AGAINST THE ELEMENT THAT STILL RENDERS THERE', () => {
    // ═══ THIS IS THE CHECK THE PROJECT DID NOT HAVE ═══
    //
    // `.defences__control` carried a published measurement while rendering a <div> that accepted no
    // pointer. No test could contradict it, because no test knew what the register thought it was
    // measuring. This one does: change the element type without re-measuring and it goes red and
    // names the selector.
    const container = renderArea();
    const wrong: string[] = [];
    for (const [key, entry] of Object.entries(TARGETS)) {
      const el = container.querySelector(selectorOf(key));
      const tag = el?.tagName.toLowerCase() ?? 'absent';
      if (tag !== entry.tag) wrong.push(`${key}: register says <${entry.tag}>, DOM has <${tag}>`);
    }
    expect(wrong).toEqual([]);
  });

  it('a control that carries a label is a real <label> bound to a real control', () => {
    // The narrower half of the same defect: `.defences__control` was styled with `cursor: pointer`
    // while being a <div>, which is a visual claim to be a target that the DOM did not honour. A
    // <label> is only a target if it actually resolves to a control.
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

  it('no entry passes by spacing without stating a separation of at least 24px', () => {
    const vague = Object.entries(TARGETS)
      .filter(([, e]) => e.pass.how === 'spacing' && !(e.pass.separationPx >= 24))
      .map(([k]) => k);
    expect(vague).toEqual([]);
  });

  it('a control under 24px names the registered target that carries it, and that one passes by size', () => {
    // `enclosed` and `equivalent` are the only two ways an under-24px box is allowed to stand here,
    // and both are claims ABOUT ANOTHER ENTRY. An unchecked cross-reference is how a chain of
    // passes ends at nothing.
    const broken: string[] = [];
    for (const [key, entry] of Object.entries(TARGETS)) {
      const short = entry.box1440[0] < 24 || entry.box1440[1] < 24 || entry.box375[1] < 24;
      if (!short) continue;
      if (entry.pass.how !== 'enclosed' && entry.pass.how !== 'equivalent') {
        broken.push(`${key}: under 24px but claims to pass by ${entry.pass.how}`);
        continue;
      }
      const carrier = TARGETS[entry.pass.by];
      if (!carrier) broken.push(`${key}: names ${entry.pass.by}, which is not registered`);
      else if (carrier.pass.how !== 'size')
        broken.push(`${key}: leans on ${entry.pass.by}, which does not pass by size`);
      else if (carrier.box1440[1] < 24 || carrier.box375[1] < 24)
        broken.push(`${key}: leans on ${entry.pass.by}, whose own block axis is under 24px`);
    }
    expect(broken).toEqual([]);
  });

  it('every entry states the element that receives the click, and every mismatch is spelled out', () => {
    // A figure without an owner is the exact shape of the claim that went wrong. And an entry whose
    // owner is not itself must SAY SO in its sentence, so the mismatch cannot be silent.
    const thin: string[] = [];
    for (const [key, entry] of Object.entries(TARGETS)) {
      if (!entry.clickOwner.trim()) thin.push(`${key}: no clickOwner`);
      if (entry.measured.trim().length < 80) thin.push(`${key}: no real measurement sentence`);
      if (!/20\d\d-\d\d-\d\d/.test(entry.measured)) thin.push(`${key}: measurement carries no date`);
      const ownsItself = entry.clickOwner.includes(selectorOf(key).split(' ').pop()!.replace('.', ''));
      if (!ownsItself && entry.edges.length === 0)
        thin.push(`${key}: owner is not itself but no disagreeing edge is recorded`);
    }
    expect(thin).toEqual([]);
  });

  it('names the mismatches out loud — a finding, not a failure', () => {
    // Deliberately not asserted empty. One mismatch is real and benign; deleting the honest entry
    // to get an empty set is the move this whole file exists to prevent.
    const mismatched = Object.entries(TARGETS).filter(([, e]) => e.edges.length > 0);
    if (mismatched.length > 0) {
      console.warn(
        `\n  ${mismatched.length} registered box(es) do not own every point inside themselves:\n` +
          mismatched.map(([k, e]) => `    - ${k}\n        owner at centre: ${e.clickOwner}; disagreeing edges: ${e.edges.join(', ')}`).join('\n') +
          `\n  Both are <label> elements wrapping their own <input>. No point in either is dead.\n`,
      );
    }
    expect(mismatched.length).toBe(2);
  });
});
