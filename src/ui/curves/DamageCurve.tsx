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
//
//   4. A LEVEL CURVE WHOSE TOP IS BELOW THE BUILD THE USER CONFIGURED (added 2026-08-15). This has
//      the same shape as 3 — a full, continuous, plausible line that is not what the reader asked
//      for — and until the `ranks` prop existed it had no signature either. `rank-shortfall.ts`
//      carries the measurement and the wording; this file draws the mark and prints the sentences.
//      The prop is OPTIONAL because a resistance curve has no ability ranks to be short of, and a
//      caller that passes it against a series carrying no ranks is told so rather than reassured.
//
// ═══ AND ONE THING THIS FILE DELIBERATELY DOES NOT DO YET ═══
//
// `src/engine/level-sweep.ts` grew `series.rankReport`, `AppliedLevel.configuredRanks` and
// `AppliedLevel.rankShortfall` on 2026-08-15, while this was being built. That is a better source
// than the `ranks` prop — it cannot disagree with the series it describes — and the prop should be
// retired in favour of it. It is NOT wired here because that work's own suite was failing when this
// was written, and an interface built on a red contract is an interface that has to be rebuilt.
// Raised to the lead rather than decided here. `appliedLevelRanks` is a RUNTIME guard rather than a
// type assertion precisely so this file keeps working across that change in either direction.

import { useId } from 'react';
import type { LevelRankPolicy, RankSchedule, Ranks, SweepSeries } from '../../engine';
import type { SlotShortfall } from './rank-shortfall';
import {
  AggregateTotal,
  TableScroller,
  VerificationStatusMark,
  formatReadout,
} from '../primitives';
import { fractionOf } from '../plot';
import {
  buildCurveModel,
  curveDescription,
  pct,
  polylinePoints,
  refusalText,
  type CurveLineKind,
} from './geometry';
import {
  annotateNotes,
  appliedLevelRanks,
  noteConfirmation,
  noteContradictionText,
  policyDetail,
  policyPhrase,
  rankShortfall,
  ranksPhrase,
  shortfallAt,
  shortfallCellParts,
  shortfallDescription,
  shortfallWarnings,
} from './rank-shortfall';
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
  /**
   * WHAT ABILITY RANKS THIS CURVE WAS DRAWN AT, and what the user actually configured.
   *
   * Supply it for a level sweep and the chart prints the rank schedule it ran under, the drawn
   * ranks on every row, and a mark wherever the line sits below a build no level can reach. Omit
   * it and the chart is exactly what it was before — which is right for a resistance sweep, where
   * ranks do not move.
   *
   * It is a PROP rather than something read off the series because `AppliedLevel` records the
   * ranks a point used but not the ranks the Scenario stated, and the type contract is frozen
   * (CLAUDE.md). A caller holding the Scenario has them, so no contract change is needed.
   */
  ranks?: DamageCurveRanks;
}

export interface DamageCurveRanks {
  /** The ranks the Scenario states — the build the user configured. */
  configured: Ranks;
  /** The policy the caller passed to `damageVsLevel`. Printed, and cross-checked against notes. */
  policy: LevelRankPolicy;
  /** The rank schedule the sweep used. Defaults to the engine's own default. */
  schedule?: RankSchedule;
}

/** The one damage-free legend entry: the mark left where the engine refused to compute. */
const REFUSED_LEGEND = 'Refused — nothing computed here';

/**
 * The second damage-free legend entry.
 *
 * "Never reached" is the same phrase the table cells and the warning sentences use, so the mark,
 * the cell and the paragraph are recognisably one fact rather than three.
 */
const SHORTFALL_LEGEND = 'Never reached — this curve does not draw your rank in that ability';

