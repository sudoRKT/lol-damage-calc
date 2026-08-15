// KNOWN-ANSWER TESTS FOR ATTACKER SUSTAIN — life steal, omnivamp and spell vamp
// (SPECIFICATION §3.7; `Result.sustain` in src/types/result.ts).
//
// EVERY expected number below is arithmetic done by hand and written out in the comment above
// the assertion. Nothing here was obtained by running the engine.
//
// THE FORMULAS, AND WHERE THEY COME FROM. All three pages read 2026-08-15.
//
//   life steal   healing = rate x post-mitigation BASIC damage dealt
//                https://wiki.leagueoflegends.com/en-us/Life_steal
//                "Life steal is a stat that grants healing equal to a percentage of the basic
//                 damage dealt. It applies to basic attacks, including those that are modified
//                 (such as Siphoning Strike or Spellblade), and abilities that are considered by
//                 the game engine to act as one (usually those which trigger on-hit effects)."
//                "The healing is based on the post-mitigation damage dealt, meaning after
//                 sources of armor, magic resistance, and damage reduction are taken into
//                 account."
//                Sources "stack additively".
//
//   omnivamp     healing = rate x post-mitigation damage dealt, of ALL THREE TYPES
//                https://wiki.leagueoflegends.com/en-us/Omnivamp
//                "Omnivamp is a stat which grants healing equal to a percentage of the
//                 post-mitigation physical damage, magic damage, and true damage dealt."
//                "Omnivamp is reduced to 33% effectiveness against minions and monsters with
//                 area of effect damage, pet damage, or damage over time." — the defender in
//                 this product is always a CHAMPION, so that reduction never applies here.
//
//   spell vamp   https://wiki.leagueoflegends.com/en-us/Spell_vamp, which REDIRECTS to
//                https://wiki.leagueoflegends.com/en-us/Vamp#Spell_vamp, where the stat appears
//                under "Trivia" in the list of kinds of Vamp that "do not currently have any
//                sources in the game, but are listed here for archival purposes":
//                 "Spell Vamp (last source removed in V26.04)".
//                So spell vamp is REFUSED because no build can carry it, and a rate handed to
//                the runner by hand is named and restores nothing.
//
//                CORRECTION 2026-08-15: this header previously cited "For area of effect and pet
//                damage, it is reduced to 33% effectiveness" as the reason. That sentence is not
//                on the live page — it survives only in a patch-history entry from the stat's
//                introduction — and the same history records V14.1 "Removed: No longer has
//                healing penalties for area and pet damage, at 33% effectiveness". The assertion
//                below that pinned the old reason was changed on the strength of the source, not
//                to make the engine pass.
//
//   on-hit       The life-steal page again, and the reason the on-hit gap is an UNDER-COUNT:
//                "The damage of most item on-hit effects benefits from life steal, denoted by
//                 the icon." Membership is per item — the page lists exceptions that do not
//                apply it — and no stored item record carries that fact, so this engine heals
//                nothing from an on-hit instance and says so.
//
//   resistances  100 / (100 + R)                                        SPECIFICATION §3.6
//   rounding     half away from zero, at the reporting boundary only    rounding.ts
//
// NO DATA FILE IS READ HERE. Every champion, item and percentage below is hand-authored.

import { describe, expect, it } from 'vitest';

import type { CuratedAbility, Item } from '../types';

import { ENGINE_EXCLUSIONS, runCombo, type ComboPlan, type PlannedInstance } from './combo';
import {
  championConfig,
  component,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  fixtureItem,
  flat,
  scenario,
  statBlock,
} from './fixtures';
import { simulate, SIMULATION_EXCLUSIONS } from './simulate';
import {
  LIFESTEAL_INSTANCE_TYPES,
  SPELL_VAMP_REFUSAL,
  vampHealing,
  type AttackerVamp,
} from './vamp';

// --- hand-authored plan helpers; no data file is read anywhere in this suite -------------

/** One instance dealing a single flat, un-scaled damage figure of one type. */
function hit(
  stepId: string,
  amount: number,
  damageType: 'physical' | 'magic' | 'true',
  extra: Partial<PlannedInstance> = {},
): PlannedInstance {
  return {
    stepId,
    sourceLabel: stepId,
    instanceType: 'damaging-ability',
    verification: 'derived',
    damage: {
      components: [component({ id: `${stepId}-c`, damageType, base: flat(amount) })],
      rank: 1,
      maxRank: 5,
    },
    ...extra,
  };
}

