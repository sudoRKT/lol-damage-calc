// WHERE EVERY RISER LABEL LANDS, AND WHICH ONES LAND ON TOP OF EACH OTHER.
//
// ═══ WHAT THIS MEASURES, AND WHAT IT CANNOT ═══
//
// jsdom computes NO layout: `getBoundingClientRect()` returns zeroes there, so no test in this
// project can measure a rendered pixel. Everything in this file is therefore ARITHMETIC over the
// CSS declarations and the type scale — a MODEL of where the browser puts each label, not a
// reading of where it actually put one. Saying so is the point: DATA-SOURCES §50 records a check
// that claimed more than it measured, and a "collision test" that implied it had read pixels out
// of jsdom would be the same mistake in a new place.
//
// WHAT MAKES THE MODEL EXACT RATHER THAN AN ESTIMATE. Every glyph in a riser label is set in
// JetBrains Mono (`--font-mono`), a MONOSPACE face: one advance width for every character,
// 0.6 × the font size. So a label's width is a character count times a constant, not a guess at
// proportional metrics. The model was validated against the real browser — see `MODEL_VALIDATION`
// below, where it reproduces four rendered labels to within 0.02px.
//
// It still models a STATIC LAYOUT. Font loading failure (fallback to `ui-monospace`), a user's
// minimum-font-size setting, or browser zoom would all move the real thing and are outside it.
//
// ═══ IT NOW MODELS A BREAKPOINT TOO (2026-08-14) ═══
//
// Below `--break-phone` the labels are not in the plot at all — DESIGN.md §4b moves them to a row
// beneath it. `plotLabelBoxes` is the function that knows this and `labelBoxes` is the in-plot
// arithmetic it calls above the breakpoint, kept whole and still asserted: it is what the fix is
// measured AGAINST, and it is what would come back if the query were deleted.

import { formatDamage, THIN_SPACE } from '../primitives';
import type { BurndownColumn, BurndownModel } from './geometry';

// ---------------------------------------------------------------------------
// The constants, each traced to the declaration it comes from
// ---------------------------------------------------------------------------

/** JetBrains Mono's advance width as a fraction of its font size. Measured in Chrome. */
export const MONO_ADVANCE_EM = 0.6;

/** U+2009 THIN SPACE in JetBrains Mono, as a fraction of the font size. Measured in Chrome. */
export const MONO_THIN_SPACE_EM = 0.2;

/** `--type-num-l`, the size a riser label's figure is set at (`.dmg--l`). */
export const NUM_L_PX = 16;

/** `.dmg__tag` is `max(10px, 0.7em)`; at 16px that is 11.2px. */
export const TAG_PX = Math.max(10, NUM_L_PX * 0.7);

/** `--type-num-s`, the size of the "(N wasted)" note on a heal label. */
export const NUM_S_PX = 11;

/**
 * The height of a riser label's line box: `.burn__label` inherits `--type-body-l` / `--lh-body-l`
 * (15px × 1.5 = 22.5px) from the panel, and its strut is taller than the 16px × 1.15 figure
 * inside it, so the block is 22.5px tall. Confirmed against the browser, which reports 22.5.
 */
export const LABEL_BLOCK_PX = 22.5;

/** `--measure-plot-block` — the height of the plot area the risers are drawn in. */
export const PLOT_BLOCK_PX = 320;

/** `.burn__label { inset-inline-end: var(--space-3) }` — 12px in from its column's trailing edge. */
export const LABEL_INSET_PX = 12;

/** `.burn__hatch--swatch { inline-size: var(--space-3) }` — the DoT column's hatch swatch. */
export const SWATCH_PX = 12;

/** `.burn__stack-item { gap: var(--space-2) }` — in front of EVERY child, name and figures alike. */
export const STACK_GAP_PX = 8;

