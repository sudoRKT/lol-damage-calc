// THE GEOMETRY OF A SWEEP CURVE — everything about WHERE a curve's ink goes, with no React in it.
//
// SPECIFICATION §11 asks for a damage-versus-level curve and a damage-versus-resistance curve. The
// engine already computes both (`src/engine/level-sweep.ts`, `src/engine/resistance-sweep.ts`), and
// until now nothing drew either. This file turns a `SweepSeries` into fractions of a plot box; the
// component beside it turns fractions into markup. Splitting them is what makes the placement
// testable without rendering anything.
//
// ═══ WHAT THIS FILE REFUSES TO DO, AND WHY EACH REFUSAL IS THE POINT ═══
//
// 1. **IT NEVER DRAWS THROUGH A REFUSED POINT.** `src/engine/sweep.ts` makes a swept point a
//    discriminated union whose refused arm carries NO damage field of any kind, and offers exactly
//    one helper for turning a series into something drawable: `contiguousSegments`, which returns
//    runs of consecutive computed points. This file uses that helper and nothing else, so a hole in
//    a range is a visible gap in the line rather than a smooth interpolation across it. A curve
//    drawn straight through a range the engine could not compute is a plausible wrong number in
//    picture form, which is the one failure this product exists to prevent.
//
// 2. **IT OWNS NO SCALE.** Every domain, tick and fraction comes from `../plot`, which is shared
//    with the build-comparison view and lead-owned. In particular `toPlotFractions` is the ONE
//    place the y axis is flipped: screen coordinates grow downward and damage grows upward, and a
//    chart that flips a second time is upside down in a way nobody notices at a glance.
//
// 3. **IT NEVER ADDS BURST AND DAMAGE-OVER-TIME TOGETHER.** SPECIFICATION §3.8 makes DoT a separate
//    line, always, and `PointSummary` carries the two as separate figures with the survival verdict
//    stated twice. So this produces two separate curves and never a third that sums them.
//
// ═══ THE Y AXIS CARRIES TWO KINDS OF QUANTITY, DELIBERATELY ═══
//
// The burst curve is damage; the target-health curve is health. Both are measured in the defender's
// health points, which is exactly why they belong on one axis: the point where the damage curve
// crosses the health curve is the point where the combo starts killing, and that crossing is the
// question a reader brings to this chart. The y axis is therefore labelled as health points, the
// health curve is optional (`showTargetHealth: false` gives the damage curves the full height), and
// the axis ticks are a scale rather than damage figures — every actual damage figure appears in the
// table beneath the plot, through `DamageValue` / `AggregateTotal`, tagged.

import {
  contiguousSegments,
  type ComputedSweepPoint,
  type SweepSeries,
} from '../../engine';
import {
  domainTicks,
  fractionOf,
  niceTicks,
  toPlotFractions,
  yDomainFor,
  type Domain,
  type PlotPoint,
} from '../plot';
import { formatReadout } from '../primitives/readout';

/**
 * Which quantity a line traces.
 *
 * The KIND is what the component turns into a stroke pattern. Colour is not available to it:
 * DESIGN.md §1 reserves hue for the three damage types and two markers, so three neutral lines on
 * one plot must be told apart by SHAPE — solid, dashed, dotted — and by the legend.
 */
export type CurveLineKind = 'burst' | 'dot' | 'targetHealth';

/** One axis tick: the value, where it sits (0–1 along its axis), and how it reads. */
export interface CurveTick {
  value: number;
  /** 0 at the axis origin, 1 at its far end. For y this is already flipped for the screen. */
  fraction: number;
  label: string;
}

/** A point of a drawn line, as a fraction of the plot box. Never pixels. */
export interface CurvePoint {
  x: number;
  y: number;
}

export interface CurveLine {
  kind: CurveLineKind;
  /** Legend text, e.g. "Burst total". */
  label: string;
  /** The same fact in a sentence, for the figure's description. */
  spoken: string;
  /**
   * ONE ENTRY PER RUN OF CONSECUTIVE COMPUTED POINTS. Draw one polyline each; the gaps between
   * them are the points the engine refused.
   */
  segments: CurvePoint[][];
}

/** A point the engine refused, positioned so the plot can mark the gap it leaves. */
export interface RefusedMark {
  x: number;
  fraction: number;
  label: string;
  reasons: string[];
}

