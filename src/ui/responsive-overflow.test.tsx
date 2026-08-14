// @vitest-environment jsdom
//
// THE RESPONSIVE-OVERFLOW SWEEP — the mechanical form of "the page must not scroll sideways on a
// phone", run across the whole of src/ui/ rather than against the one table that was measured.
//
// ═══ WHAT IT IS ABOUT ═══
//
// SPECIFICATION §10: "The interface is fully responsive. Layouts adapt for mobile, where a
// significant share of usage occurs." DESIGN-AUDIT.md §6.5 measured the built page in a real
// browser at 375×812 and found `document.documentElement.scrollWidth` at 579px against a 375px
// viewport — 204px of horizontal overflow on the WHOLE DOCUMENT. One element caused it: the
// per-instance breakdown table.
//
// ═══ WHAT THIS FILE CAN AND CANNOT MEASURE, STATED PLAINLY ═══
//
// **IT CANNOT MEASURE THE OVERFLOW.** jsdom computes no layout: every element has zero width, and
// `scrollWidth` is always 0. Nothing in this suite can tell you the page fits a 375px phone. THAT
// IS A REAL-BROWSER MEASUREMENT and it belongs in DESIGN-AUDIT.md's re-measurement procedure.
//
// What it CAN do is refuse the CONSTRUCTIONS that cause it, which is the durable half: a table
// outside a scroll region, a grid track that can be pushed wider than its share, a fixed minimum
// width larger than a phone, and a breakpoint invented locally. Each of those is a defect class,
// not an instance, and each is swept over every file in the area on every run.
//
// ═══ THE FOUR CLASSES, AND WHERE EACH ONE CAME FROM ═══
//
//   1. **A table with no scroll region.** The measured defect. Six columns of frame data have a
//      combined minimum width no phone holds, and a table's minimum width propagates up through
//      its panel, its grid track and the document. Fixed by confining the scroll to the table
//      (`../primitives/TableScroller.tsx`), which also stops the propagation: a scroll container
//      contributes a minimum of ZERO to its parent's intrinsic width.
//   2. **A bare `1fr` or `auto` grid track.** A fraction track's AUTOMATIC MINIMUM is min-content,
//      so an over-wide child widens the track rather than overflowing its own cell — and the page
//      with it. `items.css` records this exact defect being found and fixed once before, in one
//      grid, by hand. This is the sweep that finds the rest.
//   3. **A layout measure used as a hard minimum.** `minmax(256px, 1fr)` keeps a 256px track
//      inside a 240px container. `min(…, 100%)` makes the measure a preference instead of a floor.
//   4. **A locally invented breakpoint.** DESIGN.md states exactly ONE viewport width in the whole
//      file — §7a's ~1280px, written as 80rem. A phone breakpoint is a design value, and the
//      design file's preamble forbids inventing one locally. This sweep is what makes that
//      mechanical rather than a matter of memory.
//
// ANYTHING NOT ON THAT LIST IS NOT CLAIMED TO BE COVERED. In particular: an absolutely positioned
// popover that hangs off the edge of a narrow viewport is invisible to every check here, because
// its position depends on layout. One such case is known and is reported to the lead rather than
// quietly fixed — the burndown's resistance popover, `--measure-popover-max-inline` (256px) wide,
// anchored to a 47px column on a phone.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_RESULT } from '../types';
import { InstanceBreakdown } from './breakdown';
import { HpBurndown } from './burndown';
import { StatBlockPanel } from './stats';
import { SCROLL_REGION_SUFFIX } from './primitives';

afterEach(cleanup);

const UI_DIR = dirname(fileURLToPath(import.meta.url));
const TOKENS_FILE = join(UI_DIR, 'tokens.css');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const ALL = walk(UI_DIR);
const STYLESHEETS = ALL.filter((f) => f.endsWith('.css') && f !== TOKENS_FILE);
const COMPONENTS = ALL.filter(
  (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !/\.test\.tsx?$/.test(f),
);

const rel = (f: string) => relative(UI_DIR, f);
const read = (f: string) => readFileSync(f, 'utf8');
const stripCss = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Flat CSS into { selector, body } pairs, comments removed. These stylesheets have no nesting. */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  for (const m of stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1]!.trim(), body: m[2]! });
  }
  return out;
}

// =========================================================================================
// CLASS 1 — EVERY TABLE SITS IN AN ANNOUNCED, KEYBOARD-REACHABLE SCROLL REGION
// =========================================================================================

/**
 * Every file in the area that renders a `<table>`. Declared here AND recomputed from the files
 * below; if the two disagree the test fails, so a new table cannot arrive unnoticed and cannot
 * arrive without someone deciding whether it needs a fixture.
 */
