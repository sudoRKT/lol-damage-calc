// THE DEFENDER'S OWN KIT, END TO END — from a stored entry and a toggle to a changed number.
//
// Every test here runs the PUBLIC entry point, `simulate(scenario, catalogue)`, because the thing
// being tested is the wiring: `resolveDefences` could be perfect and the plan still not carry its
// output. A test that called `resolveDefences` directly would pass in exactly that case.
//
// No champion, item, ability or defensive entry below is a real one. Round numbers are used
// throughout so an expected figure is arithmetic a reader can do on paper: a defender with 0 armor
// and 0 magic resistance takes damage unmitigated, so every figure below is the raw damage minus
// exactly the defence under test.

import { describe, expect, it } from 'vitest';
import type { CuratedDefensiveEffect, DefensiveKind, Result, Scenario } from '../types';
import { defensiveToggleKey } from '../types';
import { simulate, type SimulationResult } from './simulate';
import { defenceIsUp, resolveDefences } from './defences';
import {
  championConfig,
  comboStep,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  scenario as makeScenario,
  statBlock,
} from './fixtures';

// ---------------------------------------------------------------------------------------
// The fixture world
// ---------------------------------------------------------------------------------------

const ATTACKER = 'Striker';
const DEFENDER = 'Warden';

/** A stored defensive entry. Every field a test does not care about is left off. */
function defence(parts: Partial<CuratedDefensiveEffect> & { kind: DefensiveKind }): CuratedDefensiveEffect {
  return {
    champion: DEFENDER,
    slot: 'W',
    abilityName: 'Guard',
    activation: 'conditional',
    verification: 'derived',
    provenance: { source: 'hand-authored engine fixture', patch: 'fixture' },
    ...parts,
  } as CuratedDefensiveEffect;
}

/** The scenario every test uses: one 200-damage ability against a defender with no resistances. */
function run(
  effects: CuratedDefensiveEffect[],
  entryState: Record<string, number | boolean> = {},
  opts: { damage?: number; damageType?: 'physical' | 'magic' | 'true'; casts?: number } = {},
): SimulationResult {
  const damage = opts.damage ?? 200;
  const casts = opts.casts ?? 1;
  const combo = Array.from({ length: casts }, (_, i) => comboStep(`s${i + 1}`, { ref: 'Q' }));
  const scenario: Scenario = makeScenario({
    attacker: championConfig({ apiname: ATTACKER, level: 1 }),
    defender: championConfig({ apiname: DEFENDER, level: 1, entryState }),
    combo,
  });
  return simulate(
    scenario,
    fixtureCatalogue({
      champions: [fixtureChampion({ apiname: ATTACKER }), fixtureChampion({ apiname: DEFENDER })],
      abilities: [
        fixtureAbility({
          champion: ATTACKER,
          slot: 'Q',
          damageType: opts.damageType ?? 'physical',
          perRank: [damage, damage, damage, damage, damage],
        }),
        // The DEFENDER's own ability, which is where the defensive entry's rank count comes from.
        fixtureAbility({ champion: DEFENDER, slot: 'W', abilityName: 'Guard', perRank: [0, 0, 0, 0, 0] }),
      ],
      defensiveEffects: effects,
    }),
  );
}

/** The Result, or a failure naming the refusals — a refused scenario is never silently skipped. */
function resultOf(outcome: SimulationResult): Result {
  if (!outcome.ok) throw new Error(`scenario refused: ${JSON.stringify(outcome.refusals)}`);
  return outcome.result;
}

/**
 * A defender who has already lost half their health.
 *
 * Every healing test needs one. Unplaced healing is available from the START of the verdict's
 * walk, and the engine does not let a defender heal past maximum — so a defender at full health
 * counts zero healing however large the heal is, and a test written against a full-health
 * defender would assert 0 for every case and prove nothing.
 */
const HALF_HEALTH = { currentHp: 500 } as const;

/** Whether any stated exclusion mentions this fragment. */
function excluded(result: Result, fragment: string): boolean {
  return result.excludedMechanics.some((line) => line.includes(fragment));
}

/**
 * The refusal sentence for the ONE defensive entry a scenario switched on.
 *
 * `excludedMechanics` carries two different things: the standing disclosures every result gets
 * (`SIMULATION_EXCLUSIONS`) and the per-entry refusals this file produces. Searching the whole
 * list for a phrase cannot tell them apart — and a standing disclosure about recurring defences
 * happens to contain the phrase "one occurrence or the whole duration", so an assertion written
 * that way passes whether or not the entry was refused for that reason. This narrows to the
 * refusal line, and fails loudly if the scenario produced none or more than one.
 */
function soleRefusal(result: Result): string {
  const lines = result.excludedMechanics.filter((l) =>
    l.includes('was switched on and was NOT applied'),
  );
  if (lines.length !== 1) {
    throw new Error(`expected exactly one refusal, got ${lines.length}: ${JSON.stringify(lines)}`);
  }
  return lines[0]!;
}

const SHIELD_60 = defence({
  kind: 'shield',
  label: 'Shield Strength',
  unit: 'flat',
  value: { scaling: 'explicit', perRank: [60, 60, 60, 60, 60] },
});

// ---------------------------------------------------------------------------------------

