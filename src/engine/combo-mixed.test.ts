// KNOWN-ANSWER TESTS FOR THE TWO DAMAGE TYPES A RESULT HAS AND THE DATA DOES NOT — 'mixed' and
// 'none' — AND FOR THE FOUR-STEP RESISTANCE BREAKDOWN ON EVERY INSTANCE.
//
// WHY 'mixed' EXISTS. src/types/data.ts, `ReportedDamageType`:
//   "'mixed' — one instance dealt more than one type at once. 13 abilities do this (measured
//    over 937 pages, 2026-08-13): Akshan P, Gangplank R, K'Sante W, Katarina R, Lucian P,
//    Rek'Sai E, Shyvana Q, Syndra W, Tristana E, Yone P/W/R, Zaahen E. PICKING ONE WOULD SEND
//    DAMAGE THROUGH THE WRONG RESISTANCE, so the engine refused the whole instance."
// The fixtures below are built from the SHAPE of three of those — Yone W is physical + magic,
// K'Sante W is physical + true, Gangplank R is magic + true — with hand-chosen round numbers.
// NO CHAMPION'S ACTUAL FIGURES ARE READ: no data file is touched anywhere in this suite, and
// every expected number is arithmetic written out above its assertion.
//
// WHY 'none' EXISTS. Same file: "'none' — the instance dealt nothing. Previously such an
// instance was given 'true', which applies no mitigation and so could not be mis-mitigated, but
// it is the wrong WORD for 'this dealt nothing'."
//
// THE FORMULAS USED
//   resistance multiplier    100 / (100 + R)                                SPECIFICATION §3.6
//   four-step order          flat reduction, percentage reduction,
//                            percentage penetration, flat penetration       SPECIFICATION §3.6
//   flat damage reduction    never applies to true damage                   wiki, Damage modifier
//   rounding                 half away from zero, at the reporting boundary rounding.ts

import { describe, it, expect } from 'vitest';
import { runCombo, type ComboPlan, type PlannedInstance } from './combo';
import { component, flat, scenario, statBlock } from './fixtures';
import type { StateEffect } from './state';

function plan(opts: Partial<ComboPlan> & { instances: PlannedInstance[] }): ComboPlan {
  return {
    patch: '26.16',
    scenario: scenario(),
    attacker: statBlock(),
    defender: statBlock(),
    ...opts,
  };
}

/** One instance whose payload is several flat components, each with its own damage type. */
function multiTypeHit(
  stepId: string,
  parts: Array<[amount: number, damageType: 'physical' | 'magic' | 'true']>,
  extra: Partial<PlannedInstance> = {},
): PlannedInstance {
  return {
    stepId,
    sourceLabel: stepId,
    instanceType: 'damaging-ability',
    verification: 'derived',
    damage: {
      components: parts.map(([amount, damageType], index) =>
        component({ id: `${stepId}-${index}`, damageType, base: flat(amount) }),
      ),
      rank: 1,
      maxRank: 5,
    },
    ...extra,
  };
}

// =========================================================================================
// (a) THE MIXED PATH — each type meets ITS OWN resistance
// =========================================================================================

describe('runCombo — a physical + magic instance (the Yone W shape)', () => {
  // Defender: 100 armor, 50 magic resistance, 5000 health.
  // One instance: 200 physical and 300 magic, together, as one cast.
  //   physical  200 x 100/(100+100) = 200 x 0.5      = 100
  //   magic     300 x 100/(100+ 50) = 300 x 2/3      = 200
  //   applied                                          300
  //
  // The two readings the engine used to have to choose between, and refused to:
  //   everything as physical : 500 x 0.5   = 250
  //   everything as magic    : 500 x 2/3   = 333.33
  // 300 is neither, which is what makes this test evidence about per-type mitigation.
  const result = runCombo(
    plan({
      defender: statBlock({ armor: 100, magicResist: 50, hp: 5000, maxHp: 5000 }),
      instances: [multiTypeHit('w', [[200, 'physical'], [300, 'magic']])],
    }),
  );
  const instance = result.perInstance[0];

  it('reports the instance as mixed rather than refusing it', () => {
    expect(instance.damageType).toBe('mixed');
    expect(instance.verification).toBe('derived');
    expect(result.incompleteContributors).toEqual([]);
  });

  it('applies 300, which is neither the all-physical nor the all-magic answer', () => {
    expect(instance.final).toBe(300);
    expect(instance.final).not.toBe(250);
    expect(instance.final).not.toBe(333);
  });

  it('carries the split, each half mitigated by its own resistance', () => {
    expect(instance.byType).toEqual({ physical: 100, magic: 200, true: 0 });
  });

  it('keeps the raw figure at the full 500 the ability deals', () => {
    expect(instance.raw).toBe(500);
    expect(instance.afterPreMitigationReduction).toBe(500);
    expect(instance.afterResistances).toBeCloseTo(300, 9);
  });

  it('splits the burst total across the two types in the result', () => {
    expect(result.burst.total).toBe(300);
    expect(result.burst.byType).toEqual({ physical: 100, magic: 200, true: 0 });
  });

  it('gives NO four-step breakdown, because there are two chains and one field', () => {
    // A physical + magic instance meets armor AND magic resistance, each through its own
    // four-step order. `InstanceResult.resistanceSteps` is one breakdown, so showing either
    // would state one chain as though it were the instance's. RAISED TO THE LEAD; the
    // exclusion list says so on every result.
    expect(instance.resistanceSteps).toBeUndefined();
    expect(result.excludedMechanics.join(' | ')).toMatch(/both physical and magic/i);
  });
});

