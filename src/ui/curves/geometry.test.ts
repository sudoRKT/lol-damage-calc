// KNOWN-ANSWER TESTS FOR THE CURVE'S GEOMETRY.
//
// Every case here is a hand-built series with figures chosen so the right answer can be worked out
// on paper: a burst of 500 on a y axis topping out at 1000 sits at exactly half height, and half
// height on a screen is 0.5 from the TOP because `../plot/toPlotFractions` flips the axis once.
//
// THE PROPERTY MOST OF THESE ARE REALLY ABOUT is that a refused point is never drawn through. That
// is a safety rule rather than a cosmetic one (see `geometry.ts`), so it is tested from four
// directions: the number of segments, where each segment starts and stops, the refused marks' own
// positions, and the total count of drawn points against the series' own computed count.

import { describe, expect, it } from 'vitest';
import { buildSeries, type SweepPoint } from '../../engine';
import type { VerificationStatus } from '../../types';
import {
  buildCurveModel,
  curveDescription,
  pct,
  polylinePoints,
  type CurveLineKind,
} from './geometry';

interface PointSpec {
  x: number;
  burst?: number;
  dot?: number;
  hp?: number;
  lethal?: boolean;
  lethalWithDot?: boolean;
  verification?: VerificationStatus;
  contributors?: string[];
}

/** A computed point whose figures are exactly what the spec says, and nothing derived. */
function computed(spec: PointSpec): SweepPoint<null> {
  const burst = spec.burst ?? 0;
  const dot = spec.dot ?? 0;
  const hp = spec.hp ?? 1000;
  return {
    x: spec.x,
    label: `level ${spec.x}`,
    applied: null,
    status: 'computed',
    summary: {
      burst: { total: burst, byType: { physical: burst, magic: 0, true: 0 } },
      dot: { total: dot, byType: { physical: 0, magic: dot, true: 0 } },
      verdict: {
        burstOnly: {
          lethal: spec.lethal ?? false,
          lethalAtInstance: spec.lethal ? 2 : null,
          remainingHp: spec.lethal ? 0 : hp - burst,
          damageApplied: burst,
          healingApplied: 0,
        },
        burstPlusDot: {
          lethal: spec.lethal || (spec.lethalWithDot ?? false),
          lethalAtInstance: spec.lethal || spec.lethalWithDot ? 2 : null,
          remainingHp: spec.lethal || spec.lethalWithDot ? 0 : hp - burst - dot,
          damageApplied: burst + dot,
          healingApplied: 0,
        },
      },
      attackerLevel: spec.x,
      defenderLevel: spec.x,
      defenderHp: hp,
      verification: spec.verification ?? 'derived',
      partial: (spec.contributors ?? []).length > 0,
      incompleteContributors: spec.contributors ?? [],
    },
  };
}

function refused(x: number, reason: string): SweepPoint<null> {
  return {
    x,
    label: `level ${x}`,
    applied: null,
    status: 'refused',
    refusals: [{ path: 'attacker.abilityRanks', reason }],
  };
}

function series(points: SweepPoint<null>[]) {
  return buildSeries({ kind: 'level', axisLabel: 'attacker level', points });
}

const lineOf = (model: ReturnType<typeof buildCurveModel>, kind: CurveLineKind) =>
  model.lines.find((l) => l.kind === kind);

