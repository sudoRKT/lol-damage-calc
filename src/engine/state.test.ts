// Known-answer tests for the SEQUENCE STATE MODEL (SPECIFICATION §3.1, §3.3).
//
// Every expected number below is arithmetic done by hand and written out in the comment
// above it, or a rule quoted from a named source. Nothing here was obtained by running the
// engine.
//
// Sources read 2026-08-13:
//   https://wiki.leagueoflegends.com/en-us/Armor_penetration
//     "Percentage armor reduction stacks multiplicatively"
//     "Armor penetration and armor reduction are considered in the following order:
//      1. Armor reduction, flat  2. Armor reduction, percentage
//      3. Armor penetration, percentage  4. Armor penetration, flat (Lethality)"

import { describe, it, expect } from 'vitest';
import {
  applyStateEffect,
  applyStateEffects,
  combinedPercentReduction,
  emptyShred,
  foldPersistentAccumulations,
  seedCombatState,
  snapshotCombatState,
  totalFlatReduction,
  type StateEffect,
} from './state';

describe('seedCombatState — combat state is seeded from entry state ONLY (§3.3)', () => {
  it('splits numeric entry state into counters and boolean entry state into flags', () => {
    const state = seedCombatState({
      attackerEntryState: { conquerorStacks: 2, hasKilledRecently: true },
      defenderEntryState: { hemorrhageStacks: 2, bonePlating: true },
      defenderCurrentHp: 1800,
    });

    expect(state.attacker.counters).toEqual({ conquerorStacks: 2 });
    expect(state.attacker.flags).toEqual({ hasKilledRecently: true });
    expect(state.defender.counters).toEqual({ hemorrhageStacks: 2 });
    expect(state.defender.flags).toEqual({ bonePlating: true });
  });

  it('starts with no instances resolved, no shred, and the stated defender health', () => {
    const state = seedCombatState({
      attackerEntryState: {},
      defenderEntryState: {},
      defenderCurrentHp: 1800,
    });

    expect(state.instancesResolved).toBe(0);
    expect(state.defenderCurrentHp).toBe(1800);
    expect(state.cumulativeBurst).toBe(0);
    expect(totalFlatReduction(state.defenderShred.armor)).toBe(0);
    expect(totalFlatReduction(state.defenderShred.magicResist)).toBe(0);
  });

  it('accepts a non-zero starting instance count, for a sequence joined part-way', () => {
    // SPECIFICATION §5: Bone Plating "reduces damage from the first three instances an
    // attacker delivers, resolves against the instance counter directly". A user describing
    // a moment two instances into a fight must be able to say so.
    const state = seedCombatState({
      attackerEntryState: {},
      defenderEntryState: {},
      defenderCurrentHp: 1800,
      instancesAlreadyResolved: 2,
    });
    expect(state.instancesResolved).toBe(2);
  });
});

describe('foldPersistentAccumulations — persistent state cannot be changed mid-sequence (§3.3)', () => {
  it('freezes both sides, so an attempt to mutate a persistent counter throws', () => {
    // §3.3: "Persistent accumulations do not change during a combo." The guarantee is
    // structural — the object is frozen — not a convention nobody checks.
    const persistent = foldPersistentAccumulations({ veigarStacks: 120 }, { feastStacks: 6 });

    expect(persistent.attacker.veigarStacks).toBe(120);
    expect(persistent.defender.feastStacks).toBe(6);

    // ES modules run in strict mode, where writing to a frozen object throws.
    expect(() => {
      (persistent.attacker as Record<string, number>).veigarStacks = 999;
    }).toThrow();
  });

  it('keeps a persistent counter and a combat counter of the SAME NAME independent', () => {
    // The modelling error this guards against is collapsing the two categories into one bag
    // of counters. A champion can legitimately have both: a game-long accumulation and an
    // in-combat one that happen to share a label.
    const persistent = foldPersistentAccumulations({}, { hemorrhageStacks: 5 });
    let combat = seedCombatState({
      attackerEntryState: {},
      defenderEntryState: { hemorrhageStacks: 2 },
      defenderCurrentHp: 1000,
    });

    // Three qualifying instances each add one stack: 2 + 1 + 1 + 1 = 5.
    for (let i = 0; i < 3; i++) {
      combat = applyStateEffect(combat, {
        kind: 'add-counter',
        side: 'defender',
        counter: 'hemorrhageStacks',
        amount: 1,
      });
    }

    expect(combat.defender.counters.hemorrhageStacks).toBe(5);
    // The persistent value of the same name is untouched — it was never in the same object.
    expect(persistent.defender.hemorrhageStacks).toBe(5);
    expect(Object.isFrozen(persistent.defender)).toBe(true);
  });
});

