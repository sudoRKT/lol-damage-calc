// THE PER-INSTANCE BREAKDOWN — SPECIFICATION §11's itemised output, as a table.
//
// §11 asks for four things this component prints: the damage contributed by each instance in
// order, showing the state that applied at that point; the running total as the combo
// progresses; the damage-over-time line kept separate; and every excluded mechanic stated
// visibly rather than silently omitted.
//
// ═══ THE ROUNDING RULE, WHICH GOVERNS THIS FILE ═══
//
// `InstanceResult.final` (src/types/result.ts) carries the rule in its own doc comment, and it
// is binding here: rounded output is never fed back into arithmetic. The burst total is
// rounded ONCE from the unrounded sum — it is NOT the sum of the rounded per-instance figures.
// So three instances of 150 / 166.67 / 187.5 print as 150 / 167 / 188, a column that reads 505,
// while the total is 504.
//
// The consequence for this table is a design instruction, not a caveat to bury:
// **the per-instance column must never be presented as something to add up.** Which means,
// concretely, and each of these is checked by a test:
//   • there is NO column total, no <tfoot> sum, and nothing anywhere in this area that adds
//     `final` values together (`rounding-presentation.test.tsx` sweeps every file for that);
//   • `runningTotal` — the authoritative cumulative figure, computed unrounded — is printed on
//     EVERY row, not once at the bottom;
//   • the difference is stated in plain English under the table, where a reader who notices the
//     column not adding up will look, rather than in a comment only a developer sees.
//
// ═══ THE CONTRACT GAP THIS AREA RAISED IS CLOSED (2026-08-13) ═══
//
// DESIGN.md §8 permits exactly one untagged figure: a multi-type aggregate, which must be
// broken down by a tagged composition bar. The per-row running total IS such an aggregate, and
// `Result.runningTotal` used to be `number[]` with no per-type split — so the cell was untagged
// with NO bar, the one form the hard rule does not allow. The split could not be reconstructed
// here either, because re-summing the rounded per-instance column contradicts the authoritative
// figure (the rounding rule again).
//
// `runningTotal` now carries a `DamageTotals` per step, computed unrounded by the engine and
// apportioned so the three types sum exactly to the total (`roundSplit`). The cell therefore
// renders `AggregateTotal`, which REFUSES to draw the untagged figure without the tagged bar and
// throws if the two disagree. Single-type rows fall back to an ordinary tagged value, because
// §8's exception is for a total that spans types and a one-type total is not one.

import type {
  DamageTotals,
  DamageType,
  InstanceResult,
  ReportedDamageType,
  Result,
} from '../../types';
import { AggregateTotal, DamageValue, VerificationStatusMark, formatReadout } from '../primitives';
import { AbilityChip } from '../art/AbilityChip';
import { iconUrl } from '../data/roster';
import './breakdown.css';

/** The one damage type a figure can be tagged with, or null for mixed / none. */
function singleDamageType(t: ReportedDamageType): DamageType | null {
  return t === 'mixed' || t === 'none' ? null : t;
}

/**
 * A source label split into its slot letter and the rest — "Q — The Darkin Blade (1st cast)"
 * becomes `Q` and `The Darkin Blade (1st cast)`. A label with no slot prefix ("Basic attack",
 * "Sunfire Aegis (burn)") keeps the whole string as its name and has no slot.
 *
 * `InstanceResult.sourceLabel` is one string in the contract, and `AbilityChip` takes the two
 * halves separately, so somebody has to split it. Doing it here, with a test, beats each caller
 * taking `label[0]` and putting "B" on a basic attack.
 */
export function splitSourceLabel(label: string): { slot: string; name: string } {
  const m = /^([PQWER])\s*—\s*(.+)$/.exec(label);
  return m ? { slot: m[1]!, name: m[2]! } : { slot: '', name: label };
}

/** `conquerorStacks` → `Conqueror stacks`. The state keys are the engine's, not a user's. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The state that applied at this point in the sequence (§11), as readable phrases.
 *
 * A boolean is printed as on/off rather than true/false, because it describes a condition the
 * user configured (`bonePlating: true` is "Bone plating on"), and a number keeps its figure.
 */