/**
 * THE WIDEST INSTANCE NAME THE ROW CAN EVER PRINT, in `--font-body` at `--type-body-s`.
 *
 * The name is the one part of an entry this file cannot compute: IBM Plex Sans is proportional
 * and the model is monospace-only. So it is MEASURED instead, in Chrome on the live calculator
 * page at 320px, over the whole vocabulary of names the chart can produce — `column.axisLabel`
 * is `inst N`, `+DoT` or `heal`, and nothing else:
 *
 *   "heal"     21.67px      "+DoT"     25.89px
 *   "inst 1"   27.88px      "inst 16"  34.47px   ← the widest, and 16 columns is the worst
 *                                                  case a user can build (`P3`)
 *
 * IT IS AN UPPER BOUND USED AS ONE. The entry with the widest FIGURES is always the `+DoT`
 * column, whose name is 25.89px, so pairing the worst name with the worst figures describes an
 * entry that cannot occur. That is the point: the row assertion should not have to reason about
 * which name lands on which entry.
 */
export const STACK_NAME_MAX_PX = 34.47;

/**
 * THE WIDTH AVAILABLE TO THE COLUMNS AT A 375px VIEWPORT, and how it is arrived at.
 *
 * MEASURED IN CHROME on the calculator page at a 375×812 viewport, 2026-08-14: `.burn__cols`
 * is 203px wide and 320px tall, and its four columns are 50.75px each. The arithmetic that
 * produces it, so a change to any panel's padding is traceable rather than mysterious:
 *
 *   375  viewport
 *   −48  `.app` padding (--space-5 each side)
 *   −32  `.burn` panel padding (--space-4 each side)
 *   − 2  `.burn` border
 *   −32  `.burn__plot` padding (--space-4 each side)
 *   − 2  `.burn__plot` border
 *   −48  `.burn__yaxis` (--space-7)
 *   − 8  the gap between the axis and the columns (--space-2)
 *   ————
 *   =203
 */
export const COLS_INLINE_AT_375 = 203;

/** The same arithmetic at the narrowest viewport SPECIFICATION §10 has to hold at. */
export const COLS_INLINE_AT_320 = 148;

/**
 * THE ROW BENEATH THE PLOT is wider than the columns are, by exactly the y-axis rail and the gap
 * beside it: it starts at the plot's own padding box rather than after the axis.
 *
 *   375 − 48 (.app) − 32 (.burn padding) − 2 (.burn border) − 32 (.burn__plot padding)
 *       − 2 (.burn__plot border) = 259, which is COLS_INLINE_AT_375 + 48 + 8.
 *
 * MEASURED IN CHROME at 375×812 and 320×812 on 2026-08-14, after the fix: `.burn__stack` reports
 * 259px and 204px.
 */
export const STACK_INLINE_AT_375 = 259;
export const STACK_INLINE_AT_320 = 204;

/**
 * `--break-phone` (DESIGN.md §4b), in px at the 16px root §3 assumes: 30rem.
 *
 * CSS cannot resolve a custom property inside a media query, so `burndown.css` repeats the
 * literal `30rem` — once, by §4b's permission — and this constant is the model's copy of it.
 * `label-collision.test.ts` asserts all three agree: the token, the query, and this number.
 */
export const BREAK_PHONE_PX = 480;

/**
 * Are the riser labels drawn INSIDE the plot at this viewport width?
 *
 * `@media (max-width: 30rem)` matches at exactly 480px, so the labels are in the plot only
 * ABOVE it. Below and at it they are printed in the row beneath the plot, where they are in
 * normal flow and cannot overlap anything.
 */
export function labelsAreInPlot(viewportPx: number): boolean {
  return viewportPx > BREAK_PHONE_PX;
}

/**
 * Four labels read off the live page at a 375px viewport, against what this model predicts for
 * them. Kept here as data rather than prose so the collision test can assert it: if the type
 * scale, the font or the tag size moves, this table stops matching and the test says so before
 * any collision count is believed.
 */
export const MODEL_VALIDATION: { value: number; tag: string; renderedPx: number }[] = [
  { value: 58, tag: 'mag', renderedPx: 42.55 },
  { value: 47, tag: 'mag', renderedPx: 42.55 },
  { value: 43, tag: 'phys', renderedPx: 49.27 },
  { value: 218, tag: 'mag', renderedPx: 52.16 },
];

const TAG_TEXT: Record<string, string> = { physical: 'phys', magic: 'mag', true: 'true' };

// ---------------------------------------------------------------------------
// Widths
// ---------------------------------------------------------------------------

