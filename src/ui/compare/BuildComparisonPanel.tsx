// THE BUILD-COMPARISON SURFACE — SPECIFICATION §11's third comparative output, drawn.
//
// `src/engine/build-comparison.ts` has computed this shape for a while and nothing rendered it.
// Everything below is about presenting what that module decided WITHOUT quietly undoing any of
// its decisions, because every one of them is a refusal to state a number that would mislead.
//
// ═══ THE FOUR REFUSALS THE ENGINE MAKES, AND WHAT EACH ONE LOOKS LIKE HERE ═══
//
// 1. **THE TWO DEFENDERS DIFFER** (`ok: false`). No figures are drawn AT ALL — not the two
//    builds, not a partial comparison, nothing. The panel prints what differs, field by field,
//    in the engine's own words. A comparison against two different defenders is not a smaller
//    comparison, it is a different question.
//
// 2. **A SIDE REFUSED** (`status: 'refused'`). That build shows its refusals — path and reason —
//    and no damage figure of any kind. The OTHER side still shows its own figures, because they
//    are true; what disappears is the DIFFERENCE, and the engine has already withheld it (there
//    is no `delta` key to reach for).
//
// 3. **THE DIFFERENCE IS CONFOUNDED** (`confounded`). The engine deliberately hands the same
//    figures back under a different key so a renderer cannot print them by accident. This one
//    prints the REASONS FIRST and the figures underneath, under a heading that says what they
//    are. The figures are not hidden — they are true arithmetic — but they cannot be read before
//    the sentence that says part of the difference is this project's data coverage.
//
// 4. **A BUILD IS PARTIAL** (`summary.partial`). Its burst figure is a FLOOR and is labelled as
//    one, every excluded ability is named, and the verification mark says so. SPECIFICATION §8:
//    an incomplete ability contributes no damage, so a partial total is smaller than the truth —
//    presenting it as a total is the plausible wrong number this product exists to prevent.
//
// ═══ HUE IS NEVER THE ANSWER TO "WHICH BUILD IS BETTER" ═══
//
// DESIGN.md §1 reserves hue for the three damage types, lethal magenta and the recent-damage
// gold. A comparison is the surface most tempted to break that — green for the winner, red for
// the loser — and this one does not, anywhere. Direction is carried by the ORDER the builds are
// printed in, by the label that says which way the subtraction runs, and by a sentence with the
// direction as a word. Magnitude is carried by the tagged figure. There is not one colour in
// `compare.css` that is not a neutral surface, a neutral border or neutral text.
//
// ═══ WHAT IS AND IS NOT DRAWN ON THE SHARED SCALE ═══
//
// The chart at the bottom is the two builds' damage-that-reached-health against the defender's
// health pool, on ONE axis from `src/ui/plot/`. It is `aria-hidden`: every figure it draws is
// stated in words and tagged above it, so announcing it again would read the same numbers twice
// — and the bars themselves are untagged lengths, which is precisely why they may not be the
// only place a figure appears.
//
// THERE IS NO `<table>` IN THIS FILE, and that is a constraint rather than a preference — see
// this area's report. The two builds are stacked full-width blocks, which is also what makes the
// two bars sit directly above one another on one scale at any width, including 375px.

import type { BuildComparison, BuildDelta, ComparisonSide } from '../../engine/build-comparison';
import type { PointSummary } from '../../engine/sweep';
import type { DamageByType, DamageTotals } from '../../types';
import {
  AggregateTotal,
  DamageValue,
  ExcludedAbility,
  VerificationStatusMark,
  formatDamage,
  roundReadout,
} from '../primitives';
import {
  differenceShape,
  directionSentence,
  lethalitySentence,
  magnitudeModel,
  pct,
  presentTypes,
  tickShift,
  verdictSentence,
  type BuildLabels,
  type SideMagnitude,
} from './model';
import './compare.css';

const DEFAULT_LABELS: BuildLabels = { a: 'Build A', b: 'Build B' };

