// THE REORDER CONTROLS ARE BIG ENOUGH TO HIT — derived from the tokens, not measured here.
//
// ═══ WHAT WAS WRONG, MEASURED IN A REAL BROWSER AT 375px ON 2026-08-15 ═══
//
// The twelve `.combo__control` buttons on a four-step combo measured 18.47 x 21.39px, with a
// minimum centre-to-centre distance of 22.47px between neighbours. WCAG 2.2 AA success
// criterion 2.5.8 (Target Size, Minimum) asks for 24 x 24 CSS px, and excuses a smaller target
// only when a 24px-diameter circle centred on it intersects no other target — 22.47px apart,
// the circles intersect. 16 ordered pairs failed. The neighbour 22.47px from "move later" is
// REMOVE, so the cost of a missed tap was a deleted combo step.
//
// ═══ WHAT THIS FILE CAN AND CANNOT DO, STATED PLAINLY ═══
//
// **IT CANNOT MEASURE A BUTTON.** jsdom computes no layout: every element is zero by zero, and
// `getBoundingClientRect()` returns zeroes here. The 18.47 x 21.39px above and the
// 34.47 x 25.39px below are BROWSER measurements, recorded in the report and in combo.css.
//
// What this file does instead is re-derive the guaranteed minimum from the declarations, so
// the arithmetic that reaches 24px is checked on every run rather than remembered. The
// derivation is deliberately GLYPH-INDEPENDENT in the inline axis: padding and border alone
// clear 24px before the arrow is drawn, so no font substitution can quietly shrink the target.
//
// The failure it is built to catch is one edit: a padding step tuned back down to reclaim a
// few pixels of card width. That is exactly how the defect arrived, and it is invisible to
// every other test in this area — the component renders, the names are right, the reorder
// works, and the control is unhittable.
//
// PROVED TO FAIL BEFORE IT WAS TRUSTED: reinstating the original `var(--space-0) var(--space-1)`
// padding turns the inline assertion red at 10px against a 24px floor, and the block assertion
// red at 19.4px.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = readFileSync(join(HERE, '..', 'tokens.css'), 'utf8');
const COMBO = readFileSync(join(HERE, 'combo.css'), 'utf8');

/** WCAG 2.2 AA, success criterion 2.5.8. CSS pixels, both axes. */
const MINIMUM_TARGET = 24;

/** DESIGN.md §3: "rem with px at a 16px root". The type scale is stated in rem against it. */
const ROOT_PX = 16;

/** The 1px in `--border-steel: 1px solid …`, on all four sides. */
const BORDER = 1;

function token(name: string): string {
  const found = TOKENS.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!found) throw new Error(`tokens.css declares no --${name}`);
  return found[1]!.trim();
}

function px(value: string): number {
  const v = value.trim();
  if (v === '0') return 0; // a unitless zero is a valid length, and is how the gap gets removed
  if (v.endsWith('rem')) return parseFloat(v) * ROOT_PX;
  if (v.endsWith('px')) return parseFloat(v);
  throw new Error(`not a length this test can resolve: ${value}`);
}

/** Resolve `var(--space-3)` and bare lengths alike. */
function length(value: string): number {
  const varRef = value.trim().match(/^var\(--([a-z0-9-]+)\)$/);
  return px(varRef ? token(varRef[1]!) : value);
}

/** The declared value of one property inside one rule of combo.css. */
function declaration(selector: string, property: string): string {
  const rule = COMBO.match(
    new RegExp(`\\n${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`),
  );
  if (!rule) throw new Error(`combo.css has no rule for ${selector}`);
  const decl = rule[1]!.match(new RegExp(`(?:^|;|\\n)\\s*${property}:\\s*([^;]+);`));
  if (!decl) throw new Error(`${selector} declares no ${property}`);
  return decl[1]!.trim();
}

/** `padding: A B` → { block: A, inline: B }, the only shorthand form this rule uses. */
function padding(selector: string): { block: number; inline: number } {
  const parts = declaration(selector, 'padding').split(/\s+(?![^(]*\))/);
  if (parts.length !== 2) {
    throw new Error(`expected a two-value padding shorthand, got: ${parts.join(' ')}`);
  }
  return { block: length(parts[0]!), inline: length(parts[1]!) };
}