export interface CurveModel {
  /** The sweep this came from, e.g. 'level' or 'resistance'. */
  kind: string;
  /** The x axis in words, straight from the engine, e.g. "target armor". */
  axisLabel: string;
  /** The y axis in words. Says health points, because the axis carries damage AND health. */
  yAxisLabel: string;
  /** True when at least one point computed, so there is something to draw. */
  drawable: boolean;
  x: Domain;
  y: Domain;
  xTicks: CurveTick[];
  yTicks: CurveTick[];
  lines: CurveLine[];
  refused: RefusedMark[];
  computedCount: number;
  refusedCount: number;
  /** The computed point with the largest burst total, and the smallest. Null when none computed. */
  highest: { label: string; total: number } | null;
  lowest: { label: string; total: number } | null;
  /**
   * The first point along the sweep at which the defender dies, and whether it took the DoT to do
   * it. Null when the combo never kills anywhere in the range.
   */
  firstLethal: { label: string; withDot: boolean } | null;
}

export interface CurveModelOptions {
  /**
   * Draw the defender's health as a third line. Default true.
   *
   * Turning it off is not cosmetic: the y axis is then scaled to the damage alone, so a combo
   * dealing 900 against a 3,000-health target fills the plot instead of hugging the floor. The
   * cost is that the reader loses the crossing, which is where lethality is legible.
   */
  showTargetHealth?: boolean;
  /** Tick budget for the two axes. Defaults follow the shared scale's own defaults. */
  xTickBudget?: number;
  yTickBudget?: number;
}

const LINE_TEXT: Record<CurveLineKind, { label: string; spoken: string }> = {
  burst: {
    label: 'Burst total',
    spoken: 'a solid line for the burst total',
  },
  dot: {
    label: 'Damage over time',
    spoken: 'a dashed line for damage over time, which is never added into the burst total',
  },
  targetHealth: {
    label: 'Target health',
    spoken: 'a dotted line for the target’s health, which the burst line crosses where the combo starts killing',
  },
};

/** A tick label. Two decimal places at most, and no thousands grouping (`../primitives/readout`). */
function tickLabel(value: number): string {
  return formatReadout(value);
}

/**
 * Turn a sweep into everything a plot needs to draw it.
 *
 * The order of operations matters and is stated so it cannot drift: the x domain spans EVERY point
 * including the refused ones (a refused point still occupies its place on the axis — leaving it out
 * would silently shorten the range), and the y domain spans only the lines actually drawn, so
 * hiding the health line rescales the damage curves rather than leaving them squashed against a
 * floor for no visible reason.
 */
export function buildCurveModel<A>(
  series: SweepSeries<A>,
  options: CurveModelOptions = {},
): CurveModel {
  const showHealth = options.showTargetHealth !== false;
  const points = series.points;
  const computed = points.filter(
    (p): p is ComputedSweepPoint<A> => p.status === 'computed',
  );

  const xs = points.map((p) => p.x);
  const x: Domain =
    xs.length === 0 ? { min: 0, max: 1 } : { min: Math.min(...xs), max: Math.max(...xs) };

  const segments = contiguousSegments(series);

  // The y values of each candidate line, per segment, in domain units.
  const bursts = segments.map((run) => run.map((p) => ({ x: p.x, y: p.summary.burst.total })));
  const dots = segments.map((run) => run.map((p) => ({ x: p.x, y: p.summary.dot.total })));
  const healths = segments.map((run) => run.map((p) => ({ x: p.x, y: p.summary.defenderHp })));

  // A DoT line is drawn only when there IS damage over time. A flat zero line along the bottom of
  // every plot would be three pixels of ink saying nothing, and it would put "damage over time" in
  // the legend of a combo that has none.
  const anyDot = computed.some((p) => p.summary.dot.total > 0);

  const drawn: Array<{ kind: CurveLineKind; runs: PlotPoint[][] }> = [
    { kind: 'burst', runs: bursts },
    ...(anyDot ? [{ kind: 'dot' as const, runs: dots }] : []),
    ...(showHealth ? [{ kind: 'targetHealth' as const, runs: healths }] : []),
  ];

  const y = yDomainFor(drawn.flatMap((line) => line.runs));

  const lines: CurveLine[] = drawn.map((line) => ({
    kind: line.kind,
    label: LINE_TEXT[line.kind].label,
    spoken: LINE_TEXT[line.kind].spoken,
    segments: line.runs
      .filter((run) => run.length > 0)
      .map((run) => toPlotFractions(run, x, y)),
  }));

  const refused: RefusedMark[] = points
    .filter((p) => p.status === 'refused')
    .map((p) => ({
      x: p.x,
      fraction: fractionOf(p.x, x),
      label: p.label,
      reasons: p.status === 'refused' ? p.refusals.map(refusalText) : [],
    }));

  const xTicks = domainTicks(x, options.xTickBudget ?? 5).map((value) => ({
    value,
    fraction: fractionOf(value, x),
    label: tickLabel(value),
  }));

  // niceTicks assumes a zero origin, which is what `yDomainFor` guarantees: zero is always in a
  // damage chart's y domain (../plot), so a 5% difference can never be drawn as a 100% one.
  const yTicks = niceTicks(y.max, options.yTickBudget ?? 4).map((value) => ({
    value,
    fraction: 1 - fractionOf(value, y),
    label: tickLabel(value),
  }));

  return {
    kind: series.kind,
    axisLabel: series.axisLabel,
    yAxisLabel: showHealth ? 'health points — damage and target health' : 'damage (health points)',
    drawable: computed.length > 0,
    x,
    y,
    xTicks,
    yTicks,
    lines,
    refused,
    computedCount: series.computedCount,
    refusedCount: series.refusedCount,
    highest: extremeBurst(computed, 'highest'),
    lowest: extremeBurst(computed, 'lowest'),
    firstLethal: firstLethalPoint(computed),
  };
}

