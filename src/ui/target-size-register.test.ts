// EVERY INTERACTIVE CONTROL MEETS WCAG 2.2 AA 2.5.8, AND SAYS HOW.
//
// ═══ WHY A REGISTER AND NOT A RULE ═══
//
// `--target-min` (24px) was added to `tokens.css` and DESIGN.md §4a on 2026-08-15, and **on the
// day it was added it was referenced by nothing at all.** A token defined and never used is not a
// standard; it is a note. This file is what makes it load-bearing.
//
// A blanket "every control is at least 24px" would be WRONG, and that is the whole reason this is
// a register. **2.5.8 offers two ways to pass and this product legitimately uses both:**
//
//   - **by SIZE** — the control is at least 24px on both axes;
//   - **by SPACING** — it is smaller, but no other target's centre is within 24px of its centre.
//
// Several controls here pass by spacing and should not be grown: `.burn__riser` is 16×24 with
// 50.75px between centres, and making it 24px wide would change the burndown's column geometry to
// satisfy a rule it already meets.
//
// **AND A PASS-BY-SPACING IS A MEASUREMENT OF ONE SCENARIO, WHICH THIS FILE LEARNED ON 2026-08-16.**
// That riser's separation is 50.75px on the DEFAULT scenario and 11.94px on a 17-column combo,
// where adjacent risers overlap outright. The entry claimed a general pass from a single reading.
// A spacing claim needs the DENSE case measured, not the one that happened to be on screen.
//
// ═══ WHAT THIS FILE CANNOT DO ═══
//
// **jsdom computes no layout**, so nothing here measures a rendered box. Every figure below is a
// browser measurement taken by a person, recorded so it is not lost in a transcript — which is
// exactly what happened to the combo controls, measured at 18.5×21.4px and fixed only when
// somebody happened to look again months later.
//
// What it enforces mechanically is narrower and still useful: the token is referenced by something,
// every control in the interface is accounted for, and no entry claims to pass by spacing without
// stating the separation it was measured at.
//
// ═══ THIS FILE IS THE RECORD, AND ON 2026-08-15 SIX MEASUREMENTS WENT SOMEWHERE ELSE ═══
//
// Commit `b323e9b` measured all six then-unmeasured controls in a real browser at 375px and 320px,
// and stated its findings — including that the defence toggle is 22.5px on the block axis and
// passes by spacing at 78.34px — **in its commit message and in no file.** `git log -S "78.34"`
// finds no commit that ever added that figure to the tree.
//
// The cost was immediate and it was not hypothetical: this register still said "unmeasured" for all
// six, so two agents were dispatched hours later to measure controls that had already been
// measured. One of them reproduced the shelf figures to the pixel, which is a useful independent
// confirmation and was not what it was sent to do.
//
// **A measurement that lives only in a commit message is a measurement the project has lost.** No
// test reads it, no reader finds it, and the next person re-does it. If you measure a control, the
// figure belongs HERE, in the same commit as the measuring.
//
// ═══ THIS REGISTER'S OWN WEAKNESS, NAMED 2026-08-16 ═══
//
// **A figure from `getBoundingClientRect` is true of any element, interactive or not.** What this
// file cannot ask is what `elementFromPoint` RETURNS at those coordinates — and on 2026-08-15 that
// turned out to be the difference between a control and a decoration. `.defences__control` was
// registered, measured, and was a `<div>` that accepted no pointer anywhere: the published 22.5px
// belonged to a different box, and the real target was an unrecorded 13x13px checkbox.
//
// So a `measured` figure means "this box is big enough", never "this box is the one that is
// clicked". Entries that have had the second question asked say so explicitly — `combo/` has, via
// `combo/pointer-targets.test.ts`, over 43,412 grid samples. **The other areas have not.**

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const ALL = walk(UI);
const STYLESHEETS = ALL.filter((f) => f.endsWith('.css') && !f.endsWith('tokens.css'));
const rel = (f: string) => relative(UI, f);
const read = (f: string) => readFileSync(f, 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Selectors that style an interactive control, found by name. Broad on purpose.
 *
 * ═══ AND IT MISSED ONE, WHICH IS THIS TRIPWIRE'S KNOWN LIMIT ═══
 *
 * The 13×13px checkbox at `.defences__check` matches none of these words, so the "every
 * control-shaped selector is in the register" assertion never demanded an entry for it — and it
 * went unrecorded through two measurement passes while the box beside it was measured twice.
 *
 * **The pattern finds controls by what they are CALLED, and a control that is named for its role
 * rather than for being a control is invisible to it.** Widening the pattern is the safe direction
 * here (it demands more entries, never fewer) but it is not a substitute: the next control named
 * something nobody thought of is missed again.
 *
 * What actually closed it was a browser sweep asking `elementFromPoint` what receives a click.
 * `config/pointer-target-register.test.tsx` holds 15 controls measured that way, including the
 * inputs, options and labels this pattern does not name. **That file is ahead of this one**, and
 * the reconciliation is a worklist rather than a claim of completeness.
 */
const CONTROL_SELECTOR = /(control|remove|toggle|__btn|button|riser|shelf-button)/;

type Pass =
  | { how: 'size'; measured: string }
  | { how: 'spacing'; separationPx: number; measured: string }
  | { how: 'unmeasured'; why: string };

/**
 * Every interactive control in the interface and how it meets 2.5.8.
 *
 * `measured` is a browser figure taken by a person, with the date. `'unmeasured'` is a real and
 * honest state — it means nobody has put a ruler against it — and those are printed on every run
 * as a worklist rather than asserted away.
 */
const CONTROLS: Record<string, Pass> = {
  'combo/combo.css .combo__control': {
    how: 'size',
    measured: '34.47 x 25.39px at 375px, 2026-08-15. Was 18.47 x 21.39 with 22.47px centres — 12 of 12 undersized, 16 violating pairs — and is the defect that produced --target-min. '+
      "Confirmed 2026-08-16 to be the element that RECEIVES the click, not merely the box that measures: a 1px grid over all 8 instances resolved 850/850 points each to that control at both 375px and 1440px, via elementFromPoint(...).closest('button'). A 24x24px square on its centre is 576/576.",
  },
  'combo/combo.css .combo__control--remove': {
    how: 'size',
    measured: '35.22 x 25.39px at 375px, 2026-08-15. Centres 46.84px from the nearest arrow. '+
      "Confirmed 2026-08-16 as the click recipient: 875/875 grid points on three of four instances, 874/875 on one (the miss at (34.5, 24.5), the final sub-pixel corner of a fractional box). NO sample anywhere in the area's sweep resolved to a remove control from OUTSIDE its own box, so a mis-aimed tap near it does nothing rather than deleting a step.",
  },
  'combo/combo.css .combo__shelf-button': {
    how: 'size',
    measured:
      '34.00 x 49.19px at 375px, 2026-08-15, on /calculator/ with Lux as the attacker. Nearest ' +
      "other target 42.00px centre-to-centre, so it would pass by spacing as well; it is recorded " +
      "as passing by SIZE because the box is the chip's and the chip is a token — " +
      '--art-chip-combo (32px) plus 1px of border each side. Identical at 1440px, where the shelf ' +
      'is one row rather than two, and identical again with the lane squeezed to 238px: the shelf ' +
      'WRAPS rather than shrinking, so no width takes it under the minimum. NOTHING WAS GROWN. '+
      "Confirmed 2026-08-16 as the click recipient: 1666/1666 grid points on all 5 instances at both widths. The chip's damage-type word beneath the art is INSIDE the button, so the whole 49.19px column is one contiguous target.",
  },
  'combo/combo.css .combo__shelf-button--text': {
    how: 'size',
    measured:
      '96.91 x 36.84px at 375px, 2026-08-15, on /calculator/ with Lux as the attacker. Nearest ' +
      'other target 52.09px centre-to-centre (73.71px at 1440px, where the shelf is one row). ' +
      "The register's suspicion that the basic attack was the short one is REFUTED: it is the " +
      "TALLEST control on the shelf, because --lh-body-m gives it a line box the icon buttons' " +
      'line-height: 0 does not, and --space-2 pads it twice. NOTHING WAS GROWN; both variants ' +
      'now name --target-min on the base class so the arithmetic cannot quietly stop clearing it. ' +
      'Independently reproduced to the pixel by two sessions four hours apart (b323e9b, then a ' +
      'measurement pass that did not read it) — which is the only reason this entry says REFUTED ' +
      'rather than "one person once said". '+
      "Confirmed 2026-08-16 as the click recipient: 3492/3589 grid points at 375px and 3588/3589 at 1440px. The 97 misses are the single final row of a 36.84px box — device-pixel rounding of a fractional height, and the count moves with the box's sub-pixel offset. A 24x24px square on its centre is 576/576.",
  },
  'items/items.css .items__remove': {
    how: 'size',
    measured:
      '28.36 x 24.00px at 375px, 2026-08-15, on /calculator/ with one item in the build. It was ' +
      '28.91 x 20.84 — the block axis failed by 3.16px and the inline axis always passed, and the ' +
      'browser CONFIRMED the computed figure rather than refuting it. Fixed by SIZE, not by ' +
      'spacing: a remove control sits inside a build row, which leaves no 24px separation to pass ' +
      'on. The inline axis lost 0.55px because the box became a centring flex container, and the ' +
      'build row grew 44.53 to 47.69px, which is the whole layout cost. ' +
      'Re-measured 2026-08-16 in the DENSE case — a full six-item build, not one item: 28.91 x 24.00px at 1440px, 27.22 x 24.00px narrow, and the nearest other remove control falls from 45.85 to 40.00px. Still clear of 24px, and it passes by SIZE regardless, which is the argument for having grown it rather than resting on separation. One unresolved spread flagged rather than smoothed: the inline axis reads 27.22 narrow, 28.91 wide and 28.36 in the original measurement — a 1.7px range suspected to be font-loading state. It does not touch the pass, which is on the block axis at exactly 24.00px.',
  },
  'burndown/burndown.css .burn__riser': {
    how: 'spacing',
    separationPx: 50.75,
    measured:
      '16 x 24px at 375px, 2026-08-15. Passes by spacing and MUST NOT be grown: 24px wide would ' +
      'change the burndown column geometry to satisfy a rule it already meets. ' +
      '═══ POINTER-AUDITED 2026-08-16, AND THE BOX WAS NOT THE TARGET. ═══ ' +
      'On a 1px grid over the whole border box, the default scenario was 1,598/2,192 live grid ' +
      'points at BOTH 375px and 1440px — 72.9% — with THREE OF FOUR CENTRES DEAD, returning ' +
      "li.burn__col. The live area was 8 x 24px of a 16 x 24px box: inset-inline-end: -8px puts " +
      "half the box in the next column's <li>, a later positioned sibling that painted over it, " +
      'and the dead half is the one holding the centre. The last column has no successor and was ' +
      '100% live, which is the tell. On a 17-column LETHAL combo it was 3,182/8,256 (38.5%), 16 ' +
      'of 17 centres dead, and TWO RISERS FULLY DEAD at 0/384 each — under the LETHAL chip at ' +
      '375px and under div.burn__callout at 1440px. So on any combo that kills, which is this ' +
      "product's central case, the first instances took no pointer at all. " +
      'FIXED BY ONE DECLARATION, z-index: 1 on .burn__riser, which changes no box and paints ' +
      'nothing new because the button is transparent: 2,192/2,192 and 0 dead centres on the ' +
      'default scenario at both widths, 8,256/8,256 at 1440px on the 17-column lethal case, and ' +
      '7,251/8,256 with 0 fully dead at 375px. NOTHING WAS GROWN. pointer-events: none on ' +
      '.burn__callout was measured as the alternative and rejected — alone it changed nothing. ' +
      '48 gap probes 3/8/20px outside all four edges hit no control at either width, and an open ' +
      ".burn__pop steals nothing: .burn__popbar is pointer-events: none and a probe at the " +
      "popover's own centre returns the element beneath it. " +
      '═══ TWO THINGS THIS ENTRY NOW CONTRADICTS, RAISED NOT RESOLVED ═══ ' +
      'Separation is 50.75px on the default scenario at 375px, not the 52.3px this entry recorded, ' +
      'and NOTHING IN THE TREE SAYS WHICH SCENARIO PRODUCED 52.3 — the figure is corrected here ' +
      'and its provenance is gone. ' +
      'And at 17 columns a column is 11.94px against a 16px box, so adjacent risers OVERLAP: ' +
      '1,005 of 8,256 points inside one box fire its NEIGHBOUR, and centre separation is 11.94px ' +
      "against the 24px this entry's spacing exception depends on. **SO THE PASS-BY-SPACING DOES " +
      'NOT HOLD IN THE DENSE CASE.** A single measurement of a separation is a measurement of one ' +
      'scenario, and this entry claimed a general pass from it. Method and every figure: ' +
      'src/ui/burndown/hit-target.test.ts.',
  },
  'breakdown/breakdown.css .breakdown__state-toggle': {
    how: 'spacing',
    separationPx: 155.5,
    measured:
      '87.2 x 15.2px at 375px, 2026-08-15. One per table row, far apart. ' +
      'POINTER-CONFIRMED 2026-08-16, and the answer is the opposite of the .defences__control ' +
      'case: the hit area is slightly TALLER than the measured box, never shorter. Scanned in ' +
      '0.25px steps it is 87.5 x 17.5px against a border box of 87.23 x 15.19px — the extra is ' +
      "the label span's own line box (--lh-eyebrow gives it 17.00px), overflowing 1.00px above " +
      'and 0.81px below, and being a descendant of the button those slivers still fire it. So ' +
      '15.2px is the CONSERVATIVE figure, which is the right way round for a register to be ' +
      'wrong. Ten probes at both widths: centre and 1px inside all four edges return the toggle ' +
      'itself every time; 4px and 11px into the gap beside it return the cell or the sibling ' +
      'text and take no click at all. There is no second box. Separation re-measured ' +
      'independently at 155.52px centre-to-centre — the next row\'s own toggle, exactly one body ' +
      'row away — agreeing with the figure above to the pixel, and passing 2.5.8 by 6.5x.',
  },
  'primitives/primitives.css .disclosure__toggle': {
    how: 'size',
    measured:
      '642.50 x 32.19px at 1440px, 293.00 x 44.38px at 375/404px and 349.00 x 45.38px at 446px, ' +
      "2026-08-16, on /calculator/, measured on the rune panel's two collapsed lists. Full width " +
      'by construction on the inline axis, as this entry suspected; the block axis is padding plus ' +
      'an eyebrow line and it clears 24px at every width measured, GROWING rather than shrinking ' +
      'as the label wraps. All nine elementFromPoint probes returned the button. Measured by ' +
      'ui-config, which renders it but does not own primitives/.',
  },
  'shell/nav.css .nav__toggle': {
    how: 'size',
    measured:
      '84.47 x 36.84px CLOSED and 119.36 x 36.84px OPEN, at 375px on 2026-08-16, identical at ' +
      '320px and identical on every page — it is one shell component. THE BOX CHANGES SIZE WITH ' +
      'ITS OWN LABEL: the accessible name goes from "Menu" to "Close menu", 34.89px wider, and ' +
      'both states clear 24px on both axes. It is NOT RENDERED at 1425px at all — SiteNav draws ' +
      'no button above 80rem rather than hiding one — so the widest width at which it exists is a ' +
      'client width of 1264, where it measures 119.36 x 36.84px. ' +
      'POINTER-CONFIRMED: all seven interior probes return the button and all four gaps return ' +
      'the header and no control; a full pointerdown-to-click sequence dispatched at each of ' +
      'those seven points flipped aria-expanded 7 times out of 7, and at the three ' +
      'genuinely-outside points changed nothing. Nearest other target 97.91px, 83.30px with the ' +
      'menu open as the button grows toward the wordmark. Nothing was grown. ' +
      'MEASURING IT FOUND A SEPARATE DEFECT IN ITS PANEL, recorded in ' +
      'shell/pointer-target-register.test.tsx: the OPEN panel runs 114.64px off the RIGHT edge at ' +
      'every client width from 446 to 1264 — the mirror of the -114.6px LEFT-edge defect fixed on ' +
      '2026-08-15, and CAUSED BY that fix. 375px and 320px are clean.',
  },
  'picker/runes.css .runes__remove': {
    how: 'size',
    measured:
      '28.91 x 24.00px at 375px, 2026-08-15, on /calculator/ with three runes worn on the ' +
      'attacker. Nearest neighbouring target centre 131.63px, another remove; 227.27px with one ' +
      'rune worn. It carries the --target-min floor from the start rather than having been found ' +
      'short later, which is why the block axis is exactly 24.00 and not the 20.84 its sibling ' +
      '.items__remove measured — THE PRIOR DID NOT HOLD HERE, and measuring is what showed that. ' +
      'Commit b323e9b measured it the same day and reported the same pass by size; this is an ' +
      'independent re-measurement and the two agree to the pixel.',
  },
  'config/defences.css .defences__control': {
    how: 'size',
    measured:
      '293.00 x 32.00px at 375px, 2026-08-15, on /calculator/ — on the DEFAULT scenario, since ' +
      'Garen is the default defender and has one toggle; and for all three rows with Soraka, the ' +
      'largest panel. Nearest neighbouring target centre 99.24px, and 57.00px in the tightest ' +
      'case the stylesheet allows, measured with every detail block collapsed. ' +
      '═══ THIS ENTRY SAID "not present on the default scenario", AND THE FIGURE PUBLISHED FOR IT ' +
      'BELONGED TO A DIFFERENT BOX. ═══ Commit b323e9b reported 22.5px on the block axis, failing ' +
      'by 1.5px and passing by spacing at 78.34px. 22.50px is the .defences__label TEXT BOX. ' +
      '.defences__control was a <div> measuring 293.00 x 30.50px that accepted no pointer ' +
      'anywhere: elementFromPoint returned the bare div at the gap, at the trailing padding and ' +
      'at the top edge, and a click there changed nothing. The two live targets were that ' +
      '22.50px label and a 13.00 x 13.00px CHECKBOX 11px away — 11px under on BOTH axes — and ' +
      'the checkbox appears in no published figure at all. 78.34px is not reproducible on any ' +
      'scenario measured here: row separation is 114.62 and 99.24px on Soraka as rendered, and ' +
      '57.00px collapsed. The spacing route WOULD have held at those distances; it was recorded ' +
      'against a box that was not a target. Fixed by SIZE instead: the row IS the <label> now, ' +
      'so the whole box is one contiguous target and the pass no longer depends on how much of ' +
      "the source's own prose the detail block happens to carry. Cost 1.50px per row and 4.50px " +
      'on Soraka (494.88 to 499.38px), all of it min-block-size, which the row did not need at ' +
      '30.50px and which is there so the pass cannot follow the type size down later. ' +
      "RE-MEASURED 2026-08-16 at 1440px and in the narrow layout, with elementFromPoint at nine points: 642.50 x 32.00px at 1440px and 293.00 x 32.00px narrow. The label owns its centre, all four edges, AND correctly owns nothing in the four gaps outside it. The fix holds.",
  },
  'config/defences.css .defences__check': {
    how: 'size',
    measured:
      '13.00 x 13.00px at 375, 404, 446 and 1440px, 2026-08-16 — eleven pixels under the minimum ' +
      'on BOTH axes as a box of its own, and NOT grown. It sits wholly inside .defences__control, ' +
      'a <label> for this same checkbox measuring 32.00px on the block axis, so the two are ONE ' +
      'contiguous target: probed six pixels above, below and right of the checkbox, ' +
      'elementFromPoint returns that label. Nearest target belonging to anything else 167.88px at ' +
      '1440px, 276.71px at 375px. THIS IS THE CONTROL THAT APPEARED IN NO PUBLISHED FIGURE AT ' +
      'ALL — the register\'s name pattern never demanded it, which is the gap recorded above.',
  },
};

/**
 * Selectors the name pattern catches that are NOT interactive controls, each with why.
 *
 * The pattern is deliberately broad — it is better to catch a container and explain it than to
 * miss a control — and these are the price of that. A new entry needs a sentence.
 */
const NOT_A_CONTROL: Record<string, string> = {
  'burndown/burndown.css .burn__hatch--riser':
    'the hatched decoration ON a riser, not the riser itself. It has no handler and is not focusable.',
  'combo/combo.css .combo__controls':
    'the flex container the two arrows sit in. The controls inside it are registered; a container is not a target.',
  'slice/slice.css .shelf__btn':
    'a demo harness. `slice/` is a superseded end-to-end proof imported by nothing and served to nobody.',
};

describe('target size/the token is load-bearing', () => {
  it('--target-min is referenced by at least one component, not just defined', () => {
    // THE DEFECT THIS ENCODES. On the day it was added, `--target-min` was referenced by nothing
    // in `src/ui` — a standard nobody had applied. If this goes red the token has become a note
    // again.
    const users = STYLESHEETS.filter((f) => /var\(--target-min\)/.test(stripComments(read(f))));
    expect(users.map(rel)).not.toEqual([]);
  });

  it('every control-shaped selector in the interface is in the register', () => {
    // The tripwire: a new control cannot arrive without someone saying how it passes 2.5.8.
    const missing: string[] = [];
    for (const file of STYLESHEETS) {
      const name = rel(file);
      for (const m of stripComments(read(file)).matchAll(/(^|\})\s*([^{}]+)\{/g)) {
        for (const sel of m[2]!.split(',')) {
          const s = sel.trim();
          // Only simple class selectors: a compound or state selector styles a control already
          // registered under its base name.
          if (!/^\.[a-z][a-z0-9_-]*$/.test(s)) continue;
          if (!CONTROL_SELECTOR.test(s)) continue;
          const key = `${name} ${s}`;
          if (key in NOT_A_CONTROL) continue;
          if (!(key in CONTROLS)) missing.push(key);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('no entry claims to pass by spacing without stating the separation', () => {
    const vague = Object.entries(CONTROLS)
      .filter(([, p]) => p.how === 'spacing' && !(p.separationPx >= 24))
      .map(([k]) => k);
    expect(vague).toEqual([]);
  });

  it('every entry carries a real sentence, not a placeholder', () => {
    const thin = Object.entries(CONTROLS)
      .filter(([, p]) => (p.how === 'unmeasured' ? p.why : p.measured).trim().length < 40)
      .map(([k]) => k);
    expect(thin).toEqual([]);
  });

  it('NAMES THE CONTROLS NOBODY HAS MEASURED — a worklist, not a failure', () => {
    // Deliberately not asserted to be empty. Six are unmeasured today and that is a true statement
    // about the product; asserting the empty set would mean deleting the honest ones.
    const unmeasured = Object.entries(CONTROLS).filter(([, p]) => p.how === 'unmeasured');
    if (unmeasured.length > 0) {
      console.warn(
        `\n  ${unmeasured.length} interactive control(s) have never been measured against ` +
          `--target-min (24px):\n` +
          unmeasured.map(([k, p]) => `    - ${k}\n        ${(p as { why: string }).why}`).join('\n') +
          `\n  jsdom computes no layout. These need a real browser.\n`,
      );
    }
    expect(Object.keys(CONTROLS).length).toBeGreaterThanOrEqual(8);
  });
});
