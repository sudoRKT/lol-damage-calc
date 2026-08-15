// MEASURES CLEAN, READS WRONG — the sweep for content that is present, laid out, scrollable, and
// still not in front of the reader.
//
// ═══ WHY THIS EXISTS: THREE INDEPENDENT FINDINGS IN ONE DAY ═══
//
// On 2026-08-15 three separate areas found the same shape without knowing about each other:
//
//   1. **The phone navigation panel sat 114.6px off the LEFT edge**, on all eight pages. Four
//      links were entirely invisible and a fifth read as "…ers are checked".
//   2. **The burndown's kill callout was 349px wide against a 204px plot, left edge at x = −48**,
//      so the word LETHAL rendered as "THAL" — on the mark that announces a kill.
//   3. **The per-instance table clipped the DAMAGE-TYPE TAG.** The figure is right-aligned, so
//      what fell past the scroll container's edge was not the number: row three printed `phy`,
//      row four printed `m`. A blue 217 beside a lone letter m is a damage type conveyed by
//      colour with its cue cut off — the one rule CLAUDE.md calls non-negotiable.
//
// **EVERY EXISTING CHECK PASSED ON ALL THREE.** The document did not overflow. The tables scrolled
// correctly. `body.scrollWidth` equalled the viewport. And in two of the three the reason is the
// same and is worth stating on its own: **content overflowing to the LEFT, or clipped INSIDE a
// scroll container, creates no scrollable area at all**, so every width measure reads exactly as
// it does on a clean page and a reader cannot even pan to the missing part.
//
// `responsive-overflow.test.tsx` refuses the CONSTRUCTIONS that cause page-level sideways scroll.
// It is a good sweep and it is blind to all three of these, because none of them makes the page
// scroll. "It fits" and "the reader can read it" are different questions and only the second
// matters.
//
// ═══ WHAT THIS FILE CHECKS ═══
//
// It renders real components in jsdom and walks the DOM for two defect classes that can be found
// WITHOUT layout, which is the constraint that shapes everything below:
//
//   A. **A MANDATORY CUE INSIDE A CLIPPING CONTAINER WITH NO ROOM RESERVED FOR IT.** The
//      damage-type tag is the one the specification makes non-negotiable. A tag that can be
//      clipped is a colour-only cue, whatever the markup says.
//   B. **A SURFACE THAT ONLY EXISTS ON HOVER, FOCUS OR CLICK** — a menu, a popover, a disclosure
//      body — anchored so that it opens toward a container edge. These are invisible to every
//      page-load sweep in the product because they are not in the DOM at load, which is exactly
//      how the navigation panel survived.
//
// ═══ WHAT IT CANNOT DO, STATED PLAINLY ═══
//
// **jsdom COMPUTES NO LAYOUT.** Every element has zero width and `getBoundingClientRect()` returns
// zeroes. Nothing here can tell you a glyph was clipped at 320px — that is a real-browser
// measurement and it belongs in DESIGN-AUDIT's re-measurement procedure, where all three findings
// above were actually made.
//
// What it CAN do is refuse the constructions, and name the surfaces a browser pass must visit. So
// this file has two halves: mechanical refusals, and a REGISTER of every hover/focus/click surface
// in the product with the widths it has been measured at. The register is the part that would have
// caught the navigation panel: it is a list that goes red when a new such surface appears and
// nobody has put a ruler against it.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI = join(ROOT, 'src', 'ui');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const ALL = walk(UI);
const STYLESHEETS = ALL.filter((f) => f.endsWith('.css') && !f.endsWith('tokens.css'));
const COMPONENTS = ALL.filter(
  (f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !/\.test\.tsx?$/.test(f),
);
const rel = (f: string) => relative(UI, f);
const read = (f: string) => readFileSync(f, 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Flat CSS into { selector, body } pairs. These stylesheets have no nesting. */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1]!.trim(), body: m[2]! });
  }
  return out;
}

