// Known-answer tests for THE SEQUENTIAL COMBO RUNNER (SPECIFICATION §3.1, §3.3, §3.6, §3.8,
// §5, §8, §11).
//
// EVERY expected number below is arithmetic done by hand and written out in the comment above
// the assertion. Nothing here was obtained by running the engine. Where a test pins an engine
// CONVENTION rather than a sourced rule, the test name says so.
//
// The formulas used:
//   resistance multiplier      100 / (100 + R)                       SPECIFICATION §3.6
//   four-step modifier order   flat reduction, percentage reduction,
//                              percentage penetration, flat penetration   SPECIFICATION §3.6
//   crit                       damage x critDamage                    crit.ts, wiki V26.01
//   rounding                   half away from zero, at the reporting
//                              boundary only                          rounding.ts

import { describe, it, expect } from 'vitest';
import {
  ENGINE_EXCLUSIONS,
  runCombo,
  type ComboPlan,
  type PlannedInstance,
} from './combo';
import type { StateEffect } from './state';
import { championConfig, component, flat, scenario, statBlock } from './fixtures';

// --- fixture helpers, hand-authored; no data file is read anywhere in this suite ---------

/** An instance dealing one flat, un-scaled damage figure of one type. */
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

/** A shred effect: `amount` points of flat armor reduction from one named source. */
function shredArmor(source: string, amount: number, cap?: number): StateEffect {
  return { kind: 'flat-resistance-reduction', resistance: 'armor', source, amount, cap };
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
// THE HEADLINE CASE: armor shred accumulating across a sequence (SPECIFICATION §3.1)
// =========================================================================================

describe('runCombo — armor shred accumulates, so a later instance meets less armor', () => {
  // Defender: 100 armor, 2000 health. Attacker: no penetration.
  // Three identical instances, each 300 raw physical, each shredding 20 flat armor.
  //
  //   instance 1: shred 0  -> effective armor 100 -> 100/(100+100) = 0.5      -> 300 x 0.5      = 150
  //   instance 2: shred 20 -> effective armor  80 -> 100/180                  -> 30000/180      = 166.666...
  //   instance 3: shred 40 -> effective armor  60 -> 100/160 = 0.625          -> 300 x 0.625    = 187.5
  //
  // Rounded for display (half away from zero): 150, 167, 188.
  // Cumulative, unrounded: 150 -> 316.666... -> 504.166...
  const result = runCombo(
    plan({
      defender: statBlock({ armor: 100, hp: 2000, maxHp: 2000 }),
      instances: [
        hit('one', 300, 'physical', { effects: [shredArmor('shred', 20)] }),
        hit('two', 300, 'physical', { effects: [shredArmor('shred', 20)] }),
        hit('three', 300, 'physical', { effects: [shredArmor('shred', 20)] }),
      ],
    }),
  );

  it('gives all three instances the same raw damage', () => {
    // The raw figure is identical; only the armor they meet differs. This is what makes the
    // rising final damage evidence about STATE and not about the damage numbers.
    expect(result.perInstance.map((i) => i.raw)).toEqual([300, 300, 300]);
  });

  it('resolves 150, 166.67 and 187.5 after resistances, in that order', () => {
    expect(result.perInstance[0].afterResistances).toBeCloseTo(150, 9);
    expect(result.perInstance[1].afterResistances).toBeCloseTo(166.6666666666, 6);
    expect(result.perInstance[2].afterResistances).toBeCloseTo(187.5, 9);
  });

  it('reports 150, 167 and 188 as the damage actually applied', () => {
    expect(result.perInstance.map((i) => i.final)).toEqual([150, 167, 188]);
  });

  it('shows the accumulated shred each instance MET, not the shred after it landed', () => {
    // SPECIFICATION §11: the breakdown shows "the state that applied at that point".
    expect(result.perInstance.map((i) => i.stateSnapshot.defenderArmorFlatReduction)).toEqual([
      0, 20, 40,
    ]);
  });

  it('reports a running total of 150, 317, 504, each carrying its own per-type split', () => {
    // 150 -> 316.666... -> 504.166..., each rounded for display from the unrounded total.
    expect(result.runningTotal.map((p) => p.total)).toEqual([150, 317, 504]);
    // Every point states the split behind it, so the interface can draw the composition bar
    // DESIGN.md §8 requires beside an untagged aggregate — from the engine's own arithmetic,
    // never by re-summing the rounded per-instance column. This combo is physical throughout.
    expect(result.runningTotal.map((p) => p.byType)).toEqual([
      { physical: 150, magic: 0, true: 0 },
      { physical: 317, magic: 0, true: 0 },
      { physical: 504, magic: 0, true: 0 },
    ]);
  });

  it('makes every running-total point sum to its own total', () => {
    for (const point of result.runningTotal) {
      const sum = point.byType.physical + point.byType.magic + point.byType.true;
      expect(sum).toBe(point.total);
    }
  });

  it('totals 504 of physical burst and nothing of the other two types', () => {
    expect(result.burst.total).toBe(504);
    expect(result.burst.byType).toEqual({ physical: 504, magic: 0, true: 0 });
  });

  it('leaves the 2000-health defender alive on 1496', () => {
    // 2000 - 504.1666... = 1495.8333..., rounded to 1496.
    expect(result.verdict.burstOnly.lethal).toBe(false);
    expect(result.verdict.burstOnly.damageApplied).toBe(504);
    expect(result.verdict.burstOnly.remainingHp).toBe(1496);
    expect(result.verdict.burstOnly.lethalAtInstance).toBeNull();
  });

  it('does NOT let an instance shred armor for itself', () => {
    // Instance 1 both deals damage and shreds 20. Its own damage met 100 armor, giving 150.
    // Had its shred applied first it would have met 80 and dealt 166.67.
    // ENGINE RULE, stated in state.ts: effects apply AFTER the instance's damage resolves.
    // A user who means "the shred was already there" says so in entry state (§3.3).
    expect(result.perInstance[0].final).toBe(150);
  });
});

describe('runCombo — a single shredding instance does not shred itself', () => {
  it('deals 150, not 188, against 100 armor while shredding 40', () => {
    // One instance: 300 raw physical, 40 flat armor shred, against 100 armor.
    //   with the shred applied after : 300 x 100/200 = 150
    //   with the shred applied first : 300 x 100/160 = 187.5 -> 188
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 100, hp: 2000, maxHp: 2000 }),
        instances: [hit('solo', 300, 'physical', { effects: [shredArmor('s', 40)] })],
      }),
    );
    expect(result.perInstance[0].final).toBe(150);
  });
});