export function formatState(snapshot: Record<string, number | boolean>): string[] {
  return Object.entries(snapshot).map(([key, value]) =>
    typeof value === 'boolean'
      ? `${humanizeKey(key)} ${value ? 'on' : 'off'}`
      : `${humanizeKey(key)} ${formatReadout(value)}`,
  );
}

/** The whole spoken sentence for the running-total cell. One text node (see ../primitives). */
export function runningTotalName(index: number, running: number): string {
  return `Running total after instance ${index}: ${running} damage, cumulative across damage types`;
}

export interface InstanceBreakdownProps {
  result: Result;
  /** Patch the icons are served for. Defaults to the patch the result was computed against. */
  patch?: string;
}

export function InstanceBreakdown({ result, patch }: InstanceBreakdownProps) {
  const artPatch = patch ?? result.patch;

  return (
    <section className="breakdown-panel" aria-label="Per-instance breakdown">
      <header className="breakdown-panel__head">
        <h2 className="breakdown-panel__title">Per-instance breakdown</h2>
        {/* SPECIFICATION §8: the patch is displayed adjacent to every result, never in a
            footer. */}
        <p className="breakdown-panel__patch">Patch {result.patch}</p>
      </header>

      <table className="breakdown">
        <caption className="u-visually-hidden">
          Each instance of the combo in order, with the state that applied at that point, the
          damage it dealt, and the running total. The per-instance column is rounded for
          display and is not meant to be added up; the running total is the authoritative
          figure.
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Source</th>
            <th scope="col">State at this point</th>
            <th scope="col">Damage</th>
            <th scope="col">Running total</th>
            <th scope="col">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {result.perInstance.map((instance, i) => (
            <InstanceRow
              key={instance.stepId}
              instance={instance}
              running={result.runningTotal[i]}
              patch={artPatch}
            />
          ))}
        </tbody>
      </table>

      {/* THE ROUNDING NOTE. Visible, in plain English, next to the column it is about. */}
      <p className="breakdown-panel__note">
        Each per-instance figure is rounded once, for display. The column is not meant to be
        added up: rounding is applied to the total rather than accumulated across rows, so the
        column can differ from the total by a point or two. The running total is the
        authoritative figure.
      </p>

      <div className="breakdown-panel__totals">
        <AggregateTotal
          label="Burst total"
          total={result.burst.total}
          byType={result.burst.byType}
          size="hero"
        />
      </div>

      <DotSection result={result} patch={artPatch} />

      {result.incompleteContributors.length > 0 ? (
        <section className="breakdown-panel__block" aria-label="Excluded from these totals">
          <h3 className="breakdown-panel__eyebrow">Excluded from these totals</h3>
          <ul className="breakdown-panel__list">
            {result.incompleteContributors.map((c) => (
              <li key={c.sourceLabel}>
                <VerificationStatusMark
                  status="incomplete"
                  reason={c.reason}
                  spokenSubject={`${c.sourceLabel}, contributes no damage`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* SPECIFICATION §11: "Every excluded mechanic is stated visibly in the result rather
          than silently omitted." */}
      {result.excludedMechanics.length > 0 ? (
        <section className="breakdown-panel__block" aria-label="Mechanics this result excludes">
          <h3 className="breakdown-panel__eyebrow">Mechanics this result excludes</h3>
          <ul className="breakdown-panel__list breakdown-panel__list--plain">
            {result.excludedMechanics.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function InstanceRow({
  instance,
  running,
  patch,
}: {
  instance: InstanceResult;
  running: DamageTotals | undefined;
  patch: string;
}) {
  const type = singleDamageType(instance.damageType);
  const state = formatState(instance.stateSnapshot);

  return (
    <tr>
      <th scope="row" className="breakdown__index">
        {instance.index}
      </th>

      <td className="breakdown__source">
        {instance.icon ? (
          <AbilityChip
            src={iconUrl(patch, instance.icon, splitSourceLabel(instance.sourceLabel).slot)}
            slot={splitSourceLabel(instance.sourceLabel).slot}
            abilityName={splitSourceLabel(instance.sourceLabel).name}
            damageType={type}
            size="table"
            // The row's own text names the source; a labelled chip beside it would say it twice.
            decorative
          />
        ) : null}
        <span className="breakdown__source-label">{instance.sourceLabel}</span>
        {instance.crit ? (
          <>
            <span className="breakdown__crit" aria-hidden="true">
              CRIT
            </span>
            <span className="u-visually-hidden">critical strike</span>
          </>
        ) : null}
      </td>

      <td className="breakdown__state">
        {state.length === 0 ? (
          <span className="u-visually-hidden">no state recorded</span>
        ) : (
          state.join(' · ')
        )}
      </td>

      <td className="breakdown__damage">
        <DamageCell instance={instance} />
      </td>

      <td className="breakdown__running">
        {running === undefined ? (
          <span className="u-visually-hidden">running total not recorded</span>
        ) : (
          <>
            {/* `AggregateTotal` renders the untagged figure ONLY alongside its tagged
                composition bar, and throws if the split disagrees with the total. A running
                total that has so far touched one damage type is not a multi-type aggregate, so
                it comes back tagged — which is what §8 requires. */}
            <span aria-hidden="true">
              <AggregateTotal total={running.total} byType={running.byType} size="l" />
            </span>
            <span className="u-visually-hidden">
              {runningTotalName(instance.index, running.total)}
            </span>
          </>
        )}
      </td>

      <td className="breakdown__evidence">
        <VerificationStatusMark
          status={instance.verification}
          reason={instance.incompleteReason}
        />
      </td>
    </tr>
  );
}

/**
 * The damage cell.
 *
 * AN INCOMPLETE INSTANCE SHOWS NO FIGURE AT ALL. SPECIFICATION §8: "an incomplete ability
 * contributes no damage to a result" and "a figure is absent rather than wrong". Printing its
 * zero would be a damage claim — it would say the ability dealt nothing, which is a different
 * statement from "we will not show a number we cannot stand behind". So the cell is an em dash,
 * it says "not shown" to assistive technology, and the Evidence column beside it names why.
 */
function DamageCell({ instance }: { instance: InstanceResult }) {
  if (instance.verification === 'incomplete') {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="u-visually-hidden">not shown, this ability is excluded</span>
      </>
    );
  }

  if (instance.damageType === 'none') {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="u-visually-hidden">no damage</span>
      </>
    );
  }

  if (instance.damageType === 'mixed') {
    // DESIGN.md §8's one untagged figure, and it cannot render without its tagged composition
    // bar. The contract requires `byType` on a mixed instance; if it is missing the data is
    // wrong and this fails loudly rather than picking a hue.
    if (!instance.byType) {
      throw new Error(
        `InstanceBreakdown: instance ${instance.index} is 'mixed' but carries no byType. ` +
          `src/types/result.ts requires it. Fix the caller.`,
      );
    }
    return <AggregateTotal total={instance.final} byType={instance.byType} size="l" />;
  }

  return <DamageValue value={instance.final} damageType={instance.damageType} size="l" />;
}

/**
 * Damage over time, ALWAYS a separate line (SPECIFICATION §3.8, §11).
 *
 * It is never folded into the burst figure and never appears in the per-instance table above.
 * Its own total is shown, and the survival verdict that includes it is the burndown's to print
 * — the two verdicts are given there, once, rather than twice on one page.
 */
function DotSection({ result, patch }: { result: Result; patch: string }) {
  if (result.dot.sources.length === 0) return null;

  return (
    <section className="breakdown-panel__block" aria-label="Damage over time">
      <h3 className="breakdown-panel__eyebrow">Damage over time — never in the burst total</h3>
      <table className="breakdown">
        <caption className="u-visually-hidden">
          Damage over time by source, over its full duration. Reported separately and never
          folded into the burst total.
        </caption>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Full duration</th>
            <th scope="col">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {result.dot.sources.map((source) => (
            <tr key={source.label}>
              <th scope="row" className="breakdown__source">
                {source.icon ? (
                  <AbilityChip
                    src={iconUrl(patch, source.icon, splitSourceLabel(source.label).slot)}
                    slot={splitSourceLabel(source.label).slot}
                    abilityName={splitSourceLabel(source.label).name}
                    damageType={source.damageType}
                    size="table"
                    decorative
                  />
                ) : null}
                <span className="breakdown__source-label">{source.label}</span>
              </th>
              <td className="breakdown__damage">
                <DamageValue
                  value={source.total}
                  damageType={source.damageType}
                  size="l"
                  spokenContext="over time, never folded into the burst total"
                />
              </td>
              <td className="breakdown__evidence">
                <VerificationStatusMark
                  status={source.verification}
                  reason={source.incompleteReason}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
