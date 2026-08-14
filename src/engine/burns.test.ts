// THE BURN FAMILY AS DAMAGE OVER TIME (added 2026-08-14).
//
// 9 of the 43 stored item effects recur. SPECIFICATION §3.8 fixes what happens to them: never
// folded into burst, reported as their own line across the full duration, and the survival
// verdict given twice. Until this work nothing produced a DoT at all, so the second verdict had
// been identical to the first for every real scenario ever computed (DATA-SOURCES §56).
//
// THE TWO RULES THESE TESTS EXIST TO HOLD:
//   1. the full-duration total is the stored tick times the STORED tick count, and nothing else;
//   2. where the source states no count, there is NO total — and the effect is named rather than
//      left absent, because absent reads as "this item does nothing".

import { describe, expect, it } from 'vitest';

import type { CuratedItemEffect, Item } from '../types';

import {
  championConfig,
  fixtureCatalogue,
  fixtureChampion,
  fixtureItem,
  scenario,
} from './fixtures';
import { BURN_TRIGGERS, simulate } from './simulate';

const PROV = {
  source: 'Module:ItemData/data',
  url: 'https://wiki.leagueoflegends.com/en-us/Module:ItemData/data',
  patch: '16.16.1',
  fetched: '2026-08-13',
};

/** Fated Ashes: 2.5 magic a tick, 6 ticks, total 15 — the source states the total in words. */
const FATED = fixtureItem(2508, 'Fated Ashes', {});
/** Bami's Cinder: 15 a tick and NO stated count — it burns while an enemy stays near. */
const BAMIS = fixtureItem(6660, "Bami's Cinder", {});
/** Malignance: a tick and a count, and no stated trigger. */
const MALIGNANCE = fixtureItem(3118, 'Malignance', {});

function burn(over: Partial<CuratedItemEffect> & { itemId: number }): CuratedItemEffect {
  return {
    itemName: 'fixture',
    key: 'pass',
    name: 'Burn',
    kind: 'passive',
    appliesAs: 'periodic',
    verification: 'derived',
    provenance: PROV,
    overTime: { totalInstances: 6, sourceSays: 'every 0.5 seconds over 3 seconds' },
    components: [
      {
        id: 'burn',
        label: 'Inflame',
        damageType: 'magic',
        base: { scaling: 'explicit', perRank: [2.5] },
        ratios: [],
      },
    ],
    ...over,
  };
}

const FATED_EFFECT = burn({ itemId: 2508, itemName: 'Fated Ashes', name: 'Inflame' });
const BAMIS_EFFECT = burn({
  itemId: 6660,
  itemName: "Bami's Cinder",
  name: 'Immolate',
  overTime: { sourceSays: 'Deal 15 magic damage every second to enemies within 325 units' },
  components: [
    {
      id: 'immolate',
      label: 'Immolate',
      damageType: 'magic',
      base: { scaling: 'explicit', perRank: [15] },
      ratios: [],
    },
  ],
});
const MALIGNANCE_EFFECT = burn({
  itemId: 3118,
  itemName: 'Malignance',
  name: 'Hatefog',
  overTime: { totalInstances: 12, sourceSays: '60/4 magic damage every 0.25 seconds' },
});

const ATTACKER = fixtureChampion({ apiname: 'Lux', hpBase: 600, adBase: 55 });
const DEFENDER = fixtureChampion({ apiname: 'Garen', hpBase: 2000 });
const LUX_Q = {
  champion: 'Lux',
  slot: 'Q' as const,
  abilityName: 'Light Binding',
  instanceType: 'damaging-ability' as const,
  damageType: 'magic' as const,
  maxRank: 5,
  components: [
    {
      id: 'q',
      damageType: 'magic' as const,
      base: { scaling: 'explicit' as const, perRank: [80, 120, 160, 200, 240] },
      ratios: [],
    },
  ],
  verification: 'derived' as const,
  provenance: PROV,
};