// =========================================================================================
// ORDER IS SIGNIFICANT (SPECIFICATION §3.1)
// =========================================================================================

describe('runCombo — the same two instances in two orders give different totals', () => {
  // A: 300 raw physical AND shreds 40 armor.   B: 300 raw physical, no effect.
  // Defender: 100 armor.
  //   A then B: A meets 100 -> 150 ; B meets 60 -> 300 x 100/160 = 187.5. Total 337.5 -> 338
  //   B then A: B meets 100 -> 150 ; A meets 100 -> 150.                  Total 300   -> 300
  const defender = statBlock({ armor: 100, hp: 5000, maxHp: 5000 });
  const a = () => hit('A', 300, 'physical', { effects: [shredArmor('s', 40)] });
  const b = () => hit('B', 300, 'physical');

  it('deals 338 when the shredding instance goes first', () => {
    const result = runCombo(plan({ defender, instances: [a(), b()] }));
    expect(result.perInstance.map((i) => i.final)).toEqual([150, 188]);
    expect(result.burst.total).toBe(338);
  });

  it('deals 300 when the shredding instance goes last', () => {
    const result = runCombo(plan({ defender, instances: [b(), a()] }));
    expect(result.perInstance.map((i) => i.final)).toEqual([150, 150]);
    expect(result.burst.total).toBe(300);
  });
});

// =========================================================================================
// THE FOUR-STEP RESISTANCE-MODIFIER ORDER, END TO END AGAINST CHANGING STATE (§3.6)
// =========================================================================================

describe('runCombo — reduction applies before penetration, every instance', () => {
  it('resolves 188 then 203 with 40% penetration against accumulating flat shred', () => {
    // Defender 100 armor. Attacker 40% armor penetration, constant for the sequence.
    // Each instance: 300 raw physical, 20 flat armor shred.
    //
    //   instance 1  step 1 flat reduction   100 - 0  = 100
    //               step 2 pct reduction    none     = 100
    //               step 3 pct penetration  100 x 0.60 = 60
    //               step 4 flat penetration none     = 60
    //               300 x 100/160 = 187.5                          -> 188
    //
    //   instance 2  step 1 flat reduction   100 - 20 = 80
    //               step 3 pct penetration   80 x 0.60 = 48
    //               300 x 100/148 = 30000/148 = 202.7027...        -> 203
    //
    // Under the WRONG order (penetration before reduction) instance 2 would be
    // 100 x 0.60 = 60, then - 20 = 40, giving 300 x 100/140 = 214.28... -> 214.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 100, hp: 5000, maxHp: 5000 }),
        attackerPenetration: { armor: { percentPenetration: 0.4 } },
        instances: [
          hit('one', 300, 'physical', { effects: [shredArmor('s', 20)] }),
          hit('two', 300, 'physical', { effects: [shredArmor('s', 20)] }),
        ],
      }),
    );
    expect(result.perInstance.map((i) => i.final)).toEqual([188, 203]);
  });
});

// =========================================================================================
// BONE PLATING — a defensive rune resolving against the instance counter (§5)
// =========================================================================================

