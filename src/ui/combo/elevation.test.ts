// DESIGN.md §5 — ELEVATION, SWEPT OVER THE `ui-combo` AREA.
//
// ═══ THE RULING THIS ENCODES, AND WHAT IT OVERRULED ═══
//
// DESIGN-AUDIT item 3 asked for `--elev-1` to be applied across the product, on the reading that a
// token defined and referenced by nothing is a gap. DESIGN.md §5 was settled on 2026-08-15 and
// **that reading is overruled**:
//
//   • `--elev-0` is PANELS AT REST — `.combo` among them, named in §5 by name. No shadow is
//     correct for them: this direction holds a surface down with a border and a value step
//     rather than lifting it.
//   • `--elev-1` is RESERVED for a surface whose MEANING is that it sits above another surface.
//     Nothing on the page is that today, so nothing uses it. It is not a worklist item.
//   • `--elev-2` is popovers, dropdowns and menus only. §5 verbatim: "If it is not a popover, it
//     does not get `--elev-2`." **This area contains no popover**, so the correct count here is
//     zero.
//
// ═══ WHAT WAS MEASURED IN A REAL BROWSER BEFORE ANY OF THIS WAS WRITTEN ═══
//
// On /calculator/ with Lux as the attacker and the default four-step combo, every element in the
// `.combo` subtree was read with `getComputedStyle`:
//
//   at 1440x1100   27 distinct element classes, 114 elements   box-shadow: none on every one
//   at  375x812    28 distinct element classes, 115 elements   box-shadow: none on every one
//
// (The extra class at 375px is the shelf's second wrap row producing one more bare `li`.) `filter`
// and `text-shadow` were read at the same time at 1440px and are `none` throughout as well, so no
// shadow arrives by another property either.
//
// **NOTHING WAS CHANGED. This file is the check that keeps it that way**, per CLAUDE.md: when a
// ruling is confirmed in one area, the work is the sweep that finds every future instance of it,
// not the one-off confirmation.
//
// PROVED TO FAIL BEFORE IT WAS TRUSTED. Each assertion was run against a deliberately broken copy
// of combo.css and named the offending rule — see the note above each one.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const STYLESHEETS = readdirSync(HERE)
  .filter((f) => f.endsWith('.css'))
  .map((f) => join(HERE, f));

interface Rule {
  file: string;
  selector: string;
  body: string;
}

/**
 * Every `selector { … }` rule in a stylesheet, comments stripped first so a token named in prose
 * is never read as a declaration — this file's own header names all three elevation tokens.
 *
 * The pattern refuses a body containing a brace, which is what makes it step past `@media` and
 * `@keyframes` wrappers and match the real rules nested inside them.
 */
function rules(file: string): Rule[] {
  const css = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*@import[^;]*;/gm, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    file: file.slice(HERE.length + 1),
    selector: m[1]!.trim().replace(/\s+/g, ' '),
    body: m[2]!,
  }));
}

const ALL_RULES = STYLESHEETS.flatMap(rules);
const where = (r: Rule) => `${r.file} — ${r.selector}`;

describe('combo/the area is measurable at all', () => {
  it('finds stylesheets and rules to sweep', () => {
    // A sweep that can pass by finding nothing to look at proves nothing.
    expect(STYLESHEETS.length).toBeGreaterThanOrEqual(1);
    expect(ALL_RULES.length).toBeGreaterThan(15);
  });
});

describe('combo/DESIGN.md §5 — elevation', () => {
  it('declares no shadow of any kind, by any property', () => {
    // PROVED TO FAIL: adding `box-shadow: var(--elev-1);` to `.combo` reports
    // "combo.css — .combo" and turns this red.
    //
    // Broader than the three tokens on purpose. A raw `0 1px 2px rgba(...)` would satisfy a
    // token-shaped check and still put a shadow on the instrument, and `filter: drop-shadow()`
    // is the same drift wearing a different property name.
    const shadowed = ALL_RULES.filter((r) =>
      /(^|[;\s])(box-shadow|text-shadow)\s*:/.test(r.body) || /drop-shadow\(/.test(r.body),
    ).map(where);
    expect(
      shadowed,
      'DESIGN.md §5: --elev-0 is panels at rest, and .combo is one of them. Borders before ' +
        'shadows — reach for a border first.',
    ).toEqual([]);
  });

  it('gives --elev-2 to nothing, because this area has no popover', () => {
    // The positive form of the same rule, kept separate so the file says WHY the count is zero
    // rather than only that it is. §5: "If it is not a popover, it does not get --elev-2." The
    // combo builder is a shelf of buttons and a list of steps; nothing here overlays anything.
    // If a popover ever arrives in this area, this assertion is the one to amend — with the
    // popover named in it.
    const wrong = ALL_RULES.filter((r) => /var\(--elev-2\)/.test(r.body)).map(where);
    expect(wrong).toEqual([]);
  });

  it('does not reserve --elev-1 into use', () => {
    // Stated separately from the blanket ban above because the REASON differs. A stray shadow is
    // a style defect; applying --elev-1 is a claim that a surface here overlays another one, and
    // DESIGN.md §5 requires that claim be made in the design file first.
    const raised = ALL_RULES.filter((r) => /var\(--elev-1\)/.test(r.body)).map(where);
    expect(
      raised,
      '--elev-1 is reserved for a surface that must read as sitting ABOVE another surface ' +
        '(DESIGN.md §5, settled 2026-08-15). Do not apply it to make a panel look more finished; ' +
        'amend §5 first if the meaning genuinely demands it.',
    ).toEqual([]);
  });
});