function plan(opts: Partial<ComboPlan> & { instances: PlannedInstance[] }): ComboPlan {
  return {
    patch: '26.16',
    scenario: scenario(),
    attacker: statBlock(),
    defender: statBlock(),
    ...opts,
  };
}

// =========================================================================================
// THE ARITHMETIC ON ITS OWN (vamp.ts)
// =========================================================================================

describe('vampHealing — the rate times the post-mitigation damage', () => {
  it('heals 15% of a basic attack, and nothing from an ability, for life steal alone', () => {
    const vamp: AttackerVamp = { lifesteal: 0.15 };
    // 0.15 x 200 = 30
    expect(vampHealing(vamp, 'basic-attack', 200)).toEqual([
      { kind: 'lifesteal', rate: 0.15, amount: 30 },
    ]);
    expect(vampHealing(vamp, 'damaging-ability', 200)).toEqual([]);
  });

  it('counts a MODIFIED basic attack as a basic attack, as the wiki names Siphoning Strike', () => {
    // The wiki's own sentence: life steal "applies to basic attacks, INCLUDING THOSE THAT ARE
    // MODIFIED (such as Siphoning Strike or Spellblade)". `empowered-attack` is this engine's
    // name for exactly that instance.
    expect(LIFESTEAL_INSTANCE_TYPES).toEqual(['basic-attack', 'empowered-attack']);
    // 0.15 x 200 = 30
    expect(vampHealing({ lifesteal: 0.15 }, 'empowered-attack', 200)).toEqual([
      { kind: 'lifesteal', rate: 0.15, amount: 30 },
    ]);
  });

  it('heals omnivamp from every kind of instance, because it heals from all damage dealt', () => {
    const vamp: AttackerVamp = { omnivamp: 0.1 };
    // 0.1 x 200 = 20, whatever carried the damage
    for (const kind of ['basic-attack', 'damaging-ability', 'item-active', 'on-hit'] as const) {
      expect(vampHealing(vamp, kind, 200)).toEqual([{ kind: 'omnivamp', rate: 0.1, amount: 20 }]);
    }
  });

  it('keeps life steal and omnivamp as two figures rather than summing them', () => {
    // Both stack additively (both wiki pages), but they are DIFFERENT STATS from different
    // sources, and `SustainSource.kind` exists so a result can say which restored what.
    // 0.15 x 200 = 30 and 0.10 x 200 = 20.
    expect(vampHealing({ lifesteal: 0.15, omnivamp: 0.1 }, 'basic-attack', 200)).toEqual([
      { kind: 'lifesteal', rate: 0.15, amount: 30 },
      { kind: 'omnivamp', rate: 0.1, amount: 20 },
    ]);
  });

  it('restores nothing from an instance that dealt nothing', () => {
    expect(vampHealing({ lifesteal: 0.15, omnivamp: 0.1 }, 'basic-attack', 0)).toEqual([]);
  });

  it('never resolves spell vamp, and the refusal names the reason', () => {
    expect(vampHealing({ spellVamp: 0.2 }, 'damaging-ability', 200)).toEqual([]);
    // The reason a user reads must be the one the source gives: the stat has no sources in the
    // game, its last one removed in V26.04 (Vamp#Spell vamp, "Trivia", read 2026-08-15).
    expect(SPELL_VAMP_REFUSAL).toMatch(/no sources in the game/i);
    expect(SPELL_VAMP_REFUSAL).toMatch(/V26\.04/);
    // AND IT MUST NOT CLAIM THE OLD REASON. An area-of-effect penalty on spell vamp was removed
    // from the game in V14.1; stating it would be a false claim shown on every affected result.
    expect(SPELL_VAMP_REFUSAL).not.toMatch(/area of effect/i);
    expect(SPELL_VAMP_REFUSAL).not.toMatch(/33%/);
  });
});

// =========================================================================================
// THROUGH THE COMBO RUNNER (SPECIFICATION §3.7, §3.1)
// =========================================================================================