describe('runCombo — a reduction window over the first three instances', () => {
  const bonePlating = {
    label: 'Bone Plating',
    flat: 30,
    firstInstance: 1,
    lastInstance: 3,
  };

  it('reduces the first three instances by 30 and leaves the fourth alone', () => {
    // Defender 0 magic resistance, so the resistance multiplier is exactly 1.
    // 200 raw magic each: 170, 170, 170, 200. Running total 170, 340, 510, 710.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        defenderReductions: [bonePlating],
        instances: [
          hit('1', 200, 'magic'),
          hit('2', 200, 'magic'),
          hit('3', 200, 'magic'),
          hit('4', 200, 'magic'),
        ],
      }),
    );
    expect(result.perInstance.map((i) => i.final)).toEqual([170, 170, 170, 200]);
    expect(result.runningTotal.map((p) => p.total)).toEqual([170, 340, 510, 710]);
    expect(result.burst.total).toBe(710);
  });

  it('honours a sequence joined two instances in', () => {
    // instancesAlreadyResolved = 2, so the first PLANNED instance is the third delivered and
    // is still inside the 1..3 window; the second planned instance is the fourth and is not.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        defenderReductions: [bonePlating],
        instancesAlreadyResolved: 2,
        instances: [hit('1', 200, 'magic'), hit('2', 200, 'magic')],
      }),
    );
    expect(result.perInstance.map((i) => i.final)).toEqual([170, 200]);
  });

  it('does not let a NON-DAMAGING ability consume a place in the window', () => {
    // SPECIFICATION §3.4: a non-damaging ability "occupies a position in the sequence".
    // It occupies a position, but Bone Plating counts instances of DAMAGE, so the window
    // here is spent by the two damaging instances and the third is unreduced.
    //   position 1 non-damaging  -> 0
    //   position 2 damaging (1st) -> 200 - 30 = 170
    //   position 3 damaging (2nd) -> 200 - 30 = 170
    const narrowWindow = { label: 'two only', flat: 30, firstInstance: 1, lastInstance: 2 };
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        defenderReductions: [narrowWindow],
        instances: [
          {
            stepId: 'w',
            sourceLabel: 'W (no damage)',
            instanceType: 'non-damaging-ability',
            verification: 'no-damage',
          },
          hit('q', 200, 'magic'),
          hit('e', 200, 'magic'),
        ],
      }),
    );
    expect(result.perInstance.map((i) => i.final)).toEqual([0, 170, 170]);
    // The positions still advance — the non-damaging ability is instance 1 of the sequence.
    expect(result.perInstance.map((i) => i.stateSnapshot.instanceNumber)).toEqual([1, 2, 3]);
  });
});

// =========================================================================================
// AN INCOMPLETE ABILITY CONTRIBUTES NO DAMAGE (SPECIFICATION §8)
// =========================================================================================

describe('runCombo — an incomplete ability contributes nothing and is named', () => {
  const result = runCombo(
    plan({
      defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
      instances: [
        hit('a', 200, 'magic'),
        hit('b', 500, 'magic', {
          sourceLabel: 'W — unresolved armor owner',
          verification: 'incomplete',
          incompleteReason: {
            kind: 'permanent',
            missingFacts: [
              { field: 'components[0].ratios[0].owner (armor)', why: 'the source never says whose' },
            ],
          },
        }),
        hit('c', 200, 'magic'),
      ],
    }),
  );

  it('zeroes the incomplete instance rather than guessing at it', () => {
    expect(result.perInstance.map((i) => i.final)).toEqual([200, 0, 200]);
    expect(result.perInstance[1].raw).toBe(0);
  });

  it('leaves the incomplete damage out of the burst total', () => {
    // 200 + 200 = 400. The 500 the ability would have dealt is absent, not wrong.
    expect(result.burst.total).toBe(400);
  });

  it('names it as an excluded contributor with a permanent reason', () => {
    expect(result.incompleteContributors).toEqual([
      {
        sourceLabel: 'W — unresolved armor owner',
        reason: {
          kind: 'permanent',
          missingFacts: [
            { field: 'components[0].ratios[0].owner (armor)', why: 'the source never says whose' },
          ],
        },
      },
    ]);
  });

  it('reports the worst status of the combo as incomplete', () => {
    expect(result.verificationSummary).toBe('incomplete');
  });
});

describe('runCombo — a component the evaluator cannot resolve is refused, not estimated', () => {
  it('zeroes an instance whose ratio reads a stat the evaluator is not given', () => {
    // A ratio on the caster's MAXIMUM MANA. The frozen `StatBlock` carries no mana at all, so
    // there is no honest figure to read and the instance is refused by name.
    //
    // THIS CASE USED TO BE A RATIO ON THE TARGET'S MAXIMUM HEALTH, and it was changed when the
    // engine learned to resolve one — NOT to make a failing engine pass. The guarantee this
    // test exists for is unchanged and is still asserted below: a component the evaluator
    // cannot resolve contributes NOTHING and is named, rather than being estimated. What moved
    // is which components are in that set, and the new members of the resolvable set are pinned
    // by their own known-answer tests in component-owned-stats.test.ts and
    // combo-modifiers.test.ts.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        instances: [
          {
            stepId: 'r',
            sourceLabel: 'R — percentage of the caster’s mana',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'r-c',
                  damageType: 'magic',
                  base: flat(100),
                  ratios: [{ stat: 'maxMana', owner: 'caster', scaling: 'linear', from: 20, to: 20 }],
                }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0].final).toBe(0);
    expect(result.perInstance[0].verification).toBe('incomplete');
    expect(result.perInstance[0].incompleteReason?.kind).toBe('pending');
    expect(result.incompleteContributors).toHaveLength(1);
  });
});

// =========================================================================================
// ALTERNATIVE COMPONENTS ARE NEVER SUMMED (data.ts, ComponentRelation)
// =========================================================================================