describe('combo/the reorder controls meet WCAG 2.5.8 by SIZE, not by the spacing exception', () => {
  it('clears 24px across, before the glyph is drawn', () => {
    // The inline axis is the one that failed hardest (18.47px) and the one a font change could
    // quietly break, so it is derived WITHOUT the glyph: padding + border alone must reach 24.
    const { inline } = padding('.combo__control');
    const guaranteed = inline * 2 + BORDER * 2;
    expect(guaranteed).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    expect(guaranteed).toBe(26); // 12 + 12 + 1 + 1 — measured in the browser at 34.47px with the arrow
  });

  it('clears 24px down the page, from the line box the type role gives it', () => {
    const { block } = padding('.combo__control');
    const fontSize = px(token('type-body-s'));
    const lineBox = fontSize * parseFloat(token('lh-body-s'));
    const height = lineBox + block * 2 + BORDER * 2;
    expect(height).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    expect(+height.toFixed(2)).toBe(25.4); // 11 x 1.4 + 4 + 4 + 1 + 1 — browser-measured 25.39px
  });

  it('holds the destructive control away from the pair it sits beside', () => {
    // A target that is big enough can still be the WRONG one. Remove is the only control here
    // whose mis-tap is not recoverable, and it used to sit 22.47px from "move later".
    const offset = length(declaration('.combo__control--remove', 'margin-inline-start'));
    const arrowGap = length(declaration('.combo__controls', 'gap').replace(/\s*\/\*.*$/, ''));
    expect(offset).toBeGreaterThan(arrowGap);
  });

  it('states the floor rather than reaching it by accident', () => {
    // `--target-min` is DESIGN.md §4a's stated minimum, and it must BE 24px — the constant this
    // file asserts against is the token, not a number remembered alongside it.
    expect(px(token('target-min'))).toBe(MINIMUM_TARGET);
    expect(declaration('.combo__control', 'min-inline-size')).toBe('var(--target-min)');
    expect(declaration('.combo__control', 'min-block-size')).toBe('var(--target-min)');
  });

  it('spends the card HEIGHT rather than its width — the controls are their own row', () => {
    // The card had 3.46px of slack at 375px, so a wider single row costs the two-column
    // sequence and 158px of page height. This is the construction that avoids that trade, and
    // it is asserted because reverting it is silent: everything still renders, at 18.47px.
    expect(declaration('.combo__step', 'flex-direction')).toBe('column');
    // The step's own row. Without it the controls are a sibling of the chip and the card is
    // one row again — which is the layout this whole file exists to keep from coming back.
    expect(declaration('.combo__step-head', 'display')).toBe('flex');
  });
});

// ═══ THE SHELF, MEASURED 2026-08-15 AND FOUND ALREADY COMPLIANT ═══
//
// The two shelf buttons were carried as `unmeasured` in `../target-size-register.test.ts` — nobody
// had put a ruler against either. Measured in a real browser on the calculator page, at 375px and
// again at 320px (the figures are the same at both, because the shelf WRAPS rather than shrinking):
//
//   .combo__shelf-button         34.00 x 49.19px   nearest other target 42.00px centre-to-centre
//   .combo__shelf-button--text   96.91 x 36.84px   nearest other target 52.09px centre-to-centre
//
// Both pass 2.5.8 BY SIZE, on both axes, with room to spare — so NOTHING WAS GROWN. The measurement
// refuted the suspicion that the text button would be the short one: it is the tallest control on
// the shelf, because --lh-body-m is a larger line box than the chip's zero one and --space-2 pads
// it twice.
//
// What these assertions add is the guard the `.combo__control` defect taught: the sizes above are
// arithmetic that HAPPENS to clear 24px, and arithmetic is what silently stopped clearing it last
// time. Each is re-derived from the tokens on every run, and glyph-independently in the inline axis.
describe('combo/the shelf buttons meet WCAG 2.5.8 by SIZE — measured, then pinned to the tokens', () => {
  it('carries the stated floor on the base class, so both variants inherit it', () => {
    // One declaration covers the icon chips and the basic-attack button alike: the text button
    // carries BOTH classes, and the base one is where the floor belongs.
    expect(declaration('.combo__shelf-button', 'min-inline-size')).toBe('var(--target-min)');
    expect(declaration('.combo__shelf-button', 'min-block-size')).toBe('var(--target-min)');
  });

  it('the icon button is the chip it frames — and the chip clears 24px', () => {
    // The button contributes NO box of its own: zero padding, zero border. Its measured 34 x 49px
    // is the chip's. So the guarantee to check is the chip token, plus the fact that this rule
    // adds nothing that could shrink it.
    expect(length(declaration('.combo__shelf-button', 'padding'))).toBe(0);
    expect(length(declaration('.combo__shelf-button', 'border'))).toBe(0);
    expect(px(token('art-chip-combo'))).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    expect(px(token('art-chip-combo'))).toBe(32); // browser-measured 34.00px with the chip's border
  });

  it('the basic-attack button clears 24px across, before the glyph is drawn', () => {
    // Glyph-independent, exactly as for `.combo__control`: padding and border alone must reach 24,
    // so no font substitution and no shorter label can take this under the minimum.
    const { inline } = padding('.combo__shelf-button--text');
    expect(declaration('.combo__shelf-button--text', 'border')).toBe('var(--border-steel)');
    const guaranteed = inline * 2 + BORDER * 2;
    expect(guaranteed).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    expect(guaranteed).toBe(26); // 12 + 12 + 1 + 1 — measured 96.91px with "Basic attack" in it
  });

  it('the basic-attack button clears 24px down the page, from its own line box', () => {
    // NOTE the line-height: the base rule sets `line-height: 0` so the icon buttons collapse to
    // their chip. This variant overrides it, and that override is load-bearing — without it the
    // button's height is padding and border alone, 18px, and it is the one control on this shelf
    // that has no chip to give it a box.
    const { block } = padding('.combo__shelf-button--text');
    expect(declaration('.combo__shelf-button--text', 'line-height')).toBe('var(--lh-body-m)');
    const lineBox = px(token('type-body-m')) * parseFloat(token('lh-body-m'));
    const height = lineBox + block * 2 + BORDER * 2;
    expect(height).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    expect(+height.toFixed(2)).toBe(36.85); // 13 x 1.45 + 8 + 8 + 1 + 1 — browser-measured 36.84px
  });
});
