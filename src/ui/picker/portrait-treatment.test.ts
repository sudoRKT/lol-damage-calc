// THE PORTRAIT-TREATMENT REGISTER for the configuration area.
//
// ═══ WHY THIS FILE EXISTS ═══
//
// DESIGN-AUDIT.md §9 records one drift against DESIGN.md and item 6 of its order of work asks for
// it: **"§9's portrait tint — cool toward `--bg-panel` rather than plain greyscale."** DESIGN.md §9
// says portraits are *"desaturated and tinted toward `--bg-panel` (low chroma) while the champion
// is unselected or inactive"*. The audit measured desaturation without the tint.
//
// **THE AUDIT AND THE BRIEF THAT SENT THIS AREA TO IT AGREE**, and both were checked against
// DESIGN.md's own words rather than paraphrased, which is the correction §3 of the audit records
// having had to make once already.
//
// This area is the product's largest consumer of an INACTIVE portrait: `ChampionPicker.tsx` renders
// one per option row with `active={false}`, 116 of them on an open list. It is therefore where the
// drift is most visible — and it is NOT where the treatment lives, which is the point of the check
// at the bottom of this file.
//
// ═══ MEASURED ON THE LIVE PAGE, 2026-08-16 — THE DRIFT IS STILL OPEN ═══
//
// CLAUDE.md says to check the commit log before acting on any sentence in this project's documents
// that says something is missing. `src/ui/art/art.css` has not been touched since `604fada`, and
// the rendered values were read back from a real Chrome on `/calculator/` at a 1440px viewport with
// the attacker picker open — 116 portraits, two distinct treatments:
//
//   | class                            | filter                        | background | opacity | mix-blend-mode |
//   |----------------------------------|-------------------------------|------------|---------|----------------|
//   | `portrait portrait--active`      | `none`                        | rgb(23,28,34) | 1    | normal         |
//   | `portrait portrait--row`         | `grayscale(1) brightness(0.7)`| rgb(23,28,34) | 1    | normal         |
//
// rgb(23,28,34) is `--bg-well` (#171C22). `--bg-panel` is #262E38 = rgb(38,46,56) and appears
// nowhere in the treatment. So: desaturated, dimmed, NOT tinted. The audit's reading holds.
//
// ═══ HOW BIG THE ASKED-FOR CHANGE ACTUALLY IS ═══
//
// Worth stating before anyone spends a design value on it. `--bg-panel` is rgb(38,46,56); its own
// Rec.709 luminance is 45.0, so its chroma — how far it sits from neutral grey — is
// **R −7.0, G +1.0, B +11.0 on a 0–255 scale.** A portrait tinted ALL THE WAY to `--bg-panel`'s hue
// would carry a blue-minus-red spread of 18/255, about 7%. Any partial-strength tint is subtler
// still. That is the whole visual delta item 6 is asking for.
//
// ═══ WHY THIS AREA DID NOT BUILD IT, AND WHAT THE LEAD HAS TO DECIDE ═══
//
// `.portrait` is declared in `../art/art.css`, which is LEAD-ONLY (CLAUDE.md, "The guards"). The
// change is reported rather than made. **It is also not a one-liner, and the reason is a genuine
// contradiction between two of this project's own files:**
//
//   1. **`../art/art-usage.test.ts` refuses every tint that CSS `filter` can express.** It permits
//      exactly `grayscale(n) brightness(n)`, `saturate(n)` or `none`. Checked mechanically rather
//      than read: `grayscale(1) brightness(0.7) sepia(0.35) hue-rotate(175deg)` FAILS, and so does
//      every other sepia/hue-rotate recipe. Its comment says a tint "would be an edit to Riot's
//      asset, which the licence does not permit" — while DESIGN.md §9 asks for a tint by name and
//      calls it "a display filter, not an edit to the asset (§15)". **Both cannot be right.**
//   2. **`.portrait` IS the `<img>`**, not a wrapper (`../art/ChampionPortrait.tsx`). So the two
//      routes that would tint without touching `filter` — an overlay pseudo-element, or
//      `mix-blend-mode: luminosity` over a `--bg-panel` backdrop — both need a wrapper element,
//      which is a change to that component and not to a stylesheet. Applied to the bare `<img>`,
//      `mix-blend-mode` blends the border and the surrounding surface too, and `opacity` blends
//      toward whichever surface the portrait happens to sit on rather than toward `--bg-panel`.
//   3. **Every remaining route introduces a value DESIGN.md does not define** — a hue-rotate angle,
//      a sepia strength, or an overlay alpha. DESIGN.md's preamble forbids inventing one locally.
//
// So item 6 is a decision, not a polish pass, and there are three honest ways to close it:
//
//   A. Amend DESIGN.md §9 with the exact tint recipe, and widen `art-usage.test.ts`'s permitted
//      list to that recipe and no other — resolving the contradiction in favour of §9.
//   B. Give `ChampionPortrait` a wrapper and state the overlay alpha in DESIGN.md.
//   C. **Amend DESIGN.md §9 to say the treatment is desaturation and dimming, which is what it has
//      always been.** This is the `--elev-1` precedent of 2026-08-16: the project owner ruled that
//      a token DESIGN.md described aspirationally should be recorded as it truly is rather than
//      chased, and an unused value stated is better than a value applied to look finished.
//
// **This area takes none of them. It is a raise, per CLAUDE.md: "When the spec is ambiguous or
// self-contradictory, raise it. Do not silently resolve it by picking a reading."**
//
// ═══ WHAT THIS FILE THEN CHECKS ═══
//
// The durable half, and the only half this area owns: **the portrait treatment has exactly one
// home, and it is not here.** Whichever way item 6 is settled, settling it in `picker.css` would
// put a second, divergent treatment on the same asset in the one place 116 of them render at once —
// and would recolour official art outside the single file `art-usage.test.ts` sweeps.

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
const COMPONENTS = AREA.flatMap((dir) =>
  readdirSync(join(UI_DIR, dir))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(UI_DIR, dir, f)),
);

