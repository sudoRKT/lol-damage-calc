// THE COMPARISON SURFACE'S ARITHMETIC AND ITS WORDS — everything that can be decided without
// rendering anything.
//
// Split out from the component for the reason every other area in this product splits its
// geometry out: a rule that lives inside JSX can only be checked by rendering, and the rules here
// are the ones most worth checking directly — which figures may legally be shown, which sentence
// a verdict produces, and where a bar ends on a shared scale.
//
// ═══ THE THREE DECISIONS THIS FILE HOLDS ═══
//
// 1. **NOTHING HERE COMPUTES A DAMAGE FIGURE.** Every number that reaches the screen is one the
//    engine already stated — `PointSummary.burst`, `PointSummary.dot`, `VerdictSummary
//    .damageApplied`, `BuildDelta.burstByType`. This file turns figures into POSITIONS (a
//    fraction of a plot) and into WORDS. It never adds two damage figures together, and it never
//    subtracts one from another: `build-comparison.ts` owns the delta and owns the rounding
//    argument that goes with it.
//
// 2. **"BUILD B IS BETTER" IS NEVER A COLOUR.** DESIGN.md §1 reserves hue for the three damage
//    types, and a comparison is exactly the surface that wants to reach for green and red. The
//    direction of a difference is carried by three things instead: the ORDER the two builds are
//    printed in, the LABEL that says which way the subtraction runs ("Build B minus Build A"),
//    and a plain sentence with the direction as a WORD. The magnitude stays in the tagged figure.
//
// 3. **A SIGNED DIFFERENCE IS NOT ALWAYS A COMPOSITION.** DESIGN.md §8 permits one untagged
//    figure — a multi-type total — and only beside a tagged composition bar. A difference whose
//    per-type parts point in OPPOSITE directions (+300 physical, −200 magic, total +100) has no
//    honest composition bar: the bar would show two segments filling one total that neither of
//    them is a share of. `mixedDirection` is what detects that case, and the component refuses
//    the combined figure there rather than drawing a bar that misstates it.

import type { DamageByType } from '../../types';
import { formatDamage, roundReadout } from '../primitives';
import { fractionOf, niceTicks, yDomainFor, type Domain } from '../plot';

/** The three damage types, in the fixed order every surface in this product prints them. */
const DAMAGE_TYPES = ['physical', 'magic', 'true'] as const;

export type DamageTypeName = (typeof DAMAGE_TYPES)[number];

/** The types with a non-zero figure, in the fixed order. */
export function presentTypes(byType: DamageByType): DamageTypeName[] {
  return DAMAGE_TYPES.filter((t) => byType[t] !== 0);
}

/**
 * TRUE WHEN THE PER-TYPE DIFFERENCES DISAGREE ABOUT DIRECTION.
 *
 * The one case in which the combined difference must not be drawn as an aggregate with a
 * composition bar. See decision 3 in this file's header.
 */
export function mixedDirection(byType: DamageByType): boolean {
  const values = DAMAGE_TYPES.map((t) => byType[t]);
  return values.some((v) => v > 0) && values.some((v) => v < 0);
}

/**
 * Whether a combined difference figure may be rendered at all, and as what.
 *
 *   - `none`     — every type is zero. There is no difference to draw and a bare `0` with no
 *                  composition bar is the one shape DESIGN.md §8 does not allow. Say it in words.
 *   - `aggregate`— every non-zero part points the same way. `AggregateTotal` handles both the
 *                  multi-type case (untagged figure + tagged bar) and the single-type case (an
 *                  ordinary tagged figure), so this one answer covers both.
 *   - `split`    — the parts disagree. Print them separately, tagged, and no combined figure.
 */
export function differenceShape(byType: DamageByType): 'none' | 'aggregate' | 'split' {
  if (presentTypes(byType).length === 0) return 'none';
  return mixedDirection(byType) ? 'split' : 'aggregate';
}

// -----------------------------------------------------------------------------------------
// The words
// -----------------------------------------------------------------------------------------

/**
 * The direction of a difference, as a word.
 *
 * `BuildDelta` is B minus A throughout (`build-comparison.ts`), so a positive figure means the
 * SECOND build deals more. That is stated here once rather than in each sentence below.
 */