export interface BuildComparisonPanelProps {
  /** Straight off `compareBuilds(...)`. Both arms are drawn; neither is assumed. */
  comparison: BuildComparison;
  /** What the two builds are called on screen. The delta is always B minus A. */
  labels?: BuildLabels;
  /**
   * A display name for the shared defender. Defaults to the configuration's `apiname`, which is
   * what the scenario carries — this area has no roster to look a display name up in.
   */
  defenderName?: string;
  /** Patch these figures were computed against, shown adjacent to them (SPECIFICATION §8). */
  patch?: string;
}

export function BuildComparisonPanel({
  comparison,
  labels = DEFAULT_LABELS,
  defenderName,
  patch,
}: BuildComparisonPanelProps) {
  return (
    <section className="cmp" aria-label="Build comparison">
      <header className="cmp__head">
        <h2 className="cmp__title">Build comparison</h2>
        {patch ? <p className="cmp__patch">Patch {patch}</p> : null}
      </header>

      {comparison.ok ? (
        <ComparedBuilds comparison={comparison} labels={labels} defenderName={defenderName} />
      ) : (
        <DifferentDefender differences={comparison.differences} />
      )}
    </section>
  );
}

/**
 * THE WHOLE COMPARISON REFUSED. No figures, by design.
 *
 * The engine's rule is that the two defender configurations must be identical field for field,
 * and it names every field that differs. Those strings are printed verbatim: `defender.level: 11
 * against 13` is a thing a reader can act on in one click, and rewording it here would only
 * introduce a second vocabulary for the same fact.
 */