/** Width of a run of monospace characters at a given size. THIN SPACE is narrower than the rest. */
export function monoRunPx(text: string, sizePx: number): number {
  let width = 0;
  for (const ch of text) {
    width += ch === THIN_SPACE ? sizePx * MONO_THIN_SPACE_EM : sizePx * MONO_ADVANCE_EM;
  }
  return width;
}

/**
 * The rendered width of one `<DamageValue size="l">`: the figure at `--type-num-l`, a thin space,
 * then the type word at `max(10px, 0.7em)`. `formatDamage` is the real one, so thousands grouping
 * (`1 240`, with a thin space inside it) is counted exactly as it is drawn.
 */
export function damageValueInlinePx(value: number, damageType: string): number {
  const figure = monoRunPx(formatDamage(value), NUM_L_PX);
  const gap = NUM_L_PX * MONO_THIN_SPACE_EM;
  const tag = monoRunPx(TAG_TEXT[damageType] ?? damageType, TAG_PX);
  return figure + gap + tag;
}

/** The whole `.burn__label` for a column: one figure, or a swatch plus a figure per DoT type. */
export function riserLabelInlinePx(column: BurndownColumn): number {
  if (column.kind === 'dot') {
    return column.segments.reduce(
      (w, s) => w + SWATCH_PX + damageValueInlinePx(s.damage, s.damageType),
      0,
    );
  }
  if (!column.damageType) return 0;
  return damageValueInlinePx(column.damage, column.damageType);
}

/** The `+N (M wasted)` heal label. Same monospace face, no type tag — the `+` is its cue. */
export function healLabelInlinePx(column: BurndownColumn): number {
  if (column.healing <= 0) return 0;
  const figure = monoRunPx(`+${formatDamage(column.healing)}`, NUM_L_PX);
  const waste =
    column.healingWasted > 0
      ? monoRunPx(` (${formatDamage(column.healingWasted)} wasted)`, NUM_S_PX)
      : 0;
  return figure + waste;
}

// ---------------------------------------------------------------------------
// Boxes and collisions
// ---------------------------------------------------------------------------

export interface LabelBox {
  /** Which column it belongs to, 0-based. */
  index: number;
  kind: 'damage' | 'heal';
  /** Distance from the columns container's leading edge, in px. */
  x0: number;
  x1: number;
  /** Distance UPWARD from the plot floor, in px. `y1` is the top of the line box. */
  y0: number;
  y1: number;
  text: string;
}

/**
 * Where every label sits, in the columns container's own coordinates.
 *
 * Columns are `flex: 1 1 0` with no gap, so column i occupies
 * `[i·w, (i+1)·w]` where `w = colsInlinePx / n`. A label is `position: absolute` with
 * `inset-inline-end: 12px`, so its trailing edge is its column's trailing edge less 12, and it
 * extends LEFTWARD by its own width — which is why a label can leave its own column entirely.
 * Vertically it is placed by `bottom: riserBottom` as a percentage of the 320px plot.
 */
export function labelBoxes(model: BurndownModel, colsInlinePx: number): LabelBox[] {
  const n = model.columns.length;
  if (n === 0) return [];
  const w = colsInlinePx / n;
  const boxes: LabelBox[] = [];
  model.columns.forEach((column, index) => {
    const right = (index + 1) * w - LABEL_INSET_PX;
    const damageWidth = riserLabelInlinePx(column);
    if (damageWidth > 0) {
      const y0 = column.riserBottom * PLOT_BLOCK_PX;
      boxes.push({
        index,
        kind: 'damage',
        x0: right - damageWidth,
        x1: right,
        y0,
        y1: y0 + LABEL_BLOCK_PX,
        text: labelText(column),
      });
    }
    const healWidth = healLabelInlinePx(column);
    if (healWidth > 0) {
      const y0 = column.healRiserTop * PLOT_BLOCK_PX;
      boxes.push({
        index,
        kind: 'heal',
        x0: right - healWidth,
        x1: right,
        y0,
        y1: y0 + LABEL_BLOCK_PX,
        text: `+${formatDamage(column.healing)}`,
      });
    }
  });
  return boxes;
}

