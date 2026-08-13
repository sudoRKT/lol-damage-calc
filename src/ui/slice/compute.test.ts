// Known-answer tests for the vertical slice's calculation.
//
// Every expected number is computed BY HAND here, from Lux's stored values and the documented
// formulas, before the code is run. The fixtures are the real stored entries.

import { describe, expect, it } from 'vitest';

import { computeSlice, evaluateStep, type SliceAttacker, type SliceDefender } from './compute.ts';
import type { CuratedAbility } from '../../types/data.ts';

const provenance = {
  source: 'test fixture',
  url: 'https://wiki.leagueoflegends.com/en-us/Lux',
  patch: '16.16.1',
  fetched: '2026-08-13',
};

/** Lux Q as stored: base 80 to 240 over 5 ranks, plus a 75% AP ratio. */
const luxQ: CuratedAbility = {
  champion: 'Lux', slot: 'Q', abilityName: 'Light Binding', maxRank: 5,
  instanceType: 'damaging-ability', verification: 'verified', provenance,
  components: [{
    id: 'magic-damage', label: 'Magic Damage', damageType: 'magic',
    base: { scaling: 'linear', from: 80, to: 240 },
    ratios: [{ stat: 'AP', scaling: 'linear', from: 75, to: 75 }],
    relation: { kind: 'adds' },
  }],
};

const luxW: CuratedAbility = {
  champion: 'Lux', slot: 'W', abilityName: 'Prismatic Barrier', maxRank: 5,
  instanceType: 'non-damaging-ability', verification: 'no-damage', provenance, components: [],
};

/** Garen, from public/data/champions/Garen.json. */
const garen: SliceDefender = {
  name: 'Garen', level: 1,
  stats: { hp_base: 690, hp_lvl: 98, arm_base: 38, arm_lvl: 4.2, mr_base: 32, mr_lvl: 1.55, ad_base: 69, ad_lvl: 4.5 },
};

const attacker: SliceAttacker = { level: 1, ranks: { Q: 1, W: 1, E: 1, R: 1 } };

describe('one instance, worked by hand', () => {
  it('Lux Q at rank 1 into Garen at level 1 is 80 raw and 60.6 after 32 magic resistance', () => {
    // Base at rank 1 of 5 = 80. Ability power is 0 in the slice, so the 75% ratio adds 0.
    // Magic resistance at level 1 = 32 base. Multiplier = 100 / (100 + 32) = 0.757575...
    // 80 x 0.757575... = 60.606..., which rounds to 61.
    const r = evaluateStep(luxQ, attacker, garen, 1);
    expect(r.damage?.raw).toBe(80);
    expect(r.damage?.afterResistances).toBeCloseTo(60.6060606, 6);
    expect(r.damage?.final).toBe(61);
    expect(r.damage?.type).toBe('magic');
  });

  it('the AP ratio is REPORTED with a zero contribution, not hidden', () => {
    // Hiding a ratio that contributes nothing would misrepresent the ability. The slice has no
    // items or runes, so ability power is zero — that is a scope fact, not a property of Lux.
    const r = evaluateStep(luxQ, attacker, garen, 1);
    expect(r.damage?.ratios).toHaveLength(1);
    expect(r.damage?.ratios[0]).toMatchObject({ stat: 'AP', percent: 75, statValue: 0, contribution: 0 });
  });

  it('Lux Q at rank 5 is 240 raw — the endpoint, not an interpolation', () => {
    const r = evaluateStep(luxQ, { ...attacker, ranks: { Q: 5, W: 1, E: 1, R: 1 } }, garen, 1);
    expect(r.damage?.raw).toBe(240);
  });

  it('a higher defender level reduces the damage through magic resistance', () => {
    // Garen MR at 18 = 32 + 1.55 x 17 = 58.35. 80 x 100/158.35 = 50.52..., rounds to 51.
    const r = evaluateStep(luxQ, attacker, { ...garen, level: 18 }, 1);
    expect(r.damage?.afterResistances).toBeCloseTo(50.5210, 3);
    expect(r.damage?.final).toBe(51);
  });
});

describe('the slice refuses rather than inventing', () => {
  it('a no-damage ability contributes nothing and says so', () => {
    const r = evaluateStep(luxW, attacker, garen, 1);
    expect(r.damage).toBeUndefined();
    expect(r.refusal?.why[0]).toContain('no damage');
  });

  it('an incomplete ability contributes NO damage — the status\'s whole meaning', () => {
    const incomplete = { ...luxQ, verification: 'incomplete' as const };
    const r = evaluateStep(incomplete, attacker, garen, 1);
    expect(r.damage).toBeUndefined();
    expect(r.refusal?.why[0]).toContain('incomplete');
  });

  it('never returns both a number and a refusal', () => {
    for (const a of [luxQ, luxW, { ...luxQ, verification: 'incomplete' as const }]) {
      const r = evaluateStep(a, attacker, garen, 1);
      expect(Boolean(r.damage) && Boolean(r.refusal)).toBe(false);
    }
  });
});

describe('the combo and the verdict', () => {
  it('runs in order, accumulates, and reports what it excluded', () => {
    const r = computeSlice([luxQ, luxW], ['Q', 'W', 'Q'], attacker, garen);
    // 61 + 0 + 61 = 122, and W is excluded with its reason rather than dropped.
    expect(r.runningTotal).toEqual([61, 61, 122]);
    expect(r.burstTotal).toBe(122);
    expect(r.excluded).toHaveLength(1);
    expect(r.excluded[0]!.label).toBe('W — Prismatic Barrier');
  });

  it("Garen's health at level 1 is 690 and the combo does not kill him", () => {
    const r = computeSlice([luxQ], ['Q', 'Q', 'Q'], attacker, garen);
    expect(r.defenderHp).toBe(690);
    expect(r.burstTotal).toBe(183); // 61 x 3
    expect(r.lethal).toBe(false);
    expect(r.remainingHp).toBe(507);
  });

  it('names the instance the kill happens on', () => {
    // Eleven casts of 61 is 671; the twelfth takes it to 732, past 690.
    const r = computeSlice([luxQ], Array.from({ length: 12 }, () => 'Q'), attacker, garen);
    expect(r.lethal).toBe(true);
    expect(r.lethalAtInstance).toBe(12);
    expect(r.remainingHp).toBe(0);
  });
});
