// Known-answer tests for variable-hit detection and derivation.
//
// The expected shapes are worked out by hand from the wiki's printed numbers, quoted in each test.

import { describe, expect, it } from 'vitest';

import { deriveVariableHits, statesSameTargetRepeat } from './variable-hits.ts';

describe('the prose decides whether this applies at all', () => {
  it('a later hit on the SAME champion counts', () => {
    // Nautilus E
    const r = statesSameTargetRepeat(
      'Each wave deals magic damage to enemies hit, reduced to 50% against those hit by subsequent waves beyond the first.',
    );
    expect(r.yes).toBe(true);
  });

  it('a DIFFERENT champion does not — this is the Xayah Q trap', () => {
    // Reads almost identically and means the opposite. Storing it as a repeat gives one champion
    // damage that belongs to another.
    expect(statesSameTargetRepeat('Targets hit after the first take 50% reduced damage.').yes).toBe(
      false,
    );
    expect(statesSameTargetRepeat('reduced to 60% against targets beyond the first.').yes).toBe(false);
  });

  it('a stack timer refreshing is not a damage instance', () => {
    // 42 of 75 raw matches in the roster scan were this wording.
    expect(
      statesSameTargetRepeat(
        'Ashe generates a stack of Focus for 4 seconds, refreshing on subsequent attacks and stacking up to 4 times.',
      ).yes,
    ).toBe(false);
  });

  it('records the sentence it rests on', () => {
    const r = statesSameTargetRepeat('An enemy takes 40% damage from subsequent mines.');
    expect(r.sentence).toBe('An enemy takes 40% damage from subsequent mines.');
  });
});

describe('the rate and the ceiling come from the source, never from a guess', () => {
  it('Ziggs E: full 30, reduced 12, total 150 -> 40% and 10 more mines', () => {
    // The wiki prints Magic Damage per Mine 30, Reduced Damage per Mine 30x0.4 = 12, and
    // Maximum Total Magic Damage 30x(1+0.4x10) = 150.
    const d = deriveVariableHits(30, 12, 150, 'An enemy takes 40% damage from subsequent mines.');
    expect(d.shape).toEqual({
      kind: 'repeatsAtReducedRate',
      rate: 0.4,
      maxAdditional: 10,
      sourceSays: 'An enemy takes 40% damage from subsequent mines.',
    });
  });

  it('Nautilus E: full 55, reduced 27.5, total 110 -> 50% and 2 more waves', () => {
    const d = deriveVariableHits(55, 27.5, 110, 'reduced to 50% ... subsequent waves');
    expect(d.shape).toMatchObject({ kind: 'repeatsAtReducedRate', rate: 0.5, maxAdditional: 2 });
  });

  it('Yuumi R: full 75, reduced 18.75, total 150 -> 25% and 4 more waves', () => {
    const d = deriveVariableHits(75, 18.75, 150, 'Subsequent waves against enemies hit deal 25% damage.');
    expect(d.shape).toMatchObject({ kind: 'repeatsAtReducedRate', rate: 0.25, maxAdditional: 4 });
  });

  it('Xayah Q: full 45, no reduced value, total 90 -> two instances, both full', () => {
    const d = deriveVariableHits(45, undefined, 90, 'two Feathers that each deal physical damage');
    expect(d.shape).toEqual({
      kind: 'repeatsAtFullRate',
      maxInstances: 2,
      sourceSays: 'two Feathers that each deal physical damage',
    });
  });
});

describe('it refuses rather than inventing a ceiling', () => {
  it('no total printed means no ceiling exists to store', () => {
    const d = deriveVariableHits(30, 12, undefined, 'subsequent mines');
    expect(d.shape).toBeUndefined();
    expect(d.refusedBecause).toContain('no whole-ability total');
  });

  it('a total that does not divide into whole repeats is refused with the arithmetic shown', () => {
    // 30 full, 12 reduced, total 137: (137/30 - 1) / 0.4 = 8.92 additional. Not a count.
    const d = deriveVariableHits(30, 12, 137, 'subsequent mines');
    expect(d.shape).toBeUndefined();
    expect(d.refusedBecause).toContain('not a whole number');
  });

  it('a reduced value that is not smaller than the full one is refused', () => {
    const d = deriveVariableHits(30, 30, 150, 'subsequent mines');
    expect(d.shape).toBeUndefined();
    expect(d.refusedBecause).toContain('not a fraction');
  });

  it('a full-rate total that is not a whole multiple is refused', () => {
    const d = deriveVariableHits(45, undefined, 100, 'two feathers');
    expect(d.shape).toBeUndefined();
    expect(d.refusedBecause).toContain('not a whole number of instances');
  });
});

describe('a repeat that deals MORE is refused, not squeezed into a shape', () => {
  it('Swain Q: subsequent bolts deal bonus damage, so neither shape applies', () => {
    // Storing this as "two instances at full" understates the ability, and shape A cannot hold a
    // rate above 1. A third shape may be justified if this grows past one case; inventing one from
    // a single case is the guess this project refuses.
    const d = deriveVariableHits(
      35,
      undefined,
      70,
      'Subsequent bolts against an enemy deal bonus magic damage.',
    );
    expect(d.shape).toBeUndefined();
    expect(d.refusedBecause).toContain('MORE than the first');
  });
});

describe('the derived ceiling reproduces the wiki total exactly', () => {
  it('resolving Ziggs E at its ceiling gives back 150 from 30', () => {
    // This is the check that the ceiling is the WIKI's and not ours: 30 x (1 + 10 x 0.4) = 150.
    const s = deriveVariableHits(30, 12, 150, 'x').shape!;
    if (s.kind !== 'repeatsAtReducedRate') throw new Error('wrong shape');
    expect(30 * (1 + s.maxAdditional * s.rate)).toBeCloseTo(150, 10);
  });
});
