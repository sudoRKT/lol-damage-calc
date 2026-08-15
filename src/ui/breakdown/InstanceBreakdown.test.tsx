// @vitest-environment jsdom
//
// The per-instance breakdown, against the ONE canonical mock Result.
//
// Queried through the accessibility tree throughout. A row is checked by its accessible NAME —
// which is the sentence a screen reader reads out — so a cell that shows "240 P" and announces
// nothing fails here, and a cell that announces "240 physical damage" passes for the right
// reason.

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MOCK_RESULT } from '../../types';
import type { Result } from '../../types';
import {
  InstanceBreakdown,
  changedState,
  formatState,
  fullStateName,
  humanizeKey,
  splitSourceLabel,
} from './InstanceBreakdown';

afterEach(cleanup);

const mount = (result: Result = MOCK_RESULT) => render(<InstanceBreakdown result={result} />);

describe('breakdown/every instance, in order', () => {
  it('has one row per instance and none is dropped', () => {
    mount();
    const table = screen.getAllByRole('table')[0]!;
    // Header row plus one per instance.
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(
      MOCK_RESULT.perInstance.length + 1,
    );
    expect(table.textContent).toContain('Q — The Darkin Blade (1st cast)');
  });

  it('every damage figure announces its type IN FULL, never a bare letter', () => {
    mount();
    expect(screen.getByRole('row', { name: /240 physical damage/ })).toBeTruthy();
    expect(screen.getByRole('row', { name: /200 magic damage/ })).toBeTruthy();
  });

  it('shows the state that applied at that point in the sequence (§11)', () => {
    mount();
    // The mock's Conqueror stacks are 4 at instance 1 and 6 at instance 2. Instance 2's row
    // carries the CHANGE; instance 1's value is the baseline and is printed above the table.
    expect(screen.getByRole('row', { name: /Conqueror stacks 6/ })).toBeTruthy();
    const entry = screen.getByRole('region', { name: 'The state the combo begins in' });
    expect(entry.textContent).toContain('Conqueror stacks 4');
    expect(humanizeKey('blackCleaverStacks')).toBe('Black cleaver stacks');
    expect(formatState({ bonePlating: true, conquerorStacks: 2 })).toEqual([
      'Bone plating on',
      'Conqueror stacks 2',
    ]);
  });

  // =======================================================================================
  // THE STATE COLUMN SHOWS WHAT CHANGED, AND NOTHING IS HIDDEN. Added 2026-08-14.
  //
  // The column used to print the whole snapshot on every row — twelve phrases on the default
  // scenario, six of them reading zero on every row, which is printing the ABSENCE of state.
  // §11 requires the state that applied, and a reduction of 0 did not apply.
  //
  // These tests hold the three things that make the filter safe rather than lossy: the
  // baseline is on screen, the full snapshot is one control away, and a row where nothing
  // moved says so instead of rendering an empty cell.
  // =======================================================================================

  it('filters against the baseline by VALUE, and keeps a key that moved back and forth', () => {
    // The pure function, so the rule is pinned independently of any layout.
    expect(changedState({ a: 1, b: 0 }, { a: 1, b: 0 })).toEqual({});
    expect(changedState({ a: 2, b: 0 }, { a: 1, b: 0 })).toEqual({ a: 2 });
    // A key that RETURNED to its starting value is not a change, and must not be reported as
    // one — the column's claim is "different from the entry state", not "was touched".
    expect(changedState({ a: 1 }, { a: 1 })).toEqual({});
    // false and 0 are values, not absences: a toggle switched off IS a change.
    expect(changedState({ shield: false }, { shield: true })).toEqual({ shield: false });
    // A key the baseline never carried is a change, not a silent drop.
    expect(changedState({ fresh: 3 }, {})).toEqual({ fresh: 3 });
  });

  it('prints the entry state once, above the table, rather than on every row', () => {
    mount();
    const entry = screen.getByRole('region', { name: 'The state the combo begins in' });
    for (const phrase of formatState(MOCK_RESULT.perInstance[0]!.stateSnapshot)) {
      expect(entry.textContent).toContain(phrase);
    }
  });

  it('the first row says nothing moved rather than rendering an empty cell', () => {
    // Instance 1 IS the baseline, so it always compares against itself. An empty cell there
    // cannot be told apart from a cell that failed to render.
    mount();
    expect(screen.getByRole('row', { name: /No change from the entry state/ })).toBeTruthy();
  });

  it('every row carries a control that opens its own FULL snapshot, unfiltered', () => {
    mount();
    const toggles = screen.getAllByRole('button', { name: /the full state at instance/ });
    expect(toggles).toHaveLength(MOCK_RESULT.perInstance.length);
    for (const toggle of toggles) expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('opening a row reveals the whole snapshot, including what the filter removed', () => {
    mount();
    const first = screen.getByRole('button', { name: fullStateName(1, false) });
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    // Every phrase of instance 1's snapshot — the ones the inline cell filtered out — is now
    // on screen, in the table, in its own row.
    const opened = document.getElementById('s1-full-state')!;
    for (const phrase of formatState(MOCK_RESULT.perInstance[0]!.stateSnapshot)) {
      expect(within(opened).getByText(new RegExp(escapeForRegExp(phrase)))).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: fullStateName(1, true) }));
    expect(document.getElementById('s1-full-state')).toBeNull();
  });

  it('the expand control is named in words, never by a bare arrow', () => {
    // `../interactive-names.test.tsx` sweeps for this across the area; this pins the sentence.
    expect(fullStateName(3, false)).toBe('Show the full state at instance 3');
    expect(fullStateName(3, true)).toBe('Hide the full state at instance 3');
  });

  it('marks a critical strike in words, not by a colour', () => {
    mount();
    expect(screen.getByRole('row', { name: /critical strike/ })).toBeTruthy();
  });

  it('splits a source label into slot and name rather than taking its first letter', () => {
    expect(splitSourceLabel('Q — The Darkin Blade (1st cast)')).toEqual({
      slot: 'Q',
      name: 'The Darkin Blade (1st cast)',
    });
    expect(splitSourceLabel('Basic attack')).toEqual({ slot: '', name: 'Basic attack' });
  });
});

