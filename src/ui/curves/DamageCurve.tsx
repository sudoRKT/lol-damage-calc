// THE SWEEP CURVE — SPECIFICATION §11's damage-versus-level and damage-versus-resistance views.
//
// ONE COMPONENT FOR BOTH, because they are one operation: the engine runs the combo repeatedly with
// one input moved and returns a `SweepSeries` that already carries its own axis label, its own
// point labels and its own conventions in words. Nothing here knows whether the axis is levels or
// armor, and nothing here decides a convention — a component that had to be told "this one is
// levels" would be a second place the two views could drift apart.
//
// ═══ WHERE EVERY NUMBER ON SCREEN COMES FROM ═══
//
// Every damage figure is read off `PointSummary` and rendered through `AggregateTotal`, so it
// carries its damage-type composition bar and speaks its types in full. Health figures go through
// `formatReadout` — they are the engine's unrounded working values and printing them raw puts
// `1019.1803996452423` in front of a reader (`../primitives/readout.ts`). No figure is recomputed
// here; in particular burst and damage over time are never added together (SPECIFICATION §3.8), and
// the survival verdict is shown TWICE because that is what §3.8 asks for.
//
// ═══ THE PICTURE IS `aria-hidden`, AND EVERYTHING IN IT IS SOMEWHERE ELSE ═══
//
// The plot is decorative in the strict sense: not one fact reaches a reader through it alone. The
// figure carries a one-sentence description of what is plotted (`curveDescription`), and the table
// beneath carries every point — its value, both verdicts, its verification status and, for a
// refused point, the engine's own reason for refusing. That is the same arrangement the HP burndown
// uses, and it is why the chart needs no interactive points to be accessible.
//
// ═══ THREE THINGS THIS COMPONENT REFUSES TO DRAW SMOOTHLY OVER ═══
//
//   1. A refused point. One polyline per contiguous run, so a hole is a gap (see `geometry.ts`).
//   2. A partial point. When any computed point left a contributor out, every figure on the chart
//      is a FLOOR on the damage rather than the damage, and it says so above the plot rather than
//      in a footnote.
//   3. A range whose excluded set VARIES. `SweepSeries.incompleteSetVaries` is the subtlest hazard
//      in a curve and it has no visual signature at all: every point is real, the line is
//      continuous, and yet the two ends are not comparable because one includes an ability the
//      other does not. A step in such a curve is a data-coverage artefact wearing the costume of a
//      mechanic, so it is called out first, before the plot.

import { useId } from 'react';
import type { SweepSeries } from '../../engine';
import {
  AggregateTotal,
  TableScroller,
  VerificationStatusMark,
  formatReadout,
} from '../primitives';
import {
  buildCurveModel,
  curveDescription,
  pct,
  polylinePoints,
  refusalText,
  type CurveLineKind,
} from './geometry';
import './curves.css';

export interface DamageCurveProps {
  /**
   * The sweep, exactly as `damageVsLevel` or `damageVsResistance` returned it.
   *
   * `SweepSeries<unknown>` rather than a generic: this component reads only the parts of a point
   * that every sweep has — its x, its label, its status and its summary — and never the `applied`
   * payload that differs between them. Both `LevelSweepSeries` and `ResistanceSweepSeries` are
   * assignable to it.
   */
  series: SweepSeries<unknown>;
  /** Heading text. The chart is a figure and needs a name; the page supplies the wording. */
  title?: string;
  /**
   * Draw the target's health as a third line, so the reader can see where the burst crosses it.
   * Default true. Turning it off rescales the y axis to the damage alone — see `geometry.ts`.
   */
  showTargetHealth?: boolean;
}

/** The one damage-free legend entry: the mark left where the engine refused to compute. */
const REFUSED_LEGEND = 'Refused — nothing computed here';

