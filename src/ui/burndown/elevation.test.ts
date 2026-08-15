// ELEVATION IN THE BURNDOWN — DESIGN.md §5 as SETTLED on 2026-08-15, swept over the `ui-burndown`
// area's own stylesheets, plus the browser readings that back it.
//
// ═══ WHAT §5 NOW SAYS, AND WHY THIS FILE EXISTS ═══
//
// DESIGN-AUDIT item 3 asked for `--elev-1` to be applied across the product, and a session applied
// it to every surface that is `--bg-panel` + `--radius-panel` — a reasonable reading of a table
// that described "panels at rest" and "a barely-raised panel" without saying which panels were
// which. **That reading is overruled.** §5, settled:
//
//   • `--elev-0` is panels at rest — nearly every surface in the product. No shadow. This
//     direction holds a surface down with a border and a value step rather than lifting it.
//   • `--elev-1` is reserved for a surface whose MEANING is that it overlays another surface.
//     Nothing on the page is that today, so nothing uses it. A reserved value with no current
//     occasion is not a gap and not a worklist item.
//   • `--elev-2` is popovers, dropdowns and menus only. §5 verbatim: "If it is not a popover, it
//     does not get `--elev-2`."
//
// §7 ("Interaction") is the one grant this area holds, and it is quoted rather than assumed:
// "Hovering or keyboard-focusing a riser freezes it and opens an `--elev-2` popover showing that
// instance's full resistance-modifier math in the fixed order (…), every figure carrying its
// damage-type tag." The resistance-math popover IS a popover, so `.burn__pop` keeps its shadow.
// §7's only other mention of elevation is the ban it inherits from §5 — "No coloured shadows. No
// glows anywhere except the burndown-specific effects defined in §7" — and every effect §7 then
// defines (the recent-damage ghost, the LETHAL rule, the DoT hatch, the healing riser) is an
// opacity, a border or a background. **None of them is a box-shadow, so §7 grants this area
// exactly one shadow and no more.**
//
// ═══ WHAT WAS MEASURED, IN CHROME, ON /calculator/ — 2026-08-15 ═══
//
// jsdom computes no layout, so nothing below can be re-measured by this file; the assertions pin
// the declarations that produced the readings. Readings are of the DEFAULT scenario the page
// opens on, `.burn` and every descendant, `getComputedStyle(el).boxShadow`:
//
//   viewport 1440×1100 — 132 elements in the subtree at rest, 132 read `none`, 0 read anything
//   else. With instance 1's riser focused the subtree is 133 and `.burn__pop` reads
//   `rgba(0, 0, 0, 0.5) 0px 6px 20px 0px` — `--elev-2` exactly (`0 6px 20px rgba(0,0,0,0.50)`).
//   Its wrapper `.burn__popbar` reads `none`, its own descendants all read `none`, and the
//   focused `.burn__riser` reads `none`.
//
//   viewport 375×812 — 166 elements with the popover open; 165 read `none` and the one that does
//   not is `.burn__pop`, with the identical computed value. The popover sits at x 61 → 317 inside
//   a 375px viewport, so nothing about elevation changes across §4b's breakpoint.
//
// **NOTHING WAS CHANGED AS A RESULT.** The area already obeyed the settled ruling: one shadow, on
// a popover, granted by §7. This file is the check that would have caught it had it not.
//
// ═══ PROVED TO FAIL BEFORE IT WAS TRUSTED ═══
//
// Every detector below is a pure function over CSS text, and `the detectors fire at all` runs each
// one over a fixture carrying the exact defect it hunts. A sweep that can pass by finding nothing
// proves nothing — that is the same reason `the area is measurable at all` exists.
//
// The six real-file assertions were additionally proved by MUTATING `burndown.css`, running, and
// restoring it (md5 confirmed identical afterwards). Each defect failed exactly two of them:
//
//   `box-shadow: var(--elev-2)` on `.burn`      → 2 failed, 12 passed  (the popover-only rule and
//                                                  the panel-at-rest rule)
//   `box-shadow: var(--elev-1)` on `.burn__plot` → 2 failed, 12 passed  (the reserved-token rule
//                                                  and the plot-well rule)
//   `box-shadow: 0 2px 6px rgba(0,0,0,0.4)` on
//   `.burn__chip`, a --radius-control control    → 2 failed, 12 passed  (the token rule and the
//                                                  no-shadow-on-a-control rule)
//
// Unmutated: 14 passed, 0 failed.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AREA_DIR = dirname(fileURLToPath(import.meta.url));