describe('runCombo — alternative components', () => {
  const blade = component({ id: 'blade', damageType: 'physical', base: flat(100) });
  const handle = component({
    id: 'handle',
    damageType: 'physical',
    base: flat(50),
    relation: { kind: 'alternativeTo', componentId: 'blade' },
  });

  function withChoice(chosen?: string[]) {
    return runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 5000, maxHp: 5000 }),
        instances: [
          {
            stepId: 'q',
            sourceLabel: 'Q — blade or handle',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [blade, handle],
              rank: 1,
              maxRank: 5,
              chosenComponentIds: chosen,
            },
          },
        ],
      }),
    );
  }

  it('refuses to resolve the instance when no choice between them was stated', () => {
    // Summing them would give 150 — the exact "plausible wrong number" data.ts warns about
    // ("summing them would hand Aatrox six casts' worth of Q damage").
    const result = withChoice(undefined);
    expect(result.perInstance[0].final).toBe(0);
    expect(result.perInstance[0].verification).toBe('incomplete');
  });

  it('resolves 100 when the blade is chosen and 50 when the handle is', () => {
    expect(withChoice(['blade']).perInstance[0].final).toBe(100);
    expect(withChoice(['handle']).perInstance[0].final).toBe(50);
  });
});

describe('runCombo — an instance whose components disagree about damage type', () => {
  it('is REPORTED AS MIXED, each type meeting its own resistance', () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, and the change is a contract change rather than an
    // engine failing a test. `InstanceResult.damageType` carried three values and now carries
    // five: 'mixed' and 'none' were added on 2026-08-13 (DATA-SOURCES §41, gap 3) precisely so
    // the 13 abilities that deal two types in one cast could stop being refused. The old
    // comment here said "RAISED TO THE LEAD"; this is the lead's answer.
    //
    // Defender: 100 armor, 50 magic resistance.
    //   physical 100 x 100/200 = 50
    //   magic    100 x 100/150 = 66.666...
    //   applied                = 116.666... -> 117
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 100, magicResist: 50, hp: 5000, maxHp: 5000 }),
        instances: [
          {
            stepId: 'q',
            sourceLabel: 'Q — mixed',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({ id: 'p', damageType: 'physical', base: flat(100) }),
                component({ id: 'm', damageType: 'magic', base: flat(100) }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0].damageType).toBe('mixed');
    expect(result.perInstance[0].final).toBe(117);
    expect(result.perInstance[0].byType).toEqual({ physical: 50, magic: 67, true: 0 });
    expect(result.perInstance[0].verification).toBe('derived');
    expect(result.incompleteContributors).toEqual([]);
  });
});

// =========================================================================================
// VARIABLE HIT COUNTS, THROUGH THE RUNNER (data.ts VariableHitCount, DATA-SOURCES §38)
// =========================================================================================

describe('runCombo — a variable hit count stated by the user', () => {
  function withCount(stated?: number) {
    return runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        instances: [
          {
            stepId: 'e',
            sourceLabel: 'E — mines',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'mine',
                  damageType: 'magic',
                  base: flat(100),
                  variableHits: {
                    kind: 'repeatsAtReducedRate',
                    rate: 0.4,
                    maxAdditional: 10,
                    sourceSays: 'hand-authored fixture, not from any data file',
                  },
                }),
              ],
              rank: 1,
              maxRank: 5,
              hitCounts: stated === undefined ? undefined : { mine: stated },
            },
          },
        ],
      }),
    );
  }

  it('deals 100 when no count is stated — the minimum, one full instance', () => {
    // The default is the minimum and may not be raised (scenario.ts). 100 x 1 = 100.
    expect(withCount(undefined).perInstance[0].final).toBe(100);
  });

  it('deals 220 for three additional repeats at 40%', () => {
    // multiplier = 1 + 3 x 0.4 = 2.2 ; 100 x 2.2 = 220.
    // This differs from the default answer, so the assertion cannot pass for an engine that
    // ignores the stated count.
    expect(withCount(3).perInstance[0].final).toBe(220);
  });

  it('deals 100 for a count of zero — one full instance, no repeats', () => {
    expect(withCount(0).perInstance[0].final).toBe(100);
  });
});

// =========================================================================================
// CRITICAL STRIKE (SPECIFICATION §3.7)
// =========================================================================================

describe('runCombo — a critical instance', () => {
  function withCrit(crit: boolean, critDamage: number) {
    return runCombo(
      plan({
        attacker: statBlock({ critDamage }),
        defender: statBlock({ armor: 0, hp: 5000, maxHp: 5000 }),
        instances: [
          {
            stepId: 'aa',
            sourceLabel: 'basic attack',
            instanceType: 'basic-attack',
            verification: 'derived',
            damage: {
              components: [component({ id: 'aa-c', damageType: 'physical', base: flat(200) })],
              rank: 1,
              maxRank: 1,
              crit,
            },
          },
        ],
      }),
    );
  }

  it('deals 200 without a crit and 490 with one at 245% crit damage', () => {
    // Base crit damage is 200% since V26.01; 35% + 10% of item bonus takes it to 245%.
    // 200 x 2.45 = 490.
    expect(withCrit(false, 2.45).perInstance[0].final).toBe(200);
    expect(withCrit(true, 2.45).perInstance[0].final).toBe(490);
    expect(withCrit(true, 2.45).perInstance[0].crit).toBe(true);
  });

  it('doubles at the base 200% multiplier', () => {
    expect(withCrit(true, 2).perInstance[0].final).toBe(400);
  });
});

