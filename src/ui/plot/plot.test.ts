// THE SHARED AXIS AND SCALE — known-answer tests.
//
// Two chart areas read this and neither writes it. Its whole job is that two charts place their
// gridlines and flip their y axis identically, so these tests are about arithmetic, not rendering.

import { describe, expect, it } from 'vitest';

import { domainTicks, fractionOf, niceTicks, toPlotFractions, yDomainFor } from './index';

describe('niceTicks — a zero-origin axis', () => {
  it('steps in 1, 2, 2.5 or 5 times a power of ten, never an arbitrary number', () => {
    // 1000 over at most 5 intervals gives a step of 200 — exactly five gaps, the largest nice
    // step that fits. 2000 gives 500, which is four.
    expect(niceTicks(1000)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(niceTicks(2000)).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it('adds the axis top when it is far enough from the last tick to be readable', () => {
    // 2356 with a 500 step: the last whole tick is 2000, and 356 is more than half a step.
    expect(niceTicks(2356)).toEqual([0, 500, 1000, 1500, 2000, 2356]);
  });

  it('does NOT add it when it would collide with the tick below', () => {
    // 2100 with a 500 step: 100 is under half a step, so the label is dropped rather than
    // printed on top of the 2000.
    expect(niceTicks(2100)).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it('answers a single zero for a non-positive maximum rather than dividing by it', () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(-5)).toEqual([0]);
  });
});

describe('domainTicks — an axis that does not start at zero', () => {
  it('never puts a tick on top of the MIN endpoint — the guard the max end always had', () => {
    // FOUND 2026-08-15 by the curves area, by importing this module into a live page rather than
    // by reading it. Both endpoints are pinned, so an interior tick landing beside one collides
    // with it — and the min end had no mirror of the loop's `v < max - step / 2`.
    //
    // The measured case: this returned [99, 100, 150, 200, 250, 300]. The first pair sat 0.5% of
    // the span apart, about 0.9px of pitch against a 16.5px label — -15.6px of separation at
    // 320px and -15.3px at 375px. It overlaps at EVERY width; it is not a phone problem.
    //
    // It was unreachable because App.tsx hard-codes the resistance sweep at 0 to 300 by 25. It
    // becomes reachable the moment a caller sweeps from a champion's current armor, which
    // SPECIFICATION §11 invites — so this is pinned before that caller exists.
    expect(domainTicks({ min: 99, max: 300 }, 5)).toEqual([99, 150, 200, 250, 300]);
  });

  it('and still refuses one crowding the MAX endpoint, which is what it always did', () => {
    const ticks = domainTicks({ min: 0, max: 301 }, 5);
    expect(ticks[ticks.length - 1]).toBe(301);
    expect(ticks[ticks.length - 2]! <= 301 - 50 / 2).toBe(true);
  });

  it('always includes both ends, because a curve missing its own endpoints is unreadable', () => {
    const ticks = domainTicks({ min: 1, max: 18 });
    expect(ticks[0]).toBe(1);
    expect(ticks[ticks.length - 1]).toBe(18);
  });

  it('places champion level at readable intervals', () => {
    expect(domainTicks({ min: 1, max: 18 })).toEqual([1, 5, 10, 15, 18]);
  });

  it('handles a resistance axis from zero', () => {
    expect(domainTicks({ min: 0, max: 300 })).toEqual([0, 100, 200, 300]);
  });

  it('answers the single value for a collapsed domain', () => {
    expect(domainTicks({ min: 7, max: 7 })).toEqual([7]);
  });
});

describe('fractionOf', () => {
  it('is 0 at the minimum and 1 at the maximum', () => {
    expect(fractionOf(1, { min: 1, max: 18 })).toBe(0);
    expect(fractionOf(18, { min: 1, max: 18 })).toBe(1);
  });

  it('is linear in between', () => {
    expect(fractionOf(150, { min: 0, max: 300 })).toBe(0.5);
  });

  it('CLAMPS rather than drawing outside the frame', () => {
    // A point beyond the axis would put ink where the axis says there is none — a chart that
    // lies quietly. It clamps rather than throwing so one bad point cannot take a curve down.
    expect(fractionOf(-50, { min: 0, max: 300 })).toBe(0);
    expect(fractionOf(400, { min: 0, max: 300 })).toBe(1);
  });

  it('answers 0 for a zero-width domain instead of dividing by zero', () => {
    expect(fractionOf(5, { min: 5, max: 5 })).toBe(0);
  });
});

describe('toPlotFractions', () => {
  it('FLIPS Y ONCE, here and nowhere else', () => {
    // Screen coordinates grow downward and damage grows upward. An upside-down curve is not
    // obviously wrong at a glance, which is the dangerous kind — so the flip lives in one place.
    const pts = toPlotFractions([{ x: 0, y: 100 }], { min: 0, max: 100 }, { min: 0, max: 100 });
    expect(pts[0]).toEqual({ x: 0, y: 0 }); // the largest value sits at the TOP
    const low = toPlotFractions([{ x: 0, y: 0 }], { min: 0, max: 100 }, { min: 0, max: 100 });
    expect(low[0]).toEqual({ x: 0, y: 1 }); // zero sits at the bottom
  });

  it('keeps every point, in order', () => {
    const out = toPlotFractions(
      [
        { x: 1, y: 10 },
        { x: 2, y: 20 },
        { x: 3, y: 30 },
      ],
      { min: 1, max: 3 },
      { min: 0, max: 30 },
    );
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.x)).toEqual([0, 0.5, 1]);
  });
});

describe('yDomainFor', () => {
  it('ALWAYS includes zero', () => {
    // A damage chart whose axis starts at 400 makes a 5% difference look like a 100% one. That
    // is the classic misleading chart and the one this product least can afford.
    expect(yDomainFor([[{ x: 0, y: 400 }, { x: 1, y: 420 }]])).toEqual({ min: 0, max: 420 });
  });

  it('spans every series it is given, not just the first', () => {
    expect(
      yDomainFor([
        [{ x: 0, y: 10 }],
        [{ x: 0, y: 900 }],
      ]),
    ).toEqual({ min: 0, max: 900 });
  });

  it('gives a drawable axis for an empty series rather than a collapsed one', () => {
    expect(yDomainFor([])).toEqual({ min: 0, max: 1 });
    expect(yDomainFor([[{ x: 0, y: 0 }]])).toEqual({ min: 0, max: 1 });
  });
});

describe('the burndown and the curves cannot disagree', () => {
  it('the burndown re-exports this very function rather than keeping a copy', async () => {
    // The failure this prevents: two charts placing their gridlines in different places, which
    // is the one thing a reader compares across charts.
    const geometry = await import('../burndown/geometry');
    expect(geometry.niceTicks).toBe(niceTicks);
  });
});