export function directionWord(delta: number): 'more' | 'less' | 'the same' {
  if (delta > 0) return 'more';
  if (delta < 0) return 'less';
  return 'the same';
}

export interface BuildLabels {
  a: string;
  b: string;
}

/**
 * The headline sentence. It carries the DIRECTION and never the magnitude — the magnitude is the
 * tagged figure printed beside it, so the one number on screen is the engine's own.
 */
export function directionSentence(labels: BuildLabels, delta: number, subject: string): string {
  const word = directionWord(delta);
  return word === 'the same'
    ? `${labels.a} and ${labels.b} deal the same ${subject}.`
    : `${labels.b} deals ${word} ${subject} than ${labels.a}.`;
}

/** One survival verdict, in words. Health is a readout figure, so it is rounded as one. */
export function verdictSentence(verdict: {
  lethal: boolean;
  lethalAtInstance: number | null;
  remainingHp: number;
}): string {
  if (verdict.lethal) {
    return verdict.lethalAtInstance === null
      ? 'Lethal — the defender does not survive this combo.'
      : `Lethal — the defender's health is crossed at instance ${verdict.lethalAtInstance}.`;
  }
  return `Survives — ${formatDamage(roundReadout(verdict.remainingHp))} health remaining.`;
}

/**
 * How the two builds compare on ONE of the two verdicts (SPECIFICATION §3.8 fixes the count at
 * two, and both are printed).
 *
 * Stated as a sentence rather than as two chips because lethality is a boolean and a boolean is
 * exactly the kind of thing an interface is tempted to signal with a colour.
 */
export function lethalitySentence(
  labels: BuildLabels,
  lethal: { a: boolean; b: boolean },
): string {
  if (lethal.a && lethal.b) return `Both builds kill the defender.`;
  if (!lethal.a && !lethal.b) return `Neither build kills the defender.`;
  const killer = lethal.b ? labels.b : labels.a;
  const other = lethal.b ? labels.a : labels.b;
  return `${killer} kills the defender; ${other} does not.`;
}

// -----------------------------------------------------------------------------------------
// The shared scale
// -----------------------------------------------------------------------------------------

/**
 * ONE SIDE'S PLACE ON THE SHARED SCALE.
 *
 * Both figures are `VerdictSummary.damageApplied` — damage that actually REACHED HEALTH, which
 * the engine rounded once from unrounded values. That is the figure that is comparable with a
 * health pool; the burst total is not, because a shield or an overkill makes the two differ.
 */
export interface SideMagnitude {
  label: string;
  burstApplied: number;
  burstPlusDotApplied: number;
}

export interface MagnitudeBar {
  label: string;
  /** 0..1 of the plot's width — burst alone. */
  burstFraction: number;
  /** 0..1 — burst plus damage over time. Never behind `burstFraction`. */
  burstPlusDotFraction: number;
}

export interface AxisTick {
  value: number;
  fraction: number;
  /**
   * Whether this tick's NUMBER is printed. Its gridline always is — a suppressed label never
   * removes a gridline, so the scale keeps every division it had.
   */
  labelled: boolean;
}

export interface MagnitudeModel {
  domain: Domain;
  /** Where the defender's health pool falls on the scale, 0..1. */
  healthFraction: number;
  defenderHp: number;
  ticks: AxisTick[];
  bars: MagnitudeBar[];
}

/**
 * HOW CLOSE TWO AXIS LABELS MAY COME, AS A FRACTION OF THE AXIS.
 *
 * ═══ MEASURED IN A REAL BROWSER, NOT ESTIMATED ═══
 *
 * The first version of this axis printed every tick and two labels overlapped by 2px at a 320px
 * viewport — "750" ending at x=253 under "930" starting at x=251. It was invisible at 1280px and
 * invisible to every test in the suite, because jsdom computes no layout. Found by measuring the
 * page.
 *
 * The three numbers behind the constant, measured at `--type-num-s` in JetBrains Mono on this
 * page, at a 320px viewport:
 *
 * | | Measured |
 * |---|---|
 * | Narrowest track this chart has (320px viewport) | **146px** |
 * | A five-digit label (`12345`) | **33.0px** |
 * | A three-digit label (`930`) | 19.8px |
 *
 * The worst case is the LAST label, which is right-aligned to the end of the axis, against the
 * label before it, which is centred on its own tick: it needs the full width of the last label,
 * plus half the width of the one before it, plus a gap. `(33 + 16.5 + 4) / 146 = 0.366`, rounded
 * up to **0.37**.
 *
 * IT IS EVALUATED ON THE DATA, NEVER ON MEASURED LAYOUT — a browser measurement informs the
 * constant, but nothing at run time reads a width, so the rule can be checked in a test. That is
 * the same construction, and the same reasoning, as `MIN_SHARE_FOR_INLINE_LABEL` in
 * `../primitives/DamageValue.tsx`.
 */