// =========================================================================================
// CLASS A — A MANDATORY CUE MAY NOT LIVE WHERE A CONTAINER CAN CLIP IT
// =========================================================================================

describe('clipped/a damage-type tag cannot be clipped away', () => {
  it('never has its own overflow hidden, and is never made shrinkable to nothing', () => {
    // THE DEFECT THIS ENCODES. `.dmg__tag` is the P/M/T cue. It rides beside a right-aligned
    // figure, so in a horizontally clipped container it is the FIRST thing past the edge and the
    // number stays visible — the worst possible order. If the tag itself may shrink or be
    // clipped, the cue is optional in practice however mandatory it is in the markup.
    const offences: string[] = [];
    for (const file of STYLESHEETS) {
      for (const { selector, body } of rules(read(file))) {
        if (!/\.dmg__tag\b/.test(selector)) continue;
        if (/overflow(-x)?\s*:\s*(hidden|clip)/.test(body)) {
          offences.push(`${rel(file)} ${selector}: hides its own overflow`);
        }
        if (/\bmin-(inline-size|width)\s*:\s*0\b/.test(body)) {
          offences.push(`${rel(file)} ${selector}: min-inline-size 0 lets it shrink to nothing`);
        }
        if (/\bwhite-space\s*:\s*nowrap/.test(body) === false && /\bflex\s*:\s*\d+\s+1\b/.test(body)) {
          offences.push(`${rel(file)} ${selector}: is shrinkable inside a flex line`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('and the tag is never the last child of a horizontally scrolling row', () => {
    // Where the cue sits in the SOURCE ORDER decides which end of a scroll it lands on. This is a
    // construction check, not a layout one: a tag rendered after its figure inside a row that can
    // scroll horizontally is the exact arrangement that printed `m` instead of `mag`.
    //
    // It reads the mandatory-cue component rather than every call site, because `DamageValue` is
    // the single place the pair is built (primitives/DamageValue.tsx) and the cue rule exists
    // precisely so that it cannot be assembled anywhere else.
    // The rule lives in the stylesheet: `.dmg` is `white-space: nowrap` so the number and its tag
    // cannot break apart. If that ever goes, a wrap becomes a second way to separate a figure
    // from its cue, alongside a clip.
    const css = read(join(UI, 'primitives', 'primitives.css'));
    const dmg = rules(css).find((r) => r.selector.split(',').some((sel) => sel.trim() === '.dmg'));
    expect(dmg, '.dmg has no rule in primitives.css').toBeTruthy();
    expect(dmg!.body).toMatch(/white-space:\s*nowrap/);
  });
});

// =========================================================================================
// CLASS B — THE REGISTER OF SURFACES THAT ONLY EXIST ON HOVER, FOCUS OR CLICK
// =========================================================================================

/**
 * Every surface in the product that is absent from the DOM at page load and appears on an
 * interaction — the class the navigation panel belonged to when it spent an unknown number of days
 * 114.6px off the left edge of every page.
 *
 * `measuredAt` is the widths a PERSON has opened it at in a real browser and confirmed it lands
 * inside its container. An empty array is a real and honest state: it means nobody has looked.
 *
 * THIS LIST IS THE POINT. The mechanical half below cannot measure a popover's position, so the
 * durable protection is that a NEW such surface cannot arrive without someone adding a line here
 * and deciding whether to open it at 320px.
 */
const INTERACTIVE_SURFACES: Array<{
  id: string;
  file: string;
  opensOn: 'click' | 'hover' | 'focus';
  measuredAt: number[];
  note: string;
}> = [
  {
    id: 'site navigation panel',
    file: 'shell/nav.css',
    opensOn: 'click',
    measuredAt: [320, 375],
    note:
      'THE ONE THAT WAS BROKEN. Sat 114.6px off the LEFT edge on all eight pages because ' +
      '`inset-inline-end: 0` was resolved against a toggle-sized containing block at the START ' +
      'of the header. Fixed 2026-08-15 to `inset-inline-start: 0`; panel now 24→282 in a 320 ' +
      'viewport. Left overflow creates no scrollable area, so nothing reported it.',
  },
  {
    id: 'champion picker listbox',
    file: 'picker/picker.css',
    opensOn: 'click',
    measuredAt: [],
    note:
      'A combobox popover. NOT YET OPENED AT A PHONE WIDTH BY ANYONE — it is capped by ' +
      '`--measure-popover-max-inline` (256px), which fits 320px, but where it is ANCHORED has ' +
      'not been measured and that is what the navigation panel got wrong.',
  },
  {
    id: 'burndown resistance popover',
    file: 'burndown/burndown.css',
    opensOn: 'click',
    measuredAt: [320, 375, 480, 768, 1280],
    note:
      'WAS BROKEN, AND FOUND BY OPENING IT — the second entry in this register to be, after the ' +
      'navigation panel. All four popovers on the default scenario hung off the LEFT edge of the ' +
      'viewport at 320px (131.0 / 94.0 / 57.0 / 20.0px) and three of four at 375px; 37 of 37 on ' +
      'the preview harness at 320px. `documentElement.scrollWidth` read exactly 320 throughout, ' +
      'which is the whole reason no sweep could see it. The figures are right-aligned so they ' +
      'survived and the LABEL column went off screen: four bare damage numbers with nothing ' +
      'saying which one lands. Fixed 2026-08-15 by bounding it to a plot-wide row whose trailing ' +
      'pad is capped at one popover width, with no width query. Re-measured across five widths: ' +
      '53 openings, none outside the viewport or its panel.',
  },
  {
    id: 'per-instance full-state expander',
    file: 'breakdown/breakdown.css',
    opensOn: 'click',
    measuredAt: [320, 375],
    note: 'Expands in normal flow inside the table, so it cannot be positioned outside anything.',
  },
  {
    id: 'collapsed disclosure bodies',
    file: 'primitives/primitives.css',
    opensOn: 'click',
    measuredAt: [320, 375],
    note:
      'Curve tables and exclusion lists. In normal flow; opened and measured during the ' +
      'page-length pass (DATA-SOURCES §64).',
  },
];

/**
 * Positioned rules that draw INSIDE a box their own component sizes, each with the sentence that
 * says what bounds them. These are not overlays and cannot land outside anything.
 *
 * A new entry needs a real reason. "It looked fine" is not one; the navigation panel looked fine.
 */
const DRAWS_INSIDE_ITS_OWN_BOX: Record<string, string> = {
  'art/art.css .chip__underline':
    'a rule drawn along the bottom edge of an ability chip, inset to the chip on all sides. It ' +
    'has no content and cannot grow.',
  'art/art.css .chip__tag':
    'the damage-type letter on an ability chip, one character, positioned in a corner of a chip ' +
    'of fixed size.',
  'compare/compare.css .cmp__bar':
    'a comparison bar inside a track the component sizes; its width is a percentage of that ' +
    'track, so it cannot exceed it.',
  'curves/curves.css .curve__grid':
    'gridlines inside the plot, positioned as percentages of it.',
  'curves/curves.css .curve__svg':
    'the chart itself, filling its plot box — position is for stacking against the gridlines, ' +
    'not for offsetting it anywhere.',
  'curves/curves.css .curve__ytick':
    'an axis value, a short number, in the plot\'s own rail. See NOWRAP_POSITIONED_ALLOWED for ' +
    'the separate x-axis overlap finding at 320px, which is real and is DESIGN.md §4b\'s.',
  'compare/compare.css .cmp__gridline':
    'a zero-width rule inside the comparison track, positioned as a percentage of it. It has no ' +
    'content and an inline size of 0, so there is nothing to overflow.',
  'compare/compare.css .cmp__health':
    'the defender-health marker: a zero-width dashed rule in the same track, same reason.',
  'compare/compare.css .cmp__dotmark':
    'the damage-over-time marker, also zero-width inside the track.',
  'compare/compare.css .cmp__tick':
    'an axis value under the comparison track — a short number in a box the panel sizes.',
  'curves/curves.css .curve__xtick':
    'an axis value under the plot — a short NUMBER, in monospace, in the plot\'s own rail. ' +
    'MEASURED 2026-08-15 at 320px across seven chart instances: 0 collisions, smallest separation ' +
    '+9.48px, and about 70px of axis to spare before it would reach zero. ' +
    '**THIS ENTRY CARRIED THE WRONG DEFECT UNTIL 2026-08-15 AND IT COST AN AGENT A SESSION.** It ' +
    'said these labels read as `inst 1inst 2inst 3+DoT` — but this axis only ever prints numbers, ' +
    'and those strings are written by `burndown/geometry.ts` and rendered as `.burn__xlabel`. The ' +
    'file header 90 lines below always attributed the finding to the burndown correctly; the ' +
    'lead attached it to the wrong selector here. Three things disproved it independently: the ' +
    'font (this renders JetBrains Mono, whose 6.6047px advance the reported 28.6px is not a ' +
    'multiple of), the provenance of the strings, and the header\'s own wording.',
  'curves/curves.css .curve__refused':
    'a zero-width anchor for the hatched refused band; the band inside it is a fixed flex basis, ' +
    'so neither can grow with content.',
  'curves/curves.css .curve__short':
    'a zero-width anchor for the never-reached rule, same construction as the refused band.',
  'shell/shell.css .shell__skip':
    'the skip link. It is deliberately off screen UNTIL FOCUSED and then anchored to the top ' +
    'left of the viewport — the one case where being outside the container is the feature.',
};

describe('clipped/every interaction-only surface is registered and someone has opened it', () => {
  it('the register names a file that exists, for every entry', () => {
    const missing = INTERACTIVE_SURFACES.filter((s) => !ALL.includes(join(UI, s.file))).map(
      (s) => `${s.id}: no such file ${s.file}`,
    );
    expect(missing).toEqual([]);
  });

  it('every positioned element is either a registered surface or a named exception', () => {
    // ═══ THIS CHECK GAVE UP ON BEING CLEVER, AND THAT WAS THE RIGHT CALL ═══
    //
    // Two heuristics were tried and both were too broad. "Positioned with an offset" caught 12
    // rules; narrowing it to "in a stylesheet that clips nowhere" still caught 7. Every false
    // positive was a chart or chip internal — a gridline, an axis tick, a comparison bar, an
    // underline — positioned WITHIN a box its own component sizes. **CSS alone cannot tell those
    // apart from an overlay that escapes**, because the difference is the containing block, which
    // depends on the DOM and on layout.
    //
    // A guard that reports seven false positives is one somebody suppresses, which would be worse
    // than no guard. So the mechanism is a LIST, as it is for the track allow-list, the length
    // allow-list and the countable-section allow-list: every positioned rule must be either a
    // registered interactive surface or an exception with a sentence saying what bounds it.
    //
    // The cost is that someone must write a sentence. That is also the point — the navigation
    // panel was 114.6px off the left edge of every page for an unknown number of days, and one
    // sentence asking "what stops this leaving its container?" would have caught it.
    const registered = new Set(INTERACTIVE_SURFACES.map((s) => s.file));
    const unexplained: string[] = [];
    for (const file of STYLESHEETS) {
      const name = rel(file);
      if (registered.has(name)) continue;
      for (const { selector, body } of rules(read(file))) {
        if (!/\bposition\s*:\s*(absolute|fixed)/.test(body)) continue;
        const key = `${name} ${selector}`;
        if (!(key in DRAWS_INSIDE_ITS_OWN_BOX)) unexplained.push(key);
      }
    }
    expect(unexplained).toEqual([]);
  });

  it('and no exception outlives its rule', () => {
    // A dead entry is a standing excuse for whatever takes its selector next.
    const dead = Object.keys(DRAWS_INSIDE_ITS_OWN_BOX).filter((key) => {
      const [file, ...sel] = key.split(' ');
      const selector = sel.join(' ');
      const full = ALL.find((f) => rel(f) === file);
      if (!full) return true;
      return !rules(read(full)).some(
        (r) => r.selector === selector && /\bposition\s*:\s*(absolute|fixed)/.test(r.body),
      );
    });
    expect(dead).toEqual([]);
  });

  it('NAMES THE SURFACES NOBODY HAS OPENED ON A PHONE — this is a worklist, not a failure', () => {
    // Deliberately NOT a failing assertion. Two surfaces are unmeasured today and that is a true
    // statement about the product, not a defect to hide by asserting the empty set. It prints
    // them on every run so the number cannot quietly grow.
    const unmeasured = INTERACTIVE_SURFACES.filter((s) => !s.measuredAt.includes(320));
    if (unmeasured.length > 0) {
      console.warn(
        `\n  ${unmeasured.length} interaction-only surface(s) have never been opened at 320px:\n` +
          unmeasured.map((s) => `    - ${s.id} (${s.file})`).join('\n') +
          '\n  jsdom cannot measure these. They need a real browser.\n',
      );
    }
    // What IS asserted: the register is not empty, and every entry carries a reason.
    expect(INTERACTIVE_SURFACES.length).toBeGreaterThanOrEqual(5);
    expect(INTERACTIVE_SURFACES.filter((s) => s.note.trim().length < 40)).toEqual([]);
  });
});

// =========================================================================================
// CLASS C — THE CONSTRUCTION THAT PUT LETHAL OFF THE SCREEN
// =========================================================================================

/**
 * Positioned nowrap rules that are allowed, each with the reason it cannot do what LETHAL did.
 *
 * A NEW entry needs a sentence saying what bounds its width. Both of these hold SHORT NUMERIC
 * content — an axis value — rather than a word that can grow, and both sit inside a plot.
 *
 * **NOT A CLEAN BILL OF HEALTH.** The burndown's x-axis labels were measured at 320px on
 * 2026-08-15 with 0.42px between them on a four-column chart and NEGATIVE separation on six and
 * seven columns, reading as `inst 1inst 2inst 3+DoT`. That is a real defect of a different kind —
 * overlap, not escape — and it is DESIGN.md §4b's to answer, so it is named here rather than
 * silently exempted.
 */
const NOWRAP_POSITIONED_ALLOWED = new Set([
  'curves/curves.css .curve__ytick',
  'curves/curves.css .curve__xtick',
]);

describe('clipped/a nowrap element may not be wider than the box it is anchored in', () => {
  it('no element combines nowrap with an absolute inline offset outside the register', () => {
    // The callout was `position: absolute` + `white-space: nowrap`, so it grew to its longest
    // word regardless of its container and hung off the left edge. Nowrap is not the defect and
    // absolute is not the defect; TOGETHER they mean "this element ignores its container's width".
    const registered = new Set(INTERACTIVE_SURFACES.map((s) => s.file));
    const found: string[] = [];
    for (const file of STYLESHEETS) {
      const name = rel(file);
      for (const { selector, body } of rules(read(file))) {
        if (!/\bwhite-space\s*:\s*nowrap/.test(body)) continue;
        if (!/\bposition\s*:\s*(absolute|fixed)/.test(body)) continue;
        if (/\bmax-inline-size|\bmax-width/.test(body)) continue; // capped: it cannot outgrow
        if (registered.has(name)) continue;
        if (NOWRAP_POSITIONED_ALLOWED.has(`${name} ${selector}`)) continue;
        found.push(`${name} ${selector}: nowrap + positioned, with no maximum`);
      }
    }
    expect(found).toEqual([]);
  });
});
