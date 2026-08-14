// Tests for the SHARED SWEEP SHAPES — the part that decides what a refused point looks like
// in the returned data (SPECIFICATION §11, and CLAUDE.md's rule that a plausible wrong picture
// is worse than no picture).
//
// These are pure tests of the shape and of `contiguousSegments`. The series below are hand
// authored rather than produced by the engine, precisely so the helper can be shown a hole in
// the MIDDLE of a range — a case the two real sweeps cannot currently produce, and which a
// renderer would otherwise smooth over the first time it did.

import { describe, it, expect } from 'vitest';
import { contiguousSegments, type PointSummary, type SweepPoint, type SweepSeries } from './sweep';

/** A summary with round numbers. Nothing here is a damage claim; only the shape is under test. */
function summary(total: number): PointSummary {
  return {
    burst: { total, byType: { physical: total, magic: 0, true: 0 } },
    dot: { total: 0, byType: { physical: 0, magic: 0, true: 0 } },
    verdict: {
      burstOnly: {
        lethal: false,
        lethalAtInstance: null,
        remainingHp: 1000 - total,
        damageApplied: total,
        healingApplied: 0,
      },
      burstPlusDot: {
        lethal: false,
        lethalAtInstance: null,
        remainingHp: 1000 - total,
        damageApplied: total,
        healingApplied: 0,
      },
    },
    attackerLevel: 1,
    defenderLevel: 1,
    defenderHp: 1000,
    verification: 'derived',
    partial: false,
    incompleteContributors: [],
  };
}

function computed(x: number, total: number): SweepPoint<null> {
  return { x, label: `${x}`, applied: null, status: 'computed', summary: summary(total) };
}

function refused(x: number): SweepPoint<null> {
  return {
    x,
    label: `${x}`,
    applied: null,
    status: 'refused',
    refusals: [{ path: 'fixture', reason: 'a hand-authored refusal' }],
  };
}

function series(points: SweepPoint<null>[]): SweepSeries<null> {
  return {
    kind: 'resistance',
    axisLabel: 'fixture axis',
    points,
    computedCount: points.filter((p) => p.status === 'computed').length,
    refusedCount: points.filter((p) => p.status === 'refused').length,
    anyPartial: false,
    incompleteEverywhere: [],
    incompleteSomewhere: [],
    incompleteSetVaries: false,
    excludedMechanics: [],
    notes: [],
  };
}

describe('contiguousSegments — a hole in the middle of a range', () => {
  it('splits into two segments and never joins across the hole', () => {
    const s = series([computed(0, 100), computed(50, 80), refused(100), computed(150, 40)]);
    const segments = contiguousSegments(s);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.map((p) => p.x)).toEqual([0, 50]);
    expect(segments[1]!.map((p) => p.x)).toEqual([150]);
  });

  it('splits into three segments for two separate holes', () => {
    const s = series([
      computed(0, 100),
      refused(25),
      computed(50, 80),
      refused(75),
      computed(100, 60),
    ]);
    expect(contiguousSegments(s).map((seg) => seg.map((p) => p.x))).toEqual([[0], [50], [100]]);
  });

  it('returns one segment when nothing refused', () => {
    const s = series([computed(0, 100), computed(50, 80)]);
    expect(contiguousSegments(s)).toHaveLength(1);
  });

  it('returns NO segments when every point refused, rather than an empty line', () => {
    const s = series([refused(0), refused(50)]);
    expect(contiguousSegments(s)).toEqual([]);
  });

  it('never emits an empty segment', () => {
    const s = series([refused(0), computed(50, 80), refused(100)]);
    for (const segment of contiguousSegments(s)) {
      expect(segment.length).toBeGreaterThan(0);
    }
  });
});

describe('the shape of a refused point', () => {
  it('carries no summary key at all, so a zero can never be read off it', () => {
    const point = refused(10);
    expect('summary' in point).toBe(false);
    expect('result' in point).toBe(false);
  });

  it('carries at least one reason', () => {
    const point = refused(10);
    if (point.status !== 'refused') throw new Error('unreachable');
    expect(point.refusals.length).toBeGreaterThan(0);
    expect(point.refusals[0]!.reason.length).toBeGreaterThan(0);
  });
});
