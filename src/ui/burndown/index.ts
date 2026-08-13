// The HP burndown — DESIGN.md §7's signature element.
//
// NOT YET WIRED INTO THE APP. `src/main.tsx` and `index.html` are outside this area; the
// lead mounts it. It renders from a `Result` alone and needs nothing else.

export { HpBurndown, riserName, useOdometer, usePrefersReducedMotion } from './HpBurndown';
export type { HpBurndownProps } from './HpBurndown';

export {
  auditResult,
  buildBurndownModel,
  niceTicks,
  odometerAt,
  playbackDurationMs,
  ruleShift,
  verdictText,
  worstOf,
  GHOST_MS,
  LETHAL_MS,
  ODOMETER_MS,
  STEP_MS,
} from './geometry';
export type {
  BurndownColumn,
  BurndownModel,
  DotSegment,
  ResultFinding,
} from './geometry';