/**
 * WHERE THE LABELS ACTUALLY ARE at a given viewport width — the whole fix, expressed in the
 * model (DESIGN.md §4b).
 *
 * Above the breakpoint this is `labelBoxes` unchanged. At or below it the plot holds NO labels,
 * so there are no boxes and there is nothing that can collide. That is not an assumption the
 * model makes about the CSS: the query, the token and `BREAK_PHONE_PX` are asserted to agree in
 * `label-collision.test.ts`, and the row itself is measured in a real browser, because jsdom
 * computes no layout and a media query it never evaluates could not tell us anything.
 */
export function plotLabelBoxes(
  model: BurndownModel,
  colsInlinePx: number,
  viewportPx: number,
): LabelBox[] {
  return labelsAreInPlot(viewportPx) ? labelBoxes(model, colsInlinePx) : [];
}

/**
 * The MONOSPACE part of one entry in the row beneath the plot: its figures, plus one flex gap
 * before each of them.
 *
 * ═══ THIS WAS WRONG UNTIL 2026-08-15, AND THE CURATED MERGE IS WHAT EXPOSED IT ═══
 *
 * It used to be `STACK_GAP + riserLabelInlinePx(column)` — the IN-PLOT label's width plus one
 * gap. That is right for a burst column and wrong for a `+DoT` column, because the two are laid
 * out by different boxes: `.burn__label` is `display: block`, so its swatches and figures sit
 * flush, while `.burn__stack-item` is `display: flex; gap: var(--space-2)`, so EVERY child gets
 * 8px in front of it. A two-segment DoT entry has four children and therefore four gaps, of
 * which the old arithmetic counted one — understating the entry by 24px.
 *
 * It went unnoticed because no column in the roster carried more than one DoT segment until the
 * curated data landed. Corki's `+DoT` (W — Valkyrie physical, E — Gatling Gun magic) is the
 * first, and it is still the only one: 2 of 3,667 columns across P2 and P3.
 *
 * BOTH SHAPES ARE NOW BROWSER-MEASURED, so this is not a second guess replacing a first:
 *   • in the plot, Chrome reports `.burn__label` 135.03px for that column; `riserLabelInlinePx`
 *     says 135.04. The block layout was right all along and is untouched.
 *   • in the row, Chrome reports 167.03px from the name's trailing edge to the entry's, against
 *     143.04 from the old arithmetic. This function now returns the browser's figure.
 *
 * ═══ THE SWATCH IS NOT IN THE ROW ANY MORE (`burndown.css`, same date) ═══
 *
 * `.burn__stack .burn__hatch--swatch { display: none }`, so the swatches and the gaps that
 * belong to them leave the layout entirely — `display: none` removes a flex item and its gap
 * together, which Chrome confirms. So an entry is one gap per FIGURE and nothing else.
 *
 * HONEST SCOPE, and it is the reason this is not called a width. The instance name — "inst 12",
 * "+DoT" — is set in `--font-body`, a PROPORTIONAL face, and this file models monospace advance
 * widths only. So this is the entry MINUS its name. `STACK_NAME_MAX_PX` is the browser
 * measurement that closes the gap, and the two are added in `label-collision.test.ts`.
 */
export function stackedFigureInlinePx(column: BurndownColumn): number {
  const figures =
    column.kind === 'dot'
      ? column.segments.reduce(
          (w, s) => w + STACK_GAP_PX + damageValueInlinePx(s.damage, s.damageType),
          0,
        )
      : column.damageType
        ? STACK_GAP_PX + damageValueInlinePx(column.damage, column.damageType)
        : 0;
  const heal = healLabelInlinePx(column);
  return figures + (heal > 0 ? STACK_GAP_PX + heal : 0);
}

function labelText(column: BurndownColumn): string {
  if (column.kind === 'dot') {
    return column.segments
      .map((s) => `${formatDamage(s.damage)}${THIN_SPACE}${TAG_TEXT[s.damageType]}`)
      .join(' ');
  }
  if (!column.damageType) return '';
  return `${formatDamage(column.damage)}${THIN_SPACE}${TAG_TEXT[column.damageType]}`;
}