/** One refusal as a sentence: the path it is about, then the reason the engine gave. */
export function refusalText(refusal: { path: string; reason: string }): string {
  return `${refusal.path}: ${refusal.reason}`;
}

function extremeBurst<A>(
  computed: readonly ComputedSweepPoint<A>[],
  which: 'highest' | 'lowest',
): { label: string; total: number } | null {
  if (computed.length === 0) return null;
  let best = computed[0]!;
  for (const point of computed) {
    const better =
      which === 'highest'
        ? point.summary.burst.total > best.summary.burst.total
        : point.summary.burst.total < best.summary.burst.total;
    if (better) best = point;
  }
  return { label: best.label, total: best.summary.burst.total };
}

/**
 * The first point in SERIES ORDER at which the defender dies.
 *
 * Burst alone is preferred over burst-plus-DoT, and the answer says which — because SPECIFICATION
 * §3.8 makes those two different verdicts and a chart that reported only "it kills here" would be
 * collapsing them. Series order rather than sorted x order: the caller owns the order of its own
 * points (`resistance-sweep.ts` keeps the caller's order unless asked to sort).
 */
function firstLethalPoint<A>(
  computed: readonly ComputedSweepPoint<A>[],
): { label: string; withDot: boolean } | null {
  for (const point of computed) {
    if (point.summary.verdict.burstOnly.lethal) return { label: point.label, withDot: false };
  }
  for (const point of computed) {
    if (point.summary.verdict.burstPlusDot.lethal) return { label: point.label, withDot: true };
  }
  return null;
}

/**
 * The chart in one sentence, for the figure's description.
 *
 * A screen-reader user meets the figure before the table, and "chart" on its own tells them
 * nothing. This says what is plotted, over what range, in which strokes, and how much of the range
 * could not be computed — so the picture's contents are in the accessibility tree even though the
 * picture itself is `aria-hidden`.
 */
export function curveDescription(model: CurveModel): string {
  const parts: string[] = [];
  parts.push(
    `Damage against ${model.axisLabel}, from ${tickLabel(model.x.min)} to ${tickLabel(model.x.max)}`,
  );
  parts.push(model.lines.map((line) => line.spoken).join('; '));
  parts.push(
    `${model.computedCount} of ${model.computedCount + model.refusedCount} points computed`,
  );
  if (model.refusedCount > 0) {
    parts.push(
      `${model.refusedCount} refused and left as gaps in the line rather than drawn through`,
    );
  }
  if (model.highest && model.lowest) {
    parts.push(
      `the burst total runs from ${tickLabel(model.lowest.total)} at ${model.lowest.label} ` +
        `to ${tickLabel(model.highest.total)} at ${model.highest.label}`,
    );
  }
  if (model.firstLethal) {
    parts.push(
      model.firstLethal.withDot
        ? `the defender first dies at ${model.firstLethal.label}, and only once damage over time is counted`
        : `the burst alone first kills at ${model.firstLethal.label}`,
    );
  } else if (model.drawable) {
    parts.push('the defender survives at every computed point');
  }
  // Each part is a sentence, so each part starts with a capital. Joining lowercase fragments with
  // full stops reads as broken prose on screen and is announced as broken prose too.
  return `${parts.map(capitalise).join('. ')}.`;
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/** A fraction as a CSS percentage. Geometry, not a design length. */
export function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(4)}%`;
}

/**
 * A run of points as an SVG `points` attribute, in the 0–100 user space the plot's viewBox uses.
 *
 * A ONE-POINT RUN IS EMITTED TWICE, on purpose. A polyline with a single point draws nothing at
 * all, so a lone computed point between two refused ones would vanish — the reader would see an
 * empty plot and no indication that one value exists. Repeating the point makes a zero-length
 * segment, which a round line cap renders as a dot.
 */
export function polylinePoints(run: readonly CurvePoint[]): string {
  const coords = run.map((p) => `${(p.x * 100).toFixed(4)},${(p.y * 100).toFixed(4)}`);
  if (coords.length === 1) return `${coords[0]} ${coords[0]}`;
  return coords.join(' ');
}