describe('curves/geometry — the plot box', () => {
  it('maps the x domain across every point, refused ones included', () => {
    // The refused point at 18 is the top of the axis. Dropping it would silently shorten the range
    // to 1–9 and stretch the drawn part of the curve across the whole plot.
    const model = buildCurveModel(
      series([computed({ x: 1 }), computed({ x: 9 }), refused(18, 'rank 5 needs level 9')]),
    );
    expect(model.x).toEqual({ min: 1, max: 18 });
  });

  it('puts zero in the y domain, so a small difference cannot be drawn as a large one', () => {
    const model = buildCurveModel(
      series([computed({ x: 1, burst: 950 }), computed({ x: 2, burst: 1000 })]),
      { showTargetHealth: false },
    );
    expect(model.y).toEqual({ min: 0, max: 1000 });
  });

  it('flips y exactly once — a burst of 500 against a 1000 axis is half way UP the plot', () => {
    const model = buildCurveModel(
      series([computed({ x: 1, burst: 0 }), computed({ x: 2, burst: 500 }), computed({ x: 3, burst: 1000 })]),
      { showTargetHealth: false },
    );
    const points = lineOf(model, 'burst')!.segments[0]!;
    expect(points.map((p) => p.y)).toEqual([1, 0.5, 0]);
    expect(points.map((p) => p.x)).toEqual([0, 0.5, 1]);
  });

  it('scales the y axis to the damage alone when the health line is switched off', () => {
    const withHealth = buildCurveModel(series([computed({ x: 1, burst: 400, hp: 2000 })]));
    const without = buildCurveModel(series([computed({ x: 1, burst: 400, hp: 2000 })]), {
      showTargetHealth: false,
    });
    expect(withHealth.y.max).toBe(2000);
    expect(without.y.max).toBe(400);
  });
});

describe('curves/geometry — a refused point is never drawn through', () => {
  const points = [
    computed({ x: 1, burst: 100 }),
    computed({ x: 2, burst: 200 }),
    refused(3, 'the combo casts R, and at this level the build has 0 points in R'),
    refused(4, 'the combo casts R, and at this level the build has 0 points in R'),
    computed({ x: 5, burst: 500 }),
  ];
  const model = buildCurveModel(series(points), { showTargetHealth: false });

  it('splits the line into one segment per run of consecutive computed points', () => {
    const burst = lineOf(model, 'burst')!;
    expect(burst.segments).toHaveLength(2);
    expect(burst.segments.map((s) => s.length)).toEqual([2, 1]);
  });

  it('draws exactly as many points as the series computed — no more, no fewer', () => {
    const drawn = lineOf(model, 'burst')!.segments.reduce((n, s) => n + s.length, 0);
    expect(drawn).toBe(model.computedCount);
    expect(model.computedCount).toBe(3);
    expect(model.refusedCount).toBe(2);
  });

  it('marks each refused point at its own place on the axis, with the engine’s own reason', () => {
    expect(model.refused.map((r) => r.x)).toEqual([3, 4]);
    expect(model.refused[0]!.fraction).toBeCloseTo(0.5, 10);
    expect(model.refused[0]!.reasons[0]).toContain('0 points in R');
    expect(model.refused[0]!.reasons[0]).toContain('attacker.abilityRanks');
  });

  it('renders a lone computed point as a zero-length segment, not as nothing', () => {
    const lone = lineOf(model, 'burst')!.segments[1]!;
    expect(lone).toHaveLength(1);
    // A one-point polyline draws no ink at all. Repeating the coordinate makes a dot.
    expect(polylinePoints(lone)).toBe('100.0000,0.0000 100.0000,0.0000');
  });

  it('draws nothing at all when every point refused', () => {
    const empty = buildCurveModel(series([refused(1, 'no'), refused(2, 'no')]));
    expect(empty.drawable).toBe(false);
    expect(empty.lines.every((l) => l.segments.length === 0)).toBe(true);
    expect(empty.refused).toHaveLength(2);
  });

  it('survives a series with no points at all', () => {
    const none = buildCurveModel(series([]));
    expect(none.drawable).toBe(false);
    expect(none.x).toEqual({ min: 0, max: 1 });
    expect(none.lines.every((l) => l.segments.length === 0)).toBe(true);
  });
});

describe('curves/geometry — damage over time is its own line, never folded in', () => {
  it('omits the DoT line entirely when nothing burns', () => {
    const model = buildCurveModel(series([computed({ x: 1, burst: 300 })]));
    expect(model.lines.map((l) => l.kind)).toEqual(['burst', 'targetHealth']);
  });

  it('draws it separately when something does, and never sums the two', () => {
    const model = buildCurveModel(
      series([computed({ x: 1, burst: 300, dot: 120 })]),
      { showTargetHealth: false },
    );
    expect(model.lines.map((l) => l.kind)).toEqual(['burst', 'dot']);
    // The y axis tops out at the LARGER of the two lines, never at their sum.
    expect(model.y.max).toBe(300);
  });
});