export const MIN_TICK_LABEL_GAP = 0.37;

/**
 * Which ticks may print their number.
 *
 * Walks BACKWARDS from the top of the axis, because the two labels a reader needs most are the
 * ends: zero, and the top of the scale. Everything between them keeps its label only if it is far
 * enough from the last label kept. Zero is always kept, and a label too close to zero is dropped
 * rather than allowed to sit on top of it.
 */
export function labelledTicks(fractions: readonly number[]): boolean[] {
  const labelled = fractions.map(() => false);
  if (fractions.length === 0) return labelled;

  labelled[0] = true;
  labelled[fractions.length - 1] = true;
  let lastKept = fractions[fractions.length - 1]!;

  for (let i = fractions.length - 2; i > 0; i -= 1) {
    const f = fractions[i]!;
    if (lastKept - f >= MIN_TICK_LABEL_GAP && f >= MIN_TICK_LABEL_GAP) {
      labelled[i] = true;
      lastKept = f;
    }
  }
  return labelled;
}

/**
 * Two builds and one health pool on ONE axis.
 *
 * THE SCALE COMES FROM `src/ui/plot/`, NOT FROM HERE. `yDomainFor` decides the top of the axis
 * and puts zero in it — a comparison chart whose axis starts at 400 makes a 5% difference look
 * like a 100% one, which is the classic misleading chart and the one this product can least
 * afford. `niceTicks` decides where the gridlines fall, so this chart and the burndown place
 * theirs identically. `fractionOf` maps a figure onto the axis and clamps it.
 *
 * THE DOMAIN INCLUDES THE HEALTH POOL as well as both builds' damage, so the health rule is
 * always on screen and an overkill is visible as a bar that runs PAST it.
 */
export function magnitudeModel(sides: SideMagnitude[], defenderHp: number): MagnitudeModel {
  const points = [
    ...sides.flatMap((s) => [
      { x: 0, y: s.burstApplied },
      { x: 0, y: s.burstPlusDotApplied },
    ]),
    { x: 0, y: defenderHp },
  ];
  const domain = yDomainFor([points]);

  // THREE INTERVALS, NOT FIVE. `niceTicks`'s own default budget is written for the burndown's
  // full-height health axis; this is a 16px-tall magnitude bar whose exact figures are printed,
  // tagged, in the panels above it, so it needs divisions rather than a readout. At the 146px
  // track a 320px phone gives it, five divisions is a gridline every 29px.
  const values = niceTicks(domain.max, 3);
  const fractions = values.map((value) => fractionOf(value, domain));
  const labelled = labelledTicks(fractions);

  return {
    domain,
    defenderHp,
    healthFraction: fractionOf(defenderHp, domain),
    ticks: values.map((value, i) => ({
      value,
      fraction: fractions[i]!,
      labelled: labelled[i]!,
    })),
    bars: sides.map((s) => ({
      label: s.label,
      burstFraction: fractionOf(s.burstApplied, domain),
      // NEVER BEHIND THE BURST BAR. Damage over time can only add, and a mark that fell behind
      // the bar would read as damage being taken away.
      burstPlusDotFraction: Math.max(
        fractionOf(s.burstApplied, domain),
        fractionOf(s.burstPlusDotApplied, domain),
      ),
    })),
  };
}

/**
 * How a label sitting AT a fraction of the plot must be shifted so it stays inside the frame.
 *
 * The first and last tick labels would otherwise hang half their width off each end. Returned as
 * a transform string so the component has no arithmetic in it, and so the three cases can be
 * checked without rendering.
 */
export function tickShift(fraction: number): string {
  if (fraction <= 0.001) return 'translateX(0)';
  if (fraction >= 0.999) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

/** A fraction as a CSS percentage. One implementation, so no caller rounds it differently. */
export function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}