function run(opts: {
  items?: number[];
  effects?: CuratedItemEffect[];
  itemPool?: Item[];
  combo?: Array<{ id: string; kind: string; ref: string }>;
}) {
  const cat = fixtureCatalogue({
    champions: [ATTACKER, DEFENDER],
    items: opts.itemPool ?? [FATED, BAMIS, MALIGNANCE],
    abilities: [LUX_Q],
    itemEffects: opts.effects ?? [FATED_EFFECT],
  });
  return simulate(
    scenario({
      attacker: championConfig({ apiname: 'Lux', level: 11, items: opts.items ?? [2508] }),
      defender: championConfig({ apiname: 'Garen', level: 11 }),
      combo: (opts.combo ?? [{ id: 'q', kind: 'ability', ref: 'Q' }]) as never,
    }),
    cat,
  );
}

describe('a burn with a stated tick count carries a full-duration total', () => {
  it('produces a DoT source, and the burst total does NOT contain it', () => {
    const out = run({});
    if (!out.ok) throw new Error('refused');
    expect(out.result.dot.sources).toHaveLength(1);
    expect(out.result.dot.total).toBeGreaterThan(0);
    // §3.8: never folded in. The burst is the ability alone.
    const abilityOnly = out.result.perInstance.reduce((n, i) => n + i.final, 0);
    expect(out.result.burst.total).toBe(abilityOnly);
    expect(out.result.burst.total).not.toBe(out.result.burst.total + out.result.dot.total);
  });

  it('is the stored tick times the STORED count, and nothing else', () => {
    // Fated Ashes: 2.5 a tick over 6 ticks. Against a defender with magic resistance the applied
    // figure is smaller than 15 — so the check is that six ticks is six times one tick, which is
    // the rule, rather than a game number this test has no business asserting.
    // An INTEGER tick, so the comparison is about the multiplication and not about the one
    // rounding point. With 2.5 a tick, one tick displays as 3 and six as 15, and 3 x 6 is 18 —
    // the engine is right and a naive comparison would be wrong.
    const tick = (n: number): CuratedItemEffect => ({
      ...FATED_EFFECT,
      overTime: { totalInstances: n, sourceSays: 'fixture' },
      components: [
        {
          id: 'burn',
          label: 'Inflame',
          damageType: 'magic',
          base: { scaling: 'explicit', perRank: [10] },
          ratios: [],
        },
      ],
    });
    const six = run({ effects: [tick(6)] });
    const one = run({ effects: [tick(1)] });
    if (!six.ok || !one.ok) throw new Error('refused');
    expect(one.result.dot.total).toBe(10);
    expect(six.result.dot.total).toBe(60);
  });

  it('reports it as magic, the type the effect states', () => {
    const out = run({});
    if (!out.ok) throw new Error('refused');
    expect(out.result.dot.sources[0]!.damageType).toBe('magic');
    expect(out.result.dot.byType.magic).toBeGreaterThan(0);
    expect(out.result.dot.byType.physical).toBe(0);
  });

  it('does not fire when no ability dealt damage — the source says ability damage applies it', () => {
    const out = run({ combo: [{ id: 'a', kind: 'basic-attack', ref: 'basic' }] });
    if (!out.ok) throw new Error('refused');
    expect(out.result.dot.total).toBe(0);
    expect(out.result.dot.sources[0]!.verification).toBe('incomplete');
    expect(out.result.dot.sources[0]!.incompleteReason!.note).toMatch(/no ability in this combo/);
  });

  it('does not fire at all when the item is not in the build', () => {
    const out = run({ items: [] });
    if (!out.ok) throw new Error('refused');
    expect(out.result.dot.sources).toHaveLength(0);
    expect(out.result.dot.total).toBe(0);
  });
});

