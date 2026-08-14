// SHARED AXIS AND SCALE — the geometry two chart areas need and neither owns.
//
// LEAD-ONLY, and the same standing as `primitives/` and `art/`: more than one area reads it, so
// one area must not write it. `ui-curves` and `ui-compare` are independent areas BECAUSE this
// exists; without it each would write its own axis and the two would drift apart on the one thing
// a reader compares across charts — where the gridlines fall.
//
// ═══ WHAT IS HERE AND WHAT IS NOT ═══
//
// Numbers only. No React, no CSS, no colour. A chart decides how it looks; this decides where
// things sit, and it is testable without rendering anything.
//
// `niceTicks` is MOVED FROM `burndown/geometry.ts`, not copied — that file now imports it. It was
// already generic (it takes a maximum and a tick budget and knows nothing about health), and
// leaving a second copy behind is how two charts come to disagree.
//
// ═══ WHY A CURVE NEEDS MORE THAN THE BURNDOWN DID ═══
//
// The burndown's x axis is CATEGORICAL — one column per instance, evenly spaced, and the labels
// are names rather than numbers. A damage-versus-level or damage-versus-resistance curve has a
// NUMERIC x axis: level 1 to 18, or 0 to 300 armor. So this adds a two-ended linear scale and a
// polyline builder, which the burndown never needed.

/** A closed numeric interval a chart maps from. `max` may be below `min` for a reversed axis. */
export interface Domain {
  min: number;
  max: number;
}

/**
 * Axis ticks at rounded intervals.
 *
 * Picks the smallest "nice" step (1, 2, 2.5 or 5 x a power of ten) that puts at most
 * `maxIntervals` gaps under `max`, then adds the axis top as a final label when it is far enough
 * from the last tick not to collide with it (half a step).
 *
 * MOVED HERE FROM `burndown/geometry.ts` on 2026-08-14, unchanged, so the burndown and the curves
 * cannot place their gridlines differently.
 */
export function niceTicks(max: number, maxIntervals = 5): number[] {
  if (!(max > 0)) return [0];
  const rough = max / maxIntervals;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => max / s <= maxIntervals) ??
    10 * magnitude;

  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  const last = ticks[ticks.length - 1]!;
  if (max - last >= step / 2) ticks.push(max);
  return ticks;
}

/**
 * Ticks for a domain that does not start at zero — champion level runs 1 to 18.
 *
 * `niceTicks` assumes a zero origin, which is right for health and wrong for level. This walks
 * from `min` in nice steps and always includes both ends, because a curve whose axis omits its
 * own first and last point is unreadable.
 */
export function domainTicks(domain: Domain, maxIntervals = 5): number[] {
  const { min, max } = domain;
  if (max <= min) return [min];
  const span = max - min;
  const rough = span / maxIntervals;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= maxIntervals) ??
    10 * magnitude;

  const out: number[] = [min];
  const first = Math.ceil(min / step) * step;
  for (let v = first; v < max - step / 2; v += step) {
    const rounded = Number(v.toFixed(6));
    if (rounded > min) out.push(rounded);
  }
  out.push(max);
  return out;
}

/**
 * Map a value in `domain` to a fraction of the plot, 0 at `min` and 1 at `max`.
 *
 * CLAMPED, deliberately. A point outside the domain is a caller error and drawing it outside the
 * frame would put ink where the axis says there is none — a chart that lies quietly. It is
 * clamped rather than thrown on because a curve is drawn per point and one bad point must not
 * take the whole chart down.
 *
 * A zero-width domain answers 0 rather than dividing by zero.
 */
export function fractionOf(value: number, domain: Domain): number {
  const span = domain.max - domain.min;
  if (span === 0) return 0;
  const raw = (value - domain.min) / span;
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

/** One point of a series, in DOMAIN units — not pixels and not fractions. */
export interface PlotPoint {
  x: number;
  y: number;
}

/**
 * A series as fractions of the plot box, ready for a `<polyline>` or an SVG path.
 *
 * **Y IS FLIPPED HERE AND NOWHERE ELSE.** Screen coordinates grow downward and a damage figure
 * grows upward, so every chart has to flip once. Doing it in one place is what stops one chart
 * drawing its curve upside down relative to another — and an upside-down curve is not obviously
 * wrong at a glance, which is the dangerous kind.
 *
 * Returns fractions, never pixels: the caller owns its own box.
 */
export function toPlotFractions(
  points: readonly PlotPoint[],
  x: Domain,
  y: Domain,
): Array<{ x: number; y: number }> {
  return points.map((p) => ({ x: fractionOf(p.x, x), y: 1 - fractionOf(p.y, y) }));
}

/**
 * The smallest domain containing every y value, with zero included.
 *
 * **ZERO IS ALWAYS IN IT.** A damage chart whose y axis starts at 400 makes a 5% difference look
 * like a 100% one, which is the classic misleading chart and exactly what this product cannot
 * afford. The floor is a decision, not a default, and it is made here so no chart can quietly
 * make a different one.
 *
 * An empty series answers `{ min: 0, max: 1 }` so a caller can still draw an axis.
 */
export function yDomainFor(series: ReadonlyArray<readonly PlotPoint[]>): Domain {
  const ys = series.flat().map((p) => p.y);
  if (ys.length === 0) return { min: 0, max: 1 };
  const max = Math.max(0, ...ys);
  return { min: 0, max: max === 0 ? 1 : max };
}