// ---------------------------------------------------------------------------
// THE X AXIS — WHICH COLUMNS PRINT A NAME (added 2026-08-15)
// ---------------------------------------------------------------------------
//
// ═══ THE DEFECT, MEASURED IN CHROME BEFORE ANYTHING WAS CHANGED ═══
//
// The axis printed one name per column, and a name does not fit in a column. Read off the live
// pages at a 320px viewport on 2026-08-15, separation being the gap between one name's trailing
// edge and the next one's leading edge:
//
//   preview harness, 116px axis   4 columns  +0.42px   5 columns  WRAPS to two lines
//                                 6 columns  −0.10px   7 columns  −2.87px, and −6.77px at `+DoT`
//   calculator,      148px axis   8 columns  −0.17px  16 columns  −9.42px
//
// A negative separation is `inst 1inst 2inst 3+DoT` — the string the cross-area sweep in
// `tests/clipped-and-offscreen.test.ts` reported and declined to exempt. Sixteen columns is
// 9.25px each and no type size DESIGN.md §3 permits fits a name into that, so there is no fluid
// answer: the LABELS THIN. The ruling (2026-08-15) is first, last, and every nth in between, with
// `n` derived from the width each column actually has.
//
// ═══ WHY THE NAMES ARE MEASURED AND NOT COMPUTED ═══
//
// A riser label is JetBrains Mono, monospace, so the model above is a character count times a
// constant. An axis name is IBM Plex Sans — PROPORTIONAL — and no arithmetic over the type scale
// gives its width. So the constants below are READ OFF A REAL BROWSER, which is honest for one
// reason only: **the vocabulary is closed**. `geometry.ts` writes exactly three shapes of axis
// name — `inst N`, `+DoT`, `heal` — and nothing else, so measuring three strings measures every
// string the axis can ever print. `axisNameIsKnown` is what keeps that true: a fourth shape is
// REPORTED by the census rather than silently measured as something it is not.
//
// Measured in Chrome, `.burn__xlabel` (`--font-body`, `--type-body-s`, `--weight-body-medium` —
// 500 11px/15.4px IBM Plex Sans), with a Range over the text node so the figure is the text's own
// advance width and not its flex box:
//
//   "inst"  18.67   " "  2.60   any digit  6.61   "+DoT"  25.89   "heal"  21.67
//
// Every digit measures 6.61 — the face's figures are the same width as each other — so `inst 9`
// and `inst 1` are the same 27.88px and only the DIGIT COUNT moves the number.

/** `"inst"`, the word every burst column's name starts with. Browser-measured. */
export const AXIS_INST_WORD_PX = 18.67;

/** The space inside `inst N`. Browser-measured, and much narrower than a monospace space. */
export const AXIS_SPACE_PX = 2.6;

/** One digit. Every digit 0–9 measures the same, which is why only the count matters. */
export const AXIS_DIGIT_PX = 6.61;

/** `"+DoT"` — the damage-over-time column's name. */
export const AXIS_DOT_PX = 25.89;

/** `"heal"` — the unplaced-healing column's name. */
export const AXIS_HEAL_PX = 21.67;

/**
 * THE MINIMUM GAP BETWEEN TWO PRINTED NAMES: `--space-2`, 8px.
 *
 * DESIGN.md §4 gives `--space-2` as "gaps between related controls", which is what two adjacent
 * axis names are. It is a decision with a measured consequence, so it is stated rather than tuned:
 * the calculator's DEFAULT scenario is four columns of 37px at 320px carrying `inst 1`..`inst 4`
 * at 27.88px, so it needs 35.88px of pitch and has 37px — **1.12px of headroom, and all four
 * names keep printing.** At `--space-3` (12px) that scenario would need 39.88px and would start
 * dropping names on a page where nothing is wrong, which is why the next step up is not taken.
 * Below `--space-2` the gap stops being a gap: at 0 the four names sit 1.12px apart and read as
 * one string, which is the defect this whole rule exists to remove.
 */
export const AXIS_LABEL_MIN_GAP_PX = 8;

/**
 * Four names read off the live page, against what this model predicts for them. Asserted before
 * any count below is believed, exactly as `MODEL_VALIDATION` is for the riser labels.
 */
export const AXIS_MODEL_VALIDATION: { text: string; renderedPx: number }[] = [
  { text: 'inst 1', renderedPx: 27.88 },
  { text: 'inst 9', renderedPx: 27.88 },
  { text: 'inst 16', renderedPx: 34.47 },
  { text: '+DoT', renderedPx: 25.89 },
  { text: 'heal', renderedPx: 21.67 },
];