describe('breakdown/the running total is on every row', () => {
  it('prints the authoritative cumulative figure beside each instance', () => {
    mount();
    for (const [i, running] of MOCK_RESULT.runningTotal.entries()) {
      expect(
        screen.getByRole('row', {
          name: new RegExp(`Running total after instance ${i + 1}: ${running.total} damage`),
        }),
      ).toBeTruthy();
    }
  });

  it('says the running total is cumulative ACROSS damage types, so it needs no tag', () => {
    mount();
    // Every row says it, which is the point: the untagged figure explains itself on each row
    // rather than relying on a column header a screen reader user may never have heard.
    expect(screen.getAllByRole('row', { name: /cumulative across damage types/ })).toHaveLength(
      MOCK_RESULT.perInstance.length,
    );
  });
});

describe('breakdown/an incomplete instance shows no figure at all', () => {
  it('prints no damage number for it — a figure is absent rather than wrong (§8)', () => {
    mount();
    // Found by what the cell ANNOUNCES, then checked for the thing that must not be there:
    // any digit at all. The mock's incomplete instance carries `final: 0`, and printing that 0
    // would claim the ability dealt nothing — a different statement from "we will not show a
    // number we cannot stand behind".
    const cell = screen.getByRole('cell', { name: 'not shown, this ability is excluded' });
    expect(cell.textContent).not.toMatch(/\d/);
  });

  it('names WHY, and says whether the gap will ever close', () => {
    mount();
    expect(
      screen.getByRole('row', {
        name: /Not yet modelled — the damage is stated in description prose/,
      }),
    ).toBeTruthy();
  });

  it('a permanently incomplete ability is NAMED, never silently dropped', () => {
    mount();
    expect(
      screen.getByText(
        /W — Seismic Shard \(mock\), contributes no damage: Cannot be completed — the source states the ability scales with armor/,
      ),
    ).toBeTruthy();
  });

  it('derived is never marked as a shortfall — it reads exactly like verified', () => {
    // Both marks are the same element, the same size, the same colour; the only difference is
    // the glyph and the word. There is no caution mark anywhere in the table.
    mount();
    const panel = screen.getByRole('region', { name: 'Per-instance breakdown' });
    expect(panel.textContent).toContain('Derived');
    expect(panel.textContent).toContain('Verified');
    expect(panel.textContent).not.toMatch(/⚠|caution|warning|unverified|only derived/i);
  });
});

