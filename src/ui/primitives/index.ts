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
//   • Every <table> in the area is wrapped in `TableScroller`. A table is the one thing in
//     this product that is allowed to be wider than a phone screen, and this is the only way
//     it is allowed to be: the scroll is confined to the table, and the region is keyboard
//     reachable and announced. `../responsive-overflow.test.tsx` sweeps the whole area for a
//     table that is not.

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

export { READOUT_DECIMALS, formatReadout, roundReadout } from './readout';

export { TableScroller, SCROLL_REGION_SUFFIX } from './TableScroller';
export type { TableScrollerProps } from './TableScroller';

/** An excluded ability, named and explained ON SCREEN (SPECIFICATION §8). */
export { ExcludedAbility } from './ExcludedAbility';
export type { ExcludedAbilityProps } from './ExcludedAbility';

export {
  VerificationStatusMark,
  STATE_STYLE,
  resolveDisplayState,
  incompleteDetailSuffix,
} from './VerificationStatusMark';
export type {
  VerificationStatusMarkProps,
  VerificationDisplayState,
} from './VerificationStatusMark';

export { Disclosure, disclosureName } from './Disclosure';
export type { DisclosureProps } from './Disclosure';
