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

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIMITIVES_CSS = readFileSync(join(HERE, 'primitives.css'), 'utf8');

/** The body of one flat CSS rule, comments stripped. */
function ruleBody(css: string, selector: string): string | null {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.trim() === selector) return m[2]!;
  }
  return null;
}

describe('mandatory-cue-layout/the composition bar cannot squash its own tags', () => {
  it('a composition-bar segment is never narrower than its own tagged value', () => {
    const body = ruleBody(PRIMITIVES_CSS, '.comp__seg');
    expect(body, '.comp__seg rule is missing from primitives.css').not.toBeNull();
    expect(body).toMatch(/min-width:\s*max-content\s*;/);
  });

  it('and it still starts from a zero basis, so the bar stays proportional beyond that', () => {
    // The two declarations do different jobs and both are needed: `flex-basis: 0` is what makes
    // the segments proportional at all (a defect fixed 2026-08-13), and `min-width` is the floor
    // that keeps the mandatory tag legible. Removing either brings back a real, shipped defect.
    const body = ruleBody(PRIMITIVES_CSS, '.comp__seg')!;
    expect(body).toMatch(/flex-basis:\s*0\s*;/);
    expect(body).not.toMatch(/min-width:\s*0\s*;/);
  });
});