describe('life steal on a basic attack, through the runner', () => {
  // Defender: 100 armor, 2000 health. One basic attack, 300 raw physical.
  //   post-mitigation: 300 x 100/(100+100) = 300 x 0.5 = 150
  //   life steal:      0.15 x 150          = 22.5
  //   reported total:  round(22.5)         = 23   (half away from zero)
  const result = runCombo(
    plan({
      defender: statBlock({ armor: 100, hp: 2000, maxHp: 2000 }),
      attackerVamp: { lifesteal: 0.15 },
      instances: [hit('aa', 300, 'physical', { instanceType: 'basic-attack' })],
    }),
  );

  it('records one life-steal source, on the attacker, at the instance that earned it', () => {
    expect(result.sustain.sources).toHaveLength(1);
    const source = result.sustain.sources[0]!;
    expect(source.kind).toBe('lifesteal');
    expect(source.restoresTo).toBe('attacker');
    expect(source.fromInstance).toBe(1);
    // Unrounded on the source, exactly as the frozen contract says: "rounded once at the totals".
    expect(source.amount).toBeCloseTo(22.5, 9);
  });

  it('totals the attacker sustain at 23 and leaves the defender at zero', () => {
    expect(result.sustain.attackerHealing).toBe(23);
    expect(result.sustain.defenderHealing).toBe(0);
  });

  it('does not let the attacker’s sustain touch either survival verdict', () => {
    // The verdict is about the DEFENDER. 2000 health, 150 damage applied, no healing on that
    // side: 2000 - 150 = 1850 remaining, and healingApplied is the defender's figure alone.
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(result.verdict.burstOnly.remainingHp).toBe(1850);
    expect(result.verdict.burstPlusDot.healingApplied).toBe(0);
    expect(result.verdict.burstPlusDot.remainingHp).toBe(1850);
  });

  it('is the only difference from the same combo with no life steal at all', () => {
    const without = runCombo(
      plan({
        defender: statBlock({ armor: 100, hp: 2000, maxHp: 2000 }),
        instances: [hit('aa', 300, 'physical', { instanceType: 'basic-attack' })],
      }),
    );
    expect(without.sustain.sources).toEqual([]);
    expect(without.sustain.attackerHealing).toBe(0);
    expect(without.verdict.burstOnly).toEqual(result.verdict.burstOnly);
    expect(without.perInstance[0]!.final).toBe(result.perInstance[0]!.final);
  });
});

describe('what each stat heals from, through the runner', () => {
  it('gives life steal nothing for an ability, and omnivamp its full share', () => {
    // No resistances: 400 raw magic resolves at 400.
    //   life steal: an ability is not basic damage -> nothing
    //   omnivamp:   0.1 x 400 = 40
    const result = runCombo(
      plan({
        defender: statBlock({ hp: 2000, maxHp: 2000 }),
        attackerVamp: { lifesteal: 0.15, omnivamp: 0.1 },
        instances: [hit('q', 400, 'magic')],
      }),
    );
    expect(result.sustain.sources.map((s) => s.kind)).toEqual(['omnivamp']);
    expect(result.sustain.sources[0]!.amount).toBeCloseTo(40, 9);
    expect(result.sustain.attackerHealing).toBe(40);
  });

  it('gives an on-hit rider omnivamp but no life steal — a KNOWN under-count, not a rule', () => {
    // An item on-hit effect is its own instance in this engine (`carriedBy` brackets it under the
    // attack). In game most such procs DO heal: "the damage of most item on-hit effects benefits
    // from life steal". They restore nothing HERE because the wiki decides membership item by
    // item and names exceptions, and no stored item record carries that fact — so the engine
    // reports low and says so in SIMULATION_EXCLUSIONS rather than healing every proc.
    //   omnivamp: 0.1 x 100 = 10
    const result = runCombo(
      plan({
        defender: statBlock({ hp: 2000, maxHp: 2000 }),
        attackerVamp: { lifesteal: 0.15, omnivamp: 0.1 },
        instances: [hit('rider', 100, 'magic', { instanceType: 'on-hit', carriedBy: 'aa' })],
      }),
    );
    expect(result.sustain.sources.map((s) => s.kind)).toEqual(['omnivamp']);
    expect(result.sustain.attackerHealing).toBe(10);
  });

  it('heals both stats off one basic attack, as two separate lines', () => {
    // 300 raw physical against 100 armor -> 150 post-mitigation.
    //   life steal: 0.15 x 150 = 22.5
    //   omnivamp:   0.10 x 150 = 15
    //   total:      round(37.5) = 38
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 100, hp: 2000, maxHp: 2000 }),
        attackerVamp: { lifesteal: 0.15, omnivamp: 0.1 },
        instances: [hit('aa', 300, 'physical', { instanceType: 'basic-attack' })],
      }),
    );
    expect(result.sustain.sources.map((s) => s.kind)).toEqual(['lifesteal', 'omnivamp']);
    expect(result.sustain.sources[0]!.amount).toBeCloseTo(22.5, 9);
    expect(result.sustain.sources[1]!.amount).toBeCloseTo(15, 9);
    expect(result.sustain.attackerHealing).toBe(38);
  });

  it('heals from true damage, which no resistance touches', () => {
    // 250 true damage against 100 armor and 100 magic resistance: still 250.
    //   omnivamp: 0.2 x 250 = 50
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 100, magicResist: 100, hp: 2000, maxHp: 2000 }),
        attackerVamp: { omnivamp: 0.2 },
        instances: [hit('r', 250, 'true')],
      }),
    );
    expect(result.sustain.attackerHealing).toBe(50);
  });
});

