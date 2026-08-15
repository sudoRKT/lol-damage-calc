// The sweep curves — SPECIFICATION §11's damage-versus-level and damage-versus-resistance views.
//
// NOT YET WIRED INTO THE APP. `src/ui/app/App.tsx` is the lead's; this area exports the component
// and the lead mounts it. It renders from a `SweepSeries` alone — whatever `damageVsLevel` or
// `damageVsResistance` returned — and needs no data file, no catalogue and no second argument.
//
// The one entry point is `DamageCurve`. There is deliberately no separate LevelCurve and
// ResistanceCurve: the two views differ only in what the engine put in the series' own axis label
// and point labels, and two components would be two places for one chart to drift.

export { DamageCurve, verdictText } from './DamageCurve';
export type { DamageCurveProps, DamageCurveRanks } from './DamageCurve';

// The rank comparison behind `DamageCurveProps.ranks`. Exported because the FIGURES are useful
// without the chart — a page may want to say "this build cannot be drawn" before deciding to draw
// anything — and because the wording functions are the single place the phrasing lives.
export {
  LEVELLING_ORDERS,
  SLOTS,
  TOP_OF_CURVE_NOTE,
  annotateNotes,
  appliedLevelRanks,
  levelRanges,
  noteConfirmation,
  noteContradictionText,
  orderPhrase,
  policyDetail,
  policyPhrase,
  rankShortfall,
  ranksPhrase,
  scheduleCap,
  shortfallAt,
  shortfallCellParts,
  shortfallDescription,
  shortfallSentences,
  shortfallWarnings,
  unreachableSentence,
} from './rank-shortfall';
export type {
  PointShortfall,
  RankShortfall,
  ShortfallCause,
  SlotShortfall,
} from './rank-shortfall';

// Hand-authored series for previews and for the area-wide sweeps, which render every table-bearing
// component without loading data files. See `mock-series.ts` for what they are and are not.
export {
  MOCK_LEVEL_SERIES,
  MOCK_RANK_BUILD_REACHABLE,
  MOCK_RANK_BUILD_UNREACHABLE,
  MOCK_RANK_LEVEL_SERIES,
  MOCK_RESISTANCE_SERIES,
} from './mock-series';

export {
  buildCurveModel,
  curveDescription,
  pct,
  polylinePoints,
  refusalText,
} from './geometry';
export type {
  CurveLine,
  CurveLineKind,
  CurveModel,
  CurveModelOptions,
  CurvePoint,
  CurveTick,
  RefusedMark,
} from './geometry';