describe('absent means not up', () => {
  it('a stored shield with no toggle in the scenario absorbs nothing', () => {
    const result = resultOf(run([SHIELD_60]));
    expect(result.burst.total).toBe(200);
  });

  it('a toggle set to false absorbs nothing — false is a statement, not an absence', () => {
    const result = resultOf(run([SHIELD_60], { [defensiveToggleKey(SHIELD_60)]: false }));
    expect(result.burst.total).toBe(200);
  });

  it('a toggle set to a number does not switch a defence on', () => {
    // `entryState` also carries stack counts, so a numeric value under a defence key is a
    // different kind of fact. Only boolean true means "the defence was up".
    const result = resultOf(run([SHIELD_60], { [defensiveToggleKey(SHIELD_60)]: 1 }));
    expect(result.burst.total).toBe(200);
  });

  it("a 'not-stated' activation is never up, even with its key set to true", () => {
    const entry = defence({ ...SHIELD_60, activation: 'not-stated', condition: 'a distance' });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(200);
  });

  it("an 'always-active' defence applies with no toggle at all", () => {
    const entry = defence({ ...SHIELD_60, activation: 'always-active' });
    expect(defenceIsUp(entry, championConfig())).toBe(true);
    const result = resultOf(run([entry]));
    expect(result.burst.total).toBe(140);
  });
});

describe('the toggle key is the contract’s key', () => {
  it('the key the engine fires on is the one defensiveToggleKey returns', () => {
    const key = defensiveToggleKey(SHIELD_60);
    const result = resultOf(run([SHIELD_60], { [key]: true }));
    expect(result.burst.total).toBe(140);
  });

  it('a key built by hand from the same fields, missing the label, does NOT fire', () => {
    // The seam this guards: two areas deriving "the same" key from the same fields, both suites
    // green, and the toggle silently never firing. `(slot, kind)` alone collides on 24 stored
    // entries, which is why the label is in the key at all.
    const plausible = `d.${SHIELD_60.slot}.${SHIELD_60.kind}`;
    expect(plausible).not.toBe(defensiveToggleKey(SHIELD_60));
    const result = resultOf(run([SHIELD_60], { [plausible]: true }));
    expect(result.burst.total).toBe(200);
  });

  it('two shields on one slot get different keys and can be switched on separately', () => {
    const first = defence({ ...SHIELD_60, id: 'first' });
    const second = defence({
      kind: 'shield',
      id: 'second',
      label: 'Second Shield',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [30, 30, 30, 30, 30] },
    });
    expect(defensiveToggleKey(first)).not.toBe(defensiveToggleKey(second));
    const onlySecond = resultOf(run([first, second], { [defensiveToggleKey(second)]: true }));
    expect(onlySecond.burst.total).toBe(170);
    const both = resultOf(
      run([first, second], {
        [defensiveToggleKey(first)]: true,
        [defensiveToggleKey(second)]: true,
      }),
    );
    expect(both.burst.total).toBe(110);
  });
});

describe('shields', () => {
  it('a flat shield absorbs its own strength and no more', () => {
    const result = resultOf(run([SHIELD_60], { [defensiveToggleKey(SHIELD_60)]: true }));
    expect(result.burst.total).toBe(140);
    expect(result.perInstance[0]!.stateSnapshot['shieldAbsorbed']).toBe(60);
    expect(result.perInstance[0]!.stateSnapshot['defenderShieldRemaining']).toBe(60);
  });

  it('a shield is spent once across the whole combo, not per instance', () => {
    const result = resultOf(run([SHIELD_60], { [defensiveToggleKey(SHIELD_60)]: true }, { casts: 2 }));
    expect(result.burst.total).toBe(340);
    expect(result.perInstance[1]!.stateSnapshot['shieldAbsorbed']).toBe(0);
  });

  it('a magic shield does not absorb physical damage', () => {
    const magic = defence({ ...SHIELD_60, appliesToDamageType: 'magic' });
    const vsPhysical = resultOf(run([magic], { [defensiveToggleKey(magic)]: true }));
    expect(vsPhysical.burst.total).toBe(200);
    const vsMagic = resultOf(
      run([magic], { [defensiveToggleKey(magic)]: true }, { damageType: 'magic' }),
    );
    expect(vsMagic.burst.total).toBe(140);
  });

  it('a shield stated as a percentage is refused, and the refusal reaches the result', () => {
    const percent = defence({
      kind: 'shield',
      label: 'Shield Strength',
      unit: 'percent',
      value: { scaling: 'explicit', perRank: [20, 20, 20, 20, 20] },
    });
    const result = resultOf(run([percent], { [defensiveToggleKey(percent)]: true }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'Nothing states what the percentage is a share OF')).toBe(true);
  });

  it("a shield's ratio reads the DEFENDER's ability power", () => {
    const withRatio = defence({
      kind: 'shield',
      label: 'Shield Strength',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [60, 60, 60, 60, 60] },
      ratios: [{ stat: 'AP', scaling: 'explicit', perRank: [50, 50, 50, 50, 50] }],
    });
    // The fixture defender carries no items, so ability power is 0 and the ratio adds nothing.
    // What is being checked is that it RESOLVES rather than refusing: a ratio refused by name
    // would show up as a stated exclusion, and this asserts there is none.
    const result = resultOf(run([withRatio], { [defensiveToggleKey(withRatio)]: true }));
    expect(result.burst.total).toBe(140);
    expect(excluded(result, 'was switched on and was NOT applied')).toBe(false);
  });
});