describe('runCombo — a physical + true instance (the K\'Sante W shape)', () => {
  // Defender: 100 armor, 5000 health.
  //   physical  300 x 0.5 = 150
  //   true      100 bypasses armor entirely (§3.6) = 100
  //   applied              = 250
  const result = runCombo(
    plan({
      defender: statBlock({ armor: 100, magicResist: 80, hp: 5000, maxHp: 5000 }),
      instances: [multiTypeHit('w', [[300, 'physical'], [100, 'true']])],
    }),
  );
  const instance = result.perInstance[0];

  it('mitigates the physical half and lets the true half through untouched', () => {
    expect(instance.byType).toEqual({ physical: 150, magic: 0, true: 100 });
    expect(instance.final).toBe(250);
  });

  it('DOES give the four-step breakdown, because only one resistance was met', () => {
    // Magic resistance is irrelevant to this instance — no part of it is magic — so the one
    // breakdown field is unambiguous and is filled in.
    expect(instance.resistanceSteps?.starting).toBe(100);
    expect(instance.resistanceSteps?.afterFlatPenetration).toBe(100);
    expect(instance.resistanceSteps?.multiplier).toBeCloseTo(0.5, 12);
  });
});

describe('runCombo — a magic + true instance (the Gangplank R shape)', () => {
  // Defender: 25 magic resistance, 5000 health.
  //   magic  400 x 100/125 = 400 x 0.8 = 320
  //   true   100                       = 100
  //   applied                          = 420
  const result = runCombo(
    plan({
      defender: statBlock({ armor: 200, magicResist: 25, hp: 5000, maxHp: 5000 }),
      instances: [multiTypeHit('r', [[400, 'magic'], [100, 'true']])],
    }),
  );
  const instance = result.perInstance[0];

  it('mitigates the magic half by magic resistance and not by the 200 armor', () => {
    expect(instance.byType).toEqual({ physical: 0, magic: 320, true: 100 });
    expect(instance.final).toBe(420);
  });

  it('gives the breakdown for magic resistance, the only resistance it met', () => {
    expect(instance.resistanceSteps?.starting).toBe(25);
    expect(instance.resistanceSteps?.multiplier).toBeCloseTo(0.8, 12);
  });
});

describe('runCombo — a type-specific reduction against a mixed instance', () => {
  it('reduces the physical half only, and never the true half', () => {
    // Defender: 0 armor, 0 magic resistance, so the resistance multipliers are exactly 1 and
    // the reduction is the only thing moving the numbers.
    //   a 30-point flat reduction naming PHYSICAL only
    //   physical 200 - 30 = 170
    //   magic    200           (the rule does not name magic)
    //   true     200           (wiki: "Flat damage reduction does not work against true damage")
    //   applied                = 570
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, magicResist: 0, hp: 5000, maxHp: 5000 }),
        defenderReductions: [{ label: 'physical only', flat: 30, damageTypes: ['physical'] }],
        instances: [
          multiTypeHit('q', [[200, 'physical'], [200, 'magic'], [200, 'true']]),
        ],
      }),
    );
    expect(result.perInstance[0].byType).toEqual({ physical: 170, magic: 200, true: 200 });
    expect(result.perInstance[0].final).toBe(570);
  });

  it('never lets a flat reduction touch true damage even when it names every type', () => {
    // The same 30 flat, with no damageTypes at all, so it applies to physical and magic.
    //   physical 170, magic 170, true 200 (untouchable) = 540
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, magicResist: 0, hp: 5000, maxHp: 5000 }),
        defenderReductions: [{ label: 'all types', flat: 30 }],
        instances: [multiTypeHit('q', [[200, 'physical'], [200, 'magic'], [200, 'true']])],
      }),
    );
    expect(result.perInstance[0].byType).toEqual({ physical: 170, magic: 170, true: 200 });
  });
});

