// KNOWN-ANSWER TESTS FOR THE MECHANICS THE RUNNER USED TO NAME IN `ENGINE_EXCLUSIONS` AND NOT
// MODEL: pre-mitigation flat reduction, percentage BONUS armor penetration, damage
// amplification of both kinds, shields of all three kinds, execute thresholds inside the
// sequence, and ratios that read a health pool, a resistance or a stack counter.
//
// Each is tested THROUGH `runCombo`, because each of them only means anything in a sequence:
// the shield that instance 1 broke is the shield instance 2 does not meet, and the missing
// health instance 2 scales on is the health instance 1 removed.
//
// SOURCES, all quoted where they are used below:
//   pre-mitigation flat reduction  https://wiki.leagueoflegends.com/en-us/Damage_modifier
//   percentage bonus armor pen     https://wiki.leagueoflegends.com/en-us/Armor_penetration
//   amplification, both kinds      https://wiki.leagueoflegends.com/en-us/Damage_modifier
//   shields                        https://wiki.leagueoflegends.com/en-us/Shield
//   executes                       https://wiki.leagueoflegends.com/en-us/Kill  (execute.ts)
// All read on 2026-08-13 except the Kill article, read 2026-08-12 and recorded in execute.ts.
//
// No data file is read. Every number is hand-chosen so the arithmetic can be done on paper.

import { describe, it, expect } from 'vitest';
import { runCombo, type ComboPlan, type PlannedInstance } from './combo';
import { championConfig, component, flat, scenario, statBlock } from './fixtures';

function plan(opts: Partial<ComboPlan> & { instances: PlannedInstance[] }): ComboPlan {
  return {
    patch: '26.16',
    scenario: scenario(),
    attacker: statBlock(),
    defender: statBlock(),
    ...opts,
  };
}

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

// =========================================================================================
// PRE-MITIGATION FLAT DAMAGE REDUCTION (Fizz Nimble Fighter, Amumu Tantrum, Guardian's Horn)
// =========================================================================================

describe('runCombo — flat damage reduction applied BEFORE resistances', () => {
  // The wiki lists these four effects under "Flat Damage Reduction > Pre-mitigation": Fizz's
  // Nimble Fighter, Leona's Eclipse, Amumu's Tantrum, and Guardian's Horn. Being pre-mitigation
  // makes them WEAKER the more resistance the defender has, which is the opposite of the
  // post-mitigation kind: "Some flat damage reductions are factored in after armor or magic
  // resistance. This makes it significantly better the more resistances you have."
  //
  // Defender: 100 armor, so the multiplier is 0.5. Pre-mitigation reduction of 40.
  //   raw                          300
  //   pre-mitigation reduction     300 - 40 = 260
  //   resistances                  260 x 0.5 = 130
  // Applied POST-mitigation instead it would be 300 x 0.5 - 40 = 110, so the two orders are 20
  // points apart and this assertion tells them apart.
  const result = runCombo(
    plan({
      defender: statBlock({ armor: 100, hp: 5000, maxHp: 5000 }),
      defenderPreMitigationReductions: [{ label: "Guardian's Horn", flat: 40 }],
      instances: [hit('q', 300, 'physical')],
    }),
  );

  it('reports the reduced figure in its own checkpoint, between raw and resistances', () => {
    expect(result.perInstance[0].raw).toBe(300);
    expect(result.perInstance[0].afterPreMitigationReduction).toBe(260);
    expect(result.perInstance[0].afterResistances).toBeCloseTo(130, 9);
    expect(result.perInstance[0].final).toBe(130);
  });

  it('is not the post-mitigation answer', () => {
    expect(result.perInstance[0].final).not.toBe(110);
  });

  it('does not apply to true damage', () => {
    // "Flat damage reduction does not work against true damage" — the same sentence governs
    // both the pre- and post-mitigation kinds, and it is the only one on the page.
    const trueDamage = runCombo(
      plan({
        defender: statBlock({ armor: 100, hp: 5000, maxHp: 5000 }),
        defenderPreMitigationReductions: [{ label: "Guardian's Horn", flat: 40 }],
        instances: [hit('r', 300, 'true')],
      }),
    );
    expect(trueDamage.perInstance[0].afterPreMitigationReduction).toBe(300);
    expect(trueDamage.perInstance[0].final).toBe(300);
  });

  it('sums across sources and never turns damage into healing', () => {
    // Two sources of 40 and 500 against a 300 raw hit: 300 - 540 floors at 0, not -240.
    const floored = runCombo(
      plan({
        defender: statBlock({ armor: 0, hp: 5000, maxHp: 5000 }),
        defenderPreMitigationReductions: [
          { label: 'a', flat: 40 },
          { label: 'b', flat: 500 },
        ],
        instances: [hit('q', 300, 'physical')],
      }),
    );
    expect(floored.perInstance[0].afterPreMitigationReduction).toBe(0);
    expect(floored.perInstance[0].final).toBe(0);
  });
});