export function DamageCurve({
  series,
  title,
  showTargetHealth = true,
  ranks,
}: DamageCurveProps) {
  const model = buildCurveModel(series, { showTargetHealth });
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  const heading = title ?? `Damage versus ${series.axisLabel}`;
  const total = model.computedCount + model.refusedCount;

  // The rank comparison, or null when the caller did not ask for one. Nothing below this line
  // changes a damage figure, hides a point or softens a refusal — it adds a mark and some words.
  const shortfall = ranks ? rankShortfall(series, ranks.configured, ranks.schedule) : null;
  const rankWarnings = shortfall ? shortfallWarnings(shortfall, ranks?.schedule) : [];
  const rankDescription = shortfall ? shortfallDescription(shortfall) : null;
  const noteAgreement = ranks ? noteConfirmation(series.notes, ranks.policy) : 'absent';
  const shownNotes =
    shortfall && ranks ? annotateNotes(series.notes, shortfall, ranks.schedule) : [...series.notes];

  // Marked points only — see `RankShortfall.markedPoints` for the rule and for the two wrong rules
  // it replaced. A mark that appears on all 173 curves says nothing.
  const shortMarks = shortfall
    ? shortfall.markedPoints.map((point) => ({
        x: point.x,
        label: point.label,
        fraction: fractionOf(point.x, model.x),
      }))
    : [];

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

      {/* THE RANK SCHEDULE, ALWAYS PRINTED WHEN ONE WAS SUPPLIED. A reader cannot judge a curve
          whose levelling order is invisible: the same champion drawn Q-first and E-first is two
          different lines, and neither is wrong. The block takes a STRONGER BORDER when something
          is short — brightness and weight, never a hue (DESIGN.md §1, §6). */}
      {ranks && shortfall ? (
        <section
          aria-label="Ability ranks along this curve"
          /* THE STRONGER BORDER TRACKS THE MARK, NOT "ARE THERE ANY SENTENCES".
             Keyed on `rankWarnings.length` it fired on almost every curve — MEASURED in a browser:
             the reachable-build preview case carries no mark at all and still took the strong
             border, because "5 further points are below your build only because the level has not
             bought those ranks yet" is a sentence and not a warning. An emphasis that is always on
             is not an emphasis. */
          className={
            shortfall.markedPoints.length > 0 || shortfall.unreadableCount > 0
              ? 'curve-panel__ranks curve-panel__ranks--short'
              : 'curve-panel__ranks'
          }
        >
          <h3 className="curve-panel__eyebrow">Ability ranks along this curve</h3>
          <p className="curve-panel__policy">{policyPhrase(ranks.policy)}</p>
          <p className="curve-panel__note">{policyDetail(ranks.policy)}</p>
          <p className="curve-panel__note">
            Your build: <span className="curve-panel__ranks-figure">{ranksPhrase(ranks.configured)}</span>
            {shortfall.top ? (
              <>
                {' · '}drawn at {shortfall.top.label}:{' '}
                <span className="curve-panel__ranks-figure">
                  {ranksPhrase(drawnAt(series, shortfall.top.x) ?? ranks.configured)}
                </span>
              </>
            ) : null}
          </p>
          {noteAgreement === 'contradicted' ? (
            <p className="curve-panel__note">{noteContradictionText(series.notes)}</p>
          ) : null}
          {rankWarnings.length > 0 ? (
            <ul className="curve-panel__list">
              {rankWarnings.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="curve-panel__note">
              Every point this curve draws is at the ability ranks your build states.
            </p>
          )}
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

            {/* A marked point: a DOTTED vertical rule, neutral. The cue is the PATTERN, never a
                colour — DESIGN.md §1 reserves hue for the three damage types, and §7's healing
                riser is the precedent: a neutral stroke made distinct by being dotted. It is
                visually unlike the refused band beside it (45° hatch) so the two never merge. */}
            {shortMarks.map((mark) => (
              <div
                aria-hidden="true"
                className="curve__short"
                key={`s${mark.x}`}
                style={{ insetInlineStart: pct(mark.fraction) }}
              >
                <span className="curve__short-rule" />
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
          {shortMarks.length > 0 ? (
            <li className="curve__legend-item">
              <span aria-hidden="true" className="curve__legend-short" />
              <span>{SHORTFALL_LEGEND}</span>
            </li>
          ) : null}
        </ul>

        <figcaption className="curve__description" id={descId}>
          {curveDescription(model)}
          {rankDescription ? ` ${rankDescription}` : ''}
        </figcaption>
      </figure>

      <TableScroller label={`${heading}, point by point`}>
        <table className="curve-table">
          <caption className="u-visually-hidden">
            Every point of the sweep: what it was evaluated at, the burst total, damage over time,
            both survival verdicts, and the verification status. A refused point states the engine’s
            reason instead of a figure.
            {ranks
              ? ' Each computed point also states the ability ranks it was drawn at, and says so' +
                ' when they are below the build you configured.'
              : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col">{series.axisLabel}</th>
              {ranks ? <th scope="col">Ability ranks</th> : null}
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
                  {ranks ? (
                    <RanksCell
                      configured={ranks.configured}
                      marked={shortfall?.markedXs.includes(point.x) ?? false}
                      point={point}
                      schedule={ranks.schedule}
                    />
                  ) : null}
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
                  {/* A REFUSAL STILL READS AS A REFUSAL. The rank column does not get its own cell
                      here: the row states the engine's reason across the whole width, exactly as
                      it did before this column existed. Printing ranks beside a refusal would
                      suggest something was drawn at them, and nothing was. */}
                  <td className="curve-table__refusal" colSpan={ranks ? 7 : 6}>
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

      {/* The engine's OWN notes, with the one that does not apply to this curve contradicted in
          place rather than deleted — see `annotateNotes`. Without the `ranks` prop these are the
          engine's notes verbatim, which is what they always were. */}
      {shownNotes.length > 0 ? (
        <section className="curve-panel__block" aria-label="How this curve was produced">
          <h3 className="curve-panel__eyebrow">How this curve was produced</h3>
          <ul className="curve-panel__list">
            {shownNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

/**
 * The ranks one point was drawn at, plus what is short about them.
 *
 * The ranks are printed on EVERY computed row, not only the short ones. A column that appears only
 * when something is wrong is a column a reader cannot use to check that something is right, and the
 * whole complaint this feature answers is that the schedule was invisible.
 */
function RanksCell({
  configured,
  marked,
  point,
  schedule,
}: {
  configured: Ranks;
  /** True when this point carries a mark on the plot, so the cell says the same word the mark does. */
  marked: boolean;
  point: { applied: unknown; label: string };
  schedule?: RankSchedule;
}) {
  const applied = appliedLevelRanks(point.applied);
  if (applied === null) {
    // NOT SILENCE. A point that does not record its ranks is a point this column cannot speak
    // for, and saying so is the difference between "they match" and "nobody looked".
    return (
      <td className="curve-table__ranks">
        <span className="curve-table__none">
          <span aria-hidden="true">—</span>
          <span className="u-visually-hidden">this point does not record its ability ranks</span>
        </span>
      </td>
    );
  }
  const short = shortfallAt(configured, applied.ranks, applied.attackerLevel, schedule);
  return (
    <td className="curve-table__ranks">
      {ranksPhrase(applied.ranks)}
      {short.length > 0 ? <ShortfallLabel marked={marked} short={short} /> : null}
    </td>
  );
}

/**
 * "below your build, never reached" over "E 1 of 5, R 2 of 3" — TWO LINES, deliberately.
 *
 * See `shortfallCellParts` for the measurement that forced the split. Both lines are real text in
 * the cell, so the whole label copies, is found by browser search, and is read out in order.
 */
function ShortfallLabel({ marked, short }: { marked: boolean; short: readonly SlotShortfall[] }) {
  const { label, figures } = shortfallCellParts(short, marked);
  return (
    <span className="curve-table__short">
      <span className="curve-table__short-line">{label}</span>
      <span className="curve-table__short-line">{figures}</span>
    </span>
  );
}

/** The ranks recorded at one x of a series, or null when that point records none. */
function drawnAt(series: SweepSeries<unknown>, x: number): Ranks | null {
  const point = series.points.find((candidate) => candidate.x === x);
  return point ? (appliedLevelRanks(point.applied)?.ranks ?? null) : null;
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
