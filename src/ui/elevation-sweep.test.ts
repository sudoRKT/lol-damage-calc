// THE ELEVATION RULING, SWEPT OVER THE WHOLE INTERFACE AT ONCE.
//
// ═══ WHY THIS IS AT THE ROOT AND NOT IN AN AREA ═══
//
// Four areas now carry their own elevation test, each written by the agent that owns it. That is
// right and they stay. But an area's test only ever reads its own stylesheets, and DATA-SOURCES §44
// records the defect that shape creates: **two areas can hold opposite rules about one thing with
// both suites green.** Nine of the twelve areas have no elevation test at all, and a thirteenth
// area added tomorrow would have none either.
//
// So this file reads EVERY stylesheet under `src/ui`, and it is the only place the product-wide
// count of shadows is stated.
//
// ═══ THE RULING (DESIGN.md §5, settled 2026-08-15) ═══
//
//   --elev-0  panels at rest — the calculator's config, items, combo, result and stat panels, and
//             every page's content panel. Nearly every surface in the product. No shadow.
//   --elev-1  RESERVED for a surface that must read as sitting ABOVE another surface. Nothing on
//             the page is that today, so nothing uses it. An unused token is the correct state
//             here and DESIGN.md says so in the file rather than leaving it as an aspiration.
//   --elev-2  popovers, dropdown pickers and menus ONLY. §5, verbatim: "If it is not a popover, it
//             does not get --elev-2."
//
// §5 also says "no glows anywhere except the burndown-specific effects defined in §7", and §7
// grants exactly one: the riser popover.
//
// ═══ WHAT IT MEASURED, 2026-08-16 ═══
//
// Across all twelve areas plus the lead's directories, **four** rules set `box-shadow`:
//
//   shell/nav.css         .nav__panel              --elev-2   the phone menu. A menu.
//   shell/nav.css   .nav--inline .nav__panel       --elev-0   the SAME element above 1280px, where
//                                                             it is a plain row and gives it back.
//   burndown/burndown.css .burn__pop               --elev-2   the riser popover, granted by §7 in
//                                                             as many words.
//   picker/picker.css     .picker__list            --elev-2   the champion picker's dropdown list.
//
// Eight areas declare no shadow at all. `--elev-1` is declared by nothing, which is the ruling.
//
// **This paragraph said THREE when it was written, and the fourth is the reason this file exists.**
// The lead hand-grepped twelve directories, skipped `picker/` because an agent held it, and wrote
// the count from that. The parser bug documented below was hiding the same rule independently — so
// a wrong answer and a wrong method agreed, which is the most convincing way to be wrong. The
// assertion caught it in the first run.

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

const STYLESHEETS = walk(UI).filter((f) => f.endsWith('.css') && !f.endsWith('tokens.css'));
const rel = (f: string) => relative(UI, f);
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  file: string;
  selector: string;
  body: string;
}

const RULES: Rule[] = STYLESHEETS.flatMap((f) => {
  const css = stripComments(readFileSync(f, 'utf8'));
  // NO LEADING BOUNDARY GROUP, and that is the whole point. Two earlier versions of this regex
  // required the rule to be preceded by `}` (and then by `}` or `{`), and BOTH reported zero
  // shadows in a product that has three.
  //
  // The reason is a property of global regexes rather than of CSS: `matchAll` cannot overlap, so
  // the closing `}` consumed by rule N is no longer available to be rule N+1's leading boundary.
  // Every second rule vanished. It still parsed 295 rules and passed four of its six assertions
  // while doing it — which is exactly why this file states a POPULATION GUARD and an expected
  // COUNT rather than only asserting that bad things are absent. An assertion that something is
  // absent passes trivially when the sweep is looking at nothing.
  //
  // `[^{}@]+` cannot span an `@`, so an `@media` prelude is skipped and the rules INSIDE it are
  // matched on the engine's backtrack. Media-query rules are therefore covered.
  return [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({
    file: rel(f),
    selector: m[1]!.trim().replace(/\s+/g, ' '),
    body: m[2]!,
  }));
});

