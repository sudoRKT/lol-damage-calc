// @vitest-environment jsdom
//
// THE MANDATORY-CUE LAYOUT CHECK — a rule about CSS, because jsdom cannot check the rendering.
//
// ═══ THE DEFECT THIS PINS ═══
//
// DESIGN.md §8: the P/M/T tag is "mandatory and never suppressed", and it is the DEFINITIVE
// channel — colour is the fast, redundant one. Every test in this area asserts the tag is
// PRESENT, by accessible name and by text. All of them passed while, in a real browser, the
// composition bar under a 42-physical / 225-magic total rendered its two labels on top of each
// other as the single illegible string "4222 5 M", with the physical `P` tag entirely lost.
//
// **A PRESENT CUE AND A LEGIBLE CUE ARE DIFFERENT CLAIMS, AND jsdom CANNOT TELL THEM APART**: it
// computes no layout, so `getComputedStyle` answers with the declaration and nothing about where
// the box ended up. The only mechanical check available without a browser is on the DECLARATION
// that makes overlap impossible — so that is what this asserts, on every rule that lays out a
// mandatory cue.
//
// It is deliberately narrow and it says so: it proves the stylesheet still contains the fix, not
// that the page looks right. Looking at the page is a person's job, and this is what stops the
// fix being removed by someone who cannot reproduce the failure.

import { CompositionBar, MIN_SHARE_FOR_INLINE_LABEL, labelsMustSitBelow } from './DamageValue';
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIMITIVES_CSS = readFileSync(join(HERE, 'primitives.css'), 'utf8');

afterEach(cleanup);

/** The body of one flat CSS rule, comments stripped. */
function ruleBody(css: string, selector: string): string | null {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.trim() === selector) return m[2]!;
  }
  return null;
}

describe('mandatory-cue-layout/the composition bar cannot squash its own tags', () => {
  it('a segment is NEVER widened to fit its label — the bar keeps its exact proportions', () => {
    // REVERSED 2026-08-14. This asserted `min-width: max-content`, which kept every tag legible
    // by widening the narrowest segment — and therefore made the bar OVERSTATE the smallest
    // damage type, the number a reader is least able to check. DESIGN.md §7 and §8 settled it
    // the other way: §8's "never suppressed" is not a licence to distort the data to keep a cue.
    // The labels move instead. The bar is data; a tag is a label.
    const body = ruleBody(PRIMITIVES_CSS, '.comp__seg');
    expect(body, '.comp__seg rule is missing from primitives.css').not.toBeNull();
    expect(body).toMatch(/min-width:\s*0\s*;/);
    expect(body).not.toMatch(/min-width:\s*max-content/);
  });

  it('and it still starts from a zero basis, so the bar is proportional at all', () => {
    // `flex-basis: 0` is what makes the segments proportional (a defect fixed 2026-08-13):
    // `flex-grow` distributes only FREE space, so with the default basis a 570/200/120 split
    // rendered as three near-identical segments.
    expect(ruleBody(PRIMITIVES_CSS, '.comp__seg')!).toMatch(/flex-basis:\s*0\s*;/);
  });

  it('the label row exists for when the labels have to leave the bar', () => {
    expect(ruleBody(PRIMITIVES_CSS, '.comp__labels')).not.toBeNull();
    // The track is its own row so the bar above and the labels below are separate boxes.
    expect(ruleBody(PRIMITIVES_CSS, '.comp__track')).toMatch(/display:\s*flex\s*;/);
  });
});

