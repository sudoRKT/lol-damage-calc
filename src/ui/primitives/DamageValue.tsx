// The damage value — the primitive every rendered damage figure in this product goes
// through.
//
// THE RULE IT EXISTS TO ENFORCE (SPECIFICATION §10.1, DESIGN.md §8, CLAUDE.md
// non-negotiables): damage type is never conveyed by colour alone. Every rendered damage
// value carries a P / M / T tag as well as its hue, and assistive technology is given the
// full word, so `214 P` is announced as "214 physical damage".
//
// The tag is MANDATORY AND NEVER SUPPRESSED. That is enforced structurally rather than by
// discipline: `DamageValue` has no prop that can remove the tag, and the one legitimate
// untagged figure — a multi-type aggregate total — is a DIFFERENT component
// (`AggregateTotal`) which cannot be rendered without the tagged composition bar that
// replaces the tag. A caller therefore cannot reach an untagged single-type figure at all.

import type { DamageType, DamageByType } from '../../types';
import './primitives.css';

/** The four numeric type roles in DESIGN.md §3. */
export type DamageNumberSize = 'hero' | 'l' | 'm' | 's';

/**
 * DESIGN.md §8 — the damage-type tag: a WORD FRAGMENT, not a letter.
 *
 * ═══ WHY THIS IS A WORD, CHANGED 2026-08-14 ═══
 *
 * It was `P` / `M` / `T` until the project owner read the `M` on an ability icon as an ability
 * SLOT letter — Q, W, E, R are the letters a League player expects on that object — and asked for
 * the collision removed rather than softened (DESIGN-AUDIT.md part 2, option A).
 *
 * The cue was never wrong; it was unreadable, which makes it decoration rather than a cue. So the
 * ambiguous glyph is gone from the ambiguous place: the SLOT letter now sits on the chip, where a
 * player already expects it, and the damage TYPE appears only where a number appears, as a word.
 * A slot letter never appears beside a figure and a type word never appears on a chip, so position
 * alone tells them apart.
 *
 * THIS STRENGTHENS THE COLOUR-ALONE RULE RATHER THAN WEAKENING IT. A word needs no legend and no
 * learning, and it survives greyscale, copy-paste and a screen reader identically — `214 phys`
 * pasted into a bug report still says what type it was.
 *
 * `true` is deliberately the whole word: it is already short, and `tru` would be the only
 * abbreviation on the page that is not also an English word.
 */
const TAG: Record<DamageType, string> = {
  physical: 'phys',
  magic: 'mag',
  true: 'true',
};

const SPOKEN: Record<DamageType, string> = {
  physical: 'physical',
  magic: 'magic',
  true: 'true',
};

/** DESIGN.md §8 — "separated by a thin space". U+2009 THIN SPACE, the literal character,
 *  so the value survives copy-paste as `214 P` rather than as `214P`. */
export const THIN_SPACE = ' ';

const DAMAGE_TYPES: DamageType[] = ['physical', 'magic', 'true'];

/**
 * Format a damage figure for display.
 *
 * NEVER ROUNDS. Rounding is fixed and documented at a single point in the engine
 * (CLAUDE.md); a display layer that rounded again would be a second, undocumented
 * rounding point. 250.4 renders as "250.4", not "250".
 *
 * Thousands are grouped with a thin space at four digits and above, which is the form
 * DESIGN.md §7's schematic prints for the rolling total (`TOTAL 2 480`).
 */
export function formatDamage(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`DamageValue: value must be a finite number, received ${String(value)}`);
  }
  const negative = value < 0;
  const abs = Math.abs(value);
  const [whole, fraction] = String(abs).split('.');
  const grouped =
    whole.length >= 4 ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE) : whole;
  const body = fraction === undefined ? grouped : `${grouped}.${fraction}`;
  return negative ? `-${body}` : body;
}

export interface DamageValueProps {
  /** The figure to show. Shown as given — this component never rounds. */
  value: number;
  /** Which of the three damage types it is. There is no "untyped" option by design. */
  damageType: DamageType;
  /** Numeric type role from DESIGN.md §3. Defaults to `l`, the per-instance breakdown role. */
  size?: DamageNumberSize;
  /**
   * Words appended to the accessible name after "physical damage", e.g. "after
   * resistances". Visual-only callers never need it; it exists so a figure inside the
   * resistance-math popover can say which step it is without a visible label.
   */
  spokenContext?: string;
}

/**
 * A damage figure with its mandatory damage-type tag.
 *
 * Renders `240` + thin space + `P`, coloured by damage type. The visible tag is
 * `aria-hidden` and a screen-reader-only span supplies the full word, so the accessible
 * name is "240 physical damage" — the letter is never the only machine-readable signal
 * (DESIGN.md §8).
 */