const rel = (f: string) => relative(UI_DIR, f);
const stripCss = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** Both comment forms, as `../art/art-usage.test.ts` strips them. Prose is not a breach. */
const stripJs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The declarations that would re-treat a portrait locally. */
const RETREATMENT = /(?:^|[\s;{])(filter|mix-blend-mode|background-blend-mode|-webkit-filter):/;

describe('portrait-treatment/population', () => {
  it('this area really does render an inactive portrait — the checks are not vacuous', () => {
    // If the picker stops rendering one, these checks stop meaning anything and should be
    // reconsidered rather than left passing.
    const src = readFileSync(join(UI_DIR, 'picker', 'ChampionPicker.tsx'), 'utf8');
    expect(src).toContain('ChampionPortrait');
    expect(src).toMatch(/active=\{false\}/);
  });

  it('is looking at this area’s stylesheets and components, not at nothing', () => {
    expect(STYLESHEETS.length).toBeGreaterThanOrEqual(5);
    expect(COMPONENTS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('portrait-treatment/the treatment has one home and it is not this area', () => {
  it('no stylesheet here re-treats the art — no filter, no blend mode', () => {
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const m of stripCss(readFileSync(f, 'utf8')).matchAll(/([\w-]+):\s*([^;{}]+)/g)) {
        if (!RETREATMENT.test(`;${m[1]!}:`)) continue;
        offenders.push(
          `${rel(f)}: ${m[1]}: ${m[2]!.trim()} — the portrait treatment is declared once, in ` +
            `../art/art.css, and swept there by ../art/art-usage.test.ts (SPECIFICATION §15). A ` +
            `second one here would recolour official art outside the place that is audited.`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no stylesheet here targets .portrait at all', () => {
    // Not even to size or space it. §9 fixes the two portrait sizes and art.css owns both; a
    // context-specific override is how one list ends up with a portrait that reads differently
    // from every other.
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const m of stripCss(readFileSync(f, 'utf8')).matchAll(/([^{}]+)\{/g)) {
        if (/\.portrait\b/.test(m[1]!)) offenders.push(`${rel(f)}: ${m[1]!.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no component here hand-rolls an <img> in place of ChampionPortrait', () => {
    // The same rule ../art/art-usage.test.ts states product-wide, restated over the four
    // directories this area owns so it fails HERE, naming this file, rather than in a lead-only
    // sweep somebody has to go and read.
    //
    // PROSE ABOUT THE RULE IS NOT A BREACH OF THE RULE, and a first version of this check did not
    // know that: it stripped block comments only and reported `picker/RunePicker.tsx`, whose line
    // 45 explains why the picker may not render its own icons. The product-wide sweep strips both
    // comment forms and this one now does the same. Recorded rather than quietly corrected —
    // a guard that has fired once, wrongly, is a guard whose first real report will be doubted.
    const offenders: string[] = [];
    for (const f of COMPONENTS) {
      const src = stripJs(readFileSync(f, 'utf8'));
      if (/<img[\s>]/.test(src)) offenders.push(`${rel(f)}: renders a raw <img>`);
    }
    expect(offenders).toEqual([]);
  });

  it('the checks FAIL on the constructions they exist to refuse — proved, not assumed', () => {
    // Each of the three above, written out as the thing it forbids. A guard nobody has seen go red
    // is a guard nobody has tested.
    const tinted = '.picker__option .portrait { filter: grayscale(1) sepia(1) hue-rotate(190deg); }';
    const blended = '.picker__option img { mix-blend-mode: luminosity; }';

    const declarations = (css: string) =>
      [...stripCss(css).matchAll(/([\w-]+):\s*([^;{}]+)/g)].filter((m) =>
        RETREATMENT.test(`;${m[1]!}:`),
      );
    expect(declarations(tinted).map((m) => m[1])).toEqual(['filter']);
    expect(declarations(blended).map((m) => m[1])).toEqual(['mix-blend-mode']);

    const selectors = (css: string) =>
      [...stripCss(css).matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim()).filter((s) => /\.portrait\b/.test(s));
    expect(selectors(tinted)).toEqual(['.picker__option .portrait']);

    expect(/<img[\s>]/.test('<img className="portrait" src={src} />')).toBe(true);

    // And none of them trips on the treatment as it actually ships, so they test the re-treatment
    // rather than the word.
    const asShipped = '.picker__list { position: absolute; overflow-y: auto; }';
    expect(declarations(asShipped)).toEqual([]);
    expect(selectors(asShipped)).toEqual([]);
  });
});