// =========================================================================================
// PERCENTAGE **BONUS** ARMOR PENETRATION (SPECIFICATION §3.6; wiki, Armor penetration)
// =========================================================================================

describe('runCombo — percentage bonus armor penetration reads the base/bonus split', () => {
  // Defender: 200 armor, of which 100 is base and 100 is bonus.
  // Attacker: 50% BONUS armor penetration, and no ordinary penetration at all.
  //   step 3   base 100 untouched ; bonus 100 x 0.5 = 50 ; total 150
  //   300 physical x 100/250 = 120
  // Against the same 200 armor with no penetration it would be 300 x 100/300 = 100, and with an
  // ordinary 50% penetration it would be 300 x 100/200 = 150. 120 is neither.
  const result = runCombo(
    plan({
      attacker: statBlock({
        penetration: {
          flatArmor: 0,
          percentArmor: 0,
          percentBonusArmor: 0.5,
          flatMagic: 0,
          percentMagic: 0,
        },
      }),
      defender: statBlock({ armor: 200, armorBase: 100, armorBonus: 100, hp: 5000, maxHp: 5000 }),
      instances: [hit('q', 300, 'physical')],
    }),
  );

  it('penetrates the bonus half alone, giving 120', () => {
    expect(result.perInstance[0].resistanceSteps?.afterPercentPenetration).toBeCloseTo(150, 9);
    expect(result.perInstance[0].final).toBe(120);
    expect(result.perInstance[0].final).not.toBe(100);
    expect(result.perInstance[0].final).not.toBe(150);
  });

  it('does nothing at all against a defender whose armor is entirely base', () => {
    // The wiki: "a target with any amount of base armor and no bonus armor will be considered
    // as having the same value."
    const allBase = runCombo(
      plan({
        attacker: statBlock({
          penetration: {
            flatArmor: 0,
            percentArmor: 0,
            percentBonusArmor: 0.5,
            flatMagic: 0,
            percentMagic: 0,
          },
        }),
        defender: statBlock({ armor: 200, armorBase: 200, armorBonus: 0, hp: 5000, maxHp: 5000 }),
        instances: [hit('q', 300, 'physical')],
      }),
    );
    expect(allBase.perInstance[0].final).toBe(100);
  });
});

// =========================================================================================
// DAMAGE AMPLIFICATION — additive on the attacker, multiplicative on the defender (§3.7)
// =========================================================================================

