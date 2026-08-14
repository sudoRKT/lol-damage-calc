// DETECTORS OVER A SWEEP — the checks that a curve can be run against, at any scale.
//
// ═══ WHY THIS EXISTS ═══
//
// A sweep evaluates the engine hundreds of times with one input moving, which makes it the best
// bug-finder in this codebase: a formula error that a single scenario hides shows up immediately
// as a curve doing something a formula forbids. This module turns that into checks that can be
// run over a whole roster rather than looked at by eye.
//
// ═══ A DETECTOR PROPOSES; A PERSON CONFIRMS (CLAUDE.md) ═══
//
// Findings are graded, and the grade is a claim about the CHECK, not about the severity of the
// consequence:
//
//   'defect'     the invariant comes straight from a documented formula and has no legitimate
//                exception. §3.6 says true damage bypasses armor and magic resistance, so a true
//                damage figure that moves when armor moves is wrong, full stop.
//
//   'candidate'  the pattern is usually a bug and provably not always one, so it is reported for
//                someone to read. The clearest case is a damage total that RISES with armor.
//                That is normally impossible, and an execute makes it possible: an execute
//                delivers the target's remaining health, so a combo that mitigates more can leave
//                more health for the execute to deliver.
//
// ═══ THE ONE-POINT TOLERANCE, AND WHY IT IS NOT A FUDGE ═══
//
// The per-type figures are not rounded independently. rounding.ts rounds the TOTAL once and then
// divides it among the three types by the largest-remainder method, so the split always sums to
// its own total. A consequence, which cost a wrong expected value in this module's own sibling
// test: when one type changes, ANOTHER type's printed figure can move by one point without its
// damage having changed at all. So an invariant about a per-type figure is checked with a
// tolerance of one point, and a movement of two or more is a defect. The tolerance is on the
// per-type figures ONLY — the burst TOTAL is rounded once from an unrounded sum, and rounding
// cannot turn a falling sequence into a rising one, so the monotonicity check needs no tolerance.

import type { Scenario } from '../types/scenario';
import type { AppliedLevel, LevelSweepOptions, Ranks } from './level-sweep';
import { damageVsLevel, unlearnedCasts } from './level-sweep';
import type { AppliedResistances, ResistanceSweepSeries } from './resistance-sweep';
import { damageVsResistance } from './resistance-sweep';
import type { Catalogue, SimulationRefusal } from './simulate';
import type { ComputedSweepPoint, SweepSeries } from './sweep';

/** One point of movement is the documented largest-remainder apportionment, not a change. */
export const APPORTIONMENT_TOLERANCE = 1;

export type SweepFindingKind =
  | 'true-damage-moved'
  | 'untouched-type-moved'
  | 'split-does-not-sum'
  | 'non-monotonic-in-resistance'
  | 'fell-with-attacker-level'
  | 'hole-in-series'
  | 'incomplete-set-varies'
  | 'every-point-refused'
  | 'casts-unlearned-ability';

export interface SweepFinding {
  kind: SweepFindingKind;
  severity: 'defect' | 'candidate';
  /** Plain English, naming the figures involved. Written to be read, not parsed. */
  message: string;
  /** The x values the finding is about. */
  atX: number[];
}

// ---------------------------------------------------------------------------------------
// Checks every series gets
// ---------------------------------------------------------------------------------------

function computedInOrder<A>(series: SweepSeries<A>): ComputedSweepPoint<A>[] {
  return series.points
    .filter((p): p is ComputedSweepPoint<A> => p.status === 'computed')
    .slice()
    .sort((a, b) => a.x - b.x);
}

