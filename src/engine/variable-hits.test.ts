// Known-answer tests for variable hit-count resolution.
//
// Every expected number is worked out by hand from the rule, not from what the code returns.
// The real shapes are used as fixtures: Ziggs E (10 more mines at 40%), Nautilus E (2 more waves
// at 50%), Yuumi R (4 more waves at 25%) and Xayah Q (2 feathers, both full).

import { describe, expect, it } from 'vitest';

import { resolveVariableHits } from './variable-hits.ts';
import type { VariableHitCount } from '../types/data.ts';

const ziggsE: VariableHitCount = {
  kind: 'repeatsAtReducedRate',
  rate: 0.4,
  maxAdditional: 10,
  sourceSays: 'An enemy takes 40% damage from subsequent mines.',
};
const nautilusE: VariableHitCount = {
  kind: 'repeatsAtReducedRate',
  rate: 0.5,
  maxAdditional: 2,
  sourceSays: 'reduced to 50% against those hit by subsequent waves beyond the first',
};
const xayahQ: VariableHitCount = {
  kind: 'repeatsAtFullRate',
  maxInstances: 2,
  sourceSays: 'Xayah barrages two Feathers ... that each deal physical damage to enemies hit',
};

describe('the default is the minimum, and it is not a tuning knob', () => {
  it('an unstated count is one full instance and no repeats', () => {
    const r = resolveVariableHits(ziggsE, undefined);
    expect(r.fullInstances).toBe(1);
    expect(r.reducedInstances).toBe(0);
    expect(r.multiplier).toBe(1); // 1 + 0 x 0.4
    expect(r.usedDefault).toBe(true);
  });

  it('THE DEFAULT IS NEVER THE MAXIMUM, on every shape', () => {
    // The guard that matters. A default of "as many as possible" would inflate every result
    // containing one of these abilities by up to 5x on Ziggs E alone, and would look exactly
    // like a correct answer.
    for (const shape of [ziggsE, nautilusE, xayahQ]) {
      const def = resolveVariableHits(shape, undefined);
      const max = resolveVariableHits(
        shape,
        shape.kind === 'repeatsAtReducedRate' ? shape.maxAdditional : shape.maxInstances,
      );
      expect(def.multiplier).toBeLessThan(max.multiplier);
      expect(def.multiplier).toBe(1);
    }
  });

  it('the default still reports the maximum, so the user can see the range they are at the bottom of', () => {
    const r = resolveVariableHits(ziggsE, undefined);
    expect(r.maximum).toBe(10);
    expect(r.explanation).toContain('up to 10');
    expect(r.explanation).toContain('40%');
  });
});

describe('shape A — first full, repeats at a reduced rate', () => {
  it('Ziggs E at 3 additional mines is 1 + 3 x 0.4 = 2.2', () => {
    expect(resolveVariableHits(ziggsE, 3).multiplier).toBeCloseTo(2.2, 10);
  });

  it("Ziggs E at its maximum is 1 + 10 x 0.4 = 5, which is the wiki's own Maximum Total", () => {
    // The source states Maximum Total Magic Damage as base x (1 + 0.4 x 10). Resolving at the
    // ceiling must reproduce it exactly, or the ceiling we stored is not the wiki's.
    expect(resolveVariableHits(ziggsE, 10).multiplier).toBeCloseTo(5, 10);
  });

  it("Nautilus E at its maximum is 1 + 2 x 0.5 = 2, matching the wiki's Maximum Total of base x2", () => {
    expect(resolveVariableHits(nautilusE, 2).multiplier).toBeCloseTo(2, 10);
  });

  it('the stated number is ADDITIONAL instances, not total — 1 means two instances land', () => {
    const r = resolveVariableHits(nautilusE, 1);
    expect(r.fullInstances).toBe(1);
    expect(r.reducedInstances).toBe(1);
    expect(r.multiplier).toBeCloseTo(1.5, 10);
  });

  it('a count above the maximum is clamped rather than trusted', () => {
    expect(resolveVariableHits(nautilusE, 99).multiplier).toBeCloseTo(2, 10);
  });
});

describe('shape B — every instance full, no reduction', () => {
  it('Xayah Q with both feathers landing is exactly 2x, with no reduced instance', () => {
    const r = resolveVariableHits(xayahQ, 2);
    expect(r.fullInstances).toBe(2);
    expect(r.reducedInstances).toBe(0);
    expect(r.multiplier).toBe(2);
  });

  it('the default is ONE instance, not two — the second is not assumed', () => {
    const r = resolveVariableHits(xayahQ, undefined);
    expect(r.multiplier).toBe(1);
    expect(r.usedDefault).toBe(true);
  });

  it('zero instances is a real scenario and contributes nothing', () => {
    // Distinct from an absent key, which means the default of one.
    const r = resolveVariableHits(xayahQ, 0);
    expect(r.multiplier).toBe(0);
    expect(r.explanation).toContain('contributes nothing');
  });

  it('NEVER applies a reduction — the shapes are not interchangeable', () => {
    // Forcing shape B through shape A would give 1 + 1 x rate for two feathers instead of 2,
    // inventing a reduction the source does not state.
    const r = resolveVariableHits(xayahQ, 2);
    expect(r.reducedRate).toBe(1);
    expect(r.multiplier).toBe(2);
  });
});

describe('a count the user cannot have meant is refused, not guessed at', () => {
  it('a negative count resolves to zero', () => {
    expect(resolveVariableHits(xayahQ, -3).multiplier).toBe(0);
  });

  it('a fractional count takes the whole number below it', () => {
    expect(resolveVariableHits(ziggsE, 2.9).reducedInstances).toBe(2);
  });

  it('NaN falls back to the minimum rather than producing NaN damage', () => {
    const r = resolveVariableHits(ziggsE, Number.NaN);
    expect(r.multiplier).toBe(1);
    expect(Number.isFinite(r.multiplier)).toBe(true);
  });
});

describe('the result can state which count produced it', () => {
  it('names the count and the maximum in plain English', () => {
    expect(resolveVariableHits(ziggsE, 4).explanation).toBe(
      '1 full instance plus 4 at 40% (the source allows up to 10)',
    );
  });
});
