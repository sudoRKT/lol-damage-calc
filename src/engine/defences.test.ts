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