describe('resistance shred — how sources combine', () => {
  it('adds flat reduction from different sources', () => {
    // Flat armor reduction is a subtraction from a stat; two sources of 5 and 12 give 17.
    let shred = emptyShred();
    shred = addFlat(shred, 'blackCleaver', 5);
    shred = addFlat(shred, 'corki', 12);
    expect(totalFlatReduction(shred)).toBe(17);
  });

  it('caps flat reduction PER SOURCE, so a second source is unaffected by the first cap', () => {
    // A cap belongs to the source, not to the target.
    //   source A: 4 per application, cap 24. Seven applications give 4 x 7 = 28, held at 24.
    //   source B: 6 per application, cap 12. Three applications give 6 x 3 = 18, held at 12.
    // Total 24 + 12 = 36.
    //
    // BOTH sources are capped on purpose. With only one capped source and one uncapped one,
    // this assertion is also true of an implementation that shares a single cap across every
    // source — the mutation check found exactly that hole on 2026-08-13.
    let shred = emptyShred();
    for (let i = 0; i < 7; i++) shred = addFlat(shred, 'sourceA', 4, 24);
    expect(shred.flatBySource.sourceA).toBe(24);

    for (let i = 0; i < 3; i++) shred = addFlat(shred, 'sourceB', 6, 12);
    expect(shred.flatBySource.sourceB).toBe(12);

    expect(totalFlatReduction(shred)).toBe(36);

    // And an uncapped third source is not clipped by either of the two caps: + 10 = 46.
    shred = addFlat(shred, 'sourceC', 10);
    expect(totalFlatReduction(shred)).toBe(46);
  });

  it('combines percentage reduction MULTIPLICATIVELY across sources', () => {
    // https://wiki.leagueoflegends.com/en-us/Armor_penetration (read 2026-08-13):
    // "Percentage armor reduction stacks multiplicatively".
    // 30% and 40%: remaining = 0.70 x 0.60 = 0.42, so the combined reduction is 1 - 0.42 = 0.58.
    // Adding them would give 0.70, which is a materially larger claim.
    let shred = emptyShred();
    shred = addPercent(shred, 'a', 0.3);
    shred = addPercent(shred, 'b', 0.4);
    expect(combinedPercentReduction(shred)).toBeCloseTo(0.58, 9);
  });

  it('reports no percentage reduction when nothing has applied any', () => {
    expect(combinedPercentReduction(emptyShred())).toBe(0);
  });
});