describe('runCombo — the attacker\'s amplifiers stack additively', () => {
  it('turns 200 raw magic into 270 under +20% and +15%', () => {
    // "The raw value ... is increased ... All damage modifiers stack additively."
    //   200 x (1 + 0.20 + 0.15) = 200 x 1.35 = 270
    // Multiplicatively it would be 200 x 1.2 x 1.15 = 276.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        attackerAmplifiers: [
          { label: 'a', percent: 0.2 },
          { label: 'b', percent: 0.15 },
        ],
        instances: [hit('q', 200, 'magic')],
      }),
    );
    expect(result.perInstance[0].raw).toBeCloseTo(270, 9);
    expect(result.perInstance[0].final).toBe(270);
    expect(result.perInstance[0].final).not.toBe(276);
  });

  it('applies an instance\'s own amplifier alongside the sequence-wide ones', () => {
    // 200 x (1 + 0.20 + 0.30) = 300 for the amplified instance; the other meets only the 20%.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        attackerAmplifiers: [{ label: 'sequence-wide', percent: 0.2 }],
        instances: [
          hit('q', 200, 'magic', { amplifiers: [{ label: 'this cast only', percent: 0.3 }] }),
          hit('w', 200, 'magic'),
        ],
      }),
    );
    expect(result.perInstance.map((i) => i.final)).toEqual([300, 240]);
  });

  it('amplifies before mitigation, not after', () => {
    // Defender 100 armor. 200 raw physical with a +50% amplifier:
    //   before mitigation : 200 x 1.5 = 300 ; 300 x 0.5 = 150
    //   after mitigation  : 200 x 0.5 = 100 ; 100 x 1.5 = 150
    // Those agree, so a multiplier alone cannot tell the two apart. A PRE-mitigation flat
    // reduction of 100 sitting between them can:
    //   engine  : 200 x 1.5 = 300 ; 300 - 100 = 200 ; 200 x 0.5 = 100
    //   the other way : (200 - 100) x 0.5 x 1.5 = 75
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 100, hp: 5000, maxHp: 5000 }),
        defenderPreMitigationReductions: [{ label: 'pre', flat: 100 }],
        attackerAmplifiers: [{ label: 'amp', percent: 0.5 }],
        instances: [hit('q', 200, 'physical')],
      }),
    );
    expect(result.perInstance[0].raw).toBeCloseTo(300, 9);
    expect(result.perInstance[0].afterPreMitigationReduction).toBeCloseTo(200, 9);
    expect(result.perInstance[0].final).toBe(100);
    expect(result.perInstance[0].final).not.toBe(75);
  });
});

describe('runCombo — the defender\'s received modifiers stack multiplicatively', () => {
  it('turns 200 magic into 276 under +20% and +15% taken', () => {
    // "Damage reduction from armor and magic resistance and from any other sources stack
    //  multiplicatively." 200 x 1.2 x 1.15 = 276. Additively it would be 270.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        defenderReceivedModifiers: [
          { label: 'takes 20% more', percent: 0.2 },
          { label: 'takes 15% more', percent: 0.15 },
        ],
        instances: [hit('q', 200, 'magic')],
      }),
    );
    expect(result.perInstance[0].final).toBe(276);
    expect(result.perInstance[0].final).not.toBe(270);
  });

  it('combines with the attacker\'s side, each by its own rule', () => {
    //   raw           200 x (1 + 0.35) = 270      additive, attacker
    //   resistances   0 magic resistance -> 270
    //   received      270 x 1.2 x 1.15 = 372.6    multiplicative, defender
    //   rounded                          373
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        attackerAmplifiers: [
          { label: 'a', percent: 0.2 },
          { label: 'b', percent: 0.15 },
        ],
        defenderReceivedModifiers: [
          { label: 'c', percent: 0.2 },
          { label: 'd', percent: 0.15 },
        ],
        instances: [hit('q', 200, 'magic')],
      }),
    );
    expect(result.perInstance[0].afterReductions).toBeCloseTo(372.6, 9);
    expect(result.perInstance[0].final).toBe(373);
  });

  it('applies a received modifier before post-mitigation flat reduction', () => {
    // The engine's disclosed convention is percentage first, then flat (ENGINE_EXCLUSIONS), and
    // a received modifier is a percentage. 200 x 1.5 = 300 ; 300 - 30 = 270.
    // Flat first would be (200 - 30) x 1.5 = 255.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 5000, maxHp: 5000 }),
        defenderReceivedModifiers: [{ label: 'takes 50% more', percent: 0.5 }],
        defenderReductions: [{ label: 'Bone Plating', flat: 30 }],
        instances: [hit('q', 200, 'magic')],
      }),
    );
    expect(result.perInstance[0].final).toBe(270);
    expect(result.perInstance[0].final).not.toBe(255);
  });
});

// =========================================================================================
// SHIELDS, ACROSS A SEQUENCE (SPECIFICATION §3.7)
// =========================================================================================

