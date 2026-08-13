// Known-answer tests for per-level champion statistics.
//
// Every expected value is computed BY HAND from the documented formula, not from the code:
//   base + growth * (n - 1) * (0.7025 + 0.0175 * (n - 1))
// https://wiki.leagueoflegends.com/en-us/Champion_statistic, read 2026-08-13.

import { describe, expect, it } from 'vitest';

import { championStatAtLevel, growthMultiplier, resolveBaseStats } from './champion-stats.ts';

describe('the growth multiplier', () => {
  it('is zero at level 1 — a champion has its base stat and no growth', () => {
    expect(growthMultiplier(1)).toBe(0);
  });

  it('is EXACTLY 17 at level 18, which is the identity the formula is checked against', () => {
    // n = 17, so 17 * (0.7025 + 0.0175 * 17) = 17 * (0.7025 + 0.2975) = 17 * 1 = 17.
    // The wiki states this consequence explicitly; if this fails, the constants are wrong.
    expect(growthMultiplier(18)).toBeCloseTo(17, 10);
  });

  it('is NOT linear — level 10 gives 7.74 growths, not 9', () => {
    // n = 9: 9 * (0.7025 + 0.0175 * 9) = 9 * (0.7025 + 0.1575) = 9 * 0.86 = 7.74
    expect(growthMultiplier(10)).toBeCloseTo(7.74, 10);
    // The linear reading would give 9. Treating growth as linear overstates every stat between
    // level 2 and 17, and a defender's health is the denominator of the survival verdict.
    expect(growthMultiplier(10)).toBeLessThan(9);
  });

  it('rises monotonically across every level', () => {
    for (let n = 2; n <= 18; n += 1) {
      expect(growthMultiplier(n)).toBeGreaterThan(growthMultiplier(n - 1));
    }
  });
});

describe('a statistic at a level', () => {
  it("Garen's health at 18 is 690 + 98 x 17 = 2356", () => {
    expect(championStatAtLevel(690, 98, 18)).toBeCloseTo(2356, 6);
  });

  it("Garen's health at level 1 is his base, 690", () => {
    expect(championStatAtLevel(690, 98, 1)).toBe(690);
  });

  it("Garen's health at level 10 is 690 + 98 x 7.74 = 1448.52", () => {
    // Worked by hand: 98 * 7.74 = 758.52; 690 + 758.52 = 1448.52.
    expect(championStatAtLevel(690, 98, 10)).toBeCloseTo(1448.52, 6);
  });

  it("Garen's magic resistance at 18 is 32 + 1.55 x 17 = 58.35", () => {
    expect(championStatAtLevel(32, 1.55, 18)).toBeCloseTo(58.35, 6);
  });

  it('refuses a level outside 1..18 rather than extrapolating', () => {
    expect(() => championStatAtLevel(690, 98, 0)).toThrow(RangeError);
    expect(() => championStatAtLevel(690, 98, 19)).toThrow(RangeError);
    expect(() => championStatAtLevel(690, 98, 7.5)).toThrow(RangeError);
  });
});

describe('resolving the four statistics the slice needs', () => {
  const garen = {
    hp_base: 690, hp_lvl: 98,
    arm_base: 38, arm_lvl: 4.2,
    mr_base: 32, mr_lvl: 1.55,
    ad_base: 69, ad_lvl: 4.5,
  };

  it('gives Garen his base stats at level 1', () => {
    expect(resolveBaseStats(garen, 1)).toEqual({
      hp: 690, armor: 38, magicResist: 32, attackDamage: 69,
    });
  });

  it('gives Garen 17 growths at level 18', () => {
    const s = resolveBaseStats(garen, 18);
    expect(s.hp).toBeCloseTo(690 + 98 * 17, 6);
    expect(s.armor).toBeCloseTo(38 + 4.2 * 17, 6);
    expect(s.magicResist).toBeCloseTo(32 + 1.55 * 17, 6);
    expect(s.attackDamage).toBeCloseTo(69 + 4.5 * 17, 6);
  });
});
