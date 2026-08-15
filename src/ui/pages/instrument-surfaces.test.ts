// THE MACHINED EDGE — DESIGN-AUDIT.md item 3, "the instrument details", for the ui-site area.
//
// WHAT THE AUDIT FOUND. Of the tokens DESIGN.md §5 defines for elevation, `--elev-1` was
// defined and referenced by nothing: "**`--elev-1` is the one genuinely missing token.** §5
// describes it as *'a barely-raised panel; the top inset highlight reads as a machined edge'*.
// That inset highlight is precisely the detail that makes a surface read as milled metal rather
// than as a card. It is defined and never used." (DESIGN-AUDIT §5.)
//
// CLAUDE.md's standing instruction is that fixing the instance is not the work — writing the
// check that finds every other instance is. This is that check, scoped to the four directories
// of the `ui-site` area. The other eight interface areas need the same one-line declaration on
// their own panels and the same check over their own stylesheets; that roster was measured on
// the live page and handed to the lead rather than reached across for.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// DEFINITION — A RAISED PANEL. A CSS rule in this area's stylesheets that declares BOTH
// `background: var(--bg-panel)` and `border-radius: var(--radius-panel)`.
//
// Both halves are load-bearing, and the population each half alone would select is why:
//
//   • `--bg-panel` alone also selects CONTROLS — `.lede__go`, `.nav__toggle`, `.report__copy`,
//     `.shell__skip`. DESIGN.md §5 gives a control `--radius-control` (2px) precisely so it
//     reads as interactive rather than as a surface, and a shadow on a button is the drift
//     toward the rounded-card look §5 exists to prevent.
//   • `--bg-panel` alone also selects the FOOTER BAND, which sets no radius at all (measured:
//     `border-radius: 0px` on `footer.foot` at 1440px). A plate that spans the whole viewport
//     is the page's floor, not an object raised off it.
//   • `--radius-panel` alone would select `.nav__panel`, which is `--bg-panel-raised` and a
//     MENU. DESIGN.md §5: "Popovers, dropdown pickers, menus — the only genuine shadow in the
//     product". It correctly carries `--elev-2` and must never carry `--elev-1` as well.
//
// So the two declarations together name exactly the thing §5's `--elev-1` row describes: a
// panel surface, raised off the canvas, with a panel's own bezel radius.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// PROVED TO FAIL BEFORE IT WAS TRUSTED. Run against the stylesheets as they stood before the
// declaration was added, `carries the machined edge` reported 2 failures — `.notwritten` and
// `.ledger` in pages.css — and named both. Run after, 0.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The four directories of the `ui-site` area. Nothing outside them is this test's business. */
const AREA_DIRS = ['shell', 'pages', 'landing', 'coverage'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const STYLESHEETS = AREA_DIRS.flatMap((d) => walk(join(UI_DIR, d))).filter((f) =>
  f.endsWith('.css'),
);

interface Rule {
  file: string;
  selector: string;
  body: string;
}

/**
 * Every `selector { … }` rule in a stylesheet, comments stripped first so a token named in
 * prose is never read as a declaration.
 *
 * The pattern deliberately refuses a body containing a brace, which is what makes it skip the
 * `@media` and `@keyframes` wrappers and match the real rules nested inside them instead — the
 * behaviour this area's one reduced-motion block depends on being counted correctly.
 */
function rules(file: string): Rule[] {
  const css = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*@import[^;]*;/gm, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    file: relative(UI_DIR, file),
    selector: m[1]!.trim().replace(/\s+/g, ' '),
    body: m[2]!,
  }));
}

const ALL_RULES = STYLESHEETS.flatMap(rules);

const has = (body: string, prop: string, token: string) =>
  new RegExp(`(^|[;\\s])${prop}\\s*:\\s*var\\(${token}\\)\\s*;`).test(body);

const RAISED_PANELS = ALL_RULES.filter(
  (r) => has(r.body, 'background', '--bg-panel') && has(r.body, 'border-radius', '--radius-panel'),
);

describe('the ui-site area is measurable at all', () => {
  it('finds stylesheets to read', () => {
    // The audit's own rule: a sweep that can pass by finding nothing to look at proves nothing.
    expect(STYLESHEETS.length).toBeGreaterThanOrEqual(4);
    expect(ALL_RULES.length).toBeGreaterThan(50);
  });

  it('finds raised panels to check', () => {
    expect(RAISED_PANELS.length).toBeGreaterThan(0);
  });
});

describe('DESIGN.md §5 — elevation', () => {
  it('carries the machined edge: every raised panel declares --elev-1', () => {
    const bare = RAISED_PANELS.filter((r) => !has(r.body, 'box-shadow', '--elev-1')).map(
      (r) => `${r.file} — ${r.selector}`,
    );
    expect(bare).toEqual([]);
  });

  it('gives --elev-2 to nothing that is not a menu or popover', () => {
    // §5, verbatim: "If it is not a popover, it does not get --elev-2." In this area the one
    // legitimate holder is the navigation menu; `.nav--inline .nav__panel` is the same element
    // above 1280px, where it is a plain row and correctly gives the shadow back as --elev-0.
    const permitted = /nav__panel/;
    const wrong = ALL_RULES.filter(
      (r) => has(r.body, 'box-shadow', '--elev-2') && !permitted.test(r.selector),
    ).map((r) => `${r.file} — ${r.selector}`);
    expect(wrong).toEqual([]);
  });

  it('never puts a shadow on a control', () => {
    // A control is --radius-control (2px). §5 makes that radius the interactive signal; a
    // shadow on top of it is the rounded-card drift the whole direction rejects.
    const shadowed = ALL_RULES.filter(
      (r) =>
        has(r.body, 'border-radius', '--radius-control') &&
        (has(r.body, 'box-shadow', '--elev-1') || has(r.body, 'box-shadow', '--elev-2')),
    ).map((r) => `${r.file} — ${r.selector}`);
    expect(shadowed).toEqual([]);
  });
});
