// @vitest-environment jsdom
//
// The combo builder, against Lux's REAL harvested abilities — the only champion the pipeline
// has published an abilities file for. Using the real file means the shelf is tested with a
// genuinely non-damaging ability (Prismatic Barrier, whose damage type is absent and whose
// status is `no-damage`) rather than one invented to make the test pass.
//
// THE RULE THIS FILE EXISTS TO HOLD: SPECIFICATION §10.1 — "The combo builder presents
// abilities as their in-game icons rather than as lettered buttons." So one test asserts every
// shelf control announces a NAME, and that not one of them is a bare Q / W / E / R.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ComboStep } from '../../types';
import { ComboBuilder } from './ComboBuilder';
import type { ShelfAbility } from './sequence';

afterEach(cleanup);

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LUX = JSON.parse(
  readFileSync(join(REPO, 'public/data/abilities/Lux.json'), 'utf8'),
) as { abilities: ShelfAbility[] };
const ABILITIES = LUX.abilities;

const STEPS: ComboStep[] = [
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'r1', kind: 'ability', ref: 'R' },
];

function mount(steps: readonly ComboStep[] = STEPS) {
  const onChange = vi.fn();
  render(
    <ComboBuilder
      abilities={ABILITIES}
      steps={steps}
      onChange={onChange}
      patch="16.16.1"
      championName="Lux"
    />,
  );
  return onChange;
}

describe('combo/the shelf is icons, never lettered buttons', () => {
  it('offers one control per ability, each announcing the ability by NAME', () => {
    mount();
    expect(
      screen.getByRole('button', { name: 'Add Q — Light Binding, magic damage, to the combo' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Add R — Final Spark, magic damage, to the combo' }),
    ).toBeTruthy();
  });

  it('NOT ONE control is a bare slot letter', () => {
    // The mechanical form of §10.1's ban. It sweeps every button in the component, so a future
    // control that regresses to a letter fails here rather than being noticed by eye.
    mount();
    const offenders = screen
      .getAllByRole('button')
      .map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim())
      .filter((name) => /^[PQWER]$/.test(name) || name === '');
    expect(offenders).toEqual([]);
  });

  it('renders each ability as an icon-chip carrying its damage type', () => {
    mount();
    // The chips are `role="img"` with their own accessible names (../art/AbilityChip).
    const chips = screen.getAllByRole('img').map((c) => c.getAttribute('aria-label'));
    expect(chips).toContain('Q — Light Binding, magic damage');
  });

  it('a NON-DAMAGING ability is offered as visibly having no damage type', () => {
    // Lux W really is `no-damage` in the harvested data. §9: neutral rule, em-dash marker, and
    // an accessible name that says so rather than staying silent.
    mount();
    expect(
      screen.getByRole('button', {
        name: 'Add W — Prismatic Barrier, deals no damage, to the combo',
      }),
    ).toBeTruthy();
  });

  it('adds the ability to the END of the sequence when its control is pressed', () => {
    const onChange = mount();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add W — Prismatic Barrier, deals no damage, to the combo' }),
    );
    const next = onChange.mock.calls[0]![0] as ComboStep[];
    expect(next.map((s) => s.ref)).toEqual(['E', 'Q', 'R', 'W']);
  });

  it('offers the basic attack as a plainly named control, not as a lettered chip', () => {
    const onChange = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Basic attack' }));
    const next = onChange.mock.calls[0]![0] as ComboStep[];
    expect(next[next.length - 1]!.kind).toBe('basic-attack');
  });
});

describe('combo/the sequence is ordered, reorderable and removable', () => {
  it('every step announces its own position in the combo', () => {
    mount();
    const list = screen.getByRole('list', { name: 'Sequence' });
    expect(list.textContent).toContain('Step 1 of 3: E — Lucent Singularity');
    expect(list.textContent).toContain('Step 3 of 3: R — Final Spark');
  });

  it('a step can be moved earlier, and the control says which step and where from', () => {
    const onChange = mount();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Move Q — Light Binding earlier, from position 2 of 3',
      }),
    );
    const next = onChange.mock.calls[0]![0] as ComboStep[];
    expect(next.map((s) => s.ref)).toEqual(['Q', 'E', 'R']);
  });

  it('a step can be moved later', () => {
    const onChange = mount();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Move E — Lucent Singularity later, from position 1 of 3',
      }),
    );
    const next = onChange.mock.calls[0]![0] as ComboStep[];
    expect(next.map((s) => s.ref)).toEqual(['Q', 'E', 'R']);
  });

  it('a step can be removed, and the control names the step it removes', () => {
    const onChange = mount();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove R — Final Spark from position 3 of 3' }),
    );
    const next = onChange.mock.calls[0]![0] as ComboStep[];
    expect(next.map((s) => s.ref)).toEqual(['E', 'Q']);
  });

  it('the ends of the sequence cannot be moved past — the controls are disabled, not silent', () => {
    mount();
    const first = screen.getByRole('button', {
      name: 'Move E — Lucent Singularity earlier, from position 1 of 3',
    }) as HTMLButtonElement;
    const last = screen.getByRole('button', {
      name: 'Move R — Final Spark later, from position 3 of 3',
    }) as HTMLButtonElement;
    expect(first.disabled).toBe(true);
    expect(last.disabled).toBe(true);
  });

  it('every edit is ANNOUNCED, so a screen reader user can confirm a reorder happened', () => {
    mount();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Move Q — Light Binding earlier, from position 2 of 3',
      }),
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Q — Light Binding moved to position 1 of 3.',
    );
  });

  it('an empty combo says what to do rather than showing an empty box', () => {
    mount([]);
    expect(screen.getByText(/No steps yet/)).toBeTruthy();
  });

  it('every control in the whole component has a non-empty accessible name', () => {
    mount();
    const unnamed = screen
      .getAllByRole('button')
      .filter((b) => ((b.getAttribute('aria-label') ?? b.textContent) ?? '').trim() === '');
    expect(unnamed).toEqual([]);
  });
});