const FILES_WITH_TABLES = [
  'breakdown/InstanceBreakdown.tsx',
  'burndown/HpBurndown.tsx',
  'slice/VerticalSlice.tsx',
  'stats/StatBlockPanel.tsx',
];

/**
 * Of those, the one this file does NOT render, with the reason.
 *
 * `VerticalSlice` is a superseded end-to-end proof that fetches its own data on mount and is
 * imported by nothing. Rendering it here would be a test of `fetch`, not of overflow. It is
 * covered by the STATIC half below, which reads its source — so it is checked, just not checked
 * the same way, and this constant is where that distinction is written down rather than assumed.
 */
const NOT_RENDERED_HERE = ['slice/VerticalSlice.tsx'];

interface Fixture {
  id: string;
  node: ReactNode;
  /** How many `<table>` elements this fixture is expected to render. */
  tables: number;
}

const FIXTURES: Fixture[] = [
  {
    id: 'InstanceBreakdown (canonical mock — per-instance table + the DoT table)',
    node: <InstanceBreakdown result={MOCK_RESULT} />,
    tables: 2,
  },
  {
    id: 'HpBurndown (canonical mock — the two-verdict table)',
    node: <HpBurndown result={MOCK_RESULT} />,
    tables: 1,
  },
  {
    id: 'StatBlockPanel (defender)',
    node: (
      <StatBlockPanel
        role="Defender"
        championName="Garen"
        portraitSrc="/Garen.png"
        stats={MOCK_RESULT.defenderStats}
      />
    ),
    tables: 1,
  },
];

describe('responsive-overflow/population', () => {
  it('knows every file in the area that renders a table', () => {
    const found = COMPONENTS.filter((f) => /<table[\s>]/.test(stripJs(read(f)))).map(rel).sort();
    expect(found).toEqual(FILES_WITH_TABLES);
  });

  it('renders every table-bearing component except the one named as an exception', () => {
    const rendered = FILES_WITH_TABLES.filter((f) => !NOT_RENDERED_HERE.includes(f));
    expect(rendered).toEqual([
      'breakdown/InstanceBreakdown.tsx',
      'burndown/HpBurndown.tsx',
      'stats/StatBlockPanel.tsx',
    ]);
    expect(FIXTURES).toHaveLength(rendered.length);
  });

  it('the fixtures really do render tables — the sweep cannot pass by finding nothing', () => {
    let tables = 0;
    for (const fixture of FIXTURES) {
      cleanup();
      render(<>{fixture.node}</>);
      const here = document.querySelectorAll('table').length;
      expect(here, `${fixture.id} rendered ${here} tables, expected ${fixture.tables}`).toBe(
        fixture.tables,
      );
      tables += here;
    }
    expect(tables).toBe(4);
  });

  it('is looking at a non-empty stylesheet surface', () => {
    expect(STYLESHEETS.length).toBeGreaterThan(0);
    expect(COMPONENTS.length).toBeGreaterThan(0);
  });
});

