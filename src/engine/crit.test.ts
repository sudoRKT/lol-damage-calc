// Known-answer tests for critical strike (SPECIFICATION §3.7).
//
// The multiplier is not stated in the specification, so it is taken from the League wiki,
// read 2026-08-12:
//   https://wiki.leagueoflegends.com/en-us/Critical_strike
//     "A critical strike is a damage event that deals 200% of its normal value by default"
//     "From its inception, critical strikes did 200% damage before being changed to 175%
//      in V10.23. It would later be reverted to 200% again in V26.01."
//     Critical strike damage from other sources "stacks additively".
//     "AverageDamage(DamageBase) = DamageBase x (1 + CritChance x (CritMod - 1))"
//   https://wiki.leagueoflegends.com/en-us/V26.01  (released 2026-01-08)
//     "Base critical strike damage increased to 200% from 175%."
//
// Every expected value below is that arithmetic done by hand. Nothing was obtained by
// running the engine.

import { describe, it, expect } from 'vitest';
import {
  BASE_CRITICAL_STRIKE_MULTIPLIER,
  criticalStrikeMultiplier,
  applyCriticalStrike,
  averageDamageWithCrit,
} from './crit';

describe('criticalStrikeMultiplier — base value and additive bonuses', () => {
  it('is 2 with no bonus critical strike damage', () => {
    expect(BASE_CRITICAL_STRIKE_MULTIPLIER).toBe(2);
    expect(criticalStrikeMultiplier(0)).toBe(2);
    expect(criticalStrikeMultiplier()).toBe(2);
  });

  it('adds a single bonus additively', () => {
    // 200% + 35% = 235% -> 2.35
    expect(criticalStrikeMultiplier(0.35)).toBeCloseTo(2.35, 12);
  });

  it('adds several bonuses additively, not multiplicatively', () => {
    // 35% + 10% = 45% bonus -> 245%. Multiplicative stacking would give 2 x 1.35 x 1.10
    // = 2.97, which is NOT what the wiki documents.
    expect(criticalStrikeMultiplier(0.35 + 0.1)).toBeCloseTo(2.45, 12);
    expect(criticalStrikeMultiplier(0.45)).not.toBeCloseTo(2.97, 2);
  });
});

describe('applyCriticalStrike — a single damage instance', () => {
  it('doubles a non-critical figure when it crits', () => {
    // 100 x 2 = 200
    expect(applyCriticalStrike(100, true, 2)).toBeCloseTo(200, 9);
  });

  it('leaves a non-critical instance alone', () => {
    expect(applyCriticalStrike(100, false, 2)).toBe(100);
    expect(applyCriticalStrike(100, false, 2.35)).toBe(100);
  });

  it('applies a raised critical multiplier', () => {
    // 240 x 2.35 = 564
    expect(applyCriticalStrike(240, true, 2.35)).toBeCloseTo(564, 9);
  });

  it('crits a fractional base figure without rounding it', () => {
    // 82.5 x 2.35 = 193.875 — rounding happens once, elsewhere (SPECIFICATION §3.7).
    expect(applyCriticalStrike(82.5, true, 2.35)).toBeCloseTo(193.875, 9);
  });
});

describe('averageDamageWithCrit — the wiki average-damage formula', () => {
  it('gives 150 for 100 damage at 50% crit chance and a 2x multiplier', () => {
    // 100 x (1 + 0.5 x (2 - 1)) = 100 x 1.5 = 150
    expect(averageDamageWithCrit(100, 0.5, 2)).toBeCloseTo(150, 9);
  });

  it('gives 167.5 for 100 damage at 50% crit chance and a 2.35x multiplier', () => {
    // 100 x (1 + 0.5 x (2.35 - 1)) = 100 x (1 + 0.675) = 167.5
    expect(averageDamageWithCrit(100, 0.5, 2.35)).toBeCloseTo(167.5, 9);
  });

  it('equals the base figure at 0% crit chance', () => {
    expect(averageDamageWithCrit(100, 0, 2.35)).toBeCloseTo(100, 9);
  });

  it('equals the full critical figure at 100% crit chance', () => {
    // 100 x (1 + 1 x 1.35) = 235, the same as a guaranteed crit.
    expect(averageDamageWithCrit(100, 1, 2.35)).toBeCloseTo(235, 9);
    expect(averageDamageWithCrit(100, 1, 2.35)).toBeCloseTo(
      applyCriticalStrike(100, true, 2.35),
      9,
    );
  });
});