describe('WHICH damage figure the rate is applied to', () => {
  it('uses the post-mitigation figure, not the rounded per-instance figure', () => {
    // A percentage of a rounded number compounds error, and rounding happens ONCE (rounding.ts).
    // 100 raw physical against 30 armor: 100 x 100/130 = 76.923076...
    //   the displayed instance figure is round(76.923...) = 77
    //   life steal is 0.5 x 76.923076... = 38.4615384..., NOT 0.5 x 77 = 38.5
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 30, hp: 2000, maxHp: 2000 }),
        attackerVamp: { lifesteal: 0.5 },
        instances: [hit('aa', 100, 'physical', { instanceType: 'basic-attack' })],
      }),
    );
    expect(result.perInstance[0]!.final).toBe(77);
    expect(result.sustain.sources[0]!.amount).toBeCloseTo(38.4615384615, 9);
  });

  it('still heals from damage a shield absorbed, because a shield is not mitigation', () => {
    // The wiki's shield article: "The unit's resistances (armor and magic resistance) will still
    // mitigate the damage before being absorbed by shielding" — so a shield sits AFTER mitigation,
    // and the post-mitigation figure life steal reads is the one before the shield ate any of it.
    // 200 raw physical, no armor, 150 general shield:
    //   post-mitigation 200; the shield absorbs 150; 50 reaches health
    //   life steal 0.10 x 200 = 20   (not 0.10 x 50 = 5)
    const result = runCombo(
      plan({
        defender: statBlock({ hp: 2000, maxHp: 2000 }),
        defenderShields: [{ label: 'Fixture shield', kind: 'general', remaining: 150 }],
        attackerVamp: { lifesteal: 0.1 },
        instances: [hit('aa', 200, 'physical', { instanceType: 'basic-attack' })],
      }),
    );
    expect(result.perInstance[0]!.final).toBe(50);
    expect(result.sustain.sources[0]!.amount).toBeCloseTo(20, 9);
  });

  it('heals from the health an execute actually delivered', () => {
    // An execute delivers the target's remaining health, so that — not the ability's own figure —
    // is the damage dealt. Defender on 200 health, threshold 300, instance worth 50 physical:
    //   executed, so 200 is applied
    //   life steal 0.10 x 200 = 20   (not 0.10 x 50 = 5)
    const result = runCombo(
      plan({
        defender: statBlock({ hp: 200, maxHp: 1000 }),
        attackerVamp: { lifesteal: 0.1 },
        instances: [
          hit('aa', 50, 'physical', {
            instanceType: 'basic-attack',
            execute: { label: 'Fixture execute', thresholdHealth: 300 },
          }),
        ],
      }),
    );
    expect(result.perInstance[0]!.final).toBe(200);
    expect(result.sustain.sources[0]!.amount).toBeCloseTo(20, 9);
  });

  it('heals from an instance’s BURST damage and not from the burn it registered', () => {
    // THE EXCLUSION THIS PINS AS BEHAVIOUR RATHER THAN AS A SENTENCE. In game omnivamp heals
    // from a burn's damage. Here it does not, because `SustainResult` carries one attacker total
    // with no damage-over-time arm, and folding the burn's share into it would put a
    // damage-over-time figure inside a figure presented beside the burst — which §3.8 forbids.
    //
    // One instance: 100 magic immediately, and a burn worth 300 magic over its full duration.
    // Defender has 0 magic resistance, so nothing is mitigated.
    //   burst omnivamp:  0.2 x 100 = 20
    //   if the burn counted: 0.2 x 400 = 80, which is the number this must NOT produce
    const result = runCombo(
      plan({
        defender: statBlock({ hp: 2000, maxHp: 2000 }),
        attackerVamp: { omnivamp: 0.2 },
        instances: [
          hit('w', 100, 'magic', {
            instanceType: 'dot-application',
            dot: {
              label: 'Fixture burn',
              verification: 'derived',
              damage: {
                components: [component({ id: 'burn-c', damageType: 'magic', base: flat(300) })],
                rank: 1,
                maxRank: 5,
              },
            },
          }),
        ],
      }),
    );
    // The burn is reported, in full, on its own line — never folded into the burst (§3.8).
    expect(result.dot.total).toBe(300);
    expect(result.burst.total).toBe(100);
    // And the sustain reads the burst alone.
    expect(result.sustain.sources).toHaveLength(1);
    expect(result.sustain.sources[0]!.amount).toBeCloseTo(20, 9);
    expect(result.sustain.attackerHealing).toBe(20);
  });

  it('restores nothing from an instance the engine refused', () => {
    // A refused instance deals 0 (SPECIFICATION §8), so there is no damage for a rate to read.
    const result = runCombo(
      plan({
        defender: statBlock({ hp: 2000, maxHp: 2000 }),
        attackerVamp: { lifesteal: 0.15, omnivamp: 0.1 },
        instances: [
          {
            stepId: 'broken',
            sourceLabel: 'an ability nothing was harvested for',
            instanceType: 'basic-attack',
            verification: 'incomplete',
            incompleteReason: { kind: 'pending', note: 'nothing harvested' },
          },
        ],
      }),
    );
    expect(result.sustain.sources).toEqual([]);
    expect(result.sustain.attackerHealing).toBe(0);
  });
});