// =========================================================================================
// DAMAGE OVER TIME IS NEVER FOLDED INTO BURST, AND THE VERDICT IS GIVEN TWICE (§3.8)
// =========================================================================================

describe('runCombo — damage over time', () => {
  // Defender 500 health, 0 magic resistance.
  // Burst: one instance of 400 raw magic -> 400.
  // DoT: 200 raw magic over its full duration -> 200.
  const result = runCombo(
    plan({
      defender: statBlock({ magicResist: 0, hp: 500, maxHp: 500 }),
      instances: [
        hit('q', 400, 'magic', {
          instanceType: 'dot-application',
          dot: {
            label: 'Q — burn',
            verification: 'derived',
            damage: {
              components: [component({ id: 'burn', damageType: 'magic', base: flat(200) })],
              rank: 1,
              maxRank: 5,
            },
          },
        }),
      ],
    }),
  );

  it('keeps the burst total at 400 — the 200 of DoT is not in it', () => {
    expect(result.burst.total).toBe(400);
    expect(result.burst.byType.magic).toBe(400);
  });

  it('reports the DoT on its own line as a full-duration total of 200', () => {
    expect(result.dot.total).toBe(200);
    expect(result.dot.byType.magic).toBe(200);
    expect(result.dot.sources).toHaveLength(1);
    expect(result.dot.sources[0].label).toBe('Q — burn');
  });

  it('gives the survival verdict twice: survives the burst, dies to burst plus DoT', () => {
    expect(result.verdict.burstOnly.damageApplied).toBe(400);
    expect(result.verdict.burstOnly.lethal).toBe(false);
    expect(result.verdict.burstOnly.remainingHp).toBe(100);

    expect(result.verdict.burstPlusDot.damageApplied).toBe(600);
    expect(result.verdict.burstPlusDot.lethal).toBe(true);
    expect(result.verdict.burstPlusDot.remainingHp).toBe(0);
  });

  it('never claims an instance number for a kill that needed the DoT', () => {
    // A DoT is delivered "following the combo" (§3.8) and is not an instance, so there is no
    // instance to point at. The burst reached 400 against 500 health and nothing in the combo
    // killed; the burn did.
    expect(result.verdict.burstPlusDot.lethal).toBe(true);
    expect(result.verdict.burstPlusDot.lethalAtInstance).toBeNull();
  });

  it('DOES name the instance when the burst alone already killed', () => {
    // The paired case, without which the assertion above is true even for an engine that
    // never names an instance at all.
    // Defender 300 health. Two instances of 200 raw magic against 0 magic resistance:
    // after instance 1, 200 < 300; after instance 2, 400 >= 300. A 100-damage burn follows.
    const killed = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 300, maxHp: 300 }),
        instances: [
          hit('1', 200, 'magic', {
            dot: {
              label: 'burn',
              verification: 'derived',
              damage: {
                components: [component({ id: 'b', damageType: 'magic', base: flat(100) })],
                rank: 1,
                maxRank: 5,
              },
            },
          }),
          hit('2', 200, 'magic'),
        ],
      }),
    );
    expect(killed.verdict.burstOnly.lethalAtInstance).toBe(2);
    expect(killed.verdict.burstPlusDot.lethalAtInstance).toBe(2);
    expect(killed.verdict.burstPlusDot.damageApplied).toBe(500);
  });
});

describe('runCombo — the survival verdict names the instance that kills', () => {
  it('reports instance 2 for a 300-health defender under three 200-damage instances', () => {
    // after instance 1: 200 < 300 ; after instance 2: 400 >= 300.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 300, maxHp: 300 }),
        instances: [hit('1', 200, 'magic'), hit('2', 200, 'magic'), hit('3', 200, 'magic')],
      }),
    );
    expect(result.verdict.burstOnly.lethalAtInstance).toBe(2);
    expect(result.verdict.burstOnly.lethal).toBe(true);
    expect(result.verdict.burstOnly.damageApplied).toBe(600);
    expect(result.verdict.burstOnly.remainingHp).toBe(0);
  });
});

// =========================================================================================
// THE TWO CATEGORIES OF ENTRY STATE, THROUGH THE RUNNER (SPECIFICATION §3.3)
// =========================================================================================

describe('runCombo — persistent accumulations and combat state stay separate', () => {
  const attacker = championConfig({
    persistent: { veigarStacks: 120 },
    entryState: { conquerorStacks: 2 },
  });
  const result = runCombo(
    plan({
      scenario: scenario({ attacker }),
      defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
      instances: [
        hit('1', 100, 'magic', {
          effects: [
            { kind: 'add-counter', side: 'attacker', counter: 'conquerorStacks', amount: 2, max: 12 },
          ],
        }),
        hit('2', 100, 'magic', {
          effects: [
            { kind: 'add-counter', side: 'attacker', counter: 'conquerorStacks', amount: 2, max: 12 },
          ],
        }),
      ],
    }),
  );

  it('grows the combat counter from its seeded 2 to 4 across the sequence', () => {
    // Instance 1 meets the seeded 2; instance 2 meets 2 + 2 = 4.
    expect(result.perInstance.map((i) => i.stateSnapshot['attacker.conquerorStacks'])).toEqual([
      2, 4,
    ]);
  });

  it('leaves the persistent accumulation at 120 for every instance', () => {
    // §3.3: persistent accumulations "do not change during a combo".
    expect(
      result.perInstance.map((i) => i.stateSnapshot['attacker.persistent.veigarStacks']),
    ).toEqual([120, 120]);
  });

  it('does not let the persistent value leak into the combat counters', () => {
    expect(result.perInstance[0].stateSnapshot['attacker.veigarStacks']).toBeUndefined();
  });
});