export function DamageCurve({ series, title, showTargetHealth = true }: DamageCurveProps) {
  const model = buildCurveModel(series, { showTargetHealth });
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  const heading = title ?? `Damage versus ${series.axisLabel}`;
  const total = model.computedCount + model.refusedCount;

  // Contributors missing at SOME points but not all — the ones that make the curve incomparable
  // with itself. `incompleteEverywhere` is a floor on every point equally, which is a different
  // and lesser problem, so the two lists are never merged.
  const varying = series.incompleteSomewhere.filter(
    (label) => !series.incompleteEverywhere.includes(label),
  );

  return (
    <section className="curve-panel" aria-labelledby={titleId}>
      <header className="curve-panel__head">
        <h2 className="curve-panel__title" id={titleId}>
          {heading}
        </h2>
        <p className="curve-panel__coverage">
          {total} points · {model.computedCount} computed · {model.refusedCount} refused
        </p>
      </header>

      {series.incompleteSetVaries ? (
        <section className="curve-panel__alarm" aria-label="These points are not comparable">
          <h3 className="curve-panel__eyebrow">These points are not comparable with each other</h3>
          <p className="curve-panel__note">
            Something is left out of some points on this curve and included in others, so a step in
            the line may be a gap in the data rather than a change in the game. What varies:{' '}
            {varying.join(', ')}.
          </p>
        </section>
      ) : null}

      {series.anyPartial ? (
        <p className="curve-panel__note curve-panel__note--floor">
          Every figure on this curve is a floor on the damage, not the damage: something is excluded
          from the totals.
          {series.incompleteEverywhere.length > 0
            ? ` Excluded at every point: ${series.incompleteEverywhere.join(', ')}.`
            : ''}
        </p>
      ) : null}

      <figure className="curve-panel__figure" aria-labelledby={descId}>
        <p className="curve__axis-name">{model.yAxisLabel}</p>

        <div className="curve__chart">
          <div className="curve__rail" aria-hidden="true">
            {model.yTicks.map((tick) => (
              <span
                className="curve__ytick"
                key={`y${tick.value}`}
                style={{ insetBlockStart: pct(tick.fraction) }}
              >
                <span className="curve__ytick-text">{tick.label}</span>
              </span>
            ))}
          </div>

          <div className="curve__plot">
            {model.yTicks.map((tick) => (
              <div
                aria-hidden="true"
                className={tick.value === 0 ? 'curve__grid curve__grid--zero' : 'curve__grid'}
                key={`g${tick.value}`}
                style={{ insetBlockStart: pct(tick.fraction) }}
              />
            ))}

            {/* A refused point is a hatched band, not a gap you have to notice on your own. */}
            {model.refused.map((mark) => (
              <div
                aria-hidden="true"
                className="curve__refused"
                key={`r${mark.x}`}
                style={{ insetInlineStart: pct(mark.fraction) }}
              >
                <span className="curve__refused-band" />
              </div>
            ))}

            {/* preserveAspectRatio="none" stretches a 0–100 square to whatever box the plot is;
                `vector-effect` keeps every stroke at its declared width in real pixels, so the
                lines do not thicken or thin with the viewport. */}
            {/* `width`/`height` are ATTRIBUTES rather than CSS, and that is not a style smuggled
                past the token audit — it is the only way to stop an SVG's intrinsic 1:1 aspect
                ratio deciding its height. MEASURED in a real browser: with `position:absolute;
                inset:0` alone the element rendered 219px tall inside a 320px plot, so the curve
                filled two thirds of its own frame. Both values are fractions of the parent, the
                same standing the length allow-list gives `.chip__img`. */}
            <svg
              aria-hidden="true"
              className="curve__svg"
              focusable="false"
              height="100%"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
              width="100%"
            >
              {model.lines.map((line) =>
                line.segments.map((segment, index) => (
                  <polyline
                    className={`curve__line curve__line--${line.kind}`}
                    key={`${line.kind}-${index}`}
                    points={polylinePoints(segment)}
                    vectorEffect="non-scaling-stroke"
                  />
                )),
              )}
            </svg>
          </div>
        </div>

        <div className="curve__xaxis" aria-hidden="true">
          {model.xTicks.map((tick, index) => (
            <span
              className={xTickClass(index, model.xTicks.length)}
              key={`x${tick.value}`}
              style={{ insetInlineStart: pct(tick.fraction) }}
            >
              {/* The label is its own element inside the zero-width anchor so it can be MEASURED.
                  Text sitting directly in a zero-width box reports a zero-width rectangle, which
                  makes "do two labels collide?" unanswerable in a browser — and label collision is
                  the defect the burndown's own axis is still carrying (burndown.css). */}
              <span className="curve__xtick-text">{tick.label}</span>
            </span>
          ))}
        </div>

        <p className="curve__axis-name curve__axis-name--x">{series.axisLabel}</p>

        <ul aria-label="What each line is" className="curve__legend">
          {model.lines.map((line) => (
            <li className="curve__legend-item" key={line.kind}>
              <LineSwatch kind={line.kind} />
              <span>{line.label}</span>
            </li>
          ))}
          {model.refusedCount > 0 ? (
            <li className="curve__legend-item">
              <span aria-hidden="true" className="curve__legend-hatch" />
              <span>{REFUSED_LEGEND}</span>
            </li>
          ) : null}
        </ul>

        <figcaption className="curve__description" id={descId}>
          {curveDescription(model)}
        </figcaption>
      </figure>

      <TableScroller label={`${heading}, point by point`}>
        <table className="curve-table">
          <caption className="u-visually-hidden">
            Every point of the sweep: what it was evaluated at, the burst total, damage over time,
            both survival verdicts, and the verification status. A refused point states the engine’s
            reason instead of a figure.
          </caption>
          <thead>
            <tr>
              <th scope="col">{series.axisLabel}</th>
              <th scope="col">Burst</th>
              <th scope="col">Damage over time</th>
              <th scope="col">Verdict — burst</th>
              <th scope="col">Verdict — burst + DoT</th>
              <th scope="col">Target health</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {series.points.map((point) =>
              point.status === 'computed' ? (
                <tr key={point.label}>
                  <th className="curve-table__x" scope="row">
                    {point.label}
                  </th>
                  <td className="curve-table__figure">
                    <AggregateTotal
                      byType={point.summary.burst.byType}
                      size="l"
                      total={point.summary.burst.total}
                    />
                  </td>
                  <td className="curve-table__figure">
                    {point.summary.dot.total > 0 ? (
                      <AggregateTotal
                        byType={point.summary.dot.byType}
                        size="l"
                        total={point.summary.dot.total}
                      />
                    ) : (
                      <span className="curve-table__none">
                        <span aria-hidden="true">—</span>
                        <span className="u-visually-hidden">no damage over time</span>
                      </span>
                    )}
                  </td>
                  <td>{verdictText(point.summary.verdict.burstOnly)}</td>
                  <td>{verdictText(point.summary.verdict.burstPlusDot)}</td>
                  <td className="curve-table__hp">{formatReadout(point.summary.defenderHp)}</td>
                  <td className="curve-table__evidence">
                    <VerificationStatusMark
                      spokenSubject={point.label}
                      status={point.summary.verification}
                    />
                    {point.summary.partial ? (
                      <span className="curve-table__floor">
                        floor — {point.summary.incompleteContributors.length} excluded
                      </span>
                    ) : null}
                  </td>
                </tr>
              ) : (
                <tr key={point.label}>
                  <th className="curve-table__x" scope="row">
                    {point.label}
                  </th>
                  <td className="curve-table__refusal" colSpan={6}>
                    Refused. {point.refusals.map(refusalText).join(' ')}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </TableScroller>

      {series.incompleteSomewhere.length > 0 ? (
        <section className="curve-panel__block" aria-label="Excluded from these totals">
          <h3 className="curve-panel__eyebrow">Excluded from these totals</h3>
          <ul className="curve-panel__list">
            {series.incompleteSomewhere.map((label) => (
              <li key={label}>
                {label}
                {series.incompleteEverywhere.includes(label)
                  ? ' — at every point on the curve'
                  : ' — at some points and not others'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {series.excludedMechanics.length > 0 ? (
        <section className="curve-panel__block" aria-label="Mechanics this curve excludes">
          <h3 className="curve-panel__eyebrow">Mechanics this curve excludes</h3>
          <ul className="curve-panel__list">
            {series.excludedMechanics.map((mechanic) => (
              <li key={mechanic}>{mechanic}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {series.notes.length > 0 ? (
        <section className="curve-panel__block" aria-label="How this curve was produced">
          <h3 className="curve-panel__eyebrow">How this curve was produced</h3>
          <ul className="curve-panel__list">
            {series.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

/**
 * One verdict as a sentence.
 *
 * "Lethal" and "Survives" are words, never a colour: DESIGN.md §1 reserves hue, and the lethal
 * magenta of §7 is spent on the burndown's zero-crossing rule. The remaining health is the second
 * half of the sentence because "survives" alone does not say by how much.
 */
export function verdictText(verdict: {
  lethal: boolean;
  remainingHp: number;
  lethalAtInstance: number | null;
}): string {
  if (verdict.lethal) {
    return verdict.lethalAtInstance === null
      ? 'Lethal'
      : `Lethal at instance ${verdict.lethalAtInstance}`;
  }
  return `Survives, ${formatReadout(verdict.remainingHp)} left`;
}

/** The legend's stroke sample. The SAME classes the plot's lines use, so it cannot drift. */
function LineSwatch({ kind }: { kind: CurveLineKind }) {
  return (
    <svg aria-hidden="true" className="curve__swatch" focusable="false" viewBox="0 0 24 8">
      <line
        className={`curve__line curve__line--${kind}`}
        vectorEffect="non-scaling-stroke"
        x1="0"
        x2="24"
        y1="4"
        y2="4"
      />
    </svg>
  );
}

/**
 * Where a tick label sits relative to its own tick.
 *
 * The first and last labels are anchored to the inside of the plot rather than centred on their
 * tick, because a centred label at either end hangs half of itself outside the chart — which on a
 * 375px phone is where the label gets clipped.
 */
function xTickClass(index: number, count: number): string {
  if (index === 0) return 'curve__xtick curve__xtick--start';
  if (index === count - 1) return 'curve__xtick curve__xtick--end';
  return 'curve__xtick';
}
