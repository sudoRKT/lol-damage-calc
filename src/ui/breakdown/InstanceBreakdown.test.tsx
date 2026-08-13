// @vitest-environment jsdom
//
// The per-instance breakdown, against the ONE canonical mock Result.
//
// Queried through the accessibility tree throughout. A row is checked by its accessible NAME —
// which is the sentence a screen reader reads out — so a cell that shows "240 P" and announces
// nothing fails here, and a cell that announces "240 physical damage" passes for the right
// reason.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MOCK_RESULT } from '../../types';
import type { Result } from '../../types';
import { InstanceBreakdown, formatState, humanizeKey, splitSourceLabel } from './InstanceBreakdown';

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
    expect(screen.getByRole('row', { name: /Conqueror stacks 4/ })).toBeTruthy();
    expect(humanizeKey('blackCleaverStacks')).toBe('Black cleaver stacks');
    expect(formatState({ bonePlating: true, conquerorStacks: 2 })).toEqual([
      'Bone plating on',
      'Conqueror stacks 2',
    ]);
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
  it('lists every excluded mechanic', () => {
    mount();
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
