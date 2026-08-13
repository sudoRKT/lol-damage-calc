// THE numeric input. Every number a user types into this product enters through here.
//
// That is not a style preference — it is how the negative-zero clamp is made unavoidable.
// A rule that each field is expected to remember is a rule that one field will eventually
// forget, and the forgetting is invisible: -0 and 0 look identical on screen and in every
// log. So there is ONE entry point, it clamps, and a mechanical check
// (`negative-zero-sweep.test.tsx`) refuses any other numeric input in src/ui/.
//
// The clamp itself, and why it lives at input rather than at the encoder, is documented in
// `normalize.ts`.

import { useId } from 'react';
import { parseNumericInput } from './normalize';
import './inputs.css';

export interface NumberInputProps {
  /** Visible label. Also the input's accessible name — there is no unlabelled variant. */
  label: string;
  /** Current value. Shown as-is; this component never rounds. */
  value: number;
  /**
   * Called with the new value whenever the user changes it. NEVER called with -0, NaN, or
   * an infinity. Not called at all while the field is empty or unparseable, so a
   * half-typed "-" cannot momentarily store a garbage number.
   */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Optional plain-English hint under the field, e.g. "1 to 18". */
  hint?: string;
}

/**
 * A labelled numeric field.
 *
 * It renders a real `<input type="number">`, so it has the `spinbutton` role, works with
 * the keyboard and with a screen reader for free, and is queryable by role and accessible
 * name. The label is a real `<label>` bound by id — never a placeholder, which disappears
 * the moment a user starts typing.
 */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  hint,
}: NumberInputProps) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <span className="numfield">
      <label className="numfield__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="numfield__input"
        type="number"
        value={String(value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => {
          // THE CLAMP. Every path that changes this field — typing, pasting, the spinner
          // buttons, arrow keys — arrives here as a change event, so there is exactly one
          // place -0 can get in and exactly one place it is stopped.
          const parsed = parseNumericInput(e.target.value);
          if (parsed.ok) onChange(parsed.value);
        }}
      />
      {hint ? (
        <span className="numfield__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </span>
  );
}