describe('mandatory-cue-layout/when the labels move, and that they all move together', () => {
  it('moves them for the split that actually collided in a browser', () => {
    // 42 physical / 225 magic — a 0.157 share, which rendered as "4222 5 M" with the P tag lost.
    expect(labelsMustSitBelow(267, { physical: 42, magic: 225, true: 0 })).toBe(true);
  });

  it('leaves them in the bar for the one case that still fits — a single-type bar', () => {
    // Without this the rule would pass for an implementation that always moved them
    // unconditionally, which is a different design and not the one DESIGN.md §7 specifies.
    // A single-type bar has one share of 1.0 and the whole width to draw it in.
    expect(labelsMustSitBelow(300, { physical: 300, magic: 0, true: 0 })).toBe(false);
  });

  it('ANY SPLIT OF TWO OR MORE TYPES MOVES ITS LABELS — arithmetic, not a choice', () => {
    // CHANGED 2026-08-14 with the tag, and this case used to assert the opposite. The tag was one
    // character and the threshold 0.25; the tag is now up to four, and the threshold is 0.65,
    // measured (70px of label in the 109px running-total bar). Two shares sum to 1, so they
    // cannot both reach 0.65 — an even split moves, and so does every other.
    expect(labelsMustSitBelow(300, { physical: 150, magic: 150, true: 0 })).toBe(true);
    expect(labelsMustSitBelow(300, { physical: 100, magic: 100, true: 100 })).toBe(true);
    expect(labelsMustSitBelow(1000, { physical: 340, magic: 660, true: 0 })).toBe(true);
    // The boundary, pinned from both sides so the constant cannot drift unnoticed.
    expect(labelsMustSitBelow(1000, { physical: 349, magic: 651, true: 0 })).toBe(true);
    expect(MIN_SHARE_FOR_INLINE_LABEL).toBe(0.65);
  });

  it('THE OLD 0.25 WAS ALREADY TOO LOW, against the bar this product actually draws', () => {
    // Measured, not assumed: the narrowest composition bar is the breakdown's running-total
    // column at 109px, NOT the ~200px the old derivation supposed. Even the old one-letter
    // label was 52px there, so a 0.3 share had 33px of room for it. This test states the case
    // that used to pass and should not have, so the correction cannot be quietly undone.
    const wouldHavePassedUnderTheOldRule = 0.3 >= 0.25;
    expect(wouldHavePassedUnderTheOldRule).toBe(true);
    expect(labelsMustSitBelow(1000, { physical: 300, magic: 700, true: 0 })).toBe(true);
  });

  it('ignores a type that contributed nothing — an absent segment cannot be too narrow', () => {
    // A zero share would otherwise fail the threshold and move every label for no reason.
    expect(labelsMustSitBelow(300, { physical: 300, magic: 0, true: 0 })).toBe(false);
  });

  it('renders EVERY label in one place — never some inside the bar and some beneath', () => {
    // A row with two figures inside the bar and one beneath reads as three different kinds of
    // thing. DESIGN.md §7: all the labels move together.
    const { container } = render(<CompositionBar total={267} byType={{ physical: 42, magic: 225, true: 0 }} />);
    expect(container.querySelectorAll('.comp__labels').length).toBe(1);
    expect(container.querySelectorAll('.comp__labels .dmg').length).toBe(2);
    // …and none left behind in a segment.
    expect(container.querySelectorAll('.comp__seg .dmg').length).toBe(0);
  });

  it('keeps every tag, wherever the labels sit — the cue is relocated, never suppressed', () => {
    const below = render(<CompositionBar total={267} byType={{ physical: 42, magic: 225, true: 0 }} />);
    expect(below.container.querySelectorAll('.comp__labels .dmg').length).toBe(2);
    expect(below.container.textContent).toContain('phys');
    expect(below.container.textContent).toContain('mag');
    cleanup();
    // The other branch — a bar whose one segment is wide enough — keeps its label INSIDE, and it
    // still carries the tag there. Since 2026-08-14 that branch is a single-type bar: two shares
    // cannot both clear 0.65, so any real split moves. The cue is present either way, which is
    // the claim this test makes.
    const inside = render(<CompositionBar total={300} byType={{ physical: 300, magic: 0, true: 0 }} />);
    expect(inside.container.querySelectorAll('.comp__seg .dmg').length).toBe(1);
    expect(inside.container.querySelectorAll('.comp__labels').length).toBe(0);
    expect(inside.container.textContent).toContain('phys');
  });

  it('the bar keeps proportional grow factors either way', () => {
    // The whole point: moving the labels must not touch the geometry.
    const { container } = render(<CompositionBar total={267} byType={{ physical: 42, magic: 225, true: 0 }} />);
    const grows = [...container.querySelectorAll('.comp__seg')].map(
      (e) => (e as HTMLElement).style.flexGrow,
    );
    expect(grows.map(Number)).toEqual([42 / 267, 225 / 267]);
  });
});
