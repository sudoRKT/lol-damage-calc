// Known-answer tests for THE single rounding point (SPECIFICATION §3.7).
//
// Every expected value below is computed by hand from the rule stated in rounding.ts:
// "round half away from zero to the nearest whole point of damage". Nothing here was
// obtained by running the engine.

import { describe, it, expect } from 'vitest';
import { roundDamage } from './rounding';

describe('roundDamage — the single rounding point (SPECIFICATION §3.7)', () => {
  it('leaves a whole number unchanged', () => {
    expect(roundDamage(0)).toBe(0);
    expect(roundDamage(1)).toBe(1);
    expect(roundDamage(826)).toBe(826);
  });

  it('rounds down below the halfway point', () => {
    expect(roundDamage(0.4)).toBe(0);
    expect(roundDamage(1.49)).toBe(1);
    // 1000 physical damage against 21 effective armor is 1000 x 100/121 = 826.446...
    expect(roundDamage(826.4462809917355)).toBe(826);
  });

  it('rounds up above the halfway point', () => {
    expect(roundDamage(0.51)).toBe(1);
    expect(roundDamage(826.6)).toBe(827);
  });

  it('rounds a halfway value away from zero, not to even', () => {
    // Banker's rounding would give 0, 2, 2, 4 here. This engine does not use it.
    expect(roundDamage(0.5)).toBe(1);
    expect(roundDamage(1.5)).toBe(2);
    expect(roundDamage(2.5)).toBe(3);
    expect(roundDamage(3.5)).toBe(4);
  });

  it('is idempotent — rounding an already-rounded figure changes nothing', () => {
    const values = [0.5, 1.49, 826.4462809917355, 12.5];
    for (const value of values) {
      expect(roundDamage(roundDamage(value))).toBe(roundDamage(value));
    }
  });

  it('never returns a non-finite number for a finite input', () => {
    expect(Number.isFinite(roundDamage(1e12 + 0.5))).toBe(true);
  });
});