describe('curves/geometry — the verdict the chart reports', () => {
  it('reports the first point the burst alone kills at', () => {
    const model = buildCurveModel(
      series([
        computed({ x: 1, burst: 100 }),
        computed({ x: 2, burst: 1200, lethal: true }),
        computed({ x: 3, burst: 1500, lethal: true }),
      ]),
    );
    expect(model.firstLethal).toEqual({ label: 'level 2', withDot: false });
  });

  it('prefers a burst kill to an earlier burst-plus-DoT kill, and says which it is', () => {
    const model = buildCurveModel(
      series([
        computed({ x: 1, burst: 900, lethalWithDot: true }),
        computed({ x: 2, burst: 1200, lethal: true }),
      ]),
    );
    expect(model.firstLethal).toEqual({ label: 'level 2', withDot: false });
  });

  it('falls back to the burst-plus-DoT verdict, flagged as such (SPECIFICATION §3.8)', () => {
    const model = buildCurveModel(
      series([computed({ x: 1, burst: 900, dot: 200, lethalWithDot: true })]),
    );
    expect(model.firstLethal).toEqual({ label: 'level 1', withDot: true });
  });

  it('reports no kill at all rather than inventing one', () => {
    const model = buildCurveModel(series([computed({ x: 1, burst: 10 })]));
    expect(model.firstLethal).toBeNull();
  });

  it('names the highest and lowest point of the curve', () => {
    const model = buildCurveModel(
      series([
        computed({ x: 1, burst: 300 }),
        computed({ x: 2, burst: 900 }),
        computed({ x: 3, burst: 120 }),
      ]),
    );
    expect(model.highest).toEqual({ label: 'level 2', total: 900 });
    expect(model.lowest).toEqual({ label: 'level 3', total: 120 });
  });
});

describe('curves/geometry — the figure’s spoken description', () => {
  const model = buildCurveModel(
    series([
      computed({ x: 1, burst: 100 }),
      refused(2, 'rank 3 of this slot requires level 5'),
      computed({ x: 3, burst: 700, lethal: true }),
    ]),
  );
  const text = curveDescription(model);

  it('says what is plotted and over what range', () => {
    expect(text).toContain('attacker level');
    expect(text).toContain('from 1 to 3');
  });

  it('says how much of the range could not be computed, and that the gaps are gaps', () => {
    expect(text).toContain('2 of 3 points computed');
    expect(text).toContain('1 refused');
    expect(text).toContain('rather than drawn through');
  });

  it('names each line by its stroke, since the strokes are what tell them apart', () => {
    expect(text).toContain('A solid line for the burst total');
    expect(text).toContain('dotted line for the target’s health');
  });

  it('says where the combo starts killing', () => {
    expect(text).toContain('The burst alone first kills at level 3');
  });
});

describe('curves/geometry — small helpers', () => {
  it('pct writes a fraction as a CSS percentage', () => {
    expect(pct(0)).toBe('0.0000%');
    expect(pct(0.5)).toBe('50.0000%');
    expect(pct(1)).toBe('100.0000%');
  });

  it('polylinePoints scales fractions into the 0–100 viewBox', () => {
    expect(polylinePoints([{ x: 0, y: 1 }, { x: 1, y: 0 }])).toBe('0.0000,100.0000 100.0000,0.0000');
  });

  it('ticks land on both ends of the x axis and start at zero on the y axis', () => {
    const model = buildCurveModel(
      series([computed({ x: 1, burst: 0 }), computed({ x: 18, burst: 1000 })]),
      { showTargetHealth: false },
    );
    expect(model.xTicks[0]!.value).toBe(1);
    expect(model.xTicks[model.xTicks.length - 1]!.value).toBe(18);
    expect(model.yTicks[0]!.value).toBe(0);
    expect(model.yTicks[0]!.fraction).toBe(1);
  });
});
