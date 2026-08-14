// THE HP BURNDOWN — the product's signature element (DESIGN.md §7, SPECIFICATION §10.1).
//
// A stepped chart of the defender's remaining health falling toward zero: grey treads mark
// where health sits, coloured risers are the hits, and the whole staircase is read left to
// right as a SEQUENCE. There is no time axis anywhere in this component, and there is
// nothing it could be derived from — the engine models sequence, not elapsed time
// (SPECIFICATION §3.2), and the x axis carries that as a caption under it.
//
// WHERE THE NUMBERS COME FROM. Every figure is read off the `Result` and drawn through
// `DamageValue` / `AggregateTotal`, so no damage figure in here can lose its P/M/T tag and
// no multi-type total can appear without its tagged composition bar. The geometry — every
// plateau height, riser height and rule position — is computed in `geometry.ts` and applied
// as an inline style, because it is data. No colour, size, spacing or radius value is set
// anywhere in this file; those all live in `burndown.css` and come from tokens.
//
// WHAT A SCREEN READER GETS. Each riser is a real <button> whose accessible name carries the
// instance number, what did the damage, the figure with its damage type SPOKEN IN FULL, the
// health before and after, and the verification status. The visual layer beside it —
// treads, bars, printed labels — is `aria-hidden`, so nothing is announced twice. The
// rolling total announces itself through `AggregateTotal`, and both verdicts are a real
// two-row table of text. There is no information in the picture that is not in the
// accessibility tree.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DamageByType, DamageType, ReportedDamageType, Result } from '../../types';
import {
  AggregateTotal,
  DamageValue,
  ExcludedAbility,
  TableScroller,
  VerificationStatusMark,
  formatReadout,
  roundReadout,
} from '../primitives';
import {
  buildBurndownModel,
  odometerAt,
  playbackDurationMs,
  ruleShift,
  GHOST_MS,
  STEP_MS,
  type BurndownColumn,
} from './geometry';
import './burndown.css';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** A fraction of the plot as a CSS percentage. Geometry, not a design length. */
function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(4)}%`;
}

function sumOf(byType: DamageByType): number {
  return byType.physical + byType.magic + byType.true;
}

const SPOKEN_TYPE: Record<DamageType, string> = {
  physical: 'physical',
  magic: 'magic',
  true: 'true',
};

/**
 * Does this viewer want motion switched off?
 *
 * Read from the media query rather than assumed, and re-read if it changes mid-session. When
 * `matchMedia` is unavailable (jsdom does not implement it) this answers `false`, which is
 * the "animate" branch — so a test that wants the reduced-motion path must say so explicitly
 * and cannot pass by accident.
 */
export function usePrefersReducedMotion(): boolean {
  const read = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_MOTION_QUERY).matches
      : false;

  const [reduced, setReduced] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduced(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  return reduced;
}

/**
 * The rolling total (DESIGN.md §7, §10 — 300ms, linear).
 *
 * UNDER REDUCED MOTION THERE IS NO ANIMATION AT ALL: the settled figure is the component's
 * very first render, not a value it eases to. That is what §10 means by "render the burndown
 * in its final settled state immediately", and it is why this branches before the effect
 * rather than inside it.
 */
export function useOdometer(
  cumulative: DamageByType[],
  reduced: boolean,
): { total: number; byType: DamageByType } {
  const settled = useMemo(() => {
    const last = cumulative[cumulative.length - 1] ?? { physical: 0, magic: 0, true: 0 };
    return { total: sumOf(last), byType: last };
  }, [cumulative]);

  const [value, setValue] = useState(() => (reduced ? settled : odometerAt(0, cumulative)));
  const frame = useRef(0);

  useEffect(() => {
    if (reduced) {
      setValue(settled);
      return undefined;
    }
    const end = playbackDurationMs(cumulative.length);
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      setValue(odometerAt(elapsed, cumulative));
      if (elapsed < end) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    // THE BACKSTOP, and it is not belt-and-braces — it was measured.
    //
    // Opening the chart in a browser tab that was not compositing showed the headline total
    // reading 0 indefinitely: `requestAnimationFrame` does not fire in a hidden tab, so an
    // odometer driven by frames alone never reaches its figure. The product's most prominent
    // number was wrong for as long as the tab stayed in the background. A timer fires in a
    // hidden tab (throttled, but it fires), so the settled figure arrives whether or not a
    // single frame was ever painted. Nothing in this chart may depend on an animation having
    // run.
    const backstop = setTimeout(() => setValue(settled), end + SETTLE_SLACK_MS);
    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(backstop);
    };
  }, [cumulative, reduced, settled]);

  return value;
}

/** Grace after the last frame is due before the chart is forced into its settled state. */
export const SETTLE_SLACK_MS = 50;

/**
 * Has the playback finished?
 *
 * Same reason as the odometer's backstop: the treads and risers are drawn by CSS animations
 * whose keyframes START collapsed, and a browser that never advances those animations leaves
 * the plot empty. Once this turns true the component switches the animations off entirely,
 * which is the same thing `prefers-reduced-motion` does — so the settled chart is reachable
 * by a timer, never only by a frame.
 */
export function useSettled(reduced: boolean, steps: number): boolean {
  const [settled, setSettled] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setSettled(true);
      return undefined;
    }
    setSettled(false);
    const end = playbackDurationMs(steps) + GHOST_MS + SETTLE_SLACK_MS;
    const timer = setTimeout(() => setSettled(true), end);
    return () => clearTimeout(timer);
  }, [reduced, steps]);

  return settled;
}

/**
 * The accessible name of one riser. ONE TEXT NODE, built here.
 *
 * The accessibility tree concatenates a container's descendants after trimming each, which
 * runs figures into words (recorded in `../primitives/accessible-names.test.tsx`). Building
 * the whole sentence in one place is what makes it read as a sentence — and it is also what
 * lets the damage type be spoken in full, which DESIGN.md §8 requires of every figure.
 */
export function riserName(column: BurndownColumn, maxHp: number, statusLabel: string): string {
  const parts: string[] = [];

  if (column.kind === 'dot') {
    const split = column.segments
      .map((s) => `${s.damage} ${SPOKEN_TYPE[s.damageType]} damage over time`)
      .join(', ');
    parts.push('Damage over time, after the combo');
    parts.push(column.sourceLabel);
    parts.push(split || `${column.damage} damage over time`);
  } else if (column.kind === 'heal') {
    parts.push('Before the combo');
    parts.push(column.sourceLabel);
    parts.push(`Defender heals ${column.healing}`);
  } else {
    parts.push(`Instance ${column.position}`);
    parts.push(column.sourceLabel);
    // A RIDER SAYS WHAT IT RODE ON. Sighted readers get the bracket; this is the same fact,
    // spoken. Without it a screen-reader user hears four unrelated instances where the chart
    // shows one bracketed moment.
    if (column.groupId && column.groupIndex > 1) {
      parts.push(`riding on ${column.groupLabel}`);
    }
    const type = column.damageType ? SPOKEN_TYPE[column.damageType] : '';
    parts.push(`${column.damage} ${type} damage${column.crit ? ', critical strike' : ''}`);
    // THE WORD AND THE DIRECTION CARRY THE HEAL, not a colour and not a stroke style. A screen
    // reader gets "heals 90" and "up to", which is the whole cue.
    if (column.healing > 0) parts.push(`Defender heals ${column.healing}`);
  }

  // "up to" / "down to" is the direction, spoken. `hpAfter` already includes any healing.
  const direction = column.hpAfter > column.hpBefore ? 'up to' : 'down to';
  parts.push(
    `Health ${formatReadout(column.hpBefore)} ${direction} ${formatReadout(column.hpAfter)} ` +
      `of ${formatReadout(maxHp)}`,
  );
  // OVERHEALING IS INFORMATION, not noise: it is how a theorycrafter sees that a bigger heal
  // would have bought nothing.
  if (column.healingWasted > 0) parts.push(`${column.healingWasted} healing wasted`);
  if (statusLabel) parts.push(statusLabel);
  return parts.join('. ') + '.';
}

export interface HpBurndownProps {
  result: Result;
  /** Heading text. The chart is a figure and needs a name; the page supplies the wording. */
  title?: string;
}

/**
 * The one damage type a figure can be tagged with, or null.
 *
 * `ReportedDamageType` gained `'mixed'` and `'none'` on 2026-08-13. Neither can carry a P/M/T tag:
 * a mixed instance is rendered bone and untagged with a composition bar (DESIGN.md §8), and a
 * no-damage instance has no figure to tag at all. Narrowing here rather than casting means a new
 * arm on that union fails the typecheck instead of silently rendering as physical.
 */
function singleDamageType(t: ReportedDamageType): DamageType | null {
  return t === 'mixed' || t === 'none' ? null : t;
}

export function HpBurndown({ result, title = 'HP burndown' }: HpBurndownProps) {
  const model = useMemo(() => buildBurndownModel(result), [result]);
  const reduced = usePrefersReducedMotion();
  const rolling = useOdometer(model.cumulativeByType, reduced);
  const settled = useSettled(reduced, model.cumulativeByType.length);
  const [open, setOpen] = useState<number | null>(null);

  const close = useCallback(() => setOpen(null), []);

  // WHY THE SECOND VERDICT READS AS IT DOES. Three states, and only the first is the one this
  // product spent its whole life in.
  const dotNote =
    result.dot.total > 0
      ? null
      : result.dot.sources.length === 0
        ? 'same as burst — nothing in this scenario deals damage over time'
        : 'same as burst — the damage over time here has no published total, see below';

  return (
    <section className={`burn${settled ? ' burn--settled' : ''}`} aria-label={title}>
      {/* ONE BAND, NOT TWO STACKED BLOCKS. The title, the rolling total, the patch and the
          verdict are the instrument's readout plate and they sit on one baseline. Stacking the
          title above the total spent a whole row of height above a chart that was already
          below the fold. Nothing is added or removed — only laid out. */}
      <header className="burn__head">
        <div className="burn__ident">
          <h2 className="burn__title">{title}</h2>
          <AggregateTotal
            label="Total"
            total={rolling.total}
            byType={rolling.byType}
            size="hero"
          />
        </div>
        <div className="burn__standing">
          <p className="burn__patch">Patch {result.patch}</p>
          {/*
            DESIGN.md §7 gives the kill exactly ONE chip and it sits on the rule: "A callout
            chip sits at the top of the rule: LETHAL · instance i". The neutral chip here is
            the other branch — "If the burst never crosses zero, draw no rule … and a chip
            reads SURVIVES · {remaining} HP". Rendering both a header chip and a rule callout
            printed "LETHAL · instance 5" twice on one chart, which is why this is a
            conditional and not two independent elements.
          */}
          {result.verdict.burstOnly.lethal ? null : (
            <span className="burn__chip">
              SURVIVES · {result.verdict.burstOnly.remainingHp} HP
            </span>
          )}
        </div>
      </header>

      <div className="burn__plot">
        <div className="burn__frame">
          <div className="burn__yaxis" aria-hidden="true">
            {model.ticks.map((t) => (
              <span
                key={t}
                className="burn__ytick"
                style={{ bottom: pct(t / (model.maxHp || 1)), transform: 'translateY(50%)' }}
              >
                {t}
              </span>
            ))}
          </div>

          <div className="burn__area">
            {model.ticks
              .filter((t) => t > 0)
              .map((t) => (
                <div
                  key={t}
                  className="burn__gridline"
                  aria-hidden="true"
                  style={{ bottom: pct(t / (model.maxHp || 1)) }}
                />
              ))}
            <div className="burn__zero" aria-hidden="true" />

            <ol className="burn__cols">
              {model.columns.map((column, i) => (
                <Column
                  key={`${column.kind}-${column.position}`}
                  column={column}
                  index={i}
                  maxHp={model.maxHp}
                  open={open === column.position}
                  onOpen={() => setOpen(column.position)}
                  onClose={close}
                />
              ))}
            </ol>

            {model.lethalRuleFraction !== null ? (
              <>
                <div
                  className="burn__rule"
                  aria-hidden="true"
                  style={{
                    left: pct(model.lethalRuleFraction),
                    transform: ruleShift(model.lethalRuleFraction),
                  }}
                >
                  <div className="burn__rule-stroke burn__rule-stroke--lethal" />
                </div>
                <span
                  className="burn__callout burn__chip burn__chip--lethal"
                  style={{
                    left: pct(model.lethalRuleFraction),
                    transform: 'translateX(-100%)',
                  }}
                >
                  LETHAL · instance {model.lethalAtInstance}
                </span>
              </>
            ) : null}

            {model.dotLethalRuleFraction !== null ? (
              <>
                <div
                  className="burn__rule"
                  aria-hidden="true"
                  style={{
                    left: pct(model.dotLethalRuleFraction),
                    transform: ruleShift(model.dotLethalRuleFraction),
                  }}
                >
                  <div className="burn__rule-stroke burn__rule-stroke--dot" />
                </div>
                <span
                  className="burn__callout burn__chip burn__chip--lethal"
                  style={{
                    left: pct(model.dotLethalRuleFraction),
                    transform: 'translateX(-100%)',
                  }}
                >
                  LETHAL +DoT · after combo
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* THE X AXIS, AND THE BRACKET UNDER A GROUP.

            A basic attack carrying three on-hit item effects is four columns and one moment. The
            bracket says so without the engine merging anything (geometry.ts, `groupColumns`).

            NO HUE, AND NONE IS PERMITTED. DESIGN.md §1 reserves colour for the three damage
            types, lethal magenta and the recent-damage gold; a grouping bracket is not damage
            data. It is drawn in --hp-trace, the same neutral the healing trace uses, and its
            non-colour cue is its SHAPE — a rule with turned-up ends, which nothing else here has.

            Only the first column of a group prints a label; the rest print nothing, so the group
            reads as one labelled moment rather than as N labelled columns. */}
        <ol className="burn__xaxis" aria-hidden="true">
          {model.columns.map((c) => (
            <li
              className={`burn__xlabel${c.groupId ? ' burn__xlabel--grouped' : ''}`}
              key={`${c.kind}-${c.position}`}
            >
              {c.groupId && c.groupIndex > 1 ? null : c.axisLabel}
              {c.groupId && c.groupIndex === 1 ? (
                <span
                  className="burn__bracket"
                  style={{ '--burn-group-span': c.groupSize } as CSSProperties}
                />
              ) : null}
            </li>
          ))}
          {model.columns.length === 0 ? <li className="burn__xlabel">—</li> : null}
        </ol>
        <p className="burn__caption">sequence — not elapsed time</p>
      </div>

      {/* THE RULE IS EVERY TABLE, NOT THE ONE THAT WAS MEASURED TOO WIDE. This one is two rows
          of short words and fits a phone today — but "LETHAL · instance 4" beside a long verdict
          is the same construction that overflowed the breakdown, and a rule applied only where a
          defect was found is a rule that stops holding the moment the data changes. */}
      <TableScroller label="The two-verdict table">
      <table className="burn__verdicts">
        <caption className="u-visually-hidden">
          The survival verdict, given twice: burst alone, and burst plus damage over time.
        </caption>
        <tbody>
          <tr>
            <th scope="row">Burst</th>
            <td>{verdictWords(result.verdict.burstOnly)}</td>
          </tr>
          <tr>
            <th scope="row">Burst + DoT</th>
            <td>
              {verdictWords(result.verdict.burstPlusDot)}
              {/* A READER SEEING THE SAME SENTENCE TWICE LEARNS NOTHING, and may reasonably
                  think it is a bug. Until 2026-08-14 nothing in this product produced any
                  damage over time, so these two lines were IDENTICAL for every real scenario
                  ever computed — SPECIFICATION §3.8's "given twice" satisfied in form and not
                  in substance (DATA-SOURCES §56). Where there is genuinely no DoT, the second
                  line now says so instead of repeating the first. */}
              {dotNote ? <span className="burn__verdict-note">{dotNote}</span> : null}
            </td>
          </tr>
        </tbody>
      </table>
      </TableScroller>

      {result.incompleteContributors.length > 0 ? (
        <ul className="burn__excluded">
          {result.incompleteContributors.map((c) => (
            <li key={c.sourceLabel}>
              <ExcludedAbility
                sourceLabel={c.sourceLabel}
                reason={c.reason}
                spokenContext="excluded from these totals"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** DESIGN.md §7 prints both verdicts verbatim: `SURVIVES 512 HP` / `LETHAL`. */
function verdictWords(v: { lethal: boolean; remainingHp: number }): string {
  return v.lethal ? 'LETHAL' : `SURVIVES ${v.remainingHp} HP`;
}

interface ColumnProps {
  column: BurndownColumn;
  index: number;
  maxHp: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

function Column({ column, index, maxHp, open, onOpen, onClose }: ColumnProps) {
  const delay: CSSProperties = { animationDelay: `${index * STEP_MS}ms` };
  const band = {
    bottom: pct(column.riserBottom),
    height: pct(Math.max(0, column.riserTop - column.riserBottom)),
  };
  const popId = `burn-pop-${column.kind}-${column.position}`;

  const statusLabel = column.verification
    ? column.verification === 'incomplete'
      ? column.incompleteReason?.kind === 'permanent'
        ? 'Cannot be completed'
        : 'Not yet modelled'
      : column.verification === 'no-damage'
        ? 'No damage'
        : column.verification === 'verified'
          ? 'Verified'
          : 'Derived'
    : '';

  return (
    <li className="burn__col">
      <div
        className="burn__tread"
        aria-hidden="true"
        style={{ bottom: pct(column.treadFraction), ...delay }}
      />

      {/* THE RECENT-DAMAGE GHOST IS FOR DAMAGE ONLY. DESIGN.md §7 calls it "the chunk that was
          just taken"; firing it on a heal would show health being removed as it is restored. */}
      {column.damage > 0 ? (
        <div className="burn__ghost" aria-hidden="true" style={{ ...band, ...delay }} />
      ) : null}

      {/* THE HEALING RISER. It goes UP, in the neutral HP grey — a change in health is exactly
          what it is — and its non-colour cue is a DOTTED stroke, never a new hue (DESIGN.md §1).
          Clamped at maximum health by the geometry; the waste rides in the label. */}
      {column.healing > 0 ? (
        <div
          className="burn__heal"
          aria-hidden="true"
          style={{
            bottom: pct(column.healRiserBottom),
            height: pct(Math.max(0, column.healRiserTop - column.healRiserBottom)),
            ...delay,
          }}
        />
      ) : null}

      {column.kind === 'burst' && column.damageType ? (
        <div
          className={`burn__bar burn__bar--${column.damageType}`}
          aria-hidden="true"
          style={{ ...band, ...delay }}
        />
      ) : null}

      {column.kind === 'dot'
        ? column.segments.map((s) => (
            <div
              key={s.damageType}
              className={`burn__hatch burn__hatch--riser burn__hatch--${s.damageType}`}
              aria-hidden="true"
              style={{
                bottom: pct(s.bottomFraction),
                height: pct(Math.max(0, s.topFraction - s.bottomFraction)),
                ...delay,
              }}
            />
          ))
        : null}

      <span
        className="burn__label"
        aria-hidden="true"
        style={{ bottom: pct(column.riserBottom), ...delay }}
      >
        {column.kind === 'dot' ? (
          // THE HATCH IS THE NON-COLOUR CUE (DESIGN.md §7). It rides beside the figure as
          // well as filling the riser, because a burst that already reached zero leaves the
          // riser no height to draw and the cue must not disappear with it.
          <>
            {column.segments.map((s) => (
              <Fragment key={s.damageType}>
                <span className={`burn__hatch burn__hatch--swatch burn__hatch--${s.damageType}`} />
                <DamageValue value={s.damage} damageType={s.damageType} size="l" />
              </Fragment>
            ))}
          </>
        ) : column.damageType ? (
          <DamageValue value={column.damage} damageType={column.damageType} size="l" />
        ) : null}
      </span>

      {/* THE HEAL'S FIGURE, and it carries NO P/M/T tag: a heal is not damage, and tagging it
          would make it read as one. The `+` sign is the cue that survives greyscale and copy. */}
      {column.healing > 0 ? (
        <span
          className="burn__heal-label"
          aria-hidden="true"
          style={{ bottom: pct(column.healRiserTop), ...delay }}
        >
          +{column.healing}
          {column.healingWasted > 0 ? (
            <span className="burn__heal-waste"> ({column.healingWasted} wasted)</span>
          ) : null}
        </span>
      ) : null}

      <button
        type="button"
        className="burn__riser"
        style={band}
        aria-label={riserName(column, maxHp, statusLabel)}
        aria-describedby={open ? popId : undefined}
        onMouseEnter={onOpen}
        onMouseLeave={onClose}
        onFocus={onOpen}
        onBlur={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      />

      {open ? <ResistancePopover id={popId} column={column} /> : null}
    </li>
  );
}

/**
 * The resistance-math popover (DESIGN.md §7 "Interaction").
 *
 * WHAT IT SHOWS AND WHAT IT CANNOT. §7 asks for the full modifier chain — flat reduction →
 * percentage reduction → percentage penetration → flat penetration → multiplier → final.
 * The frozen `InstanceResult` (src/types/result.ts) carries THREE mitigation checkpoints
 * (`raw`, `afterResistances`, `afterReductions`) plus `final`, not the six steps. Those
 * checkpoints are printed here in the order the contract defines them, and the fixed order
 * is stated in words underneath. NOTHING IS FABRICATED to fill the gap: a per-step figure
 * that no engine produced would be exactly the plausible wrong number this product exists to
 * prevent. A contract change is raised, not made.
 *
 * ═══ EVERY FIGURE IN HERE IS ROUNDED FOR DISPLAY (added 2026-08-14) ═══
 *
 * This popover printed `57.91960035475755 magic damage after resistances` at a reader, visibly
 * and to a screen reader, on the default scenario. Two of the four checkpoints the contract
 * carries — `afterResistances` and `afterReductions` — are the engine's unrounded WORKING values,
 * and `raw` can be too; only `final` arrives already rounded. Fourteen digits of floating-point
 * noise in a product whose only claim is that its numbers are right reads as either a bug or fake
 * precision, and a reader cannot tell which. It is the identical defect `../primitives/readout.ts`
 * was written for.
 *
 * THE ROUNDING HAPPENS AT THIS CALL SITE, NOT INSIDE `DamageValue`, and that is deliberate.
 * `DamageValue` still prints exactly what it is given, so it remains impossible for a damage
 * figure anywhere else in the product to be rounded a second time by the display layer. What is
 * rounded here is the value HANDED to it. `roundReadout` is a no-op on `final`, which the engine
 * has already rounded at its own single documented rounding point — that point is untouched, and
 * nothing rounded here is ever fed back into arithmetic.
 */
function ResistancePopover({ id, column }: { id: string; column: BurndownColumn }) {
  const instance = column.instance;

  return (
    <div
      className="burn__pop"
      role="tooltip"
      id={id}
      style={{ insetInlineEnd: 0, insetBlockEnd: '100%' }}
    >
      <p className="burn__pop-title">{column.sourceLabel}</p>

      {/* A mixed or no-damage instance carries no single hue. `singleDamageType` narrows the
          union; there is no fixture with either arm yet, and when one exists the popover must
          render it bone and untagged rather than pick a colour. */}
      {instance ? (
        <dl className="burn__steps">
          <dt>Raw</dt>
          <dd>
            <DamageValue
              value={roundReadout(instance.raw)}
              damageType={singleDamageType(instance.damageType) ?? 'true'}
              size="m"
              spokenContext="before mitigation"
            />
          </dd>
          <dt>After resistances</dt>
          <dd>
            <DamageValue
              value={roundReadout(instance.afterResistances)}
              damageType={singleDamageType(instance.damageType) ?? 'true'}
              size="m"
              spokenContext="after resistances"
            />
          </dd>
          <dt>After reductions</dt>
          <dd>
            <DamageValue
              value={roundReadout(instance.afterReductions)}
              damageType={singleDamageType(instance.damageType) ?? 'true'}
              size="m"
              spokenContext="after reductions"
            />
          </dd>
          <dt>Final</dt>
          <dd>
            <DamageValue
              value={roundReadout(instance.final)}
              damageType={singleDamageType(instance.damageType) ?? 'true'}
              size="m"
              spokenContext="applied"
            />
          </dd>
        </dl>
      ) : (
        <dl className="burn__steps">
          {column.segments.map((s) => (
            <Fragment key={s.damageType}>
              <dt>Full duration</dt>
              <dd>
                <DamageValue
                  value={roundReadout(s.damage)}
                  damageType={s.damageType}
                  size="m"
                  spokenContext="over time, never folded into the burst total"
                />
              </dd>
            </Fragment>
          ))}
        </dl>
      )}

      {column.verification ? (
        <p className="burn__pop-note">
          <VerificationStatusMark
            status={column.verification}
            reason={column.incompleteReason}
            spokenSubject={column.sourceLabel}
          />
        </p>
      ) : null}

      <p className="burn__pop-note">
        Resistance modifiers apply in one fixed order: flat reduction, then percentage
        reduction, then percentage penetration, then flat penetration. The result records the
        checkpoints above rather than each individual modifier.
      </p>
    </div>
  );
}