describe('spell vamp is refused rather than resolved', () => {
  const result = runCombo(
    plan({
      defender: statBlock({ hp: 2000, maxHp: 2000 }),
      attackerVamp: { spellVamp: 0.2 },
      instances: [hit('q', 400, 'magic')],
    }),
  );

  it('names it once, restores nothing, and says why', () => {
    expect(result.sustain.sources).toHaveLength(1);
    const source = result.sustain.sources[0]!;
    expect(source.kind).toBe('spell-vamp');
    expect(source.amount).toBe(0);
    expect(source.verification).toBe('incomplete');
    expect(source.fromInstance).toBeNull();
    expect(source.incompleteReason?.kind).toBe('pending');
    expect(source.incompleteReason?.note).toBe(SPELL_VAMP_REFUSAL);
  });

  it('adds nothing to the attacker total', () => {
    expect(result.sustain.attackerHealing).toBe(0);
  });
});

describe('the two sides of sustain stay apart (§3.7, §3.8)', () => {
  // The defender heals 100 from their own kit; the attacker life-steals off the damage.
  // Defender: 900 of 1000 health, no resistances. One basic attack, 300 physical.
  //   the defender's unplaced heal is available from the start: 900 + 100 = 1000 (capped at max)
  //   damage applied: 300 -> 700 remaining
  //   attacker life steal: 0.15 x 300 = 45 -> round(45) = 45
  const result = runCombo(
    plan({
      defender: statBlock({ hp: 900, maxHp: 1000 }),
      attackerVamp: { lifesteal: 0.15 },
      unplacedSustain: [
        { label: 'Defender kit heal', kind: 'heal', restoresTo: 'defender', amount: 100, verification: 'derived' },
      ],
      instances: [hit('aa', 300, 'physical', { instanceType: 'basic-attack' })],
    }),
  );

  it('counts the defender’s healing once, in the verdict, and not on the attacker’s line', () => {
    expect(result.sustain.defenderHealing).toBe(100);
    expect(result.verdict.burstOnly.healingApplied).toBe(100);
    expect(result.verdict.burstOnly.remainingHp).toBe(700);
  });

  it('counts the attacker’s healing once, on the attacker’s line, and not in the verdict', () => {
    expect(result.sustain.attackerHealing).toBe(45);
    // 900 entry health, 300 applied, 100 healed: the verdict's own identity.
    expect(
      result.verdict.burstOnly.defenderHp -
        result.verdict.burstOnly.damageApplied +
        result.verdict.burstOnly.healingApplied,
    ).toBe(result.verdict.burstOnly.remainingHp);
  });

  it('lists both sides on one sustain line, each saying whose health it restored', () => {
    expect(result.sustain.sources.map((s) => [s.kind, s.restoresTo])).toEqual([
      ['heal', 'defender'],
      ['lifesteal', 'attacker'],
    ]);
  });
});

