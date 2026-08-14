// ITEM ACTIVES AS COMBO STEPS (added 2026-08-14).
//
// The first thing to read the item-effect lookup. Before this, every `item-active` step returned
// a pending instance whose note said the values "have not been merged into the curated file".
//
// THE FIXTURES CARRY NO GAME NUMBER THAT MATTERS. Tiamat's real active figure is not asserted
// here — these tests pin the WIRING (which instance is produced, what it is called, when it is
// refused and why), and the figures themselves are gate 2's and gate 5's job. Where a number is
// arithmetic on a fixture, it is derived in the test from the fixture's own inputs.

import { describe, expect, it } from 'vitest';

import type { CuratedItemEffect, Item } from '../types';

import {
  championConfig,
  fixtureCatalogue,
  fixtureChampion,
  fixtureItem,
  scenario,
} from './fixtures';
import { simulate } from './simulate';

const PROV = {
  source: 'Module:ItemData/data/Tiamat',
  url: 'https://wiki.leagueoflegends.com/en-us/Module:ItemData/data',
  patch: '16.16.1',
  fetched: '2026-08-13',
};

const TIAMAT: Item = fixtureItem(3077, 'Tiamat', { FlatPhysicalDamageMod: 20 });
const SWORD: Item = fixtureItem(1036, 'Long Sword', { FlatPhysicalDamageMod: 10 });

function active(over: Partial<CuratedItemEffect> = {}): CuratedItemEffect {
  return {
    itemId: 3077,
    itemName: 'Tiamat',
    key: 'act',
    name: 'Crescent',
    kind: 'active',
    appliesAs: 'active',
    components: [
      {
        id: 'crescent',
        label: 'Crescent',
        damageType: 'physical',
        base: { scaling: 'explicit', perRank: [40] },
        ratios: [],
      },
    ],
    verification: 'derived',
    provenance: PROV,
    ...over,
  };
}

// A defender with ZERO resistances, so the instance's final figure is its raw figure and the
// assertions below are about the wiring rather than about the resistance formula.
const ATTACKER = fixtureChampion({ apiname: 'Lux', hpBase: 600, adBase: 55 });
const DEFENDER = fixtureChampion({ apiname: 'Garen', hpBase: 2000 });

/** A scenario whose only step is the item active, with the item in the stated build. */
function run(opts: {
  items?: number[];
  effects?: CuratedItemEffect[];
  ref?: string;
  itemsInCatalogue?: Item[];
}) {
  const cat = fixtureCatalogue({
    champions: [ATTACKER, DEFENDER],
    items: opts.itemsInCatalogue ?? [TIAMAT, SWORD],
    itemEffects: opts.effects ?? [active()],
  });
  return simulate(
    scenario({
      attacker: championConfig({ apiname: 'Lux', level: 11, items: opts.items ?? [3077] }),
      defender: championConfig({ apiname: 'Garen', level: 11 }),
      combo: [{ id: 's1', kind: 'item-active', ref: opts.ref ?? '3077' }],
    }),
    cat,
  );
}

describe('an item active is a step the user places', () => {
  it('produces a damaging instance instead of a pending one', () => {
    const out = run({});
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const inst = out.result.perInstance[0]!;
    expect(inst.verification).toBe('derived');
    expect(inst.incompleteReason).toBeUndefined();
    expect(inst.final).toBeGreaterThan(0);
    expect(inst.raw).toBeGreaterThan(0);
  });

  it('names the item and the active, not the step kind', () => {
    const out = run({});
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance[0]!.sourceLabel).toBe('Tiamat — Crescent');
  });

  it('is classified as an item active, which the interface reads', () => {
    const out = run({});
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance[0]!.instanceType).toBe('item-active');
  });

  it('carries the damage type the effect states, as physical', () => {
    const out = run({});
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance[0]!.damageType).toBe('physical');
    expect(out.result.perInstance[0]!.final).toBeGreaterThan(0);
  });

  it('HAS NO RANK AXIS — the figure is identical at every ability rank', () => {
    // An item active is the same figure whatever rank the abilities beside it are, which is the
    // convention gate 1 checks these entries under. If rank ever leaked in, this catches it.
    const cat = fixtureCatalogue({
      champions: [ATTACKER, DEFENDER],
      items: [TIAMAT],
      itemEffects: [active()],
    });
    const at = (q: number) =>
      simulate(
        scenario({
          attacker: championConfig({
            apiname: 'Lux',
            level: 11,
            items: [3077],
            abilityRanks: { Q: q, W: q, E: q, R: Math.min(q, 3) },
          }),
          defender: championConfig({ apiname: 'Garen', level: 11 }),
          combo: [{ id: 's1', kind: 'item-active', ref: '3077' }],
        }),
        cat,
      );
    const a = at(1);
    const b = at(5);
    if (!a.ok || !b.ok) throw new Error('refused');
    // Non-zero first: two zeroes are equal too, and this test must not be satisfiable by an
    // instance that deals nothing.
    expect(a.result.perInstance[0]!.final).toBeGreaterThan(0);
    expect(a.result.perInstance[0]!.final).toBe(b.result.perInstance[0]!.final);
  });
});