describe('responsive-overflow/every table scrolls inside its own region', () => {
  it('no table anywhere is left able to push the page sideways', () => {
    const offenders: string[] = [];
    for (const fixture of FIXTURES) {
      cleanup();
      render(<>{fixture.node}</>);
      for (const table of document.querySelectorAll('table')) {
        if (!table.closest('.u-scroll-x')) {
          offenders.push(
            `${fixture.id}: a <table class="${table.className}"> with no scroll region — ` +
              `its minimum width propagates to the document`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every scroll region is keyboard-reachable', () => {
    // A div with `overflow-x: auto` and no tabindex is content only a mouse or a touch drag can
    // reach. This is the half that stops a layout fix becoming an accessibility defect.
    const offenders: string[] = [];
    for (const fixture of FIXTURES) {
      cleanup();
      render(<>{fixture.node}</>);
      for (const region of document.querySelectorAll('.u-scroll-x')) {
        if ((region as HTMLElement).tabIndex !== 0) {
          offenders.push(`${fixture.id}: a scroll region is not focusable`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every scroll region announces itself, and says that it scrolls', () => {
    const offenders: string[] = [];
    for (const fixture of FIXTURES) {
      cleanup();
      render(<>{fixture.node}</>);
      // Asked of the accessibility tree, not of the markup: this is the same engine a
      // `getByRole(…, { name })` query uses, so it is what a screen reader would say.
      const named = screen.queryAllByRole('region', { name: /\S/ });
      const regions = [...document.querySelectorAll('.u-scroll-x')];
      for (const region of regions) {
        if (region.getAttribute('role') !== 'region') {
          offenders.push(`${fixture.id}: a scroll region is not role="region"`);
          continue;
        }
        if (!named.includes(region as HTMLElement)) {
          offenders.push(`${fixture.id}: a scroll region has no accessible name`);
          continue;
        }
        const name = region.getAttribute('aria-label') ?? '';
        if (!name.includes(SCROLL_REGION_SUFFIX)) {
          offenders.push(
            `${fixture.id}: the region is named "${name}" and never says that it scrolls — ` +
              `a keyboard user who lands on it is not told why`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the scroll region shows keyboard focus (DESIGN.md §6)', () => {
    // Focusable and invisible when focused is worse than not focusable at all: the focus goes
    // somewhere the user cannot see. jsdom loads no stylesheets, so this reads the declaration
    // out of the file rather than asking for a computed style.
    const focusRules = STYLESHEETS.flatMap((f) => rules(read(f)))
      .filter((r) => r.selector.includes('.u-scroll-x:focus-visible'))
      .filter((r) => /outline:\s*2px solid var\(--text-primary\)/.test(r.body));
    expect(focusRules).toHaveLength(1);
  });

  it('every table-bearing FILE uses the scroller as many times as it renders a table', () => {
    // The static half. It covers the component the fixtures above do not render, and it catches
    // a second table added to a file that already had one — which the rendered half would only
    // catch if somebody also added a fixture. LIMIT, STATED: it COUNTS, it does not parse the
    // JSX tree, so it cannot prove the scroller is the table's ancestor rather than its sibling.
    // The rendered half proves that, for the three components it renders.
    const offenders: string[] = [];
    for (const file of COMPONENTS) {
      const src = stripJs(read(file));
      const tables = [...src.matchAll(/<table[\s>]/g)].length;
      if (tables === 0) continue;
      const scrollers = [...src.matchAll(/<TableScroller[\s>]/g)].length;
      if (scrollers < tables) {
        offenders.push(`${rel(file)}: ${tables} tables but only ${scrollers} scroll regions`);
      }
      // The whole import statement, braces and all, so a name on its own line in a multi-line
      // import counts. A first version read only lines containing the word "import" and reported
      // two files that import it perfectly well.
      if (!/import\s*\{[^}]*\bTableScroller\b[^}]*\}\s*from/s.test(src)) {
        offenders.push(`${rel(file)}: renders a table without importing TableScroller`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// =========================================================================================
// CLASS 2 AND 3 — GRID TRACKS AND MINIMUM WIDTHS THAT CAN BE PUSHED WIDER THAN THEIR SHARE
// =========================================================================================

/**
 * Grid tracks permitted to keep an intrinsic minimum, each with the reason it cannot push a page
 * sideways. Adding an entry is a claim that the track's CONTENT is bounded — not that the
 * overflow is unlikely.
 */
const TRACK_ALLOWLIST: Array<{ rule: string; track: string; reason: string }> = [
  {
    rule: '.numfield',
    track: 'auto',
    reason:
      'a field label and its hint, side by side in an inline-grid with justify-content: start. ' +
      'Both are short fixed strings authored in this area, and the grid is sized to them rather ' +
      'than to a container it could exceed.',
  },
  {
    rule: '.ledger__row',
    track: 'auto',
    reason:
      'a count (at most four digits) and a verification status mark (a glyph and one of five ' +
      'fixed labels). Both bounded; the prose column beside them is minmax(0, 1fr).',
  },
  {
    rule: '.burn__steps',
    track: 'auto',
    reason:
      'the resistance popover’s term/figure pairs. The terms are five fixed strings and the ' +
      'figures are damage values. The popover’s own width is the open question here and it is ' +
      'RAISED rather than settled — see the header of this file.',
  },
];

/** Split a track list at the top level, respecting parentheses. */
function splitTracks(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Does this track declare an explicit minimum that cannot exceed its share? */
function guarded(track: string): boolean {
  const repeat = /^repeat\(\s*[^,]+,\s*(.+)\)$/.exec(track);
  if (repeat) return splitTracks(repeat[1]!).every(guarded);
  const minmax = /^minmax\(\s*(.+?)\s*,\s*(.+)\)$/.exec(track);
  if (!minmax) return false;
  const min = minmax[1]!.trim();
  return /^0(px|rem|%)?$/.test(min) || min.startsWith('min(');
}

describe('responsive-overflow/no track can be pushed wider than its share', () => {
  it('finds grid declarations to check — it cannot pass by finding none', () => {
    const declarations = STYLESHEETS.flatMap((f) => rules(read(f))).filter((r) =>
      /grid-template-columns:/.test(r.body),
    );
    expect(declarations.length).toBeGreaterThanOrEqual(6);
  });

  it('every grid track declares an explicit minimum, or is allow-listed with a reason', () => {
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        const m = /grid-template-columns:\s*([^;]+)/.exec(r.body);
        if (!m) continue;
        for (const track of splitTracks(m[1]!.trim())) {
          if (guarded(track)) continue;
          const permitted = TRACK_ALLOWLIST.some(
            (a) => r.selector.includes(a.rule) && a.track === track,
          );
          if (!permitted) {
            offenders.push(
              `${rel(f)} ${r.selector} { grid-template-columns: … ${track} … } — a bare ` +
                `track has a min-content automatic minimum, so an over-wide child widens the ` +
                `track and the page. Use minmax(0, …) or allow-list it with a reason.`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the track allow-list holds no dead entries', () => {
    const seen = new Set<string>();
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        if (/grid-template-columns:/.test(r.body)) seen.add(r.selector.trim());
      }
    }
    const dead = TRACK_ALLOWLIST.filter((a) => ![...seen].some((s) => s.includes(a.rule)));
    expect(dead.map((d) => d.rule)).toEqual([]);
  });
});

/**
 * Minimum widths permitted to be a raw layout measure, with the arithmetic that says they fit.
 * "It looks fine" is not an entry; a width against a viewport width is.
 */
const MIN_WIDTH_ALLOWLIST: Array<{ rule: string; reason: string }> = [
  {
    rule: '.nav__panel',
    reason:
      'the navigation menu: 256px (--measure-list-column-min) anchored to the right edge of a ' +
      'full-width nav bar, so it grows LEFTWARDS into the page rather than off it. 256px inside ' +
      'the 375px phone this was measured at, and inside 320px, the narrowest phone in service. ' +
      'A min(…, 100%) guard would be WRONG here: 100% would resolve against the positioned ' +
      'ancestor, not the viewport.',
  },
];

describe('responsive-overflow/no minimum width is wider than a phone', () => {
  it('a layout measure is never a hard minimum unless it is allow-listed with the arithmetic', () => {
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        for (const m of r.body.matchAll(/min-(?:inline-size|width):\s*([^;]+)/g)) {
          const value = m[1]!.trim();
          if (!value.includes('var(--measure-')) continue;
          if (value.startsWith('min(')) continue;
          const permitted = MIN_WIDTH_ALLOWLIST.some((a) => r.selector.includes(a.rule));
          if (!permitted) {
            offenders.push(
              `${rel(f)} ${r.selector} { min-width: ${value} } — a layout measure used as a ` +
                `hard floor keeps its width inside a narrower container and pushes the page.`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the minimum-width allow-list holds no dead entries', () => {
    const seen = new Set<string>();
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        if (/min-(?:inline-size|width):[^;]*var\(--measure-/.test(r.body)) seen.add(r.selector.trim());
      }
    }
    const dead = MIN_WIDTH_ALLOWLIST.filter((a) => ![...seen].some((s) => s.includes(a.rule)));
    expect(dead.map((d) => d.rule)).toEqual([]);
  });
});

// =========================================================================================
// CLASS 4 — NO BREAKPOINT THIS PRODUCT'S DESIGN FILE DOES NOT STATE
// =========================================================================================

describe('responsive-overflow/no locally invented breakpoint', () => {
  // DESIGN.md contains exactly one viewport width: §7a's "roughly a 1280px viewport", written
  // as 80rem. Everything else responsive in this product is intrinsic — `overflow-x: auto`,
  // `minmax(0, 1fr)`, `min(measure, 100%)`, `repeat(auto-fit, …)` — and needs no threshold at
  // all. That is not a coincidence and it is not thrift: a breakpoint is a design value, and
  // DESIGN.md's preamble says to raise one rather than invent it. This is that rule, mechanised.
  const PERMITTED = ['80rem'];

  it('every media-query width in a stylesheet is a width DESIGN.md states', () => {
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const m of stripCss(read(f)).matchAll(/@media[^{]*?\((?:min|max)-width:\s*([^)]+)\)/g)) {
        const width = m[1]!.trim();
        if (!PERMITTED.includes(width)) offenders.push(`${rel(f)}: @media … ${width}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every media-query width in a component is a width DESIGN.md states', () => {
    // The navigation asks `matchMedia('(min-width: 80rem)')` in TypeScript, which no stylesheet
    // sweep would ever see. A breakpoint invented in a component is the same invented value.
    const offenders: string[] = [];
    for (const f of COMPONENTS) {
      for (const m of stripJs(read(f)).matchAll(/\((?:min|max)-width:\s*([^)]+)\)/g)) {
        const width = m[1]!.trim();
        if (!PERMITTED.includes(width)) offenders.push(`${rel(f)}: (…-width: ${width})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('finds the one breakpoint that does exist — the sweep is not looking at nothing', () => {
    const all = [...STYLESHEETS, ...COMPONENTS].flatMap((f) => [
      ...read(f).matchAll(/\((?:min|max)-width:\s*([^)]+)\)/g),
    ]);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