/** Is this one of the three shapes `geometry.ts` writes? Anything else is reported, never sized. */
export function axisNameIsKnown(text: string): boolean {
  return text === '+DoT' || text === 'heal' || /^inst \d+$/.test(text);
}

/**
 * The rendered width of one axis name, ON ONE LINE.
 *
 * On one line is the point: the axis used to let `inst 4` WRAP to two lines to survive a 23px
 * column, which is how a chart ends up with a two-line axis under a one-line label. The names are
 * `white-space: nowrap` now, so this width is what the browser draws.
 *
 * An unknown name answers the widest known one rather than a guess — an upper bound used as one.
 * It cannot happen silently: `axisNameIsKnown` is asserted over the whole roster.
 */
export function axisLabelInlinePx(text: string): number {
  if (text === '+DoT') return AXIS_DOT_PX;
  if (text === 'heal') return AXIS_HEAL_PX;
  const digits = /^inst (\d+)$/.exec(text)?.[1];
  if (digits) return AXIS_INST_WORD_PX + AXIS_SPACE_PX + digits.length * AXIS_DIGIT_PX;
  return AXIS_INST_WORD_PX + AXIS_SPACE_PX + 2 * AXIS_DIGIT_PX;
}

/**
 * The pitch two printed names need between them: the widest name IN THIS CHART, plus the gap.
 *
 * THE WIDEST NAME IN THIS CHART, NOT THE WIDEST NAME POSSIBLE. Sizing every axis against
 * `inst 16` would thin a four-column chart that has room for all four of its names — the rule
 * would then be answering the worst case the product can produce rather than the case on screen.
 * It is an upper bound over the names actually present, so it holds for every pair in that chart
 * including the pair of widest ones.
 */
export function axisRequiredPitchPx(labels: readonly string[]): number {
  const widest = labels.reduce((w, t) => Math.max(w, axisLabelInlinePx(t)), 0);
  return widest + AXIS_LABEL_MIN_GAP_PX;
}

/**
 * `n` — how many columns apart two printed names must be, derived from the width one column has.
 *
 * This is the ruling's own number, and it comes from the axis's measured width rather than from a
 * column count or a viewport threshold: `columnPx = axisInlinePx / columns`, and `n` is the
 * smallest whole number of columns whose pitch clears `axisRequiredPitchPx`. The same arithmetic
 * gives 1 at a desktop width, 2 on the preview harness's four-column chart, and 5 on the
 * calculator's sixteen — with nothing in it that knows what a phone is.
 */
export function axisLabelStride(labels: readonly string[], axisInlinePx: number): number {
  const columns = labels.length;
  if (columns === 0 || !(axisInlinePx > 0)) return 1;
  const columnPx = axisInlinePx / columns;
  return Math.max(1, Math.ceil(axisRequiredPitchPx(labels) / columnPx));
}

/** One column's standing on the axis: may it be dropped, and does it print a name? */
export interface AxisLabelPlan {
  /** Columns whose name may never be dropped: the first, the last, and any non-`inst` name. */
  anchors: boolean[];
  /** Whether each column prints its name. */
  printed: boolean[];
  /** `n`, reported so a test and a comment can state it rather than infer it. */
  stride: number;
}

