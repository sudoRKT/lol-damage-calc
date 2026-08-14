// RIDERS — item effects that reach the target on another instance (added 2026-08-14).
//
// 21 of the 43 stored item effects are riders: 15 on-hit and 6 spellblade. They are not steps the
// user places; they fire because a basic attack landed.
//
// THE DECISION THESE TESTS PIN is that each rider is its OWN instance rather than folded into the
// attack that carried it (DATA-SOURCES §53.3). Two of the tests below are the reason: a magic
// rider on a physical attack must keep its own resistance working, and a rider must not be
// multiplied by the carrier's critical strike.

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
  source: 'Module:ItemData/data',
  url: 'https://wiki.leagueoflegends.com/en-us/Module:ItemData/data',
  patch: '16.16.1',
  fetched: '2026-08-13',
};

/** Nashor's Tooth: 15 magic damage on hit. A MAGIC rider on a PHYSICAL attack. */
const NASHORS: Item = fixtureItem(3115, "Nashor's Tooth", {});
const SHEEN: Item = fixtureItem(3057, 'Sheen', {});
const BORK: Item = fixtureItem(3153, 'Blade of The Ruined King', {});

function effect(over: Partial<CuratedItemEffect> & { itemId: number }): CuratedItemEffect {
  return {
    itemName: 'fixture',
    key: 'pass',
    name: 'Rider',
    kind: 'passive',
    appliesAs: 'on-hit',
    verification: 'derived',
    provenance: PROV,
    components: [
      {
        id: 'rider',
        label: 'Rider',
        damageType: 'magic',
        base: { scaling: 'explicit', perRank: [15] },
        ratios: [],
      },
    ],
    ...over,
  };
}

const onHit = effect({ itemId: 3115, itemName: "Nashor's Tooth", name: 'Icathian Bite' });
const spellblade = effect({
  itemId: 3057,
  itemName: 'Sheen',
  name: 'Spellblade',
  appliesAs: 'spellblade',
  components: [
    {
      id: 'sheen',
      label: 'Spellblade',
      damageType: 'physical',
      base: { scaling: 'explicit', perRank: [20] },
      ratios: [],
    },
  ],
});

const ATTACKER = fixtureChampion({ apiname: 'Lux', hpBase: 600, adBase: 55 });
const DEFENDER = fixtureChampion({ apiname: 'Garen', hpBase: 2000 });

function run(opts: {
  items?: number[];
  effects?: CuratedItemEffect[];
  combo?: Array<{ id: string; kind: string; ref: string; options?: Record<string, unknown> }>;
  attacker?: ReturnType<typeof fixtureChampion>;
}) {
  const cat = fixtureCatalogue({
    champions: [opts.attacker ?? ATTACKER, DEFENDER],
    items: [NASHORS, SHEEN, BORK],
    itemEffects: opts.effects ?? [onHit],
  });
  return simulate(
    scenario({
      attacker: championConfig({ apiname: 'Lux', level: 11, items: opts.items ?? [3115] }),
      defender: championConfig({ apiname: 'Garen', level: 11 }),
      combo: (opts.combo ?? [{ id: 'a', kind: 'basic-attack', ref: 'basic' }]) as never,
    }),
    cat,
  );
}

describe('an on-hit effect rides on the basic attack that triggered it', () => {
  it('adds a row of its own, after the attack', () => {
    const out = run({});
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance).toHaveLength(2);
    expect(out.result.perInstance[0]!.sourceLabel).toBe('Basic attack');
    expect(out.result.perInstance[1]!.sourceLabel).toBe("Nashor's Tooth — Icathian Bite");
  });

  it('KEEPS ITS OWN RESISTANCE WORKING, which folding would have destroyed', () => {
    // The rider is magic and the attack is physical. Folded together the instance would be
    // 'mixed', and a mixed instance is given NO resistanceSteps at all — so the reader would lose
    // the four-step working on the most common instance in the game.
    const out = run({});
    if (!out.ok) throw new Error('refused');
    const [attack, rider] = out.result.perInstance;
    expect(attack!.damageType).toBe('physical');
    expect(rider!.damageType).toBe('magic');
    expect(attack!.resistanceSteps).toBeDefined();
    expect(rider!.resistanceSteps).toBeDefined();
  });

  it('IS NOT MULTIPLIED BY THE CARRIER’S CRIT, which folding would have got wrong silently', () => {
    const plain = run({});
    const crit = run({
      combo: [{ id: 'a', kind: 'basic-attack', ref: 'basic', options: { forceCrit: true } }],
    });
    if (!plain.ok || !crit.ok) throw new Error('refused');
    // The attack itself does crit...
    expect(crit.result.perInstance[0]!.crit).toBe(true);
    expect(crit.result.perInstance[0]!.final).toBeGreaterThan(plain.result.perInstance[0]!.final);
    // ...and the rider is untouched by it.
    expect(crit.result.perInstance[1]!.crit).toBe(false);
    expect(crit.result.perInstance[1]!.final).toBe(plain.result.perInstance[1]!.final);
    expect(plain.result.perInstance[1]!.final).toBeGreaterThan(0);
  });

  it('fires once per basic attack, and not on an ability', () => {
    const out = run({
      combo: [
        { id: 'q', kind: 'ability', ref: 'Q' },
        { id: 'a1', kind: 'basic-attack', ref: 'basic' },
        { id: 'a2', kind: 'basic-attack', ref: 'basic' },
      ],
    });
    if (!out.ok) throw new Error('refused');
    const riders = out.result.perInstance.filter((i) => i.sourceLabel.includes('Icathian'));
    expect(riders).toHaveLength(2);
  });

  it('does not fire at all when the item is not in the build', () => {
    const out = run({ items: [] });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance).toHaveLength(1);
  });

  it('does not ride on an attack the engine could not model', () => {
    // An instance the engine refused is not a hit that landed.
    const out = run({
      combo: [{ id: 'x', kind: 'empowered-attack', ref: 'Q' }],
    });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance).toHaveLength(1);
    expect(out.result.perInstance[0]!.verification).toBe('incomplete');
  });
});