function DifferentDefender({ differences }: { differences: string[] }) {
  return (
    <div className="cmp__refusal">
      <p className="cmp__lead">
        These two builds were not compared. A comparison only says something about the builds when
        both are run against the same defender, and these two scenarios describe different
        defenders. No figures are shown, because there is no like-for-like figure to show.
      </p>
      <h3 className="cmp__eyebrow">What differs between the two defenders</h3>
      <ul className="cmp__list cmp__list--plain">
        {differences.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </div>
  );
}

function ComparedBuilds({
  comparison,
  labels,
  defenderName,
}: {
  comparison: Extract<BuildComparison, { ok: true }>;
  labels: BuildLabels;
  defenderName?: string;
}) {
  const { defender, sides } = comparison;
  const name = defenderName ?? defender.apiname;

  return (
    <>
      <p className="cmp__lead">
        Both builds were run against {name} at level {defender.level}, from the same entry state.
      </p>

      <div className="cmp__sides">
        <BuildSide name={labels.a} side={sides.a} />
        <BuildSide name={labels.b} side={sides.b} />
      </div>

      <SharedScale sides={sides} labels={labels} />

      {comparison.confounded ? (
        <Difference
          labels={labels}
          delta={comparison.confounded.delta}
          confoundedBy={comparison.confounded.reasons}
        />
      ) : comparison.delta ? (
        <Difference labels={labels} delta={comparison.delta} />
      ) : (
        <p className="cmp__note cmp__note--block">
          No difference is given, because one of the two builds could not be calculated. There is
          nothing to subtract from — a difference against a build that did not run would be a
          statement about the build that did.
        </p>
      )}

      {comparison.caveats.length > 0 ? (
        <section className="cmp__block" aria-label="Worth knowing about this comparison">
          <h3 className="cmp__eyebrow">Worth knowing</h3>
          <ul className="cmp__list cmp__list--plain">
            {comparison.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="cmp__block" aria-label="How this comparison was run">
        <h3 className="cmp__eyebrow">How this comparison was run</h3>
        <ul className="cmp__list cmp__list--plain">
          {comparison.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

// -----------------------------------------------------------------------------------------
// One build
// -----------------------------------------------------------------------------------------

function BuildSide({ name, side }: { name: string; side: ComparisonSide }) {
  return (
    <section className="cmp__side" aria-label={name}>
      <header className="cmp__side-head">
        <h3 className="cmp__side-name">{name}</h3>
        {side.status === 'computed' ? (
          <VerificationStatusMark status={side.summary.verification} spokenSubject={name} />
        ) : null}
      </header>

      {side.status === 'computed' ? (
        <ComputedSide side={side} />
      ) : (
        <div className="cmp__refusal">
          {/* NO FIGURE OF ANY KIND. A refused side has no summary in the contract — not a zero,
              not a null — and this is the rendered form of that decision. */}
          <p className="cmp__note">
            This build was not calculated, so it has no figures. The engine refused it for these
            reasons:
          </p>
          <ul className="cmp__list cmp__list--plain">
            {side.refusals.map((r) => (
              <li key={`${r.path}:${r.reason}`}>
                <span className="cmp__path">{r.path}</span> — {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ComputedSide({ side }: { side: Extract<ComparisonSide, { status: 'computed' }> }) {
  const summary: PointSummary = side.summary;
  // Reasons live on the full Result, which a caller only gets with `include: 'result'`. When it
  // is there, each excluded ability is named AND explained; when it is not, the names are still
  // printed and the panel says plainly what is missing rather than implying nothing is.
  const excluded = side.result?.incompleteContributors;

  return (
    <>
      <div className="cmp__figures">
        <Figure
          label={summary.partial ? 'Burst — a floor, not a total' : 'Burst'}
          totals={summary.burst}
          size="hero"
        />
        <Figure label="Damage over time — never in the burst" totals={summary.dot} size="l" />
      </div>

      <div className="cmp__verdicts">
        <p className="cmp__verdict">
          <span className="cmp__verdict-label">Burst alone:</span>{' '}
          {verdictSentence(summary.verdict.burstOnly)}
        </p>
        <p className="cmp__verdict">
          <span className="cmp__verdict-label">Burst plus damage over time:</span>{' '}
          {verdictSentence(summary.verdict.burstPlusDot)}
        </p>
      </div>

      {summary.partial ? (
        <section className="cmp__block" aria-label="Excluded from this build's totals">
          <h3 className="cmp__eyebrow">Excluded from this build&rsquo;s totals</h3>
          <p className="cmp__note">
            The burst figure above is a floor. Each ability below contributes no damage to it
            (SPECIFICATION §8), so the real figure is higher by an amount nobody can state.
          </p>
          <ul className="cmp__list">
            {excluded
              ? excluded.map((c) => (
                  <li key={c.sourceLabel}>
                    <ExcludedAbility
                      sourceLabel={c.sourceLabel}
                      reason={c.reason}
                      spokenContext="contributes no damage to this build"
                    />
                  </li>
                ))
              : summary.incompleteContributors.map((label) => (
                  <li key={label} className="cmp__excluded-name">
                    {label}
                  </li>
                ))}
          </ul>
          {excluded ? null : (
            <p className="cmp__note">
              Why each of these is excluded is recorded on the full result, which this comparison
              was not asked to carry.
            </p>
          )}
        </section>
      ) : null}
    </>
  );
}

/**
 * A labelled damage total.
 *
 * `AggregateTotal` covers both legal shapes on its own: a multi-type total renders untagged with
 * its tagged composition bar (DESIGN.md §8's one exception), and a single-type total comes back
 * as an ordinary tagged figure. The one shape it cannot draw is a total that is zero across all
 * three types — an untagged `0` with no bar — so that case is words instead of a figure.
 *
 * The label is rendered here rather than passed to `AggregateTotal`, because that component only
 * prints its label on the multi-type branch; passing it would make the label appear and disappear
 * depending on the data.
 */
function Figure({
  label,
  totals,
  size,
}: {
  label: string;
  totals: DamageTotals;
  size: 'hero' | 'l';
}) {
  const present = presentTypes(totals.byType);
  return (
    <div className="cmp__figure">
      <span className="cmp__eyebrow">{label}</span>
      {present.length === 0 ? (
        <span className="cmp__none">None</span>
      ) : (
        <AggregateTotal total={totals.total} byType={totals.byType} size={size} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// The difference
// -----------------------------------------------------------------------------------------

function Difference({
  labels,
  delta,
  confoundedBy,
}: {
  labels: BuildLabels;
  delta: BuildDelta;
  confoundedBy?: string[];
}) {
  const confounded = confoundedBy !== undefined && confoundedBy.length > 0;

  return (
    <section
      className="cmp__block cmp__difference"
      aria-label={confounded ? 'The difference, confounded' : 'The difference'}
    >
      <h3 className="cmp__eyebrow">
        {confounded ? 'The difference — confounded' : 'The difference'}
      </h3>

      {confounded ? (
        <>
          <p className="cmp__lead">
            Part of this difference is data this project has not modelled, not a difference
            between the builds. The figures are given below because they are true arithmetic, but
            they are not a build finding.
          </p>
          <ul className="cmp__list cmp__list--plain">
            {(confoundedBy ?? []).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="cmp__lead">{directionSentence(labels, delta.burstTotal, 'burst damage')}</p>

      <BurstDifference labels={labels} byType={delta.burstByType} total={delta.burstTotal} />

      {/* DAMAGE OVER TIME IS NEVER FOLDED IN (SPECIFICATION §3.8), so its difference is its own
          line — and it is a SENTENCE rather than a figure. `BuildDelta.dotTotal` is a single
          number with no per-type split, and DESIGN.md §8 permits an untagged multi-type figure
          only beside a tagged composition bar. The split does not exist in the contract, so the
          figure cannot be drawn legally; the direction can still be stated, and each build's own
          damage-over-time total is printed, tagged, above. Raised to the lead. */}
      <p className="cmp__note cmp__note--block">
        {directionSentence(labels, delta.dotTotal, 'damage over time')} The two figures are printed
        above, each with its damage type; no combined difference is shown, because the engine
        reports it as one number with no per-type split and an untagged figure needs a tagged
        composition bar beside it.
      </p>

      <dl className="cmp__verdict-grid">
        <dt className="cmp__eyebrow">Burst alone</dt>
        <dd className="cmp__verdict">{lethalitySentence(labels, delta.burstOnlyLethal)}</dd>
        <dt className="cmp__eyebrow">Burst plus damage over time</dt>
        <dd className="cmp__verdict">{lethalitySentence(labels, delta.burstPlusDotLethal)}</dd>
      </dl>
    </section>
  );
}

/**
 * The burst difference, in whichever of the three legal shapes the data allows.
 *
 * The `split` branch is the one worth reading twice. When the per-type differences point in
 * opposite directions there IS no honest composition: a bar showing +300 physical and −200 magic
 * as two segments of a +100 total would say each is a share of it, and neither is. So the
 * combined figure is refused and the parts are printed tagged — the same move the engine makes
 * with a confounded delta, for the same reason.
 */
function BurstDifference({
  labels,
  byType,
  total,
}: {
  labels: BuildLabels;
  byType: DamageByType;
  total: number;
}) {
  const shape = differenceShape(byType);
  const subtraction = `${labels.b} minus ${labels.a}`;

  if (shape === 'none') {
    return (
      <p className="cmp__note cmp__note--block">
        The two builds deal identical burst damage, type for type. There is no difference to show.
      </p>
    );
  }

  if (shape === 'aggregate') {
    return (
      <div className="cmp__figure cmp__figure--difference">
        <span className="cmp__eyebrow">Burst difference · {subtraction}</span>
        <AggregateTotal total={total} byType={byType} size="hero" />
      </div>
    );
  }

  return (
    <div className="cmp__figure cmp__figure--difference">
      <span className="cmp__eyebrow">Burst difference by damage type · {subtraction}</span>
      <p className="cmp__note">
        The two builds differ in opposite directions depending on the damage type, so no single
        combined figure is shown: a composition bar mixing a rise and a fall would misstate both.
      </p>
      <ul className="cmp__split">
        {presentTypes(byType).map((t) => (
          <li key={t}>
            <DamageValue
              value={byType[t]}
              damageType={t}
              size="l"
              spokenContext={`difference, ${subtraction}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// The shared scale
// -----------------------------------------------------------------------------------------

/**
 * BOTH BUILDS AGAINST THE DEFENDER'S HEALTH, ON ONE AXIS.
 *
 * The axis, its top and its gridlines all come from `src/ui/plot/` — the module that exists so
 * two chart areas cannot place their gridlines differently. Zero is always in the domain, so a
 * small difference cannot be made to look like a large one.
 *
 * The bars are NEUTRAL, deliberately. A bar is an untagged length, and DESIGN.md §8 allows an
 * untagged figure only beside a tagged composition bar; colouring these by damage type would make
 * the chart the place a reader reads the type from, which is exactly what the tag rule forbids.
 * The chart shows magnitude and lethality; the tagged figures above show what the damage is.
 */
function SharedScale({
  sides,
  labels,
}: {
  sides: { a: ComparisonSide; b: ComparisonSide };
  labels: BuildLabels;
}) {
  const computed: SideMagnitude[] = [];
  let defenderHp = 0;

  for (const [label, side] of [
    [labels.a, sides.a],
    [labels.b, sides.b],
  ] as const) {
    if (side.status !== 'computed') continue;
    computed.push({
      label,
      burstApplied: side.summary.verdict.burstOnly.damageApplied,
      burstPlusDotApplied: side.summary.verdict.burstPlusDot.damageApplied,
    });
    defenderHp = Math.max(defenderHp, side.summary.defenderHp);
  }

  if (computed.length === 0) return null;

  const model = magnitudeModel(computed, defenderHp);

  return (
    <section className="cmp__block" aria-label="Both builds on one scale">
      <h3 className="cmp__eyebrow">Both builds against the defender&rsquo;s health</h3>
      <p className="cmp__note">
        One scale, shared. Each bar is the damage that reached health; the solid rule is the
        defender&rsquo;s health pool, and a bar that runs past it is a kill. The dashed mark is
        where the bar reaches once damage over time has resolved.
      </p>

      {/* aria-hidden: every figure drawn here is stated in words and tagged above, and the bars
          themselves carry no damage type. Announcing them would read the same numbers twice
          without adding the one thing a screen reader needs, which is the type. */}
      <div className="cmp__plot" aria-hidden="true">
        <ul className="cmp__rows">
          {model.bars.map((bar) => (
            <li className="cmp__row" key={bar.label}>
              <span className="cmp__row-label">{bar.label}</span>
              <span className="cmp__track">
                {model.ticks.map((tick) => (
                  <span
                    className="cmp__gridline"
                    key={tick.value}
                    style={{ left: pct(tick.fraction) }}
                  />
                ))}
                <span className="cmp__bar" style={{ width: pct(bar.burstFraction) }} />
                <span
                  className="cmp__dotmark"
                  style={{ left: pct(bar.burstPlusDotFraction) }}
                />
                <span className="cmp__health" style={{ left: pct(model.healthFraction) }} />
              </span>
            </li>
          ))}
        </ul>

        {/* A SUPPRESSED LABEL NEVER REMOVES ITS GRIDLINE. The gridlines above are drawn for every
            tick; only the NUMBER is dropped when two would collide, so the scale keeps all of its
            divisions and loses only a figure a reader could not have read anyway. */}
        <div className="cmp__axis">
          {model.ticks
            .filter((tick) => tick.labelled)
            .map((tick) => (
              <span
                className="cmp__tick"
                key={tick.value}
                style={{ left: pct(tick.fraction), transform: tickShift(tick.fraction) }}
              >
                {tick.value}
              </span>
            ))}
        </div>
      </div>

      {/* THE AXIS IS DESCRIBED IN HEALTH, and the only figure named in this sentence is a health
          figure. The tick labels above are scale units; the damage figures themselves are stated,
          tagged, in each build's panel — this chart never becomes the place a damage number is
          read from. */}
      <p className="cmp__note">
        The scale starts at zero and both bars share it. The defender&rsquo;s health pool is{' '}
        {formatDamage(roundReadout(model.defenderHp))}.
      </p>
    </section>
  );
}