// =========================================================================================
// ROUNDING — one point, applied only at the reporting boundary (SPECIFICATION §3.7)
// =========================================================================================

describe('runCombo — rounding is applied at the reporting boundary only', () => {
  it('reports a burst total of 504 where the rounded per-instance figures add to 505', () => {
    // The same shred sequence as the headline case:
    //   unrounded 150 + 166.666... + 187.5 = 504.1666... -> 504
    //   rounded   150 + 167       + 188    = 505
    // The engine never feeds a rounded number back into arithmetic (rounding.ts), so the
    // total is rounded ONCE from the unrounded sum. This test exists so the one-point
    // difference is a recorded, deliberate behaviour rather than a surprise.
    // RAISED TO THE LEAD: a user adding the column up gets 505, not 504.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 100, hp: 2000, maxHp: 2000 }),
        instances: [
          hit('one', 300, 'physical', { effects: [shredArmor('shred', 20)] }),
          hit('two', 300, 'physical', { effects: [shredArmor('shred', 20)] }),
          hit('three', 300, 'physical', { effects: [shredArmor('shred', 20)] }),
        ],
      }),
    );
    const sumOfDisplayedFigures = result.perInstance.reduce((sum, i) => sum + i.final, 0);
    expect(sumOfDisplayedFigures).toBe(505);
    expect(result.burst.total).toBe(504);
  });
});

// =========================================================================================
// THE ENGINE STATES WHAT IT DOES NOT MODEL (SPECIFICATION §11)
// =========================================================================================

describe('runCombo — excluded mechanics', () => {
  it("carries the engine's own exclusions plus anything the caller adds", () => {
    const result = runCombo(
      plan({
        instances: [hit('q', 100, 'magic')],
        excludedMechanics: ['Zhonyas stasis'],
      }),
    );
    for (const exclusion of ENGINE_EXCLUSIONS) {
      expect(result.excludedMechanics).toContain(exclusion);
    }
    expect(result.excludedMechanics).toContain('Zhonyas stasis');
  });

  it('names where an UNPLACEABLE heal sits, which is the only assumption left in the model', () => {
    // This assertion has narrowed twice, each time because the mechanic behind it got modelled:
    // pre-mitigation flat reduction, then sustain itself. What is left is not "not built yet"
    // but "the source does not say, and the reading we chose is the generous one".
    const result = runCombo(plan({ instances: [hit('q', 100, 'magic')] }));
    expect(result.excludedMechanics.join(' | ')).toMatch(/available from the START/i);
  });
});

describe('runCombo — the echoed contract fields', () => {
  it('echoes the patch, the scenario and both stat blocks', () => {
    const attackerStats = statBlock({ level: 11, abilityPower: 300 });
    const defenderStats = statBlock({ armor: 80, hp: 2400, maxHp: 2400 });
    const s = scenario();
    const result = runCombo(
      plan({
        patch: '26.16',
        scenario: s,
        attacker: attackerStats,
        defender: defenderStats,
        instances: [hit('q', 100, 'magic')],
      }),
    );
    expect(result.patch).toBe('26.16');
    expect(result.scenario).toBe(s);
    expect(result.attackerStats).toBe(attackerStats);
    expect(result.defenderStats).toBe(defenderStats);
    expect(result.perInstance[0].index).toBe(1);
    expect(result.perInstance[0].stepId).toBe('q');
  });

  it('returns an empty result for an empty combo without inventing a status', () => {
    const result = runCombo(plan({ instances: [] }));
    expect(result.perInstance).toEqual([]);
    expect(result.runningTotal).toEqual([]);
    expect(result.burst.total).toBe(0);
    expect(result.dot.total).toBe(0);
    expect(result.verificationSummary).toBe('no-damage');
  });
});

// =========================================================================================
// WHAT THE CONTRACT PASS OF 2026-08-13 RELEASED (DATA-SOURCES §42)
//
// Three fields the engine had raised and worked around. Each test below is the behaviour that
// was IMPOSSIBLE before the field existed, run through the whole runner rather than through the
// component evaluator alone — because the gap was never in the arithmetic, it was in what the
// stat block and the Result could carry.
// =========================================================================================

