// DESIGN.md §5 — ELEVATION, SWEPT OVER THE `ui-breakdown` AREA.
//
// ═══ THE RULING THIS ENCODES, AND WHAT IT OVERRULED ═══
//
// DESIGN-AUDIT item 3 asked for `--elev-1` to be applied across the product, on the reading that a
// token defined and referenced by nothing is a gap. DESIGN.md §5 was settled on 2026-08-15 and
// **that reading is overruled**:
//
//   • `--elev-0` is PANELS AT REST — `.breakdown-panel` among them. No shadow is correct for it:
//     this direction holds a surface down with a border and a value step rather than lifting it.
//   • `--elev-1` is RESERVED for a surface whose MEANING is that it sits above another surface.
//     Nothing on the page is that today, so nothing uses it. It is not a worklist item.
//   • `--elev-2` is popovers, dropdowns and menus only. §5 verbatim: "If it is not a popover, it
//     does not get `--elev-2`." **This area contains no popover, and that is by construction**,
//     not by omission: the full-state snapshot deliberately opens as a table ROW rather than as a
//     popover, so that it cannot escape the table's reading order and so that it prints, copies
//     and reads to a screen reader in the same place the row it belongs to does
//     (`InstanceBreakdown.tsx`, the comment above `.breakdown__staterow`). So the correct
//     `--elev-2` count here is zero, and if one ever appears it means that decision was reversed.
//
// ═══ WHAT WAS MEASURED IN A REAL BROWSER BEFORE ANY OF THIS WAS WRITTEN ═══
//
// On /calculator/, four instances, every element of the `.breakdown-panel` subtree read with
// `getComputedStyle`. **Nothing in this area was changed; the stylesheet contains the string
// `box-shadow` zero times and always has.**
//
//   1440x900, all four rows collapsed    178 elements, 51 distinct class strings   none, every one
//    375x812, all four rows EXPANDED     190 elements, 54 distinct class strings   none, every one
//
// The 375px sweep was run with every `Full state ▾` disclosure OPEN on purpose, because
// `.breakdown__staterow td` — the opened well — exists in no other state and would otherwise never
// be measured. It reads `background: rgb(23, 28, 34)` (`--bg-well`) and `box-shadow: none`: the
// opened row is separated by a VALUE STEP, which is exactly what §5 asks for instead of a shadow.
//
// PROVED TO FAIL BEFORE IT WAS TRUSTED. See the note above each assertion.

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
 * is never read as a declaration — this file's own header names all three elevation tokens, and
 * breakdown.css is more comment than code.
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

describe('breakdown/the area is measurable at all', () => {
  it('finds stylesheets and rules to sweep', () => {
    // A sweep that can pass by finding nothing to look at proves nothing. breakdown.css held 35
    // rules when this was written.
    expect(STYLESHEETS.length).toBeGreaterThanOrEqual(1);
    expect(ALL_RULES.length).toBeGreaterThan(20);
  });
});

describe('breakdown/DESIGN.md §5 — elevation', () => {
  it('declares no shadow of any kind, by any property', () => {
    // PROVED TO FAIL: adding `box-shadow: var(--elev-1);` to `.breakdown-panel` reports
    // "breakdown.css — .breakdown-panel" and turns this red.
    //
    // Broader than the three tokens on purpose. A raw `0 1px 2px rgba(...)` would satisfy a
    // token-shaped check and still put a shadow on the instrument, and `filter: drop-shadow()`
    // is the same drift wearing a different property name.
    const shadowed = ALL_RULES.filter(
      (r) => /(^|[;\s])(box-shadow|text-shadow)\s*:/.test(r.body) || /drop-shadow\(/.test(r.body),
    ).map(where);
    expect(
      shadowed,
      'DESIGN.md §5: --elev-0 is panels at rest, and .breakdown-panel is one of them. Borders ' +
        'before shadows — reach for a border first.',
    ).toEqual([]);
  });

  it('gives --elev-2 to nothing, because this area has no popover', () => {
    // The positive form of the same rule, kept separate so the file says WHY the count is zero
    // rather than only that it is. §5: "If it is not a popover, it does not get --elev-2."
    //
    // The one thing here that a different build would have made a popover — the full-state
    // snapshot — is a table row instead, deliberately. If this assertion ever needs amending, the
    // thing to check first is whether that decision was reversed by accident.
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
