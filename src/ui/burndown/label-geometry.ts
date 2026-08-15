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