// =========================================================================================
// FROM A SCENARIO, THROUGH `simulate` (SPECIFICATION §4 — "item stat bonuses are modelled in
// full")
// =========================================================================================

const ATTACKER = fixtureChampion({ apiname: 'Fixtacker', hpBase: 600, adBase: 100 });
const DEFENDER = fixtureChampion({ apiname: 'Fixtender', hpBase: 2000 });

/** Two hand-authored life-steal items. The percentages are chosen for the arithmetic. */
const FANG: Item = fixtureItem(9001, 'Fixture Fang', { PercentLifeStealMod: 0.1 });
const SCEPTER: Item = fixtureItem(9002, 'Fixture Scepter', { PercentLifeStealMod: 0.05 });
const SWORD: Item = fixtureItem(9003, 'Fixture Sword', { FlatPhysicalDamageMod: 20 });
const ABILITY: CuratedAbility = fixtureAbility({
  champion: 'Fixtacker',
  slot: 'Q',
  perRank: [200, 200, 200, 200, 200],
  damageType: 'magic',
});

function run(opts: {
  attackerItems?: number[];
  defenderItems?: number[];
  combo?: { id: string; kind: 'basic-attack' | 'ability'; ref: string }[];
}) {
  const cat = fixtureCatalogue({
    champions: [ATTACKER, DEFENDER],
    items: [FANG, SCEPTER, SWORD],
    abilities: [ABILITY],
  });
  return simulate(
    scenario({
      attacker: championConfig({
        apiname: 'Fixtacker',
        level: 1,
        items: opts.attackerItems ?? [],
      }),
      defender: championConfig({
        apiname: 'Fixtender',
        level: 1,
        items: opts.defenderItems ?? [],
      }),
      combo: opts.combo ?? [{ id: 's1', kind: 'basic-attack', ref: 'basic' }],
    }),
    cat,
  );
}