/**
 * WHICH COLUMNS PRINT THEIR NAME. The whole rule, in one function, with no width query in it.
 *
 * `candidate` is the set the GROUPING rule already leaves — a basic attack carrying three on-hit
 * riders is four columns and one printed name, and that thinning predates this one. This rule
 * thins what is left; it never revives a name grouping removed.
 *
 * ═══ THE THREE THINGS THE RULING LEFT TO SETTLE, SETTLED ═══
 *
 * **1. Available width is the axis element's own measured inline size**, passed in by the
 * component from a live measurement, divided by the number of columns. Not a viewport, not a
 * breakpoint, not a constant: the burndown draws at 148px of axis on the calculator at 320px and
 * at 116px on the preview harness at the same viewport, and a rule keyed to the viewport would be
 * wrong on one of them. `axisInlinePx <= 0` means NOT YET MEASURED and prints every name, which is
 * the behaviour this replaces — a chart that has not been measured is never a thinned chart.
 *
 * **2. First, last, AND `+DoT` — and the third is not redundant.** `geometry.ts` puts `+DoT` last
 * and `heal` first, so on today's data "first and last" already keeps both. They are anchored BY
 * NAME anyway, because what makes `+DoT` unloseable is not its position: SPECIFICATION §3.8's
 * second verdict is the reason the column exists, and a reader who cannot see where the burst ends
 * and the tail begins cannot read either verdict. Anchoring it by name means a future change to
 * where the column sits cannot quietly take the label with it. It is also the one name that CANNOT
 * WRAP — one word — so it was already overhanging its column before any of this.
 *
 * **3. A thinned axis is drawn with a tick per column** (`burndown.css`, `.burn__xtick`): every
 * column keeps a mark, and only the mark under a printed name is the taller steel one. So sixteen
 * columns still read as sixteen divisions with four of them named, rather than as a chart with
 * four instances — an axis that silently dropped its labels would be a table silently dropping
 * rows. The names themselves carry the step: `inst 1 · inst 6 · inst 11 · inst 16` says what `n`
 * is without a legend.
 *
 * **THE ACCESSIBLE NAME IS NOT TOUCHED BY ANY OF THIS.** The axis is `aria-hidden` at every width
 * and always was; every instance is announced by its riser's own `aria-label` (`riserName`), which
 * names `Instance N` for all sixteen. Same standing as the riser labels below `--break-phone`:
 * moving or thinning a label is a visual answer to a visual problem.
 */
export function planAxisLabels(
  labels: readonly string[],
  candidate: readonly boolean[],
  axisInlinePx: number,
): AxisLabelPlan {
  const columns = labels.length;
  const stride = axisLabelStride(labels, axisInlinePx);
  // THE FIRST AND LAST **CANDIDATE**, NOT THE FIRST AND LAST COLUMN. A basic attack's riders are
  // columns with no name of their own, and a chart can end with three of them — so the last column
  // and the last NAME are not the same thing, and anchoring the column would anchor nothing while
  // leaving the final moment's name droppable.
  const firstCandidate = candidate.indexOf(true);
  const lastCandidate = candidate.lastIndexOf(true);
  const anchors = labels.map(
    (text, i) =>
      candidate[i] === true &&
      (i === firstCandidate || i === lastCandidate || !text.startsWith('inst ')),
  );
  const printed = labels.map(() => false);
  if (columns === 0) return { anchors, printed, stride };
  if (!(axisInlinePx > 0)) {
    // NOT MEASURED. Print what the grouping rule leaves and nothing is thinned.
    return { anchors, printed: candidate.map((c) => c === true), stride };
  }

  const columnPx = axisInlinePx / columns;
  const required = axisRequiredPitchPx(labels);
  const kept: number[] = [];

  for (let i = 0; i < columns; i += 1) {
    if (candidate[i] !== true) continue;

    // ═══ WHY THIS IS A GREEDY PITCH RULE AND NOT A LITERAL `i % n === 0` ═══
    //
    // The two are the SAME THING when every column is a candidate: the first index at least
    // `required` px from the last printed name is exactly `ceil(required / columnPx)` columns
    // along, which is `n`. `axisLabelStride` reports that number and a test asserts the identity.
    //
    // They differ where the GROUPING rule has already blanked columns, and there the modulo is
    // strictly worse. A basic attack carrying three riders leaves candidates at irregular
    // positions, and a candidate 6 columns along is refused by `6 % 5` even though it clears the
    // pitch by 13px. Measured on the 16-column worst case: the modulo prints 3 names where the
    // pitch rule prints 5, having thrown away two that fitted.
    let drop = false;
    while (kept.length > 0) {
      const prev = kept[kept.length - 1]!;
      if ((i - prev) * columnPx >= required) break;
      // TOO CLOSE. An anchor evicts a strided neighbour; a strided name yields to anything.
      if (anchors[i] && !anchors[prev]) {
        kept.pop();
        continue;
      }
      if (!anchors[i]) drop = true;
      // Two anchors too close for each other keep BOTH: the first and last name of a chart are
      // never dropped, and an axis narrow enough for that is narrower than any this product draws.
      break;
    }
    if (!drop) kept.push(i);
  }

  for (const i of kept) printed[i] = true;
  return { anchors, printed, stride };
}