/** Rules declaring a shadow by any property. `filter: drop-shadow()` counts; it is still a shadow. */
const SHADOWED = RULES.filter((r) => /box-shadow\s*:|text-shadow\s*:|drop-shadow\s*\(/.test(r.body));

/**
 * The ONLY selectors permitted a shadow, each with the clause of DESIGN.md that grants it.
 *
 * A new entry needs a sentence naming the section that grants it — not "it looks better".
 */
const GRANTED: Record<string, string> = {
  'shell/nav.css .nav__panel':
    '§5 gives --elev-2 to "popovers, dropdown pickers, menus". This is the phone navigation menu.',
  'shell/nav.css .nav--inline .nav__panel':
    'the SAME element above 1280px, where it is a plain inline row rather than a menu. It declares ' +
    '--elev-0 to GIVE THE SHADOW BACK, which is the ruling being obeyed explicitly rather than by ' +
    'omission — and is the reason --elev-0 is not an unused token.',
  'burndown/burndown.css .burn__pop':
    '§7, verbatim: "Hovering or keyboard-focusing a riser freezes it and opens an --elev-2 popover ' +
    'showing that instance\'s full resistance-modifier math." §5 defers to §7 for this area.',
  'picker/picker.css .picker__list':
    '§5 names "dropdown pickers" in the same breath as popovers and menus. This is the champion ' +
    'picker\'s result list: `position: absolute` with `z-index: 2`, so it genuinely overlays the ' +
    'page rather than sitting in flow. ' +
    'FOUND BY THIS SWEEP AND NOT BY THE PERSON WHO WROTE IT: the lead hand-checked twelve ' +
    'directories with grep and skipped `picker/` because an agent owned it, then wrote this file ' +
    'expecting three. The parser bug above was hiding it too, so the wrong answer and the wrong ' +
    'method agreed with each other. That is the case for a sweep over a checklist.',
};

describe('elevation/the whole interface at once', () => {
  it('the sweep cannot pass by finding nothing', () => {
    expect(STYLESHEETS.length).toBeGreaterThan(10);
    expect(RULES.length).toBeGreaterThan(300);
  });

  it('NOTHING declares --elev-1 — it is reserved, and reserved is not missing', () => {
    // DESIGN-AUDIT called --elev-1 "the one genuinely missing token" and item 3 asked for it to be
    // applied. It was, to six rules, and then removed when §5 was settled: --elev-1 is for a
    // surface whose MEANING is that it overlays another, and nothing on the page is that.
    //
    // Do not apply it to make a panel look more finished. If a genuine overlay arrives, amend
    // DESIGN.md §5 first, then this test, then the stylesheet — in that order.
    const used = RULES.filter((r) => /--elev-1/.test(r.body)).map(
      (r) => `${r.file} — ${r.selector}`,
    );
    expect(used).toEqual([]);
  });

  it('every shadow in the product is one DESIGN.md grants, by name', () => {
    const ungranted = SHADOWED.map((r) => `${r.file} ${r.selector}`).filter((k) => !(k in GRANTED));
    expect(
      ungranted,
      'A shadow was added to a surface DESIGN.md does not grant one. §5: "If it is not a popover, ' +
        'it does not get --elev-2." Add it to GRANTED with the clause that permits it, or remove it.',
    ).toEqual([]);
  });

  it('no shadow value is a literal — every one comes from a token', () => {
    // A raw `0 2px 6px rgba(...)` is how the palette drifts: it renders like a token and no token
    // audit can see it.
    const literal = SHADOWED.filter((r) => {
      const m = r.body.match(/box-shadow\s*:\s*([^;]+)/);
      return m ? !/var\(--elev-[012]\)/.test(m[1]!) : /text-shadow|drop-shadow/.test(r.body);
    }).map((r) => `${r.file} — ${r.selector}`);
    expect(literal).toEqual([]);
  });

  it('never a shadow on a control', () => {
    // A control is --radius-control. §5 makes that radius the interactive signal; a shadow on top
    // of it is the rounded-card drift the whole direction rejects.
    const shadowedControls = SHADOWED.filter((r) => /--radius-control/.test(r.body)).map(
      (r) => `${r.file} — ${r.selector}`,
    );
    expect(shadowedControls).toEqual([]);
  });

  it('STATES THE PRODUCT-WIDE COUNT, so a new one is visible in the diff', () => {
    // FOUR, measured 2026-08-16. This is not a limit — it is a figure that has to be edited
    // deliberately, so adding a fifth shadow cannot happen without someone noticing.
    //
    // It was written as THREE and this assertion is what corrected it. The lead had grepped twelve
    // directories by hand and skipped picker/, and the parser bug above was independently hiding
    // the same rule — so a wrong answer and a wrong method agreed with each other, which is the
    // most convincing way to be wrong.
    expect(SHADOWED.length).toBe(4);
  });
});