describe('life steal reaches a Result from the attacker’s item statistics', () => {
  it('sums two items’ percentages and heals off the basic attack', () => {
    // Attacker: 100 base attack damage, no bonus -> the basic attack deals 100 physical.
    // Defender: 0 armor -> 100 post-mitigation.
    // Life steal 10% + 5% = 15% (the wiki: sources "stack additively") -> 0.15 x 100 = 15.
    const out = run({ attackerItems: [9001, 9002] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.perInstance[0]!.final).toBe(100);
    expect(out.result.sustain.sources).toHaveLength(1);
    expect(out.result.sustain.sources[0]!.kind).toBe('lifesteal');
    // The UNROUNDED source figure is asserted as well as the rounded total, because the two
    // readings are only a rounding apart on this build: additive gives 0.15 x 100 = 15, and
    // multiplicative would give 1 - 0.9 x 0.95 = 0.145 -> 14.5, which ROUNDS TO THE SAME 15.
    // A test that could not tell the two apart would not be testing the stacking rule at all.
    expect(out.result.sustain.sources[0]!.amount).toBeCloseTo(15, 9);
    expect(out.result.sustain.attackerHealing).toBe(15);
  });

  it('restores nothing when the attacker carries no life-steal item', () => {
    const out = run({ attackerItems: [9003] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.sustain.sources).toEqual([]);
    expect(out.result.sustain.attackerHealing).toBe(0);
  });

  it('ignores life steal on the DEFENDER’s build, because the defender does not act (§5)', () => {
    const out = run({ attackerItems: [], defenderItems: [9001, 9002] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.sustain.sources).toEqual([]);
    expect(out.result.sustain.attackerHealing).toBe(0);
  });

  it('heals nothing from an ability, however much life steal is carried', () => {
    const out = run({
      attackerItems: [9001, 9002],
      combo: [{ id: 's1', kind: 'ability', ref: 'Q' }],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // The ability lands (200 magic against 0 magic resistance) and restores nothing.
    expect(out.result.perInstance[0]!.final).toBe(200);
    expect(out.result.sustain.sources).toEqual([]);
  });

  it('no longer reports the life-steal stat key as one it left out', () => {
    const out = run({ attackerItems: [9001] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const line of out.result.excludedMechanics) {
      expect(line).not.toMatch(/PercentLifeStealMod/);
    }
  });
});

describe('what is stated rather than silently dropped (SPECIFICATION §11)', () => {
  it('states that no stored source provides omnivamp or spell vamp', () => {
    expect(SIMULATION_EXCLUSIONS.some((line) => /omnivamp/i.test(line))).toBe(true);
    expect(SIMULATION_EXCLUSIONS.some((line) => /spell vamp/i.test(line))).toBe(true);
  });

  it('separates the two, because they are absent for OPPOSITE reasons', () => {
    // Omnivamp is a live stat this engine does not read; spell vamp is a stat the game no longer
    // has. One line saying "neither is provided" would read as one gap where there is only one.
    const omnivamp = SIMULATION_EXCLUSIONS.filter((line) => /omnivamp/i.test(line));
    const spellVamp = SIMULATION_EXCLUSIONS.filter((line) => /spell vamp/i.test(line));
    // The omnivamp line must say the stat EXISTS and name the route this engine does not read.
    expect(omnivamp.some((line) => /does exist in game/i.test(line) && /passive/i.test(line))).toBe(
      true,
    );
    // The spell-vamp line must say the game has none, and date it (Vamp#Spell vamp, V26.04).
    expect(
      spellVamp.some((line) => /no sources in the game/i.test(line) && /V26\.04/.test(line)),
    ).toBe(true);
    // And nothing may still claim the removed area-of-effect penalty as the reason.
    expect(SIMULATION_EXCLUSIONS.some((line) => /spell vamp/i.test(line) && /33%/.test(line))).toBe(
      false,
    );
  });

  it('states that damage-over-time damage restores nothing to the attacker', () => {
    // The contract limit: `SustainResult` has one attacker total and no damage-over-time arm, and
    // §3.8 forbids folding a damage-over-time figure into a burst one.
    expect(
      ENGINE_EXCLUSIONS.some((line) => /damage over time/i.test(line) && /attacker/i.test(line)),
    ).toBe(true);
  });

  it('states that the attacker’s sustain is before overheal', () => {
    expect(ENGINE_EXCLUSIONS.some((line) => /overheal/i.test(line))).toBe(true);
  });

  it('carries both statements on every result, not only in the constant', () => {
    const out = run({ attackerItems: [9001] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.excludedMechanics.some((line) => /overheal/i.test(line))).toBe(true);
    expect(out.result.excludedMechanics.some((line) => /omnivamp/i.test(line))).toBe(true);
  });

  it('states that an item’s on-hit proc damage restores no life steal', () => {
    expect(SIMULATION_EXCLUSIONS.some((line) => /on-hit/i.test(line) && /life steal/i.test(line))).toBe(
      true,
    );
  });

  it('admits the on-hit gap as an UNDER-COUNT, and does not deny the mechanic', () => {
    // The wiki: "the damage of most item on-hit effects benefits from life steal". A user whose
    // build pairs life steal with an on-hit item must be told the figure is low, not told the
    // interaction does not happen — the second would be a plausible wrong number.
    const line = SIMULATION_EXCLUSIONS.find(
      (x) => /on-hit/i.test(x) && /life steal/i.test(x) && /under-count/i.test(x),
    );
    expect(line).toBeDefined();
    expect(line!).toMatch(/most item on-hit effects benefits from life steal/i);
    expect(line!).toMatch(/less sustain here than it would restore in game/i);
  });
});
