// The two primitives every other component in this product is built from.
//
// Import from here rather than from the files directly, so the surface stays one thing.
//
// THE RULES THAT LIVE IN THEM, so a component author does not have to remember them:
//   • Any damage figure goes through `DamageValue`. It always carries its P/M/T tag and
//     always announces the full word. There is no way to turn either off.
//   • The one untagged figure permitted anywhere is a MULTI-TYPE total, and it is
//     `AggregateTotal`, which cannot render without the tagged composition bar.
//   • Verification status goes through `VerificationStatusMark`. Five states, glyph and
//     label, never a colour.

export {
  DamageValue,
  AggregateTotal,
  CompositionBar,
  formatDamage,
  THIN_SPACE,
} from './DamageValue';
export type {
  DamageValueProps,
  AggregateTotalProps,
  CompositionBarProps,
  DamageNumberSize,
} from './DamageValue';

export {
  VerificationStatusMark,
  STATE_STYLE,
  resolveDisplayState,
  missingFactSuffix,
} from './VerificationStatusMark';
export type {
  VerificationStatusMarkProps,
  VerificationDisplayState,
} from './VerificationStatusMark';