describe('an item active is refused when it cannot be pressed, and says which reason', () => {
  it('REFUSES an item the attacker has not bought, as a fact about the build', () => {
    // The same class as an unlearned ability: returning the damage would hand a build damage it
    // has no access to.
    const out = run({ items: [1036] });
    if (!out.ok) throw new Error('refused');
    const inst = out.result.perInstance[0]!;
    expect(inst.verification).toBe('incomplete');
    expect(inst.final).toBe(0);
    expect(inst.raw).toBe(0);
    expect(inst.incompleteReason!.cause).toBe('unlearned');
    expect(inst.incompleteReason!.note).toMatch(/not in this build/);
    expect(inst.incompleteReason!.note).toMatch(/your build rather than a gap in our data/);
  });

  it('distinguishes "nothing harvested" from "not owned" — a gap, not a build choice', () => {
    const out = run({ effects: [] });
    if (!out.ok) throw new Error('refused');
    const inst = out.result.perInstance[0]!;
    expect(inst.verification).toBe('incomplete');
    expect(inst.incompleteReason!.cause).toBeUndefined();
    expect(inst.incompleteReason!.note).toMatch(/carries no active for Tiamat/);
    // It must NOT claim anything about the harvest, which this layer cannot see.
    expect(inst.incompleteReason!.note).not.toMatch(/harvest/i);
  });

  it('refuses a step whose ref is not an item id at all', () => {
    const out = run({ ref: 'tiamat' });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance[0]!.incompleteReason!.note).toMatch(/not an item id/);
  });

  it('refuses rather than guessing when an item stores two actives', () => {
    const out = run({ effects: [active(), active({ key: 'act2', name: 'Second Crescent' })] });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance[0]!.incompleteReason!.note).toMatch(/stores 2 actives/);
    expect(out.result.perInstance[0]!.incompleteReason!.note).toMatch(/refused rather than guessed/);
  });

  it('carries an incomplete effect through as incomplete, with the source’s own reason', () => {
    const out = run({
      effects: [
        active({
          verification: 'incomplete',
          unresolvable: [{ field: 'ratios[0].owner', why: 'no source says whose maximum health' }],
        }),
      ],
    });
    if (!out.ok) throw new Error('refused');
    const r = out.result.perInstance[0]!.incompleteReason!;
    expect(r.kind).toBe('permanent');
    expect(r.missingFacts![0]!.why).toMatch(/no source says whose/);
  });

  it("reports a non-damaging active as 'no-damage', not as an absence", () => {
    const out = run({ effects: [active({ verification: 'no-damage', components: [] })] });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance[0]!.verification).toBe('no-damage');
    expect(out.result.perInstance[0]!.incompleteReason).toBeUndefined();
  });
});

describe('an item active takes its place in the combo', () => {
  it('adds to the burst total alongside an ability', () => {
    const cat = fixtureCatalogue({
      champions: [ATTACKER, DEFENDER],
      items: [TIAMAT],
      itemEffects: [active()],
    });
    const withActive = simulate(
      scenario({
        attacker: championConfig({ apiname: 'Lux', level: 11, items: [3077] }),
        defender: championConfig({ apiname: 'Garen', level: 11 }),
        combo: [
          { id: 's1', kind: 'basic-attack', ref: 'basic' },
          { id: 's2', kind: 'item-active', ref: '3077' },
        ],
      }),
      cat,
    );
    const without = simulate(
      scenario({
        attacker: championConfig({ apiname: 'Lux', level: 11, items: [3077] }),
        defender: championConfig({ apiname: 'Garen', level: 11 }),
        combo: [{ id: 's1', kind: 'basic-attack', ref: 'basic' }],
      }),
      cat,
    );
    if (!withActive.ok || !without.ok) throw new Error('refused');
    expect(withActive.result.burst.total).toBeGreaterThan(without.result.burst.total);
    // The active's own contribution is the difference — nothing else moved. Compared on the
    // engine's UNROUNDED arithmetic via the running total, because the per-instance column is
    // rounded and must never be presented as something to add up (result.ts).
    expect(withActive.result.burst.total).toBe(
      withActive.result.runningTotal[withActive.result.runningTotal.length - 1]!.total,
    );
  });

  it('does not crit, because no stored active states that it can', () => {
    const cat = fixtureCatalogue({
      champions: [ATTACKER, DEFENDER],
      items: [TIAMAT],
      itemEffects: [active()],
    });
    const plain = simulate(
      scenario({
        attacker: championConfig({ apiname: 'Lux', level: 11, items: [3077] }),
        defender: championConfig({ apiname: 'Garen', level: 11 }),
        combo: [{ id: 's1', kind: 'item-active', ref: '3077' }],
      }),
      cat,
    );
    const forced = simulate(
      scenario({
        attacker: championConfig({ apiname: 'Lux', level: 11, items: [3077] }),
        defender: championConfig({ apiname: 'Garen', level: 11 }),
        combo: [{ id: 's1', kind: 'item-active', ref: '3077', options: { forceCrit: true } }],
      }),
      cat,
    );
    if (!plain.ok || !forced.ok) throw new Error('refused');
    // Non-zero first, for the same reason as the rank test above.
    expect(plain.result.perInstance[0]!.final).toBeGreaterThan(0);
    expect(forced.result.perInstance[0]!.final).toBe(plain.result.perInstance[0]!.final);
    expect(forced.result.perInstance[0]!.crit).toBe(false);
  });
});
