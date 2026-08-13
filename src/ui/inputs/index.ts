// Numeric input.
//
// EVERY number a user types into this product goes through `NumberInput`. That is the only
// place negative zero is clamped, and `negative-zero-sweep.test.tsx` refuses any other
// numeric input in src/ui/. Do not hand-roll an `<input type="number">`; the sweep will
// fail and name the file.

export { NumberInput } from './NumberInput';
export type { NumberInputProps } from './NumberInput';
export { clampNegativeZero, parseNumericInput } from './normalize';
export type { NumericInputParse } from './normalize';