// =========================================================================================
// THE FIGURE COMES BEFORE THE ANNOTATION ABOUT IT. Added 2026-08-15.
//
// WHAT THIS CAN AND CANNOT CHECK. jsdom computes no layout, so nothing here proves anything is
// on screen. What it holds is the ORDER, which is the whole of the fix and the part a later
// edit can undo without any browser noticing. The measurement that motivated it was taken in a
// real browser and is written out on `.breakdown--instances` in breakdown.css: at 375px the
// damage column began 298px into a table with 293px of visible width, so NOT ONE PIXEL of the
// product's primary figure was on screen until the reader scrolled sideways.
//
// The state annotation is the only column that stretches; every other column is nowrap and
// takes exactly the width it needs. Placing the stretchy column between the reader and the
// figures is what pushed them off the edge, and it is the one thing about this table that can
// be changed without a breakpoint (DESIGN.md §4b grants none to this file), without a new
// design value, and without touching what any cell contains.
// =========================================================================================

/** The column order, top to bottom of the reader's priority. Changing this is a design act. */
const COLUMN_ORDER = [
  '#',
  'Source',
  'Damage',
  'Running total',
  'Evidence',
  'Changed since the combo began',
];

describe('breakdown/a reader reaches the figure before the note about it', () => {
  it('orders the columns figure-first, with the stretchy annotation last', () => {
    mount();
    const table = screen.getAllByRole('table')[0]!;
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent!.trim());
    expect(headers).toEqual(COLUMN_ORDER);
  });

  it('puts every body cell in the same order as its header, so the columns line up', () => {
    mount();
    const table = screen.getAllByRole('table')[0]!;
    const body = table.querySelector('tbody')!;
    for (const row of body.querySelectorAll('tr')) {
      const cells = [...row.children];
      // The expanded full-state row spans the table and has one cell; skip it.
      if (cells.length !== COLUMN_ORDER.length) continue;
      expect(cells[0]!.className).toContain('breakdown__index');
      expect(cells[1]!.className).toContain('breakdown__source');
      expect(cells[2]!.className).toContain('breakdown__damage');
      expect(cells[3]!.className).toContain('breakdown__running');
      expect(cells[4]!.className).toContain('breakdown__evidence');
      expect(cells[5]!.className).toContain('breakdown__state');
    }
  });

  it('still pins the row number, which is the first cell and the row header', () => {
    // The order change must not cost the sticky column its anchor: `#` stays cell one and stays
    // the `<th scope="row">` that both the pinning and assistive technology rely on.
    mount();
    const table = screen.getAllByRole('table')[0]!;
    const firstBodyRow = table.querySelector('tbody tr')!;
    const first = firstBodyRow.children[0]! as HTMLElement;
    expect(first.tagName).toBe('TH');
    expect(first.getAttribute('scope')).toBe('row');
  });
});

describe('breakdown/damage over time is a separate line (§3.8, §11)', () => {
  it('is in its own table, labelled as never being in the burst total', () => {
    mount();
    const dot = screen.getByRole('region', { name: 'Damage over time' });
    expect(dot.textContent).toContain('never in the burst total');
    expect(dot.textContent).toContain('Sunfire Aegis (burn)');
  });

  it('its figure carries its damage type and says it is over time', () => {
    mount();
    const dot = screen.getByRole('region', { name: 'Damage over time' });
    expect(
      screen.getByRole('row', {
        name: /160 magic damage over time, never folded into the burst total/,
      }),
    ).toBeTruthy();
    // And it is NOT in the per-instance table.
    const instances = screen.getAllByRole('table')[0]!;
    expect(instances.textContent).not.toContain('Sunfire');
    expect(dot).toBeTruthy();
  });
});

describe('breakdown/what the result excludes is stated visibly (§11)', () => {
  it('states the COUNT on the control, which is what §11 requires (ruled 2026-08-15)', () => {
    // The ruling is explicit that the count is the condition, not a nicety: a collapsed section
    // that hides how much it hides is the thing it rules against. So the count is asserted BEFORE
    // the list, and in the spoken name as well as on screen — a count a screen reader cannot hear
    // is not a count.
    mount();
    const toggle = screen.getByRole('button', {
      name: `Show Mechanics this result excludes, ${MOCK_RESULT.excludedMechanics.length} mechanics`,
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain(String(MOCK_RESULT.excludedMechanics.length));
  });

  it('lists every excluded mechanic, one click away', () => {
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: /^Show Mechanics this result excludes/ }),
    );
    const block = screen.getByRole('region', { name: 'Mechanics this result excludes' });
    for (const mechanic of MOCK_RESULT.excludedMechanics) {
      expect(block.textContent).toContain(mechanic);
    }
  });

  it('shows the patch adjacent to the result, not in a footer (§8)', () => {
    mount();
    expect(screen.getByText('Patch 16.16.1')).toBeTruthy();
  });

  it('shows the burst total with its tagged composition bar', () => {
    mount();
    expect(screen.getByText(/Burst total: 770 total damage — 570 physical, 200 magic/)).toBeTruthy();
  });
});

