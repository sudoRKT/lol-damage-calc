// Known-answer tests for the scaling expander.
//
// Every expected value below was derived BY HAND from the documented rule in
// Module:Ability progression, then cross-checked against the literal wikitext of the named
// ability template as fetched on 2026-08-12 (patch 16.16.1). None was taken from what this
// code returns. If the code and a case here disagree, the code is wrong (CLAUDE.md).

import { describe, expect, it } from 'vitest';

import type { Scaling } from './data.ts';
import {
  ScalingError,
  expandByRank,
  interpolate,
  isLevelScaled,
  levelBreakpoints,
  valueAt,
  valueAtLevel,
} from './scaling.ts';

describe('rank scaling — linear `X to Y`', () => {
  // Template:Data Lux/Light Binding → |leveling = {{st|Magic Damage|{{ap|80 to 240}} ...
  it('Lux Q, 80 to 240 over 5 ranks, steps by 40', () => {
    const s: Scaling = { scaling: 'linear', from: 80, to: 240 };
    expect(expandByRank(s, 5)).toEqual([80, 120, 160, 200, 240]);
  });

  // Template:Data Darius/Decimate → {{ap|50 to 170}}
  it('Darius Q blade, 50 to 170 over 5 ranks, steps by 30', () => {
    expect(expandByRank({ scaling: 'linear', from: 50, to: 170 }, 5)).toEqual([
      50, 80, 110, 140, 170,
    ]);
  });

  // Same template, handle component: {{ap|50*0.35 to 170*0.35}} → 17.5 to 59.5.
  // Proves the reducible-arithmetic case lands on the same rule once evaluated.
  it('Darius Q handle, the x0.35 variant, steps by 10.5', () => {
    expect(expandByRank({ scaling: 'linear', from: 17.5, to: 59.5 }, 5)).toEqual([
      17.5, 28, 38.5, 49, 59.5,
    ]);
  });

  // Template:Data Aatrox/The Darkin Blade, #vardefine b1=10 b2=70.
  it('Aatrox Q first cast, 10 to 70 over 5 ranks, steps by 15', () => {
    expect(expandByRank({ scaling: 'linear', from: 10, to: 70 }, 5)).toEqual([10, 25, 40, 55, 70]);
  });

  it('an ultimate interpolates over 3 ranks, not 5', () => {
    // Template:Data Cassiopeia/Petrifying Gaze → {{ap|150 to 350}}, R has 3 ranks.
    expect(expandByRank({ scaling: 'linear', from: 150, to: 350 }, 3)).toEqual([150, 250, 350]);
    // The same shorthand over 5 ranks gives entirely different middle values — which is
    // exactly why rank count is never assumed.
    expect(expandByRank({ scaling: 'linear', from: 150, to: 350 }, 5)).toEqual([
      150, 200, 250, 300, 350,
    ]);
  });

  it('a single-rank value returns `from` rather than dividing by zero', () => {
    expect(expandByRank({ scaling: 'linear', from: 42, to: 42 }, 1)).toEqual([42]);
  });
});

describe('rank scaling — explicit lists are used verbatim, never interpolated', () => {
  // Template:Data Kayle/Divine Judgment → {{ap|675|675|775}}. Steps 0 then +100.
  // The linear rule would give 675/725/775 — wrong at rank 2. This is the case that makes
  // the explicit arm necessary (DATA-SOURCES §11).
  it('Kayle R is 675/675/775, which linear interpolation would get wrong', () => {
    const s: Scaling = { scaling: 'explicit', perRank: [675, 675, 775] };
    expect(expandByRank(s, 3)).toEqual([675, 675, 775]);
    expect(expandByRank({ scaling: 'linear', from: 675, to: 775 }, 3)).toEqual([675, 725, 775]);
  });

  // Template:Data Anivia/Crystallize → {{ap|133.33|125|120|116.67|114.29}} — a DECREASING curve.
  it('Anivia W is a decreasing, non-even curve', () => {
    expect(
      expandByRank({ scaling: 'explicit', perRank: [133.33, 125, 120, 116.67, 114.29] }, 5),
    ).toEqual([133.33, 125, 120, 116.67, 114.29]);
  });

  it('refuses an explicit list whose length does not match the rank count', () => {
    expect(() => expandByRank({ scaling: 'explicit', perRank: [1, 2, 3] }, 5)).toThrow(ScalingError);
  });
});