describe('applyStateEffect — every effect returns a NEW state', () => {
  it('leaves the previous state object unchanged, so a snapshot cannot be rewritten later', () => {
    // SPECIFICATION §11 requires the per-instance breakdown to show "the state that applied
    // at that point". If effects mutated in place, every stored snapshot would end up showing
    // the state at the END of the combo.
    const before = seedCombatState({
      attackerEntryState: { conquerorStacks: 0 },
      defenderEntryState: {},
      defenderCurrentHp: 1000,
    });
    const after = applyStateEffect(before, {
      kind: 'add-counter',
      side: 'attacker',
      counter: 'conquerorStacks',
      amount: 2,
    });

    expect(before.attacker.counters.conquerorStacks).toBe(0);
    expect(after.attacker.counters.conquerorStacks).toBe(2);
    expect(after).not.toBe(before);
  });

  it('holds a counter at its stated maximum', () => {
    // Conqueror-shaped: two stacks per instance, maximum 12. Seven instances would give 14.
    let state = seedCombatState({
      attackerEntryState: {},
      defenderEntryState: {},
      defenderCurrentHp: 1000,
    });
    const effect: StateEffect = {
      kind: 'add-counter',
      side: 'attacker',
      counter: 'conquerorStacks',
      amount: 2,
      max: 12,
    };
    for (let i = 0; i < 7; i++) state = applyStateEffect(state, effect);
    expect(state.attacker.counters.conquerorStacks).toBe(12);
  });

  it('sets a counter outright and sets a flag', () => {
    let state = seedCombatState({
      attackerEntryState: {},
      defenderEntryState: { bonePlating: true },
      defenderCurrentHp: 1000,
    });
    state = applyStateEffects(state, [
      { kind: 'set-counter', side: 'defender', counter: 'hemorrhageStacks', value: 5 },
      { kind: 'set-flag', side: 'defender', flag: 'bonePlating', value: false },
    ]);
    expect(state.defender.counters.hemorrhageStacks).toBe(5);
    expect(state.defender.flags.bonePlating).toBe(false);
  });

  it('applies a list of effects in the order given', () => {
    // Order matters even inside one instance's effect list: add-then-set and set-then-add
    // give different answers, and the engine must not reorder them.
    const start = seedCombatState({
      attackerEntryState: {},
      defenderEntryState: {},
      defenderCurrentHp: 1000,
    });
    const add: StateEffect = { kind: 'add-counter', side: 'attacker', counter: 'x', amount: 3 };
    const set: StateEffect = { kind: 'set-counter', side: 'attacker', counter: 'x', value: 10 };

    // add then set: 0 + 3 = 3, then overwritten with 10.
    expect(applyStateEffects(start, [add, set]).attacker.counters.x).toBe(10);
    // set then add: 10, then + 3 = 13.
    expect(applyStateEffects(start, [set, add]).attacker.counters.x).toBe(13);
  });
});

describe('snapshotCombatState — what the breakdown shows for one instance (§11)', () => {
  it('names persistent and combat counters separately, so the two are never confused', () => {
    const persistent = foldPersistentAccumulations({ veigarStacks: 120 }, {});
    let combat = seedCombatState({
      attackerEntryState: { conquerorStacks: 2 },
      defenderEntryState: { bonePlating: true },
      defenderCurrentHp: 1800,
    });
    combat = applyStateEffect(combat, {
      kind: 'flat-resistance-reduction',
      resistance: 'armor',
      source: 'blackCleaver',
      amount: 20,
    });

    const snapshot = snapshotCombatState(combat, persistent, 3);

    expect(snapshot.instanceNumber).toBe(3);
    expect(snapshot['attacker.conquerorStacks']).toBe(2);
    expect(snapshot['attacker.persistent.veigarStacks']).toBe(120);
    expect(snapshot['defender.bonePlating']).toBe(true);
    expect(snapshot.defenderArmorFlatReduction).toBe(20);
    expect(snapshot.defenderArmorPercentReduction).toBe(0);
    expect(snapshot.defenderCurrentHp).toBe(1800);
  });
});

// --- small helpers, so the arithmetic above reads as arithmetic -----------------------

function addFlat(
  shred: ReturnType<typeof emptyShred>,
  source: string,
  amount: number,
  cap?: number,
) {
  const state = applyStateEffect(
    { ...blankState(), defenderShred: { armor: shred, magicResist: emptyShred() } },
    { kind: 'flat-resistance-reduction', resistance: 'armor', source, amount, cap },
  );
  return state.defenderShred.armor;
}

function addPercent(
  shred: ReturnType<typeof emptyShred>,
  source: string,
  fraction: number,
  cap?: number,
) {
  const state = applyStateEffect(
    { ...blankState(), defenderShred: { armor: shred, magicResist: emptyShred() } },
    { kind: 'percent-resistance-reduction', resistance: 'armor', source, fraction, cap },
  );
  return state.defenderShred.armor;
}

function blankState() {
  return seedCombatState({
    attackerEntryState: {},
    defenderEntryState: {},
    defenderCurrentHp: 1000,
  });
}