// =========================================================================================
// THE ROW NUMBER STAYS PUT WHILE THE TABLE SCROLLS SIDEWAYS. Added 2026-08-15.
//
// WHAT THESE CAN AND CANNOT CHECK, STATED PLAINLY. jsdom computes no layout, so NOTHING here
// proves a cell actually pins — that was measured in a real browser at 320x812 and 375x812 and
// the figures are on `.breakdown--instances` in breakdown.css. What these tests hold is the
// part a future edit can silently break without any browser noticing: that the marker class is
// on the right table and only that table, that the sticky rules are scoped to it, that a pinned
// cell is never transparent, and that no width query was smuggled in to do the job.
// =========================================================================================

const BREAKDOWN_CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'breakdown.css'),
  'utf8',
);

/** The stylesheet as `{selector, body}` rules, with comments stripped so their braces cannot lie. */
function cssRules(css: string): { selector: string; body: string }[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutComments)) !== null) {
    out.push({ selector: m[1]!.trim(), body: m[2]!.trim() });
  }
  return out;
}

describe('breakdown/the row number is pinned while the table scrolls', () => {
  it('marks the per-instance table, and ONLY the per-instance table', () => {
    mount();
    const tables = screen.getAllByRole('table');
    const marked = tables.filter((t) => t.classList.contains('breakdown--instances'));
    expect(marked.length).toBe(1);
    // It is the one with the row-number column, not the damage-over-time table beside it.
    expect(within(marked[0]!).getByRole('columnheader', { name: '#' })).toBeTruthy();
    // The DoT table shares the `.breakdown` class and has no `#` column. If it were marked, the
    // sticky rule would pin its first HEADER cell over body cells that keep scrolling.
    const dot = tables.find((t) => t.textContent?.includes('Sunfire Aegis (burn)'));
    expect(dot).toBeTruthy();
    expect(dot!.classList.contains('breakdown--instances')).toBe(false);
  });

  it('keeps the row number a row header, which is what the pinning pins', () => {
    mount();
    // Pinning `#` only makes sense because it IS the row's identity — `<th scope="row">` is what
    // assistive technology already announces with every cell in the row.
    const cell = screen.getAllByRole('rowheader')[0]!;
    expect(cell.tagName).toBe('TH');
    expect(cell.getAttribute('scope')).toBe('row');
    expect(cell.classList.contains('breakdown__index')).toBe(true);
  });

  it('scopes every sticky rule to the marked table', () => {
    const sticky = cssRules(BREAKDOWN_CSS).filter((r) => /position:\s*sticky/.test(r.body));
    expect(sticky.length).toBeGreaterThan(0);
    for (const rule of sticky) {
      for (const selector of rule.selector.split(',')) {
        expect(selector).toContain('.breakdown--instances');
      }
    }
  });

  it('never leaves a pinned cell transparent, or the scrolled columns show through it', () => {
    const rules = cssRules(BREAKDOWN_CSS);
    const sticky = rules.filter((r) => /position:\s*sticky/.test(r.body));
    // Every selector that is made sticky must also be given a background somewhere in the file.
    const backed = new Set<string>();
    for (const rule of rules) {
      if (!/background:/.test(rule.body)) continue;
      for (const selector of rule.selector.split(',')) backed.add(selector.trim());
    }
    for (const rule of sticky) {
      for (const raw of rule.selector.split(',')) {
        const selector = raw.trim();
        expect([...backed].some((b) => b === selector || b.startsWith(selector))).toBe(true);
      }
    }
  });

  it('paints the pinned cell from tokens only, never a raw colour', () => {
    for (const rule of cssRules(BREAKDOWN_CSS)) {
      if (!rule.selector.includes('.breakdown--instances')) continue;
      expect(rule.body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(rule.body).not.toMatch(/\brgba?\(/);
    }
  });

  it('invents no width query — DESIGN.md §4b grants exactly one, and not to this file', () => {
    // §4b: `@media (max-width: 30rem)` governs the burndown's riser labels and nothing else.
    // The whole point of pinning over a stacked-card layout is that it needs no breakpoint.
    expect(BREAKDOWN_CSS).not.toMatch(/@media[^{]*width/);
  });
});

// =========================================================================================
// THE DAMAGE-TYPE TAG IS NOT CLIPPED AT THE NARROWEST PHONE. Added 2026-08-15.
//
// WHAT THIS CAN AND CANNOT CHECK, STATED PLAINLY. jsdom computes no layout, so nothing here
// proves a tag is on screen. That was measured in a real browser at 320x812 and is written out
// on `.breakdown__source-label` in breakdown.css: with the source label held at `nowrap` the
// Damage column ran 186–262 against 238px of visible width, so the FIGURE landed on screen and
// its TAG did not — row 4 printed "217" beside the single letter "m", and row 3 printed "phy".
//
// That is the colour-alone failure CLAUDE.md calls non-negotiable, reached without anybody
// removing a tag: the cue was rendered and then clipped by the scroll container. It is invisible
// to an overflow sweep, because the table scrolls exactly as it is supposed to.
//
// What these tests hold is the part a later edit can undo without any browser noticing: that the
// per-instance source label is still allowed to wrap, and that the rule stays off the
// damage-over-time table, which has three columns and has never been measured.
// =========================================================================================

describe('breakdown/the damage-type tag survives the narrowest phone', () => {
  /** Every rule in the file that sets `white-space` on the source label. */
  const sourceLabelRules = () =>
    cssRules(BREAKDOWN_CSS).filter(
      (r) => r.selector.includes('.breakdown__source-label') && /white-space:/.test(r.body),
    );

  it('lets the per-instance source label wrap, so Damage starts 66px earlier', () => {
    // 320px, measured: Source 34–186 → 34–120, Damage 186–262 → 120–196, so the figure AND its
    // tag finish at 184 inside 238px of visible width. Nothing here can see those pixels; what it
    // can see is that the declaration they depend on is still present.
    const wrapping = sourceLabelRules().filter(
      (r) => r.selector.includes('.breakdown--instances') && /white-space:\s*normal/.test(r.body),
    );
    expect(wrapping.length).toBe(1);
  });

  it('wins the cascade over the base rule, which is a single class', () => {
    // `.breakdown--instances .breakdown__source-label` is two classes and beats the one-class base
    // rule wherever it sits in the file. If somebody ever flattens the scoped selector to one
    // class, source order starts deciding it and this stops being reliable — so it is asserted.
    const base = sourceLabelRules().filter((r) => !r.selector.includes('.breakdown--instances'));
    expect(base.length).toBe(1);
    expect(base[0]!.selector.split(/\s+/).length).toBe(1);
  });

  it('leaves the damage-over-time table alone, because nobody has measured it', () => {
    // The DoT table shares `.breakdown__source-label` and has three columns rather than six. A
    // rule is not extended to a table nobody has put a ruler against.
    for (const rule of sourceLabelRules()) {
      if (!/white-space:\s*normal/.test(rule.body)) continue;
      for (const selector of rule.selector.split(',')) {
        expect(selector).toContain('.breakdown--instances');
      }
    }
  });

  it('keeps the four figure columns at exactly the width they need', () => {
    // Source is now the one column that flexes. The figure columns must NOT start wrapping too —
    // a damage figure split across two lines from its tag is the same defect by another route.
    const fixed = cssRules(BREAKDOWN_CSS).filter((r) => /inline-size:\s*0/.test(r.body));
    const selectors = fixed.flatMap((r) => r.selector.split(',').map((s) => s.trim()));
    for (const column of [
      '.breakdown__index',
      '.breakdown__damage',
      '.breakdown__running',
      '.breakdown__evidence',
    ]) {
      expect(selectors).toContain(column);
    }
    for (const rule of fixed) expect(rule.body).toMatch(/white-space:\s*nowrap/);
    // And Source is deliberately NOT one of them — it is the column that gives way.
    expect(selectors).not.toContain('.breakdown__source');
  });
});

/** Escape a state phrase for use inside a RegExp — values carry dots. */
function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