describe('Spellblade fires on the first basic attack AFTER an ability', () => {
  const sb = { items: [3057], effects: [spellblade] };

  it('does not fire on an attack with no ability before it', () => {
    const out = run({ ...sb, combo: [{ id: 'a', kind: 'basic-attack', ref: 'basic' }] });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance).toHaveLength(1);
  });

  it('fires on the attack that follows an ability', () => {
    const out = run({
      ...sb,
      combo: [
        { id: 'q', kind: 'ability', ref: 'Q' },
        { id: 'a', kind: 'basic-attack', ref: 'basic' },
      ],
    });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance.map((i) => i.sourceLabel)).toContain('Sheen — Spellblade');
  });

  it('is CONSUMED by that attack — a second attack does not fire it again', () => {
    const out = run({
      ...sb,
      combo: [
        { id: 'q', kind: 'ability', ref: 'Q' },
        { id: 'a1', kind: 'basic-attack', ref: 'basic' },
        { id: 'a2', kind: 'basic-attack', ref: 'basic' },
      ],
    });
    if (!out.ok) throw new Error('refused');
    const fired = out.result.perInstance.filter((i) => i.sourceLabel === 'Sheen — Spellblade');
    expect(fired).toHaveLength(1);
  });

  it('fires again once another ability is cast', () => {
    const out = run({
      ...sb,
      combo: [
        { id: 'q', kind: 'ability', ref: 'Q' },
        { id: 'a1', kind: 'basic-attack', ref: 'basic' },
        { id: 'w', kind: 'ability', ref: 'W' },
        { id: 'a2', kind: 'basic-attack', ref: 'basic' },
      ],
    });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance.filter((i) => i.sourceLabel === 'Sheen — Spellblade')).toHaveLength(2);
  });
});

describe('a range-split rider reads the holder’s range type', () => {
  // Blade of the Ruined King states two numbers and says which champion gets which. `valueAt`
  // refuses it without a range type rather than picking an arm, so this is the check that the
  // attacker's own range type actually reaches the component evaluator.
  const bork = effect({
    itemId: 3153,
    itemName: 'Blade of The Ruined King',
    name: "Mist's Edge",
    components: [
      {
        id: 'bork',
        label: "Mist's Edge",
        damageType: 'physical',
        base: { scaling: 'explicit', perRank: [0] },
        ratios: [
          {
            stat: 'currentHP',
            owner: 'target',
            scaling: 'byRangeType',
            melee: { scaling: 'explicit', perRank: [9] },
            ranged: { scaling: 'explicit', perRank: [6] },
          },
        ],
      },
    ],
  });

  const melee = fixtureChampion({ apiname: 'Lux', hpBase: 600, adBase: 55 });
  const ranged = {
    ...melee,
    stats: { ...melee.stats, rangetype: 'Ranged' as const },
  };

  it('resolves rather than refusing, and the two arms give different figures', () => {
    const m = run({ items: [3153], effects: [bork], attacker: melee });
    const r = run({ items: [3153], effects: [bork], attacker: ranged });
    if (!m.ok || !r.ok) throw new Error('refused');
    const mr = m.result.perInstance[1]!;
    const rr = r.result.perInstance[1]!;
    expect(mr.verification).toBe('derived');
    expect(mr.final).toBeGreaterThan(0);
    // 9% of the target's current health against 6% — melee must be the larger.
    expect(mr.final).toBeGreaterThan(rr.final);
  });
});

describe('a rider that cannot be modelled is named, not dropped', () => {
  it("reports an incomplete effect as its own incomplete row", () => {
    const out = run({
      effects: [
        effect({
          itemId: 3115,
          itemName: "Nashor's Tooth",
          name: 'Icathian Bite',
          verification: 'incomplete',
          unresolvable: [{ field: 'ratios[0].owner', why: 'no source says whose' }],
        }),
      ],
    });
    if (!out.ok) throw new Error('refused');
    const rider = out.result.perInstance[1]!;
    expect(rider.verification).toBe('incomplete');
    expect(rider.final).toBe(0);
    expect(rider.incompleteReason!.kind).toBe('permanent');
    expect(out.result.incompleteContributors.map((c) => c.sourceLabel)).toContain(
      "Nashor's Tooth — Icathian Bite",
    );
  });

  it('does NOT guess a carrier for an effect whose delivery the source never states', () => {
    const out = run({
      effects: [effect({ itemId: 3115, itemName: "Nashor's Tooth", appliesAs: 'unstated' })],
    });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance).toHaveLength(1);
  });

  it('does not attach a periodic burn to an attack — that is a damage-over-time line', () => {
    const out = run({
      effects: [effect({ itemId: 3115, itemName: "Nashor's Tooth", appliesAs: 'periodic' })],
    });
    if (!out.ok) throw new Error('refused');
    expect(out.result.perInstance).toHaveLength(1);
  });
});