/** The gap between each adjacent pair of PRINTED names, in px. Negative is an overlap. */
export function axisLabelSeparations(
  labels: readonly string[],
  printed: readonly boolean[],
  axisInlinePx: number,
): number[] {
  const columns = labels.length;
  const columnPx = axisInlinePx / columns;
  const at = labels.map((_, i) => (i + 0.5) * columnPx);
  const shown = labels.map((_, i) => i).filter((i) => printed[i] === true);
  const out: number[] = [];
  for (let k = 1; k < shown.length; k += 1) {
    const a = shown[k - 1]!;
    const b = shown[k]!;
    out.push(
      at[b]! -
        axisLabelInlinePx(labels[b]!) / 2 -
        (at[a]! + axisLabelInlinePx(labels[a]!) / 2),
    );
  }
  return out;
}

/**
 * How far the FIRST and LAST printed names reach past the two ends of the axis, in px.
 *
 * A name is centred on its column and is wider than one, so it overhangs — and the two that
 * overhang past the axis itself are the ones at the ends. `.burn__plot` pads `--space-4` (16px)
 * on both sides and the axis is inset from the leading edge by a further `--space-7 + --space-2`
 * (56px) for the y-axis rail, so an overhang inside 16px cannot reach either edge of the panel.
 */
export function axisEndOverhangPx(
  labels: readonly string[],
  printed: readonly boolean[],
  axisInlinePx: number,
): { leadingPx: number; trailingPx: number } {
  const columns = labels.length;
  const shown = labels.map((_, i) => i).filter((i) => printed[i] === true);
  if (columns === 0 || shown.length === 0) return { leadingPx: 0, trailingPx: 0 };
  const columnPx = axisInlinePx / columns;
  const first = shown[0]!;
  const last = shown[shown.length - 1]!;
  const leading = axisLabelInlinePx(labels[first]!) / 2 - (first + 0.5) * columnPx;
  const trailing =
    (last + 0.5) * columnPx + axisLabelInlinePx(labels[last]!) / 2 - axisInlinePx;
  return { leadingPx: Math.max(0, leading), trailingPx: Math.max(0, trailing) };
}

export interface Collision {
  a: LabelBox;
  b: LabelBox;
  /** How far the two boxes overlap on each axis, in px. Both are > 0 for a collision. */
  inlineOverlapPx: number;
  blockOverlapPx: number;
}

/**
 * EVERY PAIR, NOT EVERY ADJACENT PAIR. A label 83px wide in a 50px column reaches back across
 * more than one neighbour, so a check that only compared neighbours would miss the pairs that
 * are furthest apart on the axis and most obviously wrong on screen.
 *
 * A COLLISION NEEDS BOTH AXES. Two labels whose horizontal ranges overlap do not touch if one
 * sits a line-height above the other — which is the ordinary case in this chart, because every
 * label is placed at its own riser's foot and the trace descends. The CSS comment this work
 * started from asserted a collision from the horizontal figure alone; that is what made the
 * count in it wrong.
 */
export function collisions(boxes: LabelBox[]): Collision[] {
  const out: Collision[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const inline = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const block = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (inline > 0 && block > 0) {
        out.push({ a, b, inlineOverlapPx: inline, blockOverlapPx: block });
      }
    }
  }
  return out;
}

/** How far the leftmost label reaches PAST the columns' leading edge, over the y-axis rail. */
export function spillPastLeadingEdgePx(boxes: LabelBox[]): number {
  return boxes.reduce((worst, b) => Math.max(worst, -b.x0), 0);
}

/**
 * The narrowest a column may be for a set of labels never to touch: the widest label plus the
 * inset it is held off its riser by. Reported rather than assumed, so the figure a fix would
 * need is measured from the data instead of picked.
 */
export function requiredColumnInlinePx(boxes: LabelBox[]): number {
  return boxes.reduce((worst, b) => Math.max(worst, b.x1 - b.x0 + LABEL_INSET_PX), 0);
}