export function DamageValue({
  value,
  damageType,
  size = 'l',
  spokenContext,
}: DamageValueProps) {
  // The SPOKEN number is deliberately ungrouped. The visible one groups thousands with a
  // thin space (DESIGN.md §7's `2 480`), and a screen reader given "2 480" can announce it
  // as two separate numbers. Assistive technology gets the plain digits.
  const spoken = spokenContext
    ? `${value} ${SPOKEN[damageType]} damage ${spokenContext}`
    : `${value} ${SPOKEN[damageType]} damage`;

  return (
    <span className={`dmg dmg--${damageType} dmg--${size}`} data-damage-type={damageType}>
      <span aria-hidden="true">
        {formatDamage(value)}
        {THIN_SPACE}
        <span className="dmg__tag">{TAG[damageType]}</span>
      </span>
      <span className="u-visually-hidden">{spoken}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The one legitimate untagged figure.
// ---------------------------------------------------------------------------

export interface AggregateTotalProps {
  /** The summed figure. Must equal the sum of `byType` — see below. */
  total: number;
  /** The physical / magic / true split. Required: it is what replaces the tag. */
  byType: DamageByType;
  /** `hero` is DESIGN.md §7's rolling total. `l` for a smaller total in a table. */
  size?: 'hero' | 'l';
  /** Optional eyebrow label above the figure, e.g. "Total". */
  label?: string;
}

/**
 * A multi-type aggregate total: bone, no tag, broken down by a tagged composition bar
 * (DESIGN.md §7, §8).
 *
 * Three behaviours worth knowing, all tested:
 *
 * 1. **A single-type total is not a multi-type aggregate.** DESIGN.md §8's exception is
 *    for a total that spans types. If only one type is non-zero, this renders an ordinary
 *    tagged `DamageValue` instead — the exception does not apply and the tag comes back.
 * 2. **The composition bar cannot be omitted.** `byType` is required, so the untagged
 *    figure can never appear without the tagged breakdown that makes it legal.
 * 3. **It throws if the split does not sum to the total.** A composition bar that
 *    disagrees with the number above it is a plausible wrong figure that nobody can see is
 *    wrong, which is the one failure this product exists to prevent. It fails loudly
 *    instead. Tolerance is 1e-6 for floating-point noise.
 */
export function AggregateTotal({ total, byType, size = 'hero', label }: AggregateTotalProps) {
  const sum = byType.physical + byType.magic + byType.true;
  if (Math.abs(sum - total) > 1e-6) {
    throw new Error(
      `AggregateTotal: byType sums to ${sum} but total is ${total}. The composition bar ` +
        `would contradict the figure above it. Fix the caller — do not relax this check.`,
    );
  }

  const present = DAMAGE_TYPES.filter((t) => byType[t] !== 0);

  // Rule 1: one type only — not an aggregate, so the tag is mandatory again.
  if (present.length === 1) {
    const only = present[0]!;
    return <DamageValue value={total} damageType={only} size={size} />;
  }

  // THE WHOLE ACCESSIBLE NAME IS ONE TEXT NODE, and everything visible — including the
  // composition bar — is aria-hidden.
  //
  // Why, because it is not obvious and it was measured rather than assumed: the accessible
  // name of a container is built by concatenating its descendants' text, and each part is
  // TRIMMED before it is joined. Letting the total and the three bar segments each supply
  // their own text produced "890 total damage570 physical damage200 magic damage" — every
  // figure run into the next with no gap. Building the sentence once, here, is what makes
  // it read as a sentence.
  const spokenSplit = present.map((t) => `${byType[t]} ${SPOKEN[t]}`).join(', ');
  const spokenName =
    `${label ? `${label}: ` : ''}${total} total damage` +
    (present.length > 0 ? ` — ${spokenSplit}` : '');

  return (
    <span className="agg">
      {label ? (
        <span className="agg__label" aria-hidden="true">
          {label}
        </span>
      ) : null}
      <span className={`agg__total agg__total--${size}`} aria-hidden="true">
        {formatDamage(total)}
      </span>
      <span className="u-visually-hidden">{spokenName}</span>
      {present.length > 0 ? (
        <span aria-hidden="true">
          <CompositionBar total={total} byType={byType} />
        </span>
      ) : null}
    </span>
  );
}

export interface CompositionBarProps {
  total: number;
  byType: DamageByType;
}

/**
 * The tagged split of an aggregate total (DESIGN.md §7): one segment per non-zero damage
 * type, sized in proportion, each carrying its own `P`/`M`/`T` tag so the split is
 * colourblind-safe on exactly the same terms as every other figure.
 *
 * Segment widths are the only inline style in this file. They are data, not design — a
 * proportion computed from the result — and carry no colour, size or spacing value.
 */
/**
 * THE SHARE BELOW WHICH A SEGMENT CANNOT CARRY ITS OWN LABEL.
 *
 * DESIGN.md §7 (resolved 2026-08-14) says the labels move to their own row when any segment is
 * too narrow for its tagged value, and that the bar is NEVER widened to fit a word — the bar
 * exists to show proportion, so stretching it makes it lie about the data.
 *
 * "Too narrow" is decided from the DATA rather than from measured layout, deliberately: layout
 * exists only in a real browser, and a rule that cannot be evaluated in a test is a rule nothing
 * checks. The number is an approximation and is stated as one.
 *
 * ═══ RECOMPUTED 2026-08-14 FROM MEASUREMENT, AND THE MEASUREMENT CORRECTED THE OLD FIGURE TOO ═══
 *
 * The previous value, 0.25, was derived from two ESTIMATES: a longest label of "about 46px" and
 * "the narrowest place this bar appears is a per-instance table cell at roughly 200px". Both were
 * then measured in a real browser, at `--type-num-s`, on the default scenario:
 *
 * | | Estimated | **Measured** |
 * |---|---|---|
 * | Longest label, old one-letter tag (`12 345 P`) | ~46px | **52px** |
 * | Longest label, word tag (`12 345 phys`) | — | **70px** |
 * | Narrowest composition bar in the product | ~200px | **109px** |
 *
 * **THE BAR IS HALF THE WIDTH THE OLD DERIVATION ASSUMED.** It is the breakdown's running-total
 * column, and it measures 109px, not 200px. So 0.25 was already too permissive before the tag
 * changed anything: 52/109 is 0.48, and a segment at a 0.3 share of a 109px bar had 33px for a
 * 52px label. That is a pre-existing defect this recomputation happens to close.
 *
 * The threshold is therefore the measured worst case: 70px of label in a 109px bar is 0.64, and
 * the value is rounded up to **0.65**.
 *
 * ═══ THE CONSEQUENCE, WHICH IS ARITHMETIC AND NOT A DECISION ═══
 *
 * Shares sum to 1, so two segments cannot both be at or above 0.65. **Every split with two or more
 * damage types therefore puts its labels below the bar.** With today's bar widths the inline
 * branch is reachable only for a SINGLE-type bar, where the one share is 1.0.
 *
 * That branch is kept rather than deleted, for two reasons: DESIGN.md §7 specifies both layouts,
 * and the rule is about width rather than about a count — a wider bar in some future layout
 * restores inline labels with no code change. What must not happen is the threshold being tuned
 * downward to "get the inline layout back", because the inline layout is what produced the
 * illegible string this rule exists to prevent.
 *
 * The failure that originally prompted the rule sits well inside the new threshold: a
 * 42-physical / 225-magic split is a 0.157 share, and it rendered as "4222 5 M" with the `P` lost.
 *
 * "Too narrow" is still decided from the DATA and never from measured layout — a browser
 * measurement informs this constant, but nothing at run time reads a width, so the rule stays
 * evaluable in a test.
 */
export const MIN_SHARE_FOR_INLINE_LABEL = 0.65;

/**
 * Do the labels have to leave the bar? True when ANY present segment is too narrow for its own
 * tagged value.
 *
 * Exported so the decision can be tested as arithmetic, and so a caller can lay out around it.
 */
export function labelsMustSitBelow(total: number, byType: DamageByType): boolean {
  const denominator = total === 0 ? 1 : Math.abs(total);
  return DAMAGE_TYPES.filter((t) => byType[t] !== 0).some(
    (t) => Math.abs(byType[t]) / denominator < MIN_SHARE_FOR_INLINE_LABEL,
  );
}

export function CompositionBar({ total, byType }: CompositionBarProps) {
  const present = DAMAGE_TYPES.filter((t) => byType[t] !== 0);
  const denominator = total === 0 ? 1 : Math.abs(total);
  const below = labelsMustSitBelow(total, byType);

  // DELIBERATELY carries no `aria-label`. An accessible name on this wrapper would REPLACE
  // its contents when a parent (a table cell, say) computes its own name from content, and
  // the tagged segment values inside are the entire point of the bar.
  //
  // WHEN THE LABELS MOVE, THEY ALL MOVE. A row with two figures inside the bar and one beneath
  // reads as three different kinds of thing (DESIGN.md §7). The bar above becomes pure
  // proportion; the row below carries the figures, in the bar's own order so a reader maps label
  // to segment by position. Every label keeps its tag and its hue either way — §8's cue is never
  // suppressed, it is only relocated.
  return (
    <span className={below ? 'comp comp--labels-below' : 'comp'}>
      <span className="comp__track">
        {present.map((t) => (
          <span
            key={t}
            className="comp__seg"
            style={{ flexGrow: Math.abs(byType[t]) / denominator }}
          >
            <span className={`comp__bar comp__bar--${t}`} aria-hidden="true" />
            {below ? null : <DamageValue value={byType[t]} damageType={t} size="m" />}
          </span>
        ))}
      </span>
      {below ? (
        <span className="comp__labels">
          {present.map((t) => (
            <DamageValue key={t} value={byType[t]} damageType={t} size="m" />
          ))}
        </span>
      ) : null}
    </span>
  );
}