/** Every stylesheet in `src/ui/burndown/`. Nothing outside this area is this file's business. */
const STYLESHEETS = readdirSync(AREA_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => join(AREA_DIR, f));

interface Rule {
  file: string;
  selector: string;
  body: string;
}

/**
 * Every `selector { … }` rule in a stylesheet.
 *
 * Comments are stripped FIRST, so a token named in prose is never counted as a declaration —
 * this file's own area has a 40-line comment block that names `--elev-2` twice above the one
 * rule that uses it, and without the strip the sweep would read those as three uses.
 *
 * The pattern refuses a body containing a brace, which is what makes it skip `@media` and
 * `@keyframes` wrappers and match the real rules nested inside them instead. The burndown has
 * both, so a rule that only appears inside a media query is still swept.
 */
export function rulesIn(css: string, file = 'inline'): Rule[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*@import[^;]*;/gm, '');
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    file,
    selector: m[1]!.trim().replace(/\s+/g, ' '),
    body: m[2]!,
  }));
}

/** The declared value of `prop` in a rule body, or null. Shorthand-blind on purpose: it reads
 *  the property this file cares about literally, and `box-shadow` has no shorthand parent. */
function declared(body: string, prop: string): string | null {
  const m = body.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+);`));
  return m ? m[1]!.trim() : null;
}

const has = (body: string, prop: string, token: string) =>
  new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*var\\(${token}\\)\\s*;`).test(body);

/** DEFECT 1 — a shadow whose value is not an elevation token. `none` is permitted: it is what
 *  `--elev-0` resolves to, and a rule may legitimately turn a shadow off. */
export function rawShadows(rules: Rule[]): string[] {
  return rules
    .filter((r) => {
      const v = declared(r.body, 'box-shadow');
      return v !== null && v !== 'none' && !/^var\(--elev-[012]\)$/.test(v);
    })
    .map((r) => `${r.file} — ${r.selector} { box-shadow: ${declared(r.body, 'box-shadow')} }`);
}

/** DEFECT 2 — any use at all of the reserved token. */
export function elev1Uses(rules: Rule[]): string[] {
  return rules
    .filter((r) => has(r.body, 'box-shadow', '--elev-1'))
    .map((r) => `${r.file} — ${r.selector}`);
}

/** DEFECT 3 — `--elev-2` on anything that is not the resistance-math popover. */
export function elev2Uses(rules: Rule[]): string[] {
  return rules
    .filter((r) => has(r.body, 'box-shadow', '--elev-2'))
    .map((r) => `${r.file} — ${r.selector}`);
}

/** DEFECT 4 — a shadow on a panel at rest. DEFINITION, the same one `ui-site` swept with: a rule
 *  declaring BOTH `background: var(--bg-panel)` and `border-radius: var(--radius-panel)`. In this
 *  area that is exactly `.burn`, the instrument bezel. */
export function restingPanels(rules: Rule[]): Rule[] {
  return rules.filter(
    (r) => has(r.body, 'background', '--bg-panel') && has(r.body, 'border-radius', '--radius-panel'),
  );
}

/** DEFECT 5 — a shadow on a control. §5 makes `--radius-control` (2px) the interactive signal;
 *  a shadow on top of it is the rounded-card drift the whole direction rejects. */
export function shadowedControls(rules: Rule[]): string[] {
  return rules
    .filter((r) => has(r.body, 'border-radius', '--radius-control') && /box-shadow/.test(r.body))
    .map((r) => `${r.file} — ${r.selector}`);
}

const ALL_RULES = STYLESHEETS.flatMap((f) => rulesIn(readFileSync(f, 'utf8'), f.split('/').pop()!));

describe('burndown/the area is measurable at all', () => {
  it('finds both of the area stylesheets and a real number of rules in them', () => {
    // burndown.css and preview.css. If this ever reads 1, a stylesheet was renamed and every
    // assertion below silently narrowed — which is how a sweep passes by looking at nothing.
    // Measured 2026-08-15: 2 stylesheets, 80 rules (burndown.css + preview.css). The floor is
    // set below the measurement rather than at it, so ordinary edits do not fail this — it is
    // here to catch the sweep reading NOTHING, not to freeze a rule count.
    expect(STYLESHEETS.length).toBe(2);
    expect(ALL_RULES.length).toBeGreaterThan(50);
  });

  it('finds the one rule that is a panel at rest', () => {
    // `.burn`, the instrument bezel added 2026-08-14.
    expect(restingPanels(ALL_RULES).map((r) => r.selector)).toEqual(['.burn']);
  });
});

