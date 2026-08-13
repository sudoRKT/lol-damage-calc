// The per-instance breakdown (SPECIFICATION §11).
//
// The rounding rule lives on this component: the per-instance column is rounded for display and
// must never be presented as something to add up. `runningTotal` is the authoritative figure and
// is on every row.

export {
  InstanceBreakdown,
  formatState,
  humanizeKey,
  runningTotalName,
  splitSourceLabel,
} from './InstanceBreakdown';
export type { InstanceBreakdownProps } from './InstanceBreakdown';
