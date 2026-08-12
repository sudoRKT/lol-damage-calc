// Known-answer tests for the resistance multipliers (SPECIFICATION §3.6).
//
// Every expected value is computed by hand from the two formulas the specification states
// literally:
//     resistance >= 0 : multiplier = 100 / (100 + R)
//     resistance <  0 : multiplier = 2 - 100 / (100 - R)
// True damage bypasses both. Nothing here was obtained by running the engine.

import { describe, it, expect } from 'vitest';
import { resistanceMultiplier, applyResistance } from './resistances';

describe('resistanceMultiplier — physical damage against armor (SPECIFICATION §3.6)', () => {
  it('halves damage at 100 armor', () => {
    // 100 / (100 + 100) = 100 / 200 = 0.5
    expect(resistanceMultiplier('physical', 100)).toBeCloseTo(0.5, 12);
  });

  it('resolves 25 armor at 0.8', () => {
    // 100 / (100 + 25) = 100 / 125 = 0.8
    expect(resistanceMultiplier('physical', 25)).toBeCloseTo(0.8, 12);
  });

  it('resolves 300 armor at 0.25', () => {
    // 100 / (100 + 300) = 100 / 400 = 0.25
    expect(resistanceMultiplier('physical', 300)).toBeCloseTo(0.25, 12);
  });

  it('resolves negative armor above 1 — the second formula', () => {
    // -25 armor: 2 - 100 / (100 - (-25)) = 2 - 100/125 = 2 - 0.8 = 1.2
    expect(resistanceMultiplier('physical', -25)).toBeCloseTo(1.2, 12);
    // -100 armor: 2 - 100 / 200 = 2 - 0.5 = 1.5
    expect(resistanceMultiplier('physical', -100)).toBeCloseTo(1.5, 12);
  });

  it('approaches but never reaches double damage as armor falls', () => {
    // -1,000,000 armor: 2 - 100/1000100 = 1.99990001...  The formula is bounded by 2.
    expect(resistanceMultiplier('physical', -1_000_000)).toBeLessThan(2);
    expect(resistanceMultiplier('physical', -1_000_000)).toBeGreaterThan(1.999);
  });
});

describe('resistanceMultiplier — magic damage against magic resistance (SPECIFICATION §3.6)', () => {
  it('resolves 50 magic resistance at two thirds', () => {
    // 100 / (100 + 50) = 100/150 = 0.6666...
    expect(resistanceMultiplier('magic', 50)).toBeCloseTo(2 / 3, 12);
  });

  it('resolves negative magic resistance with the second formula', () => {
    // -50 MR: 2 - 100 / (100 - (-50)) = 2 - 100/150 = 2 - 0.6666... = 1.3333...
    expect(resistanceMultiplier('magic', -50)).toBeCloseTo(2 - 2 / 3, 12);
  });
});

describe('resistanceMultiplier — the zero case and true damage (SPECIFICATION §3.6)', () => {
  it('resolves zero resistance at exactly 1 for both damage types', () => {
    // 100 / (100 + 0) = 1. Zero takes the positive branch, so the two formulas agree there:
    // the negative branch at 0 gives 2 - 100/100 = 1 as well.
    expect(resistanceMultiplier('physical', 0)).toBe(1);
    expect(resistanceMultiplier('magic', 0)).toBe(1);
  });

  it('gives true damage a multiplier of exactly 1 whatever the resistances are', () => {
    expect(resistanceMultiplier('true', 300)).toBe(1);
    expect(resistanceMultiplier('true', 0)).toBe(1);
    expect(resistanceMultiplier('true', -75)).toBe(1);
  });
});

describe('applyResistance — raw damage through the multiplier', () => {
  it('applies 1000 physical damage against 100 armor as 500', () => {
    // 1000 x 100/(100+100) = 1000 x 0.5 = 500
    expect(applyResistance(1000, 'physical', 100)).toBeCloseTo(500, 9);
  });

  it('applies 1000 magic damage against 30 magic resistance as 769.2307...', () => {
    // 1000 x 100/130 = 769.230769230769...
    expect(applyResistance(1000, 'magic', 30)).toBeCloseTo(769.2307692307692, 9);
  });

  it('applies 1000 physical damage against -20 armor as 1166.6666...', () => {
    // multiplier = 2 - 100/120 = 2 - 0.833333... = 1.1666666...
    // 1000 x 1.1666666... = 1166.6666...
    expect(applyResistance(1000, 'physical', -20)).toBeCloseTo(1166.6666666666667, 9);
  });

  it('passes true damage through untouched', () => {
    expect(applyResistance(1000, 'true', 300)).toBe(1000);
  });
});