describe('damage reduction', () => {
  it('a percentage reduction is applied as a fraction of the instance', () => {
    const entry = defence({
      kind: 'damage-reduction',
      label: 'Damage Reduction',
      unit: 'percent',
      value: { scaling: 'explicit', perRank: [55, 55, 55, 55, 55] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(90); // 200 × (1 − 0.55)
  });

  it('a flat reduction is points off after resistances', () => {
    const entry = defence({
      kind: 'damage-reduction',
      label: 'Minimum Damage Reduction',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [30, 30, 30, 30, 30] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(170);
  });

  it('a type-specific reduction touches only its own type', () => {
    const entry = defence({
      kind: 'type-specific-reduction',
      label: 'Physical Damage Reduction',
      appliesToDamageType: 'physical',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [30, 30, 30, 30, 30] },
    });
    const key = defensiveToggleKey(entry);
    expect(resultOf(run([entry], { [key]: true })).burst.total).toBe(170);
    expect(resultOf(run([entry], { [key]: true }, { damageType: 'magic' })).burst.total).toBe(200);
  });
});

describe('resistance grants', () => {
  it('a grant of armor raises the defender’s armor and meets the four-step order unchanged', () => {
    const entry = defence({
      kind: 'resistance-grant',
      label: 'Bonus Armor',
      grantedStat: 'armor',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [50, 50, 50, 50, 50] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    // 100 / (100 + 50) = 2/3 of 200 = 133.33…, rounded once at the total.
    expect(result.burst.total).toBe(133);
    const steps = result.perInstance[0]!.resistanceSteps!;
    // THE ORDER IS NOT TOUCHED. The grant is a stat: it lands on `starting`, and every one of the
    // four steps still runs against it in the fixed order.
    expect(steps.starting).toBe(50);
    expect(steps.afterFlatReduction).toBe(50);
    expect(steps.afterPercentReduction).toBe(50);
    expect(steps.afterPercentPenetration).toBe(50);
    expect(steps.afterFlatPenetration).toBe(50);
  });

  it('a grant of armor does not mitigate magic damage', () => {
    const entry = defence({
      kind: 'resistance-grant',
      label: 'Bonus Armor',
      grantedStat: 'armor',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [50, 50, 50, 50, 50] },
    });
    const result = resultOf(
      run([entry], { [defensiveToggleKey(entry)]: true }, { damageType: 'magic' }),
    );
    expect(result.burst.total).toBe(200);
  });

  it("grantedStat 'both' raises both resistances from one entry", () => {
    const entry = defence({
      kind: 'resistance-grant',
      label: 'Resistances',
      grantedStat: 'both',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [100, 100, 100, 100, 100] },
    });
    const key = defensiveToggleKey(entry);
    expect(resultOf(run([entry], { [key]: true })).burst.total).toBe(100);
    expect(resultOf(run([entry], { [key]: true }, { damageType: 'magic' })).burst.total).toBe(100);
  });

  it('a grant with no grantedStat is refused, and says armor and magic resistance differ', () => {
    const entry = defence({
      kind: 'resistance-grant',
      label: 'Resistances',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [50, 50, 50, 50, 50] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'says WHICH resistance it grants')).toBe(true);
  });

  it('a grant reading the defender’s OWN armor reads the figure before the grant', () => {
    // Taric W's shape: a share of the holder's own armor. Resolving it against a block that
    // already carried the grant would compound it — 20 armor plus 50% of 20 is 30, never 45.
    const entry = defence({
      kind: 'resistance-grant',
      label: 'Bonus Armor',
      grantedStat: 'armor',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [0, 0, 0, 0, 0] },
      ratios: [{ stat: 'armor', owner: 'caster', scaling: 'explicit', perRank: [50, 50, 50, 50, 50] }],
    });
    const before = statBlock({ armor: 20 });
    const resolved = resolveDefences({
      effects: [entry],
      abilities: [fixtureAbility({ champion: DEFENDER, slot: 'W', abilityName: 'Guard' })],
      config: championConfig({ entryState: { [defensiveToggleKey(entry)]: true } }),
      defender: before,
    });
    expect(resolved.resistanceGrant.armor).toBe(10);
  });
});

describe('healing', () => {
  it('a flat heal becomes unplaced sustain and is netted into the verdict', () => {
    const entry = defence({
      kind: 'heal',
      label: 'Heal',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [150, 150, 150, 150, 150] },
    });
    const result = resultOf(run([entry], { ...HALF_HEALTH, [defensiveToggleKey(entry)]: true }));
    // Healing never changes the damage dealt — it changes what the defender has left.
    expect(result.burst.total).toBe(200);
    expect(result.verdict.burstOnly.healingApplied).toBe(150);
    expect(result.sustain.defenderHealing).toBe(150);
  });

  it('life steal on the defender is refused — the defender does not act (§5)', () => {
    const entry = defence({
      kind: 'heal',
      label: 'Life Steal',
      unit: 'percent-of-damage-dealt',
      value: { scaling: 'explicit', perRank: [20, 20, 20, 20, 20] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(excluded(result, 'the defender does not act')).toBe(true);
  });

  it('a healing amplifier restores no health and says so', () => {
    const entry = defence({
      kind: 'heal',
      label: 'Increased Healing',
      unit: 'healing-multiplier',
      value: { scaling: 'explicit', perRank: [30, 30, 30, 30, 30] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(excluded(result, 'amplifies OTHER healing')).toBe(true);
  });
});

describe('what contributes nothing, and says why', () => {
  it('an entry the data calls incomplete is not applied, and its unresolvable field is named', () => {
    const entry = defence({
      ...SHIELD_60,
      verification: 'incomplete',
      unresolvable: [
        { field: 'ratios[0].owner (bonusHP)', why: 'the source names bonusHP and never says whose' },
      ],
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'ratios[0].owner (bonusHP)')).toBe(true);
    expect(excluded(result, 'never says whose')).toBe(true);
  });

  it('an incomplete entry with no recorded reason says that the reason itself is missing', () => {
    const entry = defence({ ...SHIELD_60, verification: 'incomplete' });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(excluded(result, 'records no reason')).toBe(true);
  });

  it.each<[DefensiveKind, string]>([
    ['immunity', 'skips an instance outright'],
    ['spell-shield', 'cancels one ability before it lands'],
    ['max-health-grant', 'changes the size of a health pool mid-sequence'],
  ])('a %s switched on is refused by name', (kind, fragment) => {
    const entry = defence({
      kind,
      label: 'Something',
      ...(kind === 'max-health-grant'
        ? { unit: 'flat' as const, value: { scaling: 'explicit' as const, perRank: [300, 300, 300, 300, 300] } }
        : {}),
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, fragment)).toBe(true);
  });

  it('the three unmodelled kinds are named in the exclusions of EVERY result', () => {
    const result = resultOf(run([]));
    expect(excluded(result, 'invulnerability and dodge')).toBe(true);
    expect(excluded(result, 'spell shields')).toBe(true);
    expect(excluded(result, 'grant maximum health')).toBe(true);
  });

  it('a defence that recurs over a duration is refused and quotes the source', () => {
    const entry = defence({
      ...SHIELD_60,
      overTime: { sourceSays: 'shields herself every 0.25 seconds' },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'shields herself every 0.25 seconds')).toBe(true);
    expect(excluded(result, 'states no number of occurrences')).toBe(true);
  });

  it('a defence on an ability with no point in it is refused as a build fact', () => {
    const result = resultOf(
      (() => {
        const scenario: Scenario = makeScenario({
          attacker: championConfig({ apiname: ATTACKER }),
          defender: championConfig({
            apiname: DEFENDER,
            abilityRanks: { Q: 1, W: 0, E: 1, R: 1 },
            entryState: { [defensiveToggleKey(SHIELD_60)]: true },
          }),
          combo: [comboStep('s1', { ref: 'Q' })],
        });
        return simulate(
          scenario,
          fixtureCatalogue({
            champions: [
              fixtureChampion({ apiname: ATTACKER }),
              fixtureChampion({ apiname: DEFENDER }),
            ],
            abilities: [
              fixtureAbility({ champion: ATTACKER, slot: 'Q', perRank: [200, 200, 200, 200, 200] }),
              fixtureAbility({ champion: DEFENDER, slot: 'W', abilityName: 'Guard' }),
            ],
            defensiveEffects: [SHIELD_60],
          }),
        );
      })(),
    );
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'no point has been put into W')).toBe(true);
    expect(excluded(result, "defender's build rather than a gap in our data")).toBe(true);
  });

  it("a ratio reading the TARGET is refused, naming the ambiguity rather than picking a side", () => {
    const entry = defence({
      kind: 'heal',
      label: 'Heal',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [0, 0, 0, 0, 0] },
      ratios: [{ stat: 'maxHP', owner: 'target', scaling: 'explicit', perRank: [10, 10, 10, 10, 10] }],
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(excluded(result, 'an ally being healed who is not in this scenario')).toBe(true);
  });

  it('a value whose rank list does not match the ability’s rank count is refused', () => {
    // Nidalee E is the real case: maxRank 4, with defensive rows of 5 values. The expander
    // refuses it rather than reading the fifth as though it were the fourth.
    const entry = defence({
      ...SHIELD_60,
      slot: 'E',
      value: { scaling: 'explicit', perRank: [60, 60, 60, 60, 60] },
    });
    const scenario: Scenario = makeScenario({
      attacker: championConfig({ apiname: ATTACKER }),
      defender: championConfig({
        apiname: DEFENDER,
        entryState: { [defensiveToggleKey(entry)]: true },
      }),
      combo: [comboStep('s1', { ref: 'Q' })],
    });
    const result = resultOf(
      simulate(
        scenario,
        fixtureCatalogue({
          champions: [
            fixtureChampion({ apiname: ATTACKER }),
            fixtureChampion({ apiname: DEFENDER }),
          ],
          abilities: [
            fixtureAbility({ champion: ATTACKER, slot: 'Q', perRank: [200, 200, 200, 200, 200] }),
            fixtureAbility({ champion: DEFENDER, slot: 'E', abilityName: 'Guard', maxRank: 4, perRank: [0, 0, 0, 0] }),
          ],
          defensiveEffects: [entry],
        }),
      ),
    );
    expect(result.burst.total).toBe(200);
    expect(excluded(result, '5 values but the ability has 4 ranks')).toBe(true);
  });
});

describe('one slot, two abilities', () => {
  // 57 (champion, slot) pairs across the roster hold more than one curated ability and 9 of them
  // carry a defensive entry. Nidalee's E is Primal Surge with 5 ranks AND Swipe with 4. The rank
  // count is what every stored value is expanded against, so taking the wrong ability moves every
  // figure — and it moves it silently, because both expansions succeed.
  const entry = defence({
    kind: 'shield',
    slot: 'E',
    abilityName: 'Primal Surge',
    label: 'Shield Strength',
    unit: 'flat',
    value: { scaling: 'explicit', perRank: [10, 20, 30, 40, 50] },
  });

  function withBothForms(firstIsWrongOne: boolean) {
    const primal = fixtureAbility({
      champion: DEFENDER,
      slot: 'E',
      abilityName: 'Primal Surge',
      maxRank: 5,
      perRank: [0, 0, 0, 0, 0],
    });
    const swipe = fixtureAbility({
      champion: DEFENDER,
      slot: 'E',
      abilityName: 'Swipe',
      maxRank: 4,
      perRank: [0, 0, 0, 0],
    });
    const scenario: Scenario = makeScenario({
      attacker: championConfig({ apiname: ATTACKER }),
      defender: championConfig({
        apiname: DEFENDER,
        abilityRanks: { Q: 1, W: 1, E: 5, R: 1 },
        entryState: { [defensiveToggleKey(entry)]: true },
      }),
      combo: [comboStep('s1', { ref: 'Q' })],
    });
    return simulate(
      scenario,
      fixtureCatalogue({
        champions: [fixtureChampion({ apiname: ATTACKER }), fixtureChampion({ apiname: DEFENDER })],
        abilities: [
          fixtureAbility({ champion: ATTACKER, slot: 'Q', perRank: [200, 200, 200, 200, 200] }),
          ...(firstIsWrongOne ? [swipe, primal] : [primal, swipe]),
        ],
        defensiveEffects: [entry],
      }),
    );
  }

  it('the entry is matched to the ability it NAMES, whichever was harvested first', () => {
    // Rank 5 of a 5-rank ability is 50. Had the 4-rank ability been taken, the expander would
    // have refused — and with a rank inside both ranges it would have returned a wrong number
    // instead, with nothing on screen to say so.
    expect(resultOf(withBothForms(false)).burst.total).toBe(150);
    expect(resultOf(withBothForms(true)).burst.total).toBe(150);
  });
});

describe('two alternatives cannot both apply', () => {
  const minimum = defence({
    kind: 'heal',
    id: 'minimum-heal',
    label: 'Minimum Heal',
    unit: 'flat',
    value: { scaling: 'explicit', perRank: [100, 100, 100, 100, 100] },
  });
  const maximum = defence({
    kind: 'heal',
    id: 'maximum-heal',
    label: 'Maximum Heal',
    unit: 'flat',
    value: { scaling: 'explicit', perRank: [300, 300, 300, 300, 300] },
    relation: { kind: 'alternativeTo', componentId: 'minimum-heal' },
  });

  it('the minimum alone applies', () => {
    const result = resultOf(run([minimum, maximum], { ...HALF_HEALTH, [defensiveToggleKey(minimum)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(100);
  });

  it('the maximum alone applies, and replaces nothing because nothing else is up', () => {
    const result = resultOf(run([minimum, maximum], { ...HALF_HEALTH, [defensiveToggleKey(maximum)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(300);
  });

  it('both on is refused rather than summed to 400', () => {
    const result = resultOf(
      run([minimum, maximum], {
        ...HALF_HEALTH,
        [defensiveToggleKey(minimum)]: true,
        [defensiveToggleKey(maximum)]: true,
      }),
    );
    // The one that would double-count is dropped; the base it replaces still stands.
    expect(result.verdict.burstOnly.healingApplied).toBe(100);
    expect(excluded(result, 'both are switched on')).toBe(true);
  });
});

describe('several defences at once', () => {
  it('reduction applies before the shield, and the shield absorbs what is left', () => {
    const reduction = defence({
      kind: 'damage-reduction',
      label: 'Damage Reduction',
      unit: 'percent',
      value: { scaling: 'explicit', perRank: [50, 50, 50, 50, 50] },
    });
    const result = resultOf(
      run([reduction, SHIELD_60], {
        [defensiveToggleKey(reduction)]: true,
        [defensiveToggleKey(SHIELD_60)]: true,
      }),
    );
    // 200 → 100 after the reduction → 40 after a 60-point shield.
    expect(result.burst.total).toBe(40);
  });

  it('a defence that resolves and one that does not both report — one number, one sentence', () => {
    const broken = defence({
      kind: 'resistance-grant',
      label: 'Resistances',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [50, 50, 50, 50, 50] },
    });
    const result = resultOf(
      run([SHIELD_60, broken], {
        [defensiveToggleKey(SHIELD_60)]: true,
        [defensiveToggleKey(broken)]: true,
      }),
    );
    expect(result.burst.total).toBe(140);
    expect(excluded(result, 'says WHICH resistance it grants')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// A RECURRING DEFENCE — the refusal must name the fact that is actually missing
// ---------------------------------------------------------------------------------------
//
// The refusal for a recurring defence used to end "...so no total can be formed", and that clause
// is FALSE for half the entries it fires on. Measured over `curated/curated-data.json` (patch
// 16.16.1) on 2026-08-15: 18 stored entries reach this refusal, and 9 of them store the WHOLE
// DURATION figure rather than one occurrence. Master Yi W is the clearest — "Minimum Heal Per
// Tick" is 15 at rank 1 and "Minimum Total Heal" is 120, exactly eight times it, and the source
// sentence stored on both says the channel runs 4 seconds at one tick every 0.5 seconds. A total
// can plainly be formed for that entry; it is already formed and stored.
//
// The fact that is actually missing is a different one: nothing on the entry says whether its
// figure covers ONE OCCURRENCE or the WHOLE DURATION. Only the row's label distinguishes them,
// and reading a label to decide something that multiplies a number is the move this project
// forbids — DATA-SOURCES §48.3 records a "Maximum Total Heal" where "total" means across every
// target hit rather than across a duration, so the word does not settle it.
//
// NOTHING BELOW CHANGES A NUMBER. Every one of these entries was refused before and is refused
// now; what changed is the sentence the user is shown. The tests assert the sentence, because the
// sentence is the whole deliverable.

describe('a recurring defence names the fact that is actually missing', () => {
  /** The shape 9 stored entries have: a figure that IS the whole duration, marked as recurring. */
  const WHOLE_DURATION_HEAL = defence({
    kind: 'heal',
    id: 'minimum-total-heal',
    label: 'Minimum Total Heal',
    unit: 'flat',
    value: { scaling: 'explicit', perRank: [120, 120, 120, 120, 120] },
    overTime: { sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds' },
  });

  it('the refusal does not claim that no total can be formed', () => {
    const result = resultOf(
      run([WHOLE_DURATION_HEAL], { ...HALF_HEALTH, [defensiveToggleKey(WHOLE_DURATION_HEAL)]: true }),
    );
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(excluded(result, 'no total can be formed')).toBe(false);
  });

  it('the refusal names the missing fact: one occurrence, or the whole duration', () => {
    const result = resultOf(
      run([WHOLE_DURATION_HEAL], { ...HALF_HEALTH, [defensiveToggleKey(WHOLE_DURATION_HEAL)]: true }),
    );
    // Narrowed to the entry's own refusal on 2026-08-15: the standing disclosure about recurring
    // defences carried this same phrase, so a search of the whole list proved nothing.
    expect(soleRefusal(result)).toContain('one occurrence or the whole duration');
    expect(soleRefusal(result)).toContain('channels for up to 4 seconds');
  });

  it('a stated occurrence count does not by itself release the entry', () => {
    // `overTime.totalInstances` is in the frozen contract and NO stored entry uses it (measured
    // over all 21 recurring entries, 2026-08-15). If one ever does, a count alone is still not
    // enough: multiplying a figure that is already the whole duration double-counts it.
    const counted = defence({
      ...WHOLE_DURATION_HEAL,
      overTime: {
        totalInstances: 8,
        sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
      },
    });
    const result = resultOf(run([counted], { ...HALF_HEALTH, [defensiveToggleKey(counted)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(soleRefusal(result)).toContain('one occurrence or the whole duration');
  });

  it('a stated occurrence count is quoted back, and the entry no longer says the count is absent', () => {
    const counted = defence({
      ...WHOLE_DURATION_HEAL,
      overTime: {
        totalInstances: 8,
        sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
      },
    });
    const result = resultOf(run([counted], { ...HALF_HEALTH, [defensiveToggleKey(counted)]: true }));
    expect(soleRefusal(result)).toContain('it lands 8 times');
    // The old sentence would have told the reader the source states no count while the entry
    // states one. Saying a false thing about the data is the defect this block exists for.
    expect(excluded(result, 'states no number of occurrences')).toBe(false);
  });

  it('a per-occurrence row and a whole-duration row each get their own sentence', () => {
    // Master Yi W's real shape: both rows carry `overTime`, both are switched on separately, and
    // the reader must be told about each rather than about "a defence".
    const perTick = defence({
      kind: 'heal',
      id: 'minimum-heal-per-tick',
      label: 'Minimum Heal Per Tick',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [15, 15, 15, 15, 15] },
      overTime: { sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds' },
    });
    const result = resultOf(
      run([perTick, WHOLE_DURATION_HEAL], {
        ...HALF_HEALTH,
        [defensiveToggleKey(perTick)]: true,
        [defensiveToggleKey(WHOLE_DURATION_HEAL)]: true,
      }),
    );
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(excluded(result, 'Minimum Heal Per Tick')).toBe(true);
    expect(excluded(result, 'Minimum Total Heal')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// `figureIs` — A RECURRING DEFENCE THAT SAYS WHAT ITS FIGURE MEANS
// ---------------------------------------------------------------------------------------
//
// `CuratedDefensiveEffect.overTime.figureIs` was added to the frozen contract on 2026-08-15. Its
// two values, quoted from `src/types/data.ts` lines 938–941:
//
//   'per-instance'  — the figure is one occurrence; the whole-duration total is it times
//                     `totalInstances`, and without a count the entry stays incomplete.
//   'full-duration' — the figure already covers the whole duration and must never be multiplied.
//                     A count may still be present and is then descriptive only.
//
// EVERY EXPECTED NUMBER BELOW IS THAT SENTENCE DONE BY HAND. Nothing was read back out of the
// engine: a per-occurrence figure of 15 with a stated count of 8 is 15 × 8 = 120, and a
// whole-duration figure of 120 is 120 whatever count sits beside it. Those are the two halves of
// Master Yi W, whose stored rows are 15 per tick and 120 for the channel — the pair DATA-SOURCES
// records as the proof that the distinction is real and not a pedantry.
//
// The absent case is asserted UNCHANGED in the block above and is not repeated here.

describe('figureIs: full-duration — the figure stands, and is never multiplied', () => {
  const TOTAL_HEAL = defence({
    kind: 'heal',
    id: 'minimum-total-heal',
    label: 'Minimum Total Heal',
    unit: 'flat',
    value: { scaling: 'explicit', perRank: [120, 120, 120, 120, 120] },
    overTime: {
      sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
      figureIs: 'full-duration',
    },
  });

  it('a whole-duration heal restores its stored figure', () => {
    const result = resultOf(run([TOTAL_HEAL], { ...HALF_HEALTH, [defensiveToggleKey(TOTAL_HEAL)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(120);
    expect(result.sustain.defenderHealing).toBe(120);
    // Healing never changes the damage dealt — it changes what the defender has left.
    expect(result.burst.total).toBe(200);
  });

  it('a stated count beside a whole-duration figure is DESCRIPTIVE and changes nothing', () => {
    // The failure this test exists for: 120 × 8 = 960, which would restore the channel's health
    // eight times over and is exactly the overstatement `figureIs` was added to prevent.
    const counted = defence({
      ...TOTAL_HEAL,
      overTime: {
        totalInstances: 8,
        sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
        figureIs: 'full-duration',
      },
    });
    const result = resultOf(run([counted], { ...HALF_HEALTH, [defensiveToggleKey(counted)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(120);
  });

  it('the count makes no difference at all — with and without it are the same number', () => {
    const withCount = defence({
      ...TOTAL_HEAL,
      overTime: {
        totalInstances: 8,
        sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
        figureIs: 'full-duration',
      },
    });
    const a = resultOf(run([TOTAL_HEAL], { ...HALF_HEALTH, [defensiveToggleKey(TOTAL_HEAL)]: true }));
    const b = resultOf(run([withCount], { ...HALF_HEALTH, [defensiveToggleKey(withCount)]: true }));
    expect(a.verdict.burstOnly.healingApplied).toBe(b.verdict.burstOnly.healingApplied);
  });

  it('a whole-duration shield absorbs its stored strength and no more', () => {
    const shield = defence({
      ...SHIELD_60,
      overTime: {
        totalInstances: 8,
        sourceSays: 'shields herself every 0.25 seconds',
        figureIs: 'full-duration',
      },
    });
    // 200 damage − a 60-point shield = 140. Had the count been read, 60 × 8 = 480 would have
    // absorbed the whole instance and reported 0.
    const result = resultOf(run([shield], { [defensiveToggleKey(shield)]: true }));
    expect(result.burst.total).toBe(140);
  });

  it('a whole-duration percentage reduction is applied once, not once per tick', () => {
    const reduction = defence({
      kind: 'damage-reduction',
      label: 'Damage Reduction',
      unit: 'percent',
      value: { scaling: 'explicit', perRank: [55, 55, 55, 55, 55] },
      overTime: {
        totalInstances: 8,
        sourceSays: 'reduces damage for 4 seconds',
        figureIs: 'full-duration',
      },
    });
    // 200 × (1 − 0.55) = 90. 55 × 8 = 440% is not a number that means anything.
    const result = resultOf(run([reduction], { [defensiveToggleKey(reduction)]: true }));
    expect(result.burst.total).toBe(90);
  });

  it('nothing is refused, so no exclusion sentence is produced for it', () => {
    const result = resultOf(run([TOTAL_HEAL], { ...HALF_HEALTH, [defensiveToggleKey(TOTAL_HEAL)]: true }));
    expect(excluded(result, 'was switched on and was NOT applied')).toBe(false);
  });
});

describe('figureIs: per-instance — the total is the figure times the stated count', () => {
  /** Master Yi W's per-tick row: 15 a tick, eight ticks over a 4-second channel at 0.5s each. */
  const PER_TICK_HEAL = defence({
    kind: 'heal',
    id: 'minimum-heal-per-tick',
    label: 'Minimum Heal Per Tick',
    unit: 'flat',
    // Rank-varying on purpose: rank 1 is 15, so a total of 120 can only have come from 15 × 8 and
    // not from summing the list (170) or from taking the top rank (55 × 8 = 440).
    value: { scaling: 'explicit', perRank: [15, 25, 35, 45, 55] },
    overTime: {
      totalInstances: 8,
      sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
      figureIs: 'per-instance',
    },
  });

  it('a per-occurrence heal of 15 over 8 occurrences restores 120', () => {
    const result = resultOf(run([PER_TICK_HEAL], { ...HALF_HEALTH, [defensiveToggleKey(PER_TICK_HEAL)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(120);
    expect(result.sustain.defenderHealing).toBe(120);
    expect(result.burst.total).toBe(200);
  });

  it('a count of 1 restores exactly one occurrence', () => {
    const once = defence({
      ...PER_TICK_HEAL,
      overTime: {
        totalInstances: 1,
        sourceSays: 'heals once at the end of the channel',
        figureIs: 'per-instance',
      },
    });
    const result = resultOf(run([once], { ...HALF_HEALTH, [defensiveToggleKey(once)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(15);
  });

  it("Master Yi W's two stored rows agree: 15 × 8 and 120 are the same health", () => {
    // The pair the contract cites. If the engine ever reads one of them the other way, these two
    // numbers separate by a factor of eight and this is the test that says so.
    const perTick = defence({
      kind: 'heal',
      id: 'minimum-heal-per-tick',
      label: 'Minimum Heal Per Tick',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [15, 15, 15, 15, 15] },
      overTime: {
        totalInstances: 8,
        sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
        figureIs: 'per-instance',
      },
    });
    const total = defence({
      kind: 'heal',
      id: 'minimum-total-heal',
      label: 'Minimum Total Heal',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [120, 120, 120, 120, 120] },
      overTime: {
        sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
        figureIs: 'full-duration',
      },
    });
    const a = resultOf(run([perTick], { ...HALF_HEALTH, [defensiveToggleKey(perTick)]: true }));
    const b = resultOf(run([total], { ...HALF_HEALTH, [defensiveToggleKey(total)]: true }));
    expect(a.verdict.burstOnly.healingApplied).toBe(120);
    expect(b.verdict.burstOnly.healingApplied).toBe(120);
  });

  it('without a count the entry stays incomplete and restores nothing', () => {
    const noCount = defence({
      ...PER_TICK_HEAL,
      overTime: {
        sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
        figureIs: 'per-instance',
      },
    });
    const result = resultOf(run([noCount], { ...HALF_HEALTH, [defensiveToggleKey(noCount)]: true }));
    expect(result.verdict.burstOnly.healingApplied).toBe(0);
    expect(result.burst.total).toBe(200);
  });

  it('the refusal without a count says what is missing, and no longer says the meaning is', () => {
    const noCount = defence({
      ...PER_TICK_HEAL,
      overTime: {
        sourceSays: 'channels for up to 4 seconds, healing every 0.5 seconds',
        figureIs: 'per-instance',
      },
    });
    const result = resultOf(run([noCount], { ...HALF_HEALTH, [defensiveToggleKey(noCount)]: true }));
    const refusal = soleRefusal(result);
    expect(refusal).toContain('states no number of occurrences');
    expect(refusal).toContain('channels for up to 4 seconds');
    // The entry DOES now say what its figure covers. Repeating the old sentence would tell the
    // reader something false about their own data, which is the defect the previous pass fixed.
    expect(refusal).not.toContain('one occurrence or the whole duration');
    expect(refusal).toContain('covers ONE occurrence');
  });
});

describe('per-instance is multiplied only where occurrences ADD UP', () => {
  // RAISED, AND IMPLEMENTED ON THE SAFE SIDE. The contract states the arithmetic — figure times
  // count — and that arithmetic is sound for HEALTH RESTORED, which accumulates: eight ticks of 15
  // health is 120 health and the engine's sustain model already takes a total.
  //
  // It is NOT sound for a shield, a resistance grant or a damage reduction. Those are STATES, not
  // quantities: a shield reapplied eight times is either one 60-point pool refreshed eight times or
  // a 480-point pool, and NOTHING ON THE ENTRY SAYS WHICH — the two differ by the whole count.
  // 55% reduction applied eight times is not 440%. Multiplying any of them would hand the defender
  // mitigation the source never stated, so each is refused with the ambiguity named.
  //
  // These four tests are what that decision looks like from the outside. If the decision is later
  // taken the other way, they are the tests that must be argued with.

  function perInstance(parts: Partial<CuratedDefensiveEffect> & { kind: DefensiveKind }) {
    return defence({
      ...parts,
      overTime: {
        totalInstances: 8,
        sourceSays: 'reapplies every 0.5 seconds for 4 seconds',
        figureIs: 'per-instance',
      },
    });
  }

  it('a per-occurrence SHIELD is refused rather than summed into one pool', () => {
    const entry = perInstance({
      kind: 'shield',
      label: 'Shield Strength',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [60, 60, 60, 60, 60] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    // Neither 140 (one pool) nor 0 (an eight-fold pool absorbing everything) is asserted here,
    // because neither is established. Nothing is applied and the reader is told why.
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'do not add into one whole-duration figure')).toBe(true);
    expect(excluded(result, 'reapplies every 0.5 seconds')).toBe(true);
  });

  it('a per-occurrence RESISTANCE GRANT is refused', () => {
    const entry = perInstance({
      kind: 'resistance-grant',
      label: 'Bonus Armor',
      grantedStat: 'armor',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [50, 50, 50, 50, 50] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'do not add into one whole-duration figure')).toBe(true);
  });

  it('a per-occurrence PERCENTAGE REDUCTION is refused — 55% eight times is not 440%', () => {
    const entry = perInstance({
      kind: 'damage-reduction',
      label: 'Damage Reduction',
      unit: 'percent',
      value: { scaling: 'explicit', perRank: [55, 55, 55, 55, 55] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'do not add into one whole-duration figure')).toBe(true);
  });

  it('a per-occurrence FLAT REDUCTION is refused', () => {
    const entry = perInstance({
      kind: 'damage-reduction',
      label: 'Minimum Damage Reduction',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [30, 30, 30, 30, 30] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'do not add into one whole-duration figure')).toBe(true);
  });

  it('the refusal names the factor the two readings differ by', () => {
    const entry = perInstance({
      kind: 'shield',
      label: 'Shield Strength',
      unit: 'flat',
      value: { scaling: 'explicit', perRank: [60, 60, 60, 60, 60] },
    });
    const result = resultOf(run([entry], { [defensiveToggleKey(entry)]: true }));
    expect(excluded(result, 'differ by a factor of 8')).toBe(true);
  });
});
