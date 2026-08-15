// THE ART SWEEP — DESIGN.md §9's rules, checked across every component in the area rather than
// in the two components that happen to implement them.
//
// §9 makes three rules about official game art, and each is easy to break by accident in a new
// component that just needs "a picture here":
//
//   1. art is only ever a data-chip or a portrait, at the SIZES §9 names (32 / 24 / 20 for
//      chips, 64 / 40 for portraits) — so no component may render a raw <img> of its own;
//   2. a portrait is desaturated unless it belongs to one of the two active combatants, which
//      is a property of `ChampionPortrait` and is lost the moment somebody hand-rolls one;
//   3. art is loaded from Data Dragon by URL and is never recoloured (SPECIFICATION §15), so no
//      component may build a CDN path of its own — there is one place that does it.
//
// This is the same shape as the negative-zero sweep next door: one component owns the rule, and
// a mechanical check refuses every other implementation of it.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = join(UI_DIR, 'art');
const ROSTER_FILE = join(UI_DIR, 'data', 'roster.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const COMPONENTS = walk(UI_DIR).filter(
  (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !/\.test\.tsx?$/.test(f),
);

/** Prose about the rule is not a breach of the rule. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rel = (f: string) => relative(UI_DIR, f);

describe('art-sweep/population', () => {
  it('is looking at a non-empty surface', () => {
    expect(COMPONENTS.length).toBeGreaterThan(0);
  });
});

describe('art-sweep/only art/ renders an image', () => {
  it('no component outside src/ui/art/ renders an <img> of its own', () => {
    // A hand-rolled <img> is how a portrait loses its desaturation filter, its 40px size, its
    // border and its alt text all at once — and it looks fine on screen while doing it.
    const offenders = COMPONENTS.filter(
      (f) => !f.startsWith(ART_DIR) && /<img\b/.test(stripComments(readFileSync(f, 'utf8'))),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it('the four art components are the ones that do', () => {
    // The guard is not pointing at a stub: the components it protects really render the images.
    //
    // `RuneChip` joined on 2026-08-15, when a rune picker reached the page. The picker area
    // could not render its own icons — the sweep above forbids it — and RAISED that rather than
    // working around it, which is the partition doing its job rather than getting in the way.
    //
    // `ItemChip` joined the list on 2026-08-14, when item selection reached the page and
    // SPECIFICATION §10.1's "official game art in place of text labels" started applying to item
    // icons as well as ability icons. This assertion is a ROLL CALL, not a cap: it exists so the
    // sweep above cannot pass by pointing at components that render nothing. Adding a name to it
    // is a deliberate act — it says a new component now owns image rendering and is therefore
    // bound by §9's sizes, borders and no-recolour rule.
    const art = walk(ART_DIR).filter((f) => f.endsWith('.tsx') && !/\.test\./.test(f));
    const rendering = art.filter((f) => /<img\b/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(rendering.sort()).toEqual([
      'art/AbilityChip.tsx',
      'art/ChampionPortrait.tsx',
      'art/ItemChip.tsx',
      'art/RuneChip.tsx',
    ]);
  });
});

describe('art-sweep/one place builds a Data Dragon URL', () => {
  it('no component builds a CDN path of its own', () => {
    const offenders = COMPONENTS.filter(
      (f) => f !== ROSTER_FILE && /ddragon|\/img\/(champion|spell|passive|item)\//.test(stripComments(readFileSync(f, 'utf8'))),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it('that one place is data/roster.ts, and it really builds them', () => {
    const src = readFileSync(ROSTER_FILE, 'utf8');
    for (const path of ['/img/champion/', '/img/spell/', '/img/passive/', '/img/item/']) {
      expect(src).toContain(path);
    }
  });
});

describe('art-sweep/nothing recolours the art (SPECIFICATION §15)', () => {
  it('the only filter applied to a portrait is the §9 desaturation, and it lives in art.css', () => {
    // §9 permits a DISPLAY filter (desaturate + dim) and nothing else. A hue-rotate or a tint
    // would be an edit to Riot's asset, which the licence does not permit.
    const stylesheets = walk(UI_DIR).filter((f) => f.endsWith('.css'));
    const offenders: string[] = [];
    for (const f of stylesheets) {
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/filter:\s*([^;]+);/g)) {
        const value = m[1]!.trim();
        const permitted =
          /^grayscale\([\d.]+\)\s+brightness\([\d.]+\)$/.test(value) || // §9 portrait treatment
          /^saturate\([\d.]+\)$/.test(value) || // §7 the DoT hatch at ~50% saturation
          value === 'none';
        if (!permitted) offenders.push(`${rel(f)}: filter: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