describe('level scaling — the same rule on the champion-level axis', () => {
  // Template:Data Caitlyn/Headshot → {{pp|key=%|60 to 100 for 3|1 to 13}}
  // 3 values across levels 1..13 ⇒ breakpoints at levels 1, 7, 13.
  const headshot: Scaling = {
    scaling: 'byLevel',
    from: 60,
    to: 100,
    atLevels: [1, 13],
    steps: 3,
  };

  it('places Caitlyn Headshot at levels 1 / 7 / 13 with values 60 / 80 / 100', () => {
    expect(levelBreakpoints(headshot)).toEqual([
      { level: 1, value: 60 },
      { level: 7, value: 80 },
      { level: 13, value: 100 },
    ]);
  });

  it('holds each value until the next breakpoint is reached', () => {
    expect(valueAtLevel(headshot, 1)).toBe(60);
    expect(valueAtLevel(headshot, 6)).toBe(60);
    expect(valueAtLevel(headshot, 7)).toBe(80);
    expect(valueAtLevel(headshot, 12)).toBe(80);
    expect(valueAtLevel(headshot, 13)).toBe(100);
    expect(valueAtLevel(headshot, 18)).toBe(100);
  });

  // Template:Data Vladimir/Transfusion → {{pp|10%;20%;30%;40%|1;6;11;16}}
  it('reads explicit values at explicit levels (Vladimir Crimson Rush)', () => {
    const s: Scaling = {
      scaling: 'byLevelExplicit',
      values: [10, 20, 30, 40],
      atLevels: [1, 6, 11, 16],
    };
    expect(valueAtLevel(s, 5)).toBe(10);
    expect(valueAtLevel(s, 6)).toBe(20);
    expect(valueAtLevel(s, 10)).toBe(20);
    expect(valueAtLevel(s, 16)).toBe(40);
    expect(valueAtLevel(s, 18)).toBe(40);
  });

  it('caps at level 18, the highest level reachable in normal play (DATA-SOURCES §13)', () => {
    // Press the Attack's own formula 40 + (160-40)/17*(x-1) pins level 18 to exactly 160.
    // The wiki RENDERS 174.12, which is the level-20 extrapolation and would overstate damage.
    const pta: Scaling = { scaling: 'byLevel', from: 40, to: 160, atLevels: [1, 18], steps: 18 };
    expect(valueAtLevel(pta, 18)).toBeCloseTo(160, 10);
    expect(valueAtLevel(pta, 18)).not.toBeCloseTo(174.12, 2);
  });

  it('refuses mismatched value and level lists', () => {
    expect(() =>
      levelBreakpoints({ scaling: 'byLevelExplicit', values: [1, 2], atLevels: [1] }),
    ).toThrow(ScalingError);
  });
});

describe('the two axes are never silently confused', () => {
  it('expandByRank refuses a level-scaled value', () => {
    expect(() =>
      expandByRank({ scaling: 'byLevel', from: 1, to: 2, atLevels: [1, 18], steps: 2 }, 5),
    ).toThrow(ScalingError);
  });

  it('levelBreakpoints refuses a rank-scaled value', () => {
    expect(() => levelBreakpoints({ scaling: 'linear', from: 1, to: 2 })).toThrow(ScalingError);
  });

  it('isLevelScaled identifies the axis', () => {
    expect(isLevelScaled({ scaling: 'linear', from: 1, to: 2 })).toBe(false);
    expect(isLevelScaled({ scaling: 'explicit', perRank: [1] })).toBe(false);
    expect(isLevelScaled({ scaling: 'byLevel', from: 1, to: 2, atLevels: [1, 18], steps: 2 })).toBe(
      true,
    );
  });

  it('valueAt routes each arm to the right axis', () => {
    const rank: Scaling = { scaling: 'linear', from: 80, to: 240 };
    expect(valueAt(rank, { rank: 3, maxRank: 5, level: 18 })).toBe(160);
    const lvl: Scaling = { scaling: 'byLevel', from: 60, to: 100, atLevels: [1, 13], steps: 3 };
    // Rank is irrelevant to a level-scaled value, and must not change the answer.
    expect(valueAt(lvl, { rank: 1, maxRank: 5, level: 7 })).toBe(80);
    expect(valueAt(lvl, { rank: 5, maxRank: 5, level: 7 })).toBe(80);
  });
});

describe('interpolate — the shared helper, stated directly', () => {
  it('matches the documented formula at every index', () => {
    // value(x) = from + (to - from) / (steps - 1) * (x - 1)
    for (let x = 1; x <= 5; x += 1) {
      expect(interpolate(80, 240, 5, x)).toBeCloseTo(80 + ((240 - 80) / 4) * (x - 1), 10);
    }
  });
});
