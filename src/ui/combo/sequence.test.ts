// The combo sequence's edits, as arithmetic on an array — no DOM needed.
//
// Every function here returns a NEW array. The tests assert that too: a builder that mutates
// the sequence in place breaks the URL encoder (§12) and any undo built on top of it, and it
// does so silently, because the screen looks identical either way.

import { describe, expect, it } from 'vitest';
import type { ComboStep } from '../../types';
import { MOCK_SCENARIO } from '../../types';
import {
  appendStep,
  damageTypeClause,
  moveStep,
  nextStepId,
  removeStep,
  sortBySlot,
  stepLabel,
  viewSteps,
  type ShelfAbility,
} from './sequence';

const ability = (
  slot: ShelfAbility['slot'],
  abilityName: string,
  extra: Partial<ShelfAbility> = {},
): ShelfAbility =>
  ({
    champion: 'Lux',
    slot,
    abilityName,
    instanceType: 'damaging-ability',
    damageType: 'magic',
    maxRank: 5,
    components: [],
    verification: 'derived',
    provenance: { source: 'test', url: 'test', patch: '16.16.1', fetched: '2026-08-13' },
    icon: `${abilityName}.png`,
    ...extra,
  }) as ShelfAbility;

const STEPS: ComboStep[] = [
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
  { id: 'e1', kind: 'ability', ref: 'E' },
];

describe('sequence/ids', () => {
  it('a new step never reuses an id that is already in the combo', () => {
    expect(nextStepId(STEPS, 'ability', 'Q')).toBe('q2');
    expect(nextStepId(STEPS, 'basic-attack', 'basic')).toBe('aa2');
  });

  it('an id is never issued while it is still in use, even after a removal', () => {
    // THE PROPERTY THAT MATTERS is uniqueness within the combo at any moment. An id freed by a
    // removal may be reused — that is fine, and this test says so rather than over-claiming.
    // What must never happen is a duplicate, which is what counting steps instead of scanning
    // ids would produce.
    const afterRemove = removeStep(STEPS, 1); // frees `aa1`, leaves q1 and e1 in use
    const withNew = appendStep(afterRemove, 'ability', 'Q');
    expect(withNew.map((s) => s.id)).toEqual(['q1', 'e1', 'q2']);
    expect(new Set(withNew.map((s) => s.id)).size).toBe(withNew.length);

    const reuse = appendStep(removeStep(STEPS, 0), 'ability', 'Q');
    expect(reuse.map((s) => s.id)).toEqual(['aa1', 'e1', 'q1']);
    expect(new Set(reuse.map((s) => s.id)).size).toBe(reuse.length);
  });

  it('ids stay unique across fifty appends of the same ability', () => {
    let steps: ComboStep[] = [];
    for (let i = 0; i < 50; i += 1) steps = appendStep(steps, 'ability', 'Q');
    expect(new Set(steps.map((s) => s.id)).size).toBe(50);
  });
});

describe('sequence/order', () => {
  it('moves a step one place earlier', () => {
    expect(moveStep(STEPS, 2, -1).map((s) => s.id)).toEqual(['q1', 'e1', 'aa1']);
  });

  it('moves a step one place later', () => {
    expect(moveStep(STEPS, 0, 1).map((s) => s.id)).toEqual(['aa1', 'q1', 'e1']);
  });

  it('REFUSES to wrap around at either end', () => {
    // "Move earlier" on the first step is a no-op, never a jump to the back of the combo.
    expect(moveStep(STEPS, 0, -1).map((s) => s.id)).toEqual(['q1', 'aa1', 'e1']);
    expect(moveStep(STEPS, 2, 1).map((s) => s.id)).toEqual(['q1', 'aa1', 'e1']);
  });

  it('removes exactly one step', () => {
    expect(removeStep(STEPS, 1).map((s) => s.id)).toEqual(['q1', 'e1']);
  });

  it('never mutates the sequence it was given', () => {
    const before = STEPS.map((s) => s.id);
    moveStep(STEPS, 0, 1);
    removeStep(STEPS, 0);
    appendStep(STEPS, 'ability', 'W');
    expect(STEPS.map((s) => s.id)).toEqual(before);
  });

  it('orders the shelf the way the game prints it: P Q W E R', () => {
    const shuffled = [
      ability('R', 'Final Spark'),
      ability('P', 'Illumination'),
      ability('E', 'Lucent Singularity'),
      ability('Q', 'Light Binding'),
      ability('W', 'Prismatic Barrier'),
    ];
    expect(sortBySlot(shuffled).map((a) => a.slot)).toEqual(['P', 'Q', 'W', 'E', 'R']);
  });
});

describe('sequence/what a step says it is', () => {
  const abilities = [ability('Q', 'Light Binding'), ability('W', 'Prismatic Barrier')];

  it('an ability step is named by its slot and its ability', () => {
    expect(stepLabel({ id: 'q1', kind: 'ability', ref: 'Q' }, abilities[0]!)).toBe(
      'Q — Light Binding',
    );
  });

  it('every step of the canonical mock combo gets a name and no step is dropped', () => {
    // MOCK_SCENARIO's combo mixes an ability, two basic attacks and an on-hit proc, and the
    // builder is given no ability data at all here — the hardest case, and nothing may vanish.
    const views = viewSteps(MOCK_SCENARIO.combo, []);
    expect(views).toHaveLength(MOCK_SCENARIO.combo.length);
    expect(views.map((v) => v.label)).toEqual([
      'Q — ability not modelled',
      'Basic attack',
      'W — ability not modelled',
      'On-hit effect — mock-true-proc',
      'Basic attack',
    ]);
  });

  it('a step with no art gets a mark rather than an empty square', () => {
    const views = viewSteps(MOCK_SCENARIO.combo, []);
    expect(views[1]!.marker).toBe('AA');
    expect(views[3]!.marker).toBe('—');
  });

  it('positions are 1-based, because they are spoken to a user', () => {
    expect(viewSteps(STEPS, []).map((v) => v.position)).toEqual([1, 2, 3]);
  });
});

describe('sequence/damage-type honesty', () => {
  it('a typed ability says its type in words', () => {
    expect(damageTypeClause(ability('Q', 'Light Binding'))).toBe('magic damage');
  });

  it('an ability the source says deals NO damage says exactly that', () => {
    expect(
      damageTypeClause(
        ability('W', 'Prismatic Barrier', {
          damageType: undefined,
          verification: 'no-damage',
          instanceType: 'non-damaging-ability',
        }),
      ),
    ).toBe('deals no damage');
  });

  it('an ability whose type NO SOURCE STATES is never called "no damage"', () => {
    // The distinction the frozen contract draws (src/types/data.ts): an absent damageType means
    // no source states one, which is not the same claim as "this ability deals none". Collapsing
    // the two would put a confident wrong answer on screen.
    expect(
      damageTypeClause(
        ability('E', 'Something unread', { damageType: undefined, verification: 'incomplete' }),
      ),
    ).toBe('damage type not recorded');
  });
});
