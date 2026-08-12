// Known-answer tests for adaptive force resolution (SPECIFICATION §3.7).
//
// The rule is not stated in the specification, so it is taken from the League wiki's
// mechanics page, read 2026-08-12:
//   https://wiki.leagueoflegends.com/en-us/Adaptive_force
//   "1 point of Adaptive Force provides 0.6 bonus AD or 1 AP."
//   Higher bonus AD -> attack damage; higher AP -> ability power.
//   "If the bonus attack damage and the ability power of the unit are equal, the stat
//    granted depends on the adaptive type of the champion."
//
// Every expected value below is that arithmetic done by hand. Nothing was obtained by
// running the engine.

import { describe, it, expect } from 'vitest';
import { resolveAdaptiveForce, ADAPTIVE_BONUS_AD_PER_POINT } from './adaptive';

describe('resolveAdaptiveForce — which stat is granted', () => {
  it('grants attack damage when bonus attack damage is higher', () => {
    // 30 adaptive force x 0.6 = 18 bonus attack damage, and no ability power.
    // The champion's own adaptive type (Magic here) is irrelevant when the two differ.
    const result = resolveAdaptiveForce(
      30,
      { bonusAttackDamage: 40, abilityPower: 20 },
      'Magic',
    );
    expect(result.granted).toBe('Physical');
    expect(result.bonusAttackDamage).toBeCloseTo(18, 9);
    expect(result.abilityPower).toBe(0);
  });

  it('grants ability power when ability power is higher', () => {
    // 30 adaptive force x 1 = 30 ability power, and no attack damage.
    const result = resolveAdaptiveForce(
      30,
      { bonusAttackDamage: 10, abilityPower: 80 },
      'Physical',
    );
    expect(result.granted).toBe('Magic');
    expect(result.bonusAttackDamage).toBe(0);
    expect(result.abilityPower).toBeCloseTo(30, 9);
  });

  it('compares BONUS attack damage, not total attack damage', () => {
    // A champion with 60 base and 5 bonus attack damage against 30 ability power takes the
    // ability power branch, because 5 < 30. Total attack damage of 65 must not be used.
    const result = resolveAdaptiveForce(
      10,
      { bonusAttackDamage: 5, abilityPower: 30 },
      'Physical',
    );
    expect(result.granted).toBe('Magic');
    expect(result.abilityPower).toBeCloseTo(10, 9);
  });
});

describe('resolveAdaptiveForce — the tie case', () => {
  it("breaks a tie toward attack damage for a Physical adaptive-type champion", () => {
    // Equal at 50/50, adaptive type Physical: 30 x 0.6 = 18 bonus attack damage.
    const result = resolveAdaptiveForce(
      30,
      { bonusAttackDamage: 50, abilityPower: 50 },
      'Physical',
    );
    expect(result.granted).toBe('Physical');
    expect(result.bonusAttackDamage).toBeCloseTo(18, 9);
    expect(result.abilityPower).toBe(0);
  });

  it("breaks a tie toward ability power for a Magic adaptive-type champion", () => {
    // Equal at 50/50, adaptive type Magic: 30 x 1 = 30 ability power.
    const result = resolveAdaptiveForce(
      30,
      { bonusAttackDamage: 50, abilityPower: 50 },
      'Magic',
    );
    expect(result.granted).toBe('Magic');
    expect(result.bonusAttackDamage).toBe(0);
    expect(result.abilityPower).toBeCloseTo(30, 9);
  });

  it('treats a champion with no bonus attack damage and no ability power as a tie', () => {
    // 0 == 0, so the adaptive type decides. Physical: 20 x 0.6 = 12 bonus attack damage.
    const result = resolveAdaptiveForce(
      20,
      { bonusAttackDamage: 0, abilityPower: 0 },
      'Physical',
    );
    expect(result.granted).toBe('Physical');
    expect(result.bonusAttackDamage).toBeCloseTo(12, 9);
  });
});

describe('resolveAdaptiveForce — the conversion itself', () => {
  it('converts at 0.6 bonus attack damage per point', () => {
    expect(ADAPTIVE_BONUS_AD_PER_POINT).toBe(0.6);
    // 9 adaptive force x 0.6 = 5.4
    const result = resolveAdaptiveForce(
      9,
      { bonusAttackDamage: 100, abilityPower: 0 },
      'Physical',
    );
    expect(result.bonusAttackDamage).toBeCloseTo(5.4, 9);
  });

  it('converts at 1 ability power per point', () => {
    // 9 adaptive force x 1 = 9
    const result = resolveAdaptiveForce(
      9,
      { bonusAttackDamage: 0, abilityPower: 100 },
      'Magic',
    );
    expect(result.abilityPower).toBeCloseTo(9, 9);
  });

  it('grants nothing at zero adaptive force', () => {
    const result = resolveAdaptiveForce(
      0,
      { bonusAttackDamage: 40, abilityPower: 10 },
      'Physical',
    );
    expect(result.bonusAttackDamage).toBe(0);
    expect(result.abilityPower).toBe(0);
    expect(result.granted).toBe('Physical');
  });
});