describe('runCombo — a shield absorbs, breaks, and stays broken', () => {
  // Defender: 1000 health, no resistances, one 250-point general shield.
  //   instance 1  200 magic -> 200 absorbed, 0 applied, 50 of shield left
  //   instance 2  200 magic ->  50 absorbed, 150 applied, shield gone
  //   instance 3  200 magic ->   0 absorbed, 200 applied
  // Burst 350 of a possible 600, and the defender is left on 650.
  const result = runCombo(
    plan({
      defender: statBlock({ magicResist: 0, hp: 1000, maxHp: 1000 }),
      defenderShields: [{ label: 'Barrier', kind: 'general', remaining: 250 }],
      instances: [hit('1', 200, 'magic'), hit('2', 200, 'magic'), hit('3', 200, 'magic')],
    }),
  );

  it('applies 0, 150 and 200 to health', () => {
    expect(result.perInstance.map((i) => i.final)).toEqual([0, 150, 200]);
  });

  it('totals 350 of burst, not the 600 that was dealt', () => {
    expect(result.burst.total).toBe(350);
    expect(result.verdict.burstOnly.remainingHp).toBe(650);
  });

  it('still reports the full 200 the ability dealt at each earlier checkpoint', () => {
    // The shield changed what reached health; it did not change what the ability did. A user
    // reading the row can see both.
    expect(result.perInstance[0].raw).toBe(200);
    expect(result.perInstance[0].afterReductions).toBe(200);
    expect(result.perInstance[0].final).toBe(0);
  });

  it('shows the shield each instance MET, and what it took', () => {
    expect(result.perInstance.map((i) => i.stateSnapshot.defenderShieldRemaining)).toEqual([
      250, 50, 0,
    ]);
    expect(result.perInstance.map((i) => i.stateSnapshot.shieldAbsorbed)).toEqual([200, 50, 0]);
  });
});