describe('runCombo — a mixed instance still resolves crit as one decision', () => {
  it('doubles both halves at the base 200% multiplier', () => {
    // 100 physical + 100 magic, critting at 2.0, against 0 resistances: 200 + 200 = 400.
    const result = runCombo(
      plan({
        attacker: statBlock({ critDamage: 2 }),
        defender: statBlock({ armor: 0, magicResist: 0, hp: 5000, maxHp: 5000 }),
        instances: [
          {
            stepId: 'aa',
            sourceLabel: 'empowered attack',
            instanceType: 'empowered-attack',
            verification: 'derived',
            damage: {
              components: [
                component({ id: 'p', damageType: 'physical', base: flat(100) }),
                component({ id: 'm', damageType: 'magic', base: flat(100) }),
              ],
              rank: 1,
              maxRank: 1,
              crit: true,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0].byType).toEqual({ physical: 200, magic: 200, true: 0 });
    expect(result.perInstance[0].final).toBe(400);
  });
});

// =========================================================================================
// (a) THE 'none' PATH — an instance that dealt nothing says so
// =========================================================================================

describe('runCombo — an instance that dealt nothing reports \'none\'', () => {
  it('labels a non-damaging ability \'none\', not \'true\'', () => {
    // SPECIFICATION §3.4: a non-damaging ability "occupies a position in the sequence" and
    // generates no damage. Calling that true damage was the wrong word for it.
    const result = runCombo(
      plan({
        instances: [
          {
            stepId: 'w',
            sourceLabel: 'W — no damage',
            instanceType: 'non-damaging-ability',
            verification: 'no-damage',
          },
        ],
      }),
    );
    expect(result.perInstance[0].damageType).toBe('none');
    expect(result.perInstance[0].final).toBe(0);
    expect(result.perInstance[0].byType).toBeUndefined();
    expect(result.perInstance[0].resistanceSteps).toBeUndefined();
  });

  it('labels a REFUSED instance \'none\', because no damage was applied for it', () => {
    // An incomplete ability contributes no damage (SPECIFICATION §8). Whatever type it would
    // have dealt, what this instance actually delivered is nothing.
    const result = runCombo(
      plan({
        instances: [
          {
            stepId: 'q',
            sourceLabel: 'Q — incomplete',
            instanceType: 'damaging-ability',
            verification: 'incomplete',
            incompleteReason: { kind: 'pending', note: 'hand-authored fixture' },
            damage: {
              components: [component({ id: 'c', damageType: 'magic', base: flat(400) })],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0].damageType).toBe('none');
    expect(result.perInstance[0].final).toBe(0);
    expect(result.incompleteContributors).toHaveLength(1);
  });

  it('keeps a resolved single-type instance on its own type, not \'none\'', () => {
    // The paired case: without it, the two assertions above would pass for an engine that
    // labelled every instance in the game 'none'.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        instances: [multiTypeHit('q', [[200, 'magic']])],
      }),
    );
    expect(result.perInstance[0].damageType).toBe('magic');
    expect(result.perInstance[0].final).toBe(200);
  });
});

describe('runCombo — byType is present ONLY on a mixed instance', () => {
  it('leaves byType off a single-type instance', () => {
    // src/types/result.ts: "REQUIRED when `damageType` is 'mixed'. Absent otherwise — a
    // single-type instance already says its type, and a byType with two zeroes in it invites a
    // bar with empty segments."
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 5000, maxHp: 5000 }),
        instances: [
          multiTypeHit('q', [[200, 'physical']]),
          multiTypeHit('w', [[100, 'physical'], [100, 'magic']]),
        ],
      }),
    );
    expect(result.perInstance[0].byType).toBeUndefined();
    expect(result.perInstance[1].byType).toBeDefined();
  });
});

// =========================================================================================
// (b) THE FOUR-STEP BREAKDOWN, ON EVERY INSTANCE (SPECIFICATION §3.6, DESIGN.md §7)
// =========================================================================================