describe('burndown/the detectors fire at all', () => {
  // Each fixture carries the exact defect its detector hunts, so a detector that stopped
  // detecting fails here rather than passing silently over the real files.
  it('rawShadows catches a literal shadow value', () => {
    expect(rawShadows(rulesIn('.x { box-shadow: 0 2px 6px rgba(0,0,0,0.4); }'))).toHaveLength(1);
    expect(rawShadows(rulesIn('.x { box-shadow: var(--elev-2); }'))).toEqual([]);
    expect(rawShadows(rulesIn('.x { box-shadow: none; }'))).toEqual([]);
  });

  it('elev1Uses catches the reserved token', () => {
    expect(elev1Uses(rulesIn('.x { box-shadow: var(--elev-1); }'))).toHaveLength(1);
    expect(elev1Uses(rulesIn('.x { box-shadow: var(--elev-2); }'))).toEqual([]);
  });

  it('elev2Uses ignores a token named only in a comment', () => {
    // The real reason the comment strip exists: this area's own file names --elev-2 in prose.
    expect(elev2Uses(rulesIn('/* --elev-2 is popovers only */ .x { color: red; }'))).toEqual([]);
    expect(elev2Uses(rulesIn('.x { box-shadow: var(--elev-2); }'))).toEqual(['inline — .x']);
  });

  it('restingPanels needs both declarations, not either', () => {
    expect(restingPanels(rulesIn('.x { background: var(--bg-panel); }'))).toEqual([]);
    expect(restingPanels(rulesIn('.x { border-radius: var(--radius-panel); }'))).toEqual([]);
    expect(
      restingPanels(rulesIn('.x { background: var(--bg-panel); border-radius: var(--radius-panel); }')),
    ).toHaveLength(1);
  });

  it('shadowedControls catches a shadow on a 2px-radius control', () => {
    expect(
      shadowedControls(rulesIn('.x { border-radius: var(--radius-control); box-shadow: var(--elev-2); }')),
    ).toHaveLength(1);
    expect(shadowedControls(rulesIn('.x { border-radius: var(--radius-control); }'))).toEqual([]);
  });

  it('a rule nested inside a media query is swept like any other', () => {
    // §4b's one width query wraps real rules; they must not be invisible to this sweep.
    const nested = '@media (max-width: 30rem) { .x { box-shadow: var(--elev-1); } }';
    expect(elev1Uses(rulesIn(nested))).toHaveLength(1);
  });
});

describe('burndown/DESIGN.md §5 — elevation', () => {
  it('every shadow in the area comes from an elevation token', () => {
    // No raw value, no coloured shadow, no glow. §5: "No coloured shadows."
    expect(rawShadows(ALL_RULES)).toEqual([]);
  });

  it('NOTHING declares --elev-1 — it is reserved, and reserved is not missing', () => {
    // Settled 2026-08-15. Nothing in the burndown overlays another surface: the popover is a
    // popover and takes --elev-2; the bezel, the plot well and the chips are all at rest.
    expect(
      elev1Uses(ALL_RULES),
      '--elev-1 is reserved for a surface that must read as sitting ABOVE another surface ' +
        '(DESIGN.md §5). Do not apply it to make a panel look more finished — amend §5 first.',
    ).toEqual([]);
  });

  it('--elev-2 is on the resistance-math popover and on nothing else', () => {
    // The §7 grant, stated as the exact selector rather than as a permitted pattern, so a second
    // holder — a tooltip, a legend, a callout that "is basically a popover" — fails here.
    expect(elev2Uses(ALL_RULES)).toEqual(['burndown.css — .burn__pop']);
  });

  it('the panel at rest declares no shadow at all, which is what --elev-0 means', () => {
    const panels = restingPanels(ALL_RULES);
    expect(panels.length).toBeGreaterThan(0);
    expect(panels.filter((r) => /box-shadow/.test(r.body)).map((r) => r.selector)).toEqual([]);
  });

  it('never puts a shadow on a control', () => {
    expect(shadowedControls(ALL_RULES)).toEqual([]);
  });

  it('the plot well is at rest too, though it is not a --bg-panel surface', () => {
    // §7: "A rectangular plot inside a `--bg-well` panel with `--border-steel` and
    // `--radius-panel`." It is a panel by every reading except the one `restingPanels` uses, so
    // it is named here rather than left to a definition that happens not to select it.
    const plot = ALL_RULES.filter((r) => r.selector === '.burn__plot');
    expect(plot.length).toBeGreaterThan(0);
    expect(plot.filter((r) => /box-shadow/.test(r.body))).toEqual([]);
  });
});