describe('runCombo — the three kinds of shield against the three damage types', () => {
  it('lets physical through a magic shield and stops magic with it', () => {
    // A 500-point MAGIC shield. 200 physical passes untouched; 200 magic is absorbed whole.
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, magicResist: 0, hp: 2000, maxHp: 2000 }),
        defenderShields: [{ label: 'Black Shield', kind: 'magic', remaining: 500 }],
        instances: [hit('p', 200, 'physical'), hit('m', 200, 'magic')],
      }),
    );
    expect(result.perInstance.map((i) => i.final)).toEqual([200, 0]);
  });

  it('absorbs TRUE damage with a general shield, which no flat reduction can touch', () => {
    // The distinction that makes a shield not a damage reduction: "Normal shields ... absorb
    // all types of damage (physical, magic and true)", while "flat damage reduction does not
    // work against true damage".
    const result = runCombo(
      plan({
        defender: statBlock({ hp: 2000, maxHp: 2000 }),
        defenderShields: [{ label: 'Barrier', kind: 'general', remaining: 500 }],
        defenderReductions: [{ label: 'Bone Plating', flat: 30 }],
        instances: [hit('t', 200, 'true')],
      }),
    );
    expect(result.perInstance[0].afterReductions).toBe(200); // the flat 30 did not apply
    expect(result.perInstance[0].final).toBe(0); // the shield did
  });

  it('splits a MIXED instance across a type-specific shield correctly', () => {
    // A 100-point PHYSICAL shield against one instance of 200 physical + 200 magic, no
    // resistances: the shield eats 100 of the physical half and none of the magic half.
    //   physical 200 - 100 = 100 ; magic 200 ; applied 300
    const result = runCombo(
      plan({
        defender: statBlock({ armor: 0, magicResist: 0, hp: 2000, maxHp: 2000 }),
        defenderShields: [{ label: 'Armored Advance', kind: 'physical', remaining: 100 }],
        instances: [
          {
            stepId: 'w',
            sourceLabel: 'W — mixed',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({ id: 'p', damageType: 'physical', base: flat(200) }),
                component({ id: 'm', damageType: 'magic', base: flat(200) }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0].byType).toEqual({ physical: 100, magic: 200, true: 0 });
    expect(result.perInstance[0].final).toBe(300);
  });
});

// =========================================================================================
// EXECUTE THRESHOLDS, INSIDE THE SEQUENCE (SPECIFICATION §3.7)
// =========================================================================================

describe('runCombo — an execute threshold resolves against the health the sequence left', () => {
  // execute.ts, from https://wiki.leagueoflegends.com/en-us/Kill (read 2026-08-12):
  //   "An execute is the process of killing a unit by dealing 100% of their CURRENT health
  //    through the raw damage source type."
  //   "Most forms of executes only occur if the unit is BELOW a specific health threshold."
  //
  // Defender: 1000 maximum health, entering the fight on 300 (a "moment in time", §3.3).
  //   instance 1  200 magic          -> health 300 - 200 = 100
  //   instance 2  50 magic, executing below 150 health.
  //               Health as it resolves is 100, which is below 150, so the target dies:
  //               the instance delivers 100 — their whole remaining health — not its own 50.
  //   burst 200 + 100 = 300, exactly the health they had.
  // Without the execute the combo deals 250 and the defender lives on 50.
  const executing = runCombo(
    plan({
      defender: statBlock({ magicResist: 0, hp: 300, maxHp: 1000 }),
      instances: [
        hit('1', 200, 'magic'),
        hit('2', 50, 'magic', { execute: { label: 'R — execute', thresholdHealth: 150 } }),
      ],
    }),
  );

  it('delivers the target\'s remaining health instead of its own smaller figure', () => {
    expect(executing.perInstance[1].final).toBe(100);
    expect(executing.burst.total).toBe(300);
  });

  it('kills, and names the instance that did it', () => {
    expect(executing.verdict.burstOnly.lethal).toBe(true);
    expect(executing.verdict.burstOnly.lethalAtInstance).toBe(2);
    expect(executing.verdict.burstOnly.remainingHp).toBe(0);
  });

  it('records the execute in the instance\'s state snapshot', () => {
    expect(executing.perInstance[1].stateSnapshot.executed).toBe(true);
    expect(executing.perInstance[1].stateSnapshot.executeThreshold).toBe(150);
    expect(executing.perInstance[0].stateSnapshot.executed).toBeUndefined();
  });

  it('does NOT fire while the target is above the threshold', () => {
    // The same ability, first in the combo. Health as it resolves is 300, which is not below
    // 150, so it deals its own 50 and the defender survives on 250.
    const notExecuting = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 300, maxHp: 1000 }),
        instances: [hit('1', 50, 'magic', { execute: { label: 'R', thresholdHealth: 150 } })],
      }),
    );
    expect(notExecuting.perInstance[0].final).toBe(50);
    expect(notExecuting.perInstance[0].stateSnapshot.executed).toBe(false);
    expect(notExecuting.verdict.burstOnly.lethal).toBe(false);
  });

  it('does not fire on a target sitting EXACTLY on the threshold', () => {
    // execute.ts: "the wiki's wording is 'below', so a target sitting exactly ON the threshold
    // is not executed". A figure that turns on this boundary is `derived`, never `verified`.
    const onTheLine = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 150, maxHp: 1000 }),
        instances: [hit('1', 50, 'magic', { execute: { label: 'R', thresholdHealth: 150 } })],
      }),
    );
    expect(onTheLine.perInstance[0].final).toBe(50);
  });

  it('keeps its own damage when that is already larger than the health remaining', () => {
    // 400 of damage into a target on 100 health, executing below 150: the target dies either
    // way and the overkill is left visible rather than trimmed to 100.
    const overkill = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 100, maxHp: 1000 }),
        instances: [hit('1', 400, 'magic', { execute: { label: 'R', thresholdHealth: 150 } })],
      }),
    );
    expect(overkill.perInstance[0].final).toBe(400);
  });

  it('DESTROYS shields, so the next instance meets none', () => {
    // https://wiki.leagueoflegends.com/en-us/Shield (read 2026-08-13): "Some effects fully
    // destroy any shields before applying their damage: ... Executes".
    //
    // THIS TEST WAS STRENGTHENED AFTER A DELIBERATE-BREAK RUN FOUND IT COULD NOT FAIL. It used
    // to assert only that the execute delivered 100 through a 500-point shield — but the
    // execute path never offers its damage to the shields at all, so "destroyed" and merely
    // "bypassed" gave the same number and an engine that did neither passed. Destruction is
    // only visible to a LATER instance, so the sequence now has one.
    //
    // Defender: 1000 maximum health, on 100, behind a 500-point shield.
    //   instance 1  executes below 150: delivers the 100 they had, and destroys the shield
    //   instance 2  200 magic, meeting no shield at all -> 200
    // Had the shield merely been bypassed it would still hold 500, and instance 2 would apply 0.
    const shielded = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 100, maxHp: 1000 }),
        defenderShields: [{ label: 'Barrier', kind: 'general', remaining: 500 }],
        instances: [
          hit('1', 50, 'magic', { execute: { label: 'R', thresholdHealth: 150 } }),
          hit('2', 200, 'magic'),
        ],
      }),
    );
    expect(shielded.perInstance.map((i) => i.final)).toEqual([100, 200]);
    expect(shielded.perInstance.map((i) => i.stateSnapshot.defenderShieldRemaining)).toEqual([
      500, 0,
    ]);
    expect(shielded.verdict.burstOnly.lethal).toBe(true);
    expect(shielded.verdict.burstOnly.lethalAtInstance).toBe(1);
  });

  it('is REFUSED on a mixed instance rather than being attributed to a guessed type', () => {
    // An execute delivers the target's remaining health, and a result must say which type that
    // damage was. On a physical + magic instance nothing states which, and splitting it by
    // proportion would be inventing an attribution. RAISED TO THE LEAD.
    const refused = runCombo(
      plan({
        defender: statBlock({ armor: 0, magicResist: 0, hp: 100, maxHp: 1000 }),
        instances: [
          {
            stepId: 'w',
            sourceLabel: 'W — mixed with an execute',
            instanceType: 'damaging-ability',
            verification: 'derived',
            execute: { label: 'execute', thresholdHealth: 150 },
            damage: {
              components: [
                component({ id: 'p', damageType: 'physical', base: flat(50) }),
                component({ id: 'm', damageType: 'magic', base: flat(50) }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(refused.perInstance[0].final).toBe(0);
    expect(refused.perInstance[0].verification).toBe('incomplete');
    expect(refused.incompleteContributors[0].reason.note).toMatch(/execute/i);
  });
});

// =========================================================================================
// RATIOS THAT READ A HEALTH POOL, A RESISTANCE, OR A STACK COUNTER (§3.3, §3.7)
// =========================================================================================

describe('runCombo — a ratio on the target\'s maximum health', () => {
  it('adds 10% of the defender\'s 2000 maximum health to a base of 100', () => {
    // 100 + (10/100) x 2000 = 300, against 0 resistances.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 2000, maxHp: 2000 }),
        instances: [
          {
            stepId: 'r',
            sourceLabel: 'R — percentage of target health',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'r-c',
                  damageType: 'magic',
                  base: flat(100),
                  ratios: [{ stat: 'maxHP', owner: 'target', scaling: 'linear', from: 10, to: 10 }],
                }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0].final).toBe(300);
    expect(result.perInstance[0].verification).toBe('derived');
  });
});

describe('runCombo — a ratio on MISSING health reads the health the sequence has left', () => {
  it('deals nothing on a full-health target and 100 after 200 has landed', () => {
    // SPECIFICATION §3.1: "Each instance resolves against the state produced by all preceding
    // instances." Defender 1000 health, no resistances.
    //   instance 1  50% of missing health, and nothing is missing -> 0
    //   instance 2  200 flat                                       -> 200 (health now 800)
    //   instance 3  50% of missing health, 200 missing             -> 100
    // An engine reading the ENTRY health for all three would give 0, 200, 0.
    const missingHealthHit = (stepId: string): PlannedInstance => ({
      stepId,
      sourceLabel: stepId,
      instanceType: 'damaging-ability',
      verification: 'derived',
      damage: {
        components: [
          component({
            id: `${stepId}-c`,
            damageType: 'magic',
            base: flat(0),
            ratios: [{ stat: 'missingHP', owner: 'target', scaling: 'linear', from: 50, to: 50 }],
          }),
        ],
        rank: 1,
        maxRank: 5,
      },
    });
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 1000, maxHp: 1000 }),
        instances: [missingHealthHit('1'), hit('2', 200, 'magic'), missingHealthHit('3')],
      }),
    );
    expect(result.perInstance.map((i) => i.final)).toEqual([0, 200, 100]);
    expect(result.burst.total).toBe(300);
  });
});