describe('runCombo — resistanceSteps reports §3.6 step by step', () => {
  // Defender: 100 armor, no bonus. Attacker: 40% armor penetration and 10 flat penetration,
  // both constant for the sequence. Each instance shreds 20 flat armor AFTER its own damage.
  //
  //   instance 1  starting                100
  //               step 1 flat reduction   100 - 0    = 100
  //               step 2 pct reduction    none       = 100
  //               step 3 pct penetration  100 x 0.60 =  60
  //               step 4 flat penetration  60 - 10   =  50
  //               multiplier 100/150 = 2/3 ; 300 x 2/3 = 200
  //
  //   instance 2  starting                100
  //               step 1 flat reduction   100 - 20   =  80
  //               step 2 pct reduction    none       =  80
  //               step 3 pct penetration   80 x 0.60 =  48
  //               step 4 flat penetration  48 - 10   =  38
  //               multiplier 100/138 ; 300 x 100/138 = 217.3913...  -> 217
  const shred: StateEffect = {
    kind: 'flat-resistance-reduction',
    resistance: 'armor',
    source: 'shred',
    amount: 20,
  };
  const result = runCombo(
    plan({
      attacker: statBlock({
        penetration: {
          flatArmor: 10,
          percentArmor: 0.4,
          percentBonusArmor: 0,
          flatMagic: 0,
          percentMagic: 0,
        },
      }),
      defender: statBlock({ armor: 100, hp: 5000, maxHp: 5000 }),
      instances: [
        multiTypeHit('one', [[300, 'physical']], { effects: [shred] }),
        multiTypeHit('two', [[300, 'physical']]),
      ],
    }),
  );

  it('shows all four steps for the first instance', () => {
    expect(result.perInstance[0].resistanceSteps).toEqual({
      starting: 100,
      afterFlatReduction: 100,
      afterPercentReduction: 100,
      afterPercentPenetration: 60,
      afterFlatPenetration: 50,
      multiplier: 100 / 150,
    });
  });

  it('shows the shred arriving at step 1 of the second instance, not at step 3', () => {
    const steps = result.perInstance[1].resistanceSteps!;
    expect(steps.afterFlatReduction).toBeCloseTo(80, 9);
    expect(steps.afterPercentPenetration).toBeCloseTo(48, 9);
    expect(steps.afterFlatPenetration).toBeCloseTo(38, 9);
    // Under the WRONG order — penetration before reduction — step 3 would be 60 and the flat
    // reduction would then take it to 40 - 10 = 30, not 38.
    expect(steps.afterFlatPenetration).not.toBeCloseTo(30, 6);
  });

  it('agrees with the damage it actually applied', () => {
    // The breakdown is not a decoration alongside the arithmetic; it IS the arithmetic.
    expect(result.perInstance.map((i) => i.final)).toEqual([200, 217]);
    const steps = result.perInstance[1].resistanceSteps!;
    expect(300 * steps.multiplier).toBeCloseTo(result.perInstance[1].afterResistances, 9);
  });

  it('reads the attacker\'s penetration off the stat block', () => {
    // The frozen `StatBlock` now carries penetration, so a resolved stat block a user is shown
    // includes a stat their build gives them (src/types/result.ts, `StatBlock.penetration`).
    expect(result.attackerStats.penetration.percentArmor).toBe(0.4);
  });
});

describe('runCombo — the breakdown is ABSENT for true damage', () => {
  it('gives no resistanceSteps at all, rather than a breakdown of zeroes', () => {
    // src/types/result.ts: "Absent entirely for true damage, which meets no resistance at all —
    // an absent breakdown and a breakdown of zeroes are different claims."
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 100, magicResist: 100, hp: 5000, maxHp: 5000 }),
        instances: [multiTypeHit('r', [[500, 'true']])],
      }),
    );
    expect(result.perInstance[0].damageType).toBe('true');
    expect(result.perInstance[0].final).toBe(500);
    expect(result.perInstance[0].resistanceSteps).toBeUndefined();
  });

  it('gives one for a magic instance against the same defender', () => {
    // The paired case: the assertion above must not be true merely because the field is never
    // filled in.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 100, magicResist: 100, hp: 5000, maxHp: 5000 }),
        instances: [multiTypeHit('r', [[500, 'magic']])],
      }),
    );
    expect(result.perInstance[0].resistanceSteps?.starting).toBe(100);
    expect(result.perInstance[0].final).toBe(250);
  });
});