describe('runCombo — a bonus-health ratio resolves, because the stat block now splits maxHp', () => {
  it('reads 10% of the CASTER’s 800 bonus health', () => {
    // 100 flat + (10 / 100) x 800 bonus health = 180 raw, against 0 armor.
    // Before `maxHpBase`/`maxHpBonus` this instance contributed NOTHING and was listed as
    // incomplete: bonus health is maximum minus the champion's own base at that level, and a
    // total carries neither term.
    const result = runCombo(
      plan({
        attacker: statBlock({ maxHp: 2010, maxHpBonus: 800, hp: 2010 }),
        defender: statBlock({ armor: 0, hp: 5000, maxHp: 5000 }),
        instances: [
          {
            stepId: 'q',
            sourceLabel: 'Q — scales on bonus health',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'c',
                  damageType: 'physical',
                  base: flat(100),
                  ratios: [{ stat: 'bonusHP', owner: 'caster', scaling: 'linear', from: 10, to: 10 }],
                }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0]!.final).toBe(180);
    expect(result.incompleteContributors).toEqual([]);
  });

  it('still REFUSES a mana ratio, because the stat block carries mana only where it is mana', () => {
    // Not a regression — the honest state. `mp_base` in the wiki module holds whatever the
    // champion's resource is, and 19 of its 175 entries state a NON-MANA resource with a
    // non-zero value, so a pool alone cannot be read as mana. Absent produces a NAMED refusal.
    const result = runCombo(
      plan({
        attacker: statBlock({ maxHp: 2010 }),
        defender: statBlock({ armor: 0, hp: 5000, maxHp: 5000 }),
        instances: [
          {
            stepId: 'q',
            sourceLabel: 'Q — scales on maximum mana',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'c',
                  damageType: 'magic',
                  base: flat(100),
                  ratios: [{ stat: 'maxMana', owner: 'caster', scaling: 'linear', from: 4, to: 4 }],
                }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0]!.final).toBe(0);
    expect(result.incompleteContributors).toHaveLength(1);
  });

  it('resolves a mana ratio once the stat block carries mana — the Ryze Q shape', () => {
    // 4% of 1000 maximum mana = 40, plus 100 flat. The paired test: without it the refusal above
    // would pass for an engine that refused every mana ratio unconditionally.
    const result = runCombo(
      plan({
        attacker: statBlock({ maxHp: 2010, mana: 640, maxMana: 1000 }),
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        instances: [
          {
            stepId: 'q',
            sourceLabel: 'Q — scales on maximum mana',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'c',
                  damageType: 'magic',
                  base: flat(100),
                  ratios: [{ stat: 'maxMana', owner: 'caster', scaling: 'linear', from: 4, to: 4 }],
                }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0]!.final).toBe(140);
    expect(result.incompleteContributors).toEqual([]);
  });
});

describe('runCombo — the Result has a sustain line, and reports zero from ZERO sources', () => {
  it('reports an EMPTY sustain line when the plan states none', () => {
    // An empty `sources` list is what distinguishes "nothing was computed" from "we computed
    // that nothing was restored".
    const result = runCombo(plan({ instances: [hit('q', 300, 'physical')] }));
    expect(result.sustain).toEqual({ attackerHealing: 0, defenderHealing: 0, sources: [] });
  });

  it('nets defender healing into BOTH verdicts rather than adding a third', () => {
    // §3.8 fixes the verdict count at two, so healing is a TERM inside each. With none, every
    // figure reduces to the arithmetic the engine has always produced.
    const result = runCombo(plan({ instances: [hit('q', 300, 'physical')] }));
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(result.verdict.burstPlusDot.healingApplied).toBe(0);
    expect(Object.keys(result.verdict)).toEqual(['burstOnly', 'burstPlusDot']);
  });
});

// =========================================================================================
// HEALING IN THE SEQUENCE (2026-08-14; DATA-SOURCES §45)
//
// The rule that matters most here is negative: A HEAL THAT ARRIVES AFTER THE KILL CANNOT
// RESURRECT. Healing used to be added in one lump before the first instance, which got exactly
// that case wrong, and it is the case a user would never spot in a total.
// =========================================================================================

describe('runCombo — placed healing resolves at its own instance', () => {
  const heal = (amount: number, restoresTo: 'attacker' | 'defender' = 'defender') => ({
    label: `heal ${amount}`,
    kind: 'heal' as const,
    restoresTo,
    amount,
    verification: 'derived' as const,
  });

  it('nets a heal placed mid-combo into the verdict and reports it on the sustain line', () => {
    // 1000 health, three 300s = 900 damage, and 200 healed after the first. 1000 - 900 + 200 = 300.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 1000, maxHp: 2000 }),
        instances: [
          { ...hit('q', 300, 'physical'), sustain: [heal(200)] },
          hit('w', 300, 'physical'),
          hit('e', 300, 'physical'),
        ],
      }),
    );
    expect(result.verdict.burstOnly.lethal).toBe(false);
    expect(result.verdict.burstOnly.remainingHp).toBe(300);
    expect(result.verdict.burstOnly.healingApplied).toBe(200);
    expect(result.sustain.defenderHealing).toBe(200);
    expect(result.sustain.sources[0]!.fromInstance).toBe(1);
  });

  it('DOES NOT RESURRECT: a heal placed after the crossing is not counted at all', () => {
    // The same 200 heal, moved to the LAST instance. The defender is dead at instance 3 and the
    // heal never happens. Under the old lump-sum model this scenario "survived" on 300 health —
    // a defender reported alive who died two instances earlier.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 700, maxHp: 2000 }),
        instances: [
          hit('q', 300, 'physical'),
          hit('w', 300, 'physical'),
          hit('e', 300, 'physical'),
          { ...hit('r', 300, 'physical'), sustain: [heal(200)] },
        ],
      }),
    );
    expect(result.verdict.burstOnly.lethal).toBe(true);
    expect(result.verdict.burstOnly.lethalAtInstance).toBe(3);
    expect(result.verdict.burstOnly.remainingHp).toBe(0);
    // The healing is REPORTED on the sustain line, because the source states it — but none of it
    // entered the verdict, because the defender was already dead when it would have landed.
    expect(result.sustain.defenderHealing).toBe(200);
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
  });

  it('the same heal one instance EARLIER does buy an instance — the paired case', () => {
    // Without this, the test above would pass for an engine that ignored healing entirely.
    // 700 health, 250 healed after instance 2, four 300s:
    //   inst1  700 - 300 = 400
    //   inst2  400 - 300 = 100, then +250 = 350
    //   inst3  350 - 300 =  50   (dead here without the heal)
    //   inst4   50 - 300 = -250  LETHAL
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 700, maxHp: 2000 }),
        instances: [
          hit('q', 300, 'physical'),
          { ...hit('w', 300, 'physical'), sustain: [heal(250)] },
          hit('e', 300, 'physical'),
          hit('r', 300, 'physical'),
        ],
      }),
    );
    expect(result.verdict.burstOnly.lethalAtInstance).toBe(4);
    expect(result.verdict.burstOnly.healingApplied).toBe(250);
  });

  it('treats health reaching EXACTLY zero as lethal, healed or not', () => {
    // The boundary, pinned because it is the one a heal is most likely to sit on. 700 + 200
    // healed against 900 damage leaves exactly 0, and 0 health is dead — the same rule the
    // unhealed walk has always used ("cumulative >= health"), applied to the healed pool.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 700, maxHp: 2000 }),
        instances: [
          hit('q', 300, 'physical'),
          { ...hit('w', 300, 'physical'), sustain: [heal(200)] },
          hit('e', 300, 'physical'),
        ],
      }),
    );
    expect(result.verdict.burstOnly.lethalAtInstance).toBe(3);
    expect(result.verdict.burstOnly.remainingHp).toBe(0);
  });

  it('caps a heal at maximum health, so overhealing never inflates the verdict', () => {
    // 900 of 1000, healed for 400: only 100 fits. `healingApplied` states what counted.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 900, maxHp: 1000 }),
        instances: [{ ...hit('q', 100, 'physical'), sustain: [heal(400)] }],
      }),
    );
    expect(result.verdict.burstOnly.remainingHp).toBe(1000);
    expect(result.verdict.burstOnly.healingApplied).toBe(200);
    // NEVER more health remaining than the champion can hold.
    expect(result.verdict.burstOnly.remainingHp).toBeLessThanOrEqual(1000);
    // The source still states its full figure; the waste is the difference, and the interface
    // shows it rather than the engine hiding it.
    expect(result.sustain.defenderHealing).toBe(400);
  });

  it('keeps ATTACKER sustain out of the verdict entirely', () => {
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 400, maxHp: 2000 }),
        instances: [{ ...hit('q', 500, 'physical'), sustain: [heal(1000, 'attacker')] }],
      }),
    );
    expect(result.sustain.attackerHealing).toBe(1000);
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(result.verdict.burstOnly.lethal).toBe(true);
  });

  it('an INCOMPLETE sustain source restores nothing, exactly as incomplete damage deals none', () => {
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 400, maxHp: 2000 }),
        instances: [
          {
            ...hit('q', 500, 'physical'),
            sustain: [
              {
                ...heal(1000),
                verification: 'incomplete' as const,
                incompleteReason: { kind: 'pending' as const, note: 'a hand-authored probe' },
              },
            ],
          },
        ],
      }),
    );
    expect(result.sustain.sources[0]!.amount).toBe(0);
    expect(result.verdict.burstOnly.lethal).toBe(true);
  });

  it('treats UNPLACED healing as available from the start, and says so', () => {
    // No instance owns it, so there is nowhere honest to put it. Available from the start is the
    // reading most generous to the defender — it says "this kills" less often.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 700, maxHp: 2000 }),
        unplacedSustain: [heal(300)],
        instances: [hit('q', 500, 'physical'), hit('w', 400, 'physical')],
      }),
    );
    expect(result.verdict.burstOnly.lethal).toBe(false);
    expect(result.verdict.burstOnly.remainingHp).toBe(100);
    expect(result.sustain.sources[0]!.fromInstance).toBeNull();
    expect(result.excludedMechanics.join(' ')).toMatch(/available from the START/i);
  });

  it('lets the DoT line kill a defender the burst left alive after healing', () => {
    // Nothing heals after the trailing line: §3.8 puts DoT "following the combo", and there is
    // no instance left to carry a heal.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, magicResist: 0, hp: 500, maxHp: 2000 }),
        instances: [
          { ...hit('q', 400, 'physical'), sustain: [heal(200)] },
          {
            stepId: 'burn',
            sourceLabel: 'burn',
            instanceType: 'dot-application',
            verification: 'derived',
            dot: {
              label: 'burn',
              verification: 'derived',
              damage: {
                components: [component({ id: 'burn-c', damageType: 'magic', base: flat(400) })],
                rank: 1,
                maxRank: 5,
              },
            },
          },
        ],
      }),
    );
    expect(result.verdict.burstOnly.lethal).toBe(false);
    expect(result.verdict.burstOnly.remainingHp).toBe(300);
    expect(result.verdict.burstPlusDot.lethal).toBe(true);
    expect(result.verdict.burstPlusDot.lethalAtInstance).toBeNull();
  });
});