describe('runCombo — a ratio on the caster\'s armor and on the target\'s resistance', () => {
  it('reads the caster\'s 100 armor, not the defender\'s 40', () => {
    // 15% of the CASTER's armor (the Malphite W shape, DATA-SOURCES §16): 100 x 0.15 = 15,
    // plus a base of 85 = 100 raw. Against the defender's 40 magic resistance:
    //   100 x 100/140 = 71.428... -> 71
    // Read off the defender's armor instead it would be 85 + 6 = 91 raw -> 65.
    const result = runCombo(
      plan({
        attacker: statBlock({ armor: 100 }),
        defender: statBlock({ armor: 40, magicResist: 40, hp: 2000, maxHp: 2000 }),
        instances: [
          {
            stepId: 'w',
            sourceLabel: 'W — scales with the caster\'s armor',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'w-c',
                  damageType: 'magic',
                  base: flat(85),
                  ratios: [{ stat: 'armor', owner: 'caster', scaling: 'linear', from: 15, to: 15 }],
                }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0].raw).toBeCloseTo(100, 9);
    expect(result.perInstance[0].final).toBe(71);
  });
});

describe('runCombo — a ratio on a persistent stack counter (§3.3)', () => {
  it('reads the count the user entered up front', () => {
    // The attacker enters with 25 stacks. The ratio is 100 percentage points of the counter —
    // one point of damage per stack — so 30 base + 25 = 55, against 0 magic resistance.
    const result = runCombo(
      plan({
        scenario: scenario({ attacker: championConfig({ persistent: { nasusQ: 25 } }) }),
        defender: statBlock({ magicResist: 0, hp: 2000, maxHp: 2000 }),
        instances: [
          {
            stepId: 'q',
            sourceLabel: 'Q — stacking',
            instanceType: 'empowered-attack',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'q-c',
                  damageType: 'magic',
                  base: flat(30),
                  ratios: [
                    { stat: 'stacks', counter: 'nasusQ', scaling: 'linear', from: 100, to: 100 },
                  ],
                }),
              ],
              rank: 1,
              maxRank: 5,
            },
          },
        ],
      }),
    );
    expect(result.perInstance[0].final).toBe(55);
  });

  it('refuses an instance whose counter the scenario never stated', () => {
    // Absent and zero are different claims (component.ts). The instance is named as incomplete
    // rather than quietly dealing 30.
    const result = runCombo(
      plan({
        scenario: scenario({ attacker: championConfig({ persistent: {} }) }),
        defender: statBlock({ magicResist: 0, hp: 2000, maxHp: 2000 }),
        instances: [
          {
            stepId: 'q',
            sourceLabel: 'Q — stacking',
            instanceType: 'empowered-attack',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'q-c',
                  damageType: 'magic',
                  base: flat(30),
                  ratios: [
                    { stat: 'stacks', counter: 'nasusQ', scaling: 'linear', from: 100, to: 100 },
                  ],
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
    expect(result.incompleteContributors[0].reason.note).toMatch(/nasusQ/);
  });
});

describe('runCombo — a ratio the source never attributed is still refused', () => {
  it('names the ability rather than picking a champion for it', () => {
    // data.ts, RatioOwner: "'unresolved' ... means the source names a health pool and does not
    // say whose", and no amount of context can settle it.
    const result = runCombo(
      plan({
        defender: statBlock({ magicResist: 0, hp: 2000, maxHp: 2000 }),
        instances: [
          {
            stepId: 'w',
            sourceLabel: 'W — unattributed armor ratio',
            instanceType: 'damaging-ability',
            verification: 'derived',
            damage: {
              components: [
                component({
                  id: 'w-c',
                  damageType: 'magic',
                  base: flat(100),
                  ratios: [
                    { stat: 'armor', owner: 'unresolved', scaling: 'linear', from: 15, to: 15 },
                  ],
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
  });
});

// =========================================================================================
// THE EXCLUSION LIST SHRINKS ONLY WHEN SOMETHING IS ACTUALLY MODELLED (SPECIFICATION §11)
// =========================================================================================

describe('runCombo — what the engine now says it does NOT model', () => {
  const result = runCombo(plan({ instances: [hit('q', 100, 'magic')] }));
  const exclusions = result.excludedMechanics.join(' | ');

  it('no longer claims shields, amplification or execute thresholds are unmodelled', () => {
    // Compared against the exact strings the list used to carry, so this cannot pass merely
    // because the wording drifted.
    expect(result.excludedMechanics).not.toContain('Shields, of any of the three kinds');
    expect(result.excludedMechanics).not.toContain('Damage amplification, additive or multiplicative');
    expect(result.excludedMechanics).not.toContain('Execute thresholds');
  });

  it('still names lifesteal and healing, which the Result has no field for', () => {
    expect(exclusions).toMatch(/lifesteal|life steal/i);
  });

  it('still names mana ratios, which the stat block has no field for', () => {
    expect(exclusions).toMatch(/mana/i);
  });
});
