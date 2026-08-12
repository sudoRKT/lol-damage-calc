// Known-answer tests for execute thresholds (SPECIFICATION §3.7).
//
// The rule is not stated in the specification, so it is taken from the League wiki's Kill
// article (the "Execute" section, which the "Execute" page redirects to), read 2026-08-12:
//   https://wiki.leagueoflegends.com/en-us/Kill
//     "An execute is the process of killing a unit by dealing 100% of their current health
//      through the raw damage source type."
//     "Most forms of executes only occur if the unit is below a specific health threshold."
//
// The wiki says BELOW the threshold, so a target sitting exactly on the threshold is not
// executed. See the note in execute.ts about how confident that edge is.
//
// Every expected value below follows from that rule directly. Nothing was obtained by
// running the engine.

import { describe, it, expect } from 'vitest';
import { isExecuted, healthThresholdFromMaxHealth } from './execute';

describe('isExecuted — the threshold comparison', () => {
  it('does NOT execute a target sitting exactly on the threshold', () => {
    // 300 is not below 300.
    expect(isExecuted(300, 300)).toBe(false);
  });

  it('does NOT execute a target above the threshold', () => {
    expect(isExecuted(350, 300)).toBe(false);
    expect(isExecuted(300.01, 300)).toBe(false);
  });

  it('executes a target below the threshold', () => {
    expect(isExecuted(299.99, 300)).toBe(true);
    expect(isExecuted(1, 300)).toBe(true);
  });

  it('does not execute anything on a threshold of zero', () => {
    // A target on 0 health is already dead; 0 is not below 0.
    expect(isExecuted(0, 0)).toBe(false);
    expect(isExecuted(100, 0)).toBe(false);
  });

  it('executes against current health, not maximum health', () => {
    // The caller passes current health. A full-health 2000 hp target is not executed by a
    // 300 threshold; the same target at 250 current health is.
    expect(isExecuted(2000, 300)).toBe(false);
    expect(isExecuted(250, 300)).toBe(true);
  });
});

describe('healthThresholdFromMaxHealth — percentage-of-maximum thresholds', () => {
  it('takes 15% of 2000 maximum health as 300', () => {
    // 2000 x 0.15 = 300
    expect(healthThresholdFromMaxHealth(2000, 0.15)).toBeCloseTo(300, 9);
  });

  it('feeds straight into the threshold comparison', () => {
    const threshold = healthThresholdFromMaxHealth(2000, 0.15); // 300
    expect(isExecuted(299, threshold)).toBe(true);
    expect(isExecuted(300, threshold)).toBe(false);
    expect(isExecuted(301, threshold)).toBe(false);
  });

  it('is zero at a zero fraction', () => {
    expect(healthThresholdFromMaxHealth(2000, 0)).toBe(0);
  });
});
