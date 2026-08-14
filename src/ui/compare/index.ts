// The build-comparison surface (SPECIFICATION §11).
//
// One component and the pure model behind it. Import from here rather than from the files
// directly, so the area's surface stays one thing.
//
// MOUNTING IS A LEAD ACTION. Nothing in this directory wires itself into `src/ui/app/App.tsx`.

export { BuildComparisonPanel } from './BuildComparisonPanel';
export type { BuildComparisonPanelProps } from './BuildComparisonPanel';

export {
  MIN_TICK_LABEL_GAP,
  differenceShape,
  directionSentence,
  directionWord,
  labelledTicks,
  lethalitySentence,
  magnitudeModel,
  mixedDirection,
  pct,
  presentTypes,
  tickShift,
  verdictSentence,
} from './model';
export type {
  AxisTick,
  BuildLabels,
  DamageTypeName,
  MagnitudeBar,
  MagnitudeModel,
  SideMagnitude,
} from './model';