/** The three checks that apply whatever is being swept. */
function sharedChecks<A>(series: SweepSeries<A>): SweepFinding[] {
  const findings: SweepFinding[] = [];

  // 1. A per-type split must sum to its own total. This is a hard invariant of rounding.ts and
  //    of the cross-area rule that a split never disagrees with the figure above it.
  const badSplits = computedInOrder(series).filter((point) => {
    const { total, byType } = point.summary.burst;
    return byType.physical + byType.magic + byType.true !== total;
  });
  if (badSplits.length > 0) {
    findings.push({
      kind: 'split-does-not-sum',
      severity: 'defect',
      message:
        `the per-type split does not sum to the burst total at ${badSplits.length} point(s): ` +
        badSplits
          .map(
            (p) =>
              `${p.label} reads ${p.summary.burst.byType.physical} + ` +
              `${p.summary.burst.byType.magic} + ${p.summary.burst.byType.true} against a total ` +
              `of ${p.summary.burst.total}`,
          )
          .join('; '),
      atX: badSplits.map((p) => p.x),
    });
  }

  // 2. Nothing computed at all. A series of pure refusals is honest and is also not a curve;
  //    a view drawing it has nothing to draw and should say so in words.
  if (series.points.length > 0 && series.computedCount === 0) {
    findings.push({
      kind: 'every-point-refused',
      severity: 'candidate',
      message:
        `no point of this ${series.axisLabel} sweep could be computed — all ` +
        `${series.refusedCount} refused. There is no curve here, only a reason`,
      atX: series.points.map((p) => p.x),
    });
  }

  // 3. A refused point BETWEEN two computed ones. `contiguousSegments` already stops a renderer
  //    drawing through it; this reports it, because a hole in the middle of a range is usually
  //    telling you something about the scenario.
  const holes: number[] = [];
  const ordered = series.points.slice().sort((a, b) => a.x - b.x);
  for (let i = 1; i < ordered.length - 1; i += 1) {
    if (ordered[i]!.status !== 'refused') continue;
    const before = ordered.slice(0, i).some((p) => p.status === 'computed');
    const after = ordered.slice(i + 1).some((p) => p.status === 'computed');
    if (before && after) holes.push(ordered[i]!.x);
  }
  if (holes.length > 0) {
    findings.push({
      kind: 'hole-in-series',
      severity: 'candidate',
      message:
        `${holes.length} refused point(s) sit between computed ones on the ${series.axisLabel} ` +
        `axis (at ${holes.join(', ')}), so this curve has a hole in the middle rather than a ` +
        'shortened range',
      atX: holes,
    });
  }

  // 4. The curve does not compare like with like along its own axis.
  if (series.incompleteSetVaries) {
    findings.push({
      kind: 'incomplete-set-varies',
      severity: 'candidate',
      message:
        'the abilities excluded from this curve are not the same at every point — ' +
        `${series.incompleteSomewhere.join(', ')} is excluded somewhere and not everywhere, so a ` +
        'step in this curve may be a change in what was modelled rather than a change in damage',
      atX: computedInOrder(series)
        .filter(
          (p) => p.summary.incompleteContributors.length !== series.incompleteEverywhere.length,
        )
        .map((p) => p.x),
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------------------
// Resistance sweeps
// ---------------------------------------------------------------------------------------

/** Which resistances a series actually moved, read off its own points. */
function axesOf(series: ResistanceSweepSeries): { armor: boolean; magic: boolean } {
  const applied = series.points[0]?.applied as AppliedResistances | undefined;
  return { armor: applied?.armor !== undefined, magic: applied?.magicResist !== undefined };
}

export function auditResistanceSeries(series: ResistanceSweepSeries): SweepFinding[] {
  const findings = sharedChecks(series);
  const points = computedInOrder(series);
  if (points.length === 0) return findings;

  const axes = axesOf(series);

  // TRUE DAMAGE BYPASSES BOTH RESISTANCES (§3.6). It may not move on any resistance axis.
  findings.push(
    ...movementFinding(points, 'true', 'true-damage-moved', 'true damage bypasses both armor and magic resistance (SPECIFICATION §3.6)'),
  );

  // A TYPE THE AXIS DOES NOT TOUCH may not move either. On a 'both' sweep there is no such type.
  if (axes.armor && !axes.magic) {
    findings.push(
      ...movementFinding(points, 'magic', 'untouched-type-moved', 'this sweep moves armor only, and armor does not mitigate magic damage'),
    );
  }
  if (axes.magic && !axes.armor) {
    findings.push(
      ...movementFinding(points, 'physical', 'untouched-type-moved', 'this sweep moves magic resistance only, and magic resistance does not mitigate physical damage'),
    );
  }

  // DAMAGE MAY NOT RISE AS RESISTANCE RISES — usually. See the header on executes.
  const rises: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i]!.summary.burst.total > points[i - 1]!.summary.burst.total) rises.push(points[i]!.x);
  }
  if (rises.length > 0) {
    findings.push({
      kind: 'non-monotonic-in-resistance',
      severity: 'candidate',
      message:
        `burst damage RISES as ${series.axisLabel} rises, at ${rises.join(', ')}. A higher ` +
        'resistance cannot increase mitigated damage, so this is a defect unless the combo ' +
        'carries an execute — an execute delivers the target’s remaining health, so a slower ' +
        'combo can deliver more of it. Read the combo before treating it as either',
      atX: rises,
    });
  }

  return findings;
}

/** A per-type figure that moved by more than the apportionment tolerance. */
function movementFinding<A>(
  points: ComputedSweepPoint<A>[],
  type: 'physical' | 'magic' | 'true',
  kind: SweepFindingKind,
  why: string,
): SweepFinding[] {
  const first = points[0]!.summary.burst.byType[type];
  const moved = points.filter(
    (p) => Math.abs(p.summary.burst.byType[type] - first) > APPORTIONMENT_TOLERANCE,
  );
  if (moved.length === 0) return [];
  return [
    {
      kind,
      severity: 'defect',
      message:
        `the ${type} damage figure moves across this sweep — ${first} at ${points[0]!.label}, ` +
        `${moved.map((p) => `${p.summary.burst.byType[type]} at ${p.label}`).join(', ')}. ` +
        `${why}. A movement of one point is the documented largest-remainder apportionment ` +
        '(rounding.ts) and is tolerated; this is larger',
      atX: moved.map((p) => p.x),
    },
  ];
}

// ---------------------------------------------------------------------------------------
// Level sweeps
// ---------------------------------------------------------------------------------------

export function auditLevelSeries(series: SweepSeries<AppliedLevel>): SweepFinding[] {
  const findings = sharedChecks(series);
  const points = computedInOrder(series);

  // ONLY MEANINGFUL WHEN THE ATTACKER ALONE LEVELS. Every per-level growth figure in the game is
  // non-negative, so with the same ranks a higher-level attacker cannot deal less. When the
  // DEFENDER is levelling too, damage falling is the expected shape and says nothing.
  if (series.axisLabel !== 'attacker level') return findings;

  const falls: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]!;
    const current = points[i]!;
    if (current.summary.burst.total >= previous.summary.burst.total) continue;
    // A rank that FELL explains a fall honestly: a levelling path can put its points elsewhere,
    // and a sweep never ranks above the configured build.
    const rankFell = (['Q', 'W', 'E', 'R'] as const).some(
      (slot) => current.applied.ranks[slot] < previous.applied.ranks[slot],
    );
    if (!rankFell) falls.push(current.x);
  }
  if (falls.length > 0) {
    findings.push({
      kind: 'fell-with-attacker-level',
      severity: 'candidate',
      message:
        `burst damage FALLS as the attacker levels, at level(s) ${falls.join(', ')}, with no ` +
        'ability rank falling. Every per-level growth figure is non-negative, so this is a defect ' +
        'unless the scenario carries an effect that scales inversely with level',
      atX: falls,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------------------
// The runner — every detector, over as many scenarios as the caller supplies
// ---------------------------------------------------------------------------------------

export interface SweepAuditCase {
  /** How the case is named in a finding. Make it identify the scenario to a person. */
  name: string;
  scenario: Scenario;
}

export interface SweepAuditOptions {
  catalogue: Catalogue;
  cases: readonly SweepAuditCase[];
  /** The resistance range to sweep. All three axes are run. Omit to skip resistance sweeps. */
  resistance?: { from: number; to: number; step: number } | { values: readonly number[] };
  /** How to sweep levels. Omit to skip level sweeps. */
  level?: LevelSweepOptions;
}

export interface AuditFinding extends SweepFinding {
  case: string;
  /** The axis label of the series the finding came from. */
  series: string;
}

export interface SweepAuditReport {
  /** Cases that produced at least one series. */
  casesRun: number;
  /** Cases the catalogue could not answer at all; these produce no series. */
  refusedCases: Array<{ case: string; refusals: readonly SimulationRefusal[] }>;
  seriesRun: number;
  /** Points evaluated, refused ones included — a refused point was still an attempt. */
  pointsEvaluated: number;
  defects: AuditFinding[];
  candidates: AuditFinding[];
}

/**
 * Run every detector over every case.
 *
 * THIS FUNCTION READS NO DATA FILE, and that is not an oversight: the engine's rule is that
 * champion, item and ability values arrive as arguments. To audit the published roster, a caller
 * outside `src/engine/` builds a `Catalogue` from `public/data/` and a `cases` list from it, and
 * passes both in. The counts this returns are only meaningful beside the definition of that list,
 * which the caller owns — "412 findings" says nothing without "over N champions x M levels on
 * patch X".
 */
export function auditSweeps(options: SweepAuditOptions): SweepAuditReport {
  const report: SweepAuditReport = {
    casesRun: 0,
    refusedCases: [],
    seriesRun: 0,
    pointsEvaluated: 0,
    defects: [],
    candidates: [],
  };

  for (const testCase of options.cases) {
    let ranAnything = false;

    // A SCENARIO-LEVEL CHECK, run before any sweep, because it is about the configuration rather
    // than about a curve. See `unlearnedCasts` in level-sweep.ts for the engine behaviour behind
    // it and for why it proposes rather than decides.
    const unlearned = unlearnedCasts(
      testCase.scenario,
      testCase.scenario.attacker.abilityRanks as Ranks,
    );
    if (unlearned.length > 0) {
      file(report, testCase.name, 'scenario', [
        {
          kind: 'casts-unlearned-ability',
          severity: 'candidate',
          message:
            `this scenario casts an ability the build has no points in — ` +
            `${unlearned.map((r) => r.reason).join('; ')}. simulate.ts resolves such a step at ` +
            'rank 1, so the figure it returns is for a build the game does not allow',
          atX: [],
        },
      ]);
    }

    if (options.resistance) {
      const range =
        'values' in options.resistance
          ? { values: options.resistance.values }
          : options.resistance;
      for (const axis of ['armor', 'magicResist', 'both'] as const) {
        const outcome = damageVsResistance(testCase.scenario, options.catalogue, {
          axis,
          ...range,
          sort: true,
        });
        if (!outcome.ok) {
          record(report, testCase, outcome.refusals);
          continue;
        }
        ranAnything = true;
        report.seriesRun += 1;
        report.pointsEvaluated += outcome.series.points.length;
        file(report, testCase.name, outcome.series.axisLabel, auditResistanceSeries(outcome.series));
      }
    }

    if (options.level) {
      const outcome = damageVsLevel(testCase.scenario, options.catalogue, options.level);
      if (!outcome.ok) {
        record(report, testCase, outcome.refusals);
      } else {
        ranAnything = true;
        report.seriesRun += 1;
        report.pointsEvaluated += outcome.series.points.length;
        file(report, testCase.name, outcome.series.axisLabel, auditLevelSeries(outcome.series));
      }
    }

    if (ranAnything) report.casesRun += 1;
  }

  return report;
}

function record(
  report: SweepAuditReport,
  testCase: SweepAuditCase,
  refusals: readonly SimulationRefusal[],
): void {
  if (report.refusedCases.some((r) => r.case === testCase.name)) return;
  report.refusedCases.push({ case: testCase.name, refusals });
}

function file(
  report: SweepAuditReport,
  caseName: string,
  seriesLabel: string,
  findings: SweepFinding[],
): void {
  for (const finding of findings) {
    const entry: AuditFinding = { ...finding, case: caseName, series: seriesLabel };
    if (finding.severity === 'defect') report.defects.push(entry);
    else report.candidates.push(entry);
  }
}