describe('a burn with NO stated tick count is named, never given a figure', () => {
  it('appears as an incomplete DoT source rather than being absent', () => {
    // Absent reads as "this item does nothing", which is false.
    const out = run({ items: [6660], effects: [BAMIS_EFFECT] });
    if (!out.ok) throw new Error('refused');
    expect(out.result.dot.sources).toHaveLength(1);
    expect(out.result.dot.sources[0]!.label).toMatch(/Bami’s Cinder|Bami's Cinder/);
    expect(out.result.dot.sources[0]!.verification).toBe('incomplete');
    expect(out.result.dot.total).toBe(0);
  });

  it('says the source states no number of ticks, and that time cannot supply one', () => {
    const out = run({ items: [6660], effects: [BAMIS_EFFECT] });
    if (!out.ok) throw new Error('refused');
    const note = out.result.dot.sources[0]!.incompleteReason!.note!;
    expect(note).toMatch(/states no number of ticks/);
    expect(note).toMatch(/sequence rather than elapsed time/);
  });

  it('NEVER derives a count from the duration in the sentence', () => {
    // The stored sentence says "every second" and names no end. A count invented from a duration
    // is the single thing this must not do.
    const out = run({ items: [6660], effects: [BAMIS_EFFECT] });
    if (!out.ok) throw new Error('refused');
    expect(out.result.dot.total).toBe(0);
    expect(out.result.dot.byType.magic).toBe(0);
  });
});

describe('a burn whose trigger the source never states is named, not fired', () => {
  it('reports it as incomplete even though it has both a tick and a count', () => {
    const out = run({ items: [3118], effects: [MALIGNANCE_EFFECT] });
    if (!out.ok) throw new Error('refused');
    expect(out.result.dot.sources[0]!.verification).toBe('incomplete');
    expect(out.result.dot.total).toBe(0);
    expect(out.result.dot.sources[0]!.incompleteReason!.note).toMatch(/does not say what sets it off/);
  });

  it('refuses an item outside the read population rather than guessing its trigger', () => {
    // Adding a member means reading its sentence, not widening a pattern (CLAUDE.md).
    const stranger = burn({ itemId: 9999, itemName: 'An Item Nobody Read', name: 'Burn' });
    const out = run({
      items: [9999],
      itemPool: [fixtureItem(9999, 'An Item Nobody Read', {})],
      effects: [stranger],
    });
    if (!out.ok) throw new Error('refused');
    expect(out.result.dot.total).toBe(0);
    expect(out.result.dot.sources[0]!.verification).toBe('incomplete');
  });
});

describe('the read population is exactly what was read', () => {
  it('names five items, and every one of them is a real periodic effect', () => {
    // A count with its definition: the 5 entries a person read sentence by sentence on
    // 2026-08-14, out of the 9 stored effects whose appliesAs is 'periodic'.
    expect(BURN_TRIGGERS.size).toBe(5);
    expect([...BURN_TRIGGERS.keys()].sort((a, b) => a - b)).toEqual([2503, 2508, 3050, 3118, 6653]);
  });

  it('states a trigger for three and records the other two as not stated', () => {
    const values = [...BURN_TRIGGERS.values()];
    expect(values.filter((v) => v === 'ability-damage')).toHaveLength(3);
    expect(values.filter((v) => v === 'not-stated')).toHaveLength(2);
  });
});

describe('the second survival verdict finally means something', () => {
  it('differs from the first when the burn is what kills', () => {
    // A defender left alive by the burst and killed by the burn is the whole reason §3.8 asks
    // for the verdict twice.
    const frail = fixtureChampion({ apiname: 'Garen', hpBase: 100 });
    const cat = fixtureCatalogue({
      champions: [ATTACKER, frail],
      items: [FATED],
      abilities: [LUX_Q],
      itemEffects: [
        {
          ...FATED_EFFECT,
          components: [
            {
              id: 'burn',
              label: 'Inflame',
              damageType: 'true',
              base: { scaling: 'explicit', perRank: [40] },
              ratios: [],
            },
          ],
        },
      ],
    });
    const out = simulate(
      scenario({
        attacker: championConfig({ apiname: 'Lux', level: 1, items: [2508] }),
        defender: championConfig({ apiname: 'Garen', level: 1 }),
        combo: [{ id: 'q', kind: 'ability', ref: 'Q' }],
      }),
      cat,
    );
    if (!out.ok) throw new Error('refused');
    expect(out.result.verdict.burstOnly.lethal).toBe(false);
    expect(out.result.verdict.burstPlusDot.lethal).toBe(true);
    // And the two are genuinely different objects, not the same sentence printed twice.
    expect(out.result.verdict.burstOnly.remainingHp).toBeGreaterThan(0);
    expect(out.result.verdict.burstPlusDot.remainingHp).toBe(0);
  });
});
