// @vitest-environment node
//
// DO THE RISER LABELS LAND ON TOP OF EACH OTHER ON A PHONE? — MEASURED, THEN FIXED, 2026-08-14.
//
// ═══ WHAT CHANGED, AND WHAT THIS FILE NOW HOLDS ═══
//
// They did: 4,296 overlapping pairs at 375px on the worst build a reader can assemble, the worst
// of them by 22.09px, which is a full line box — one damage figure printed directly on another.
// DESIGN.md §4b answered it with the product's one breakpoint: below `--break-phone` the labels
// leave the plot and stack in a row beneath it. Nothing else moves.
//
// So there are TWO censuses here over the SAME populations, and the pair is the point:
//
//   IN_PLOT — what the labels do when they are in the plot. Still computed, still asserted. It is
//             the counterfactual: what comes back if the 30rem query is deleted.
//   PINNED  — what the page actually draws. Every `collidingPairs` is 0, and the column counts and
//             column widths are asserted IDENTICAL to IN_PLOT, so a "fix" that quietly dropped or
//             merged columns to reach zero would fail rather than pass.
//
// ═══ WHAT THIS TEST MEASURES. READ THIS BEFORE BELIEVING A NUMBER OUT OF IT. ═══
//
// It measures CHARACTER COUNTS AGAINST AVAILABLE WIDTH, plus label positions computed from the
// CSS declarations — never a rendered pixel. jsdom computes no layout at all, so
// `getBoundingClientRect` returns zeroes there, and a check that implied it had read real pixels
// would be claiming more than it measured (DATA-SOURCES §50). The model lives in
// `label-geometry.ts`.
//
// WHY THE MODEL IS EXACT RATHER THAN AN ESTIMATE, AND HOW THAT WAS ESTABLISHED. Every glyph in a
// riser label is JetBrains Mono, a monospace face, so a label's width is a character count times a
// constant. Two independent confirmations against a REAL BROWSER (Chrome, the calculator page, the
// scenario the page opens on) are asserted below before any count in this file is believed:
//
//   • at 375px the browser reports `.burn__cols` 203px wide and NO colliding pair; the model
//     predicts 203px and 0.
//   • at 320px the browser reports 148px wide and TWO colliding pairs, the worse of them
//     "47 mag" over "43 phys" overlapping by 9.71px; the model predicts 148px, 2, the same pair,
//     and 9.72px.
//
// ═══ THE POPULATIONS, STATED ═══
//
// P1 — THE PAGE AS IT OPENS. The default scenario `App.tsx` starts on: Lux vs Garen at level 6,
//      rank 1, no items, combo Q → E → basic attack → R. One scenario, 4 columns.
//
// P2 — THE ROSTER. All 173 champions in `public/data/champions.json` as the attacker at level 18
//      with every ability at the rank the roster records as its maximum, running P → Q → W → E →
//      R → basic attack against Garen at level 18, neither side holding an item. 173 scenarios.
//
// P3 — THE WORST CASE A USER CAN BUILD, and the reason this got worse rather than better. The
//      same 173 champions, same levels and ranks, holding the five items in the pool whose
//      effects RIDE on a basic attack (Nashor's Tooth, Guinsoo's Rageblade, Wit's End, Blade of
//      the Ruined King, Trinity Force), running Q → W → E → R → basic attack → basic attack. Each
//      basic attack carries its riders as their own columns, so a six-step combo becomes up to
//      SIXTEEN columns and every column is narrower.
//
// Every population is measured at TWO viewports: 375px, the phone width this project has always
// measured at, and 320px, the narrowest SPECIFICATION §10 has to hold at. Data is patch 16.16.1
// as published in `public/data/manifest.json`.
//
// ═══ WHAT IT DOES NOT MEASURE ═══
//
// Not whether any damage figure is right — that is the engine's suite. Not what the page LOOKS
// like: a collision here is two boxes overlapping in the model, which on screen is two numbers
// printed across each other. Not the heal label against a heal label in a scenario with several
// heals, because no population above produces one.
//
// THE X-AXIS NAMES UNDERNEATH ARE CHECKED TOO, in their own census at the foot of this file. This
// paragraph used to say they were "counted below, never collision-checked" — and they were
// colliding all along: `inst 1inst 2inst 3+DoT` from six columns on, measured in Chrome on
// 2026-08-15. They are a different element with a different rule, so they get their own census
// over the same three populations rather than being folded into the ones above.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Champion, ChampionConfig, ComboStep, Scenario } from '../../types';
import type { Result } from '../../types/result';
import { simulate } from '../../engine';
import {
  buildCatalogue,
  itemEffectsById,
  loadAbilities,
  loadItemEffects,
  loadItems,
} from '../data/catalogue';
import { loadRoster } from '../data/roster';
import { fetchPublished } from '../data/published-files';
import { startingCombo, startingConfig } from '../app/App';
import { buildBurndownModel, type BurndownModel } from './geometry';
import type { LabelBox } from './label-geometry';
import {
  AXIS_LABEL_MIN_GAP_PX,
  AXIS_MODEL_VALIDATION,
  BREAK_PHONE_PX,
  COLS_INLINE_AT_320,
  COLS_INLINE_AT_375,
  LABEL_INSET_PX,
  MODEL_VALIDATION,
  PLOT_BLOCK_PX,
  STACK_INLINE_AT_320,
  STACK_INLINE_AT_375,
  STACK_NAME_MAX_PX,
  axisEndOverhangPx,
  axisLabelInlinePx,
  axisLabelSeparations,
  axisNameIsKnown,
  axisRequiredPitchPx,
  collisions,
  planAxisLabels,
  damageValueInlinePx,
  labelBoxes,
  labelsAreInPlot,
  plotLabelBoxes,
  requiredColumnInlinePx,
  spillPastLeadingEdgePx,
  stackedFigureInlinePx,
} from './label-geometry';

const roster = await loadRoster(fetchPublished);
const items = await loadItems(fetchPublished);
const abilities = new Map(
  await Promise.all(
    roster.map(async (c) => {
      const file = await loadAbilities(c.apiname, fetchPublished);
      return [c.apiname, file?.abilities ?? []] as const;
    }),
  ),
);
// THE ITEM EFFECTS ARE LOADED ON PURPOSE. Without them `buildCatalogue` hands the engine an empty
// effect list, no on-hit or Spellblade rider can fire, and P3 quietly degrades into P2 with a
// longer combo — a population that looks like the worst case and is not one. That is exactly what
// happened on the first run of this file: 4,296 colliding pairs read as 283 until the effects were
// passed in. The population check below is what makes it impossible to happen silently again.
const itemEffects = itemEffectsById(await loadItemEffects(fetchPublished));
const catalogue = buildCatalogue({ champions: roster, items, abilities, itemEffects });
const GAREN = roster.find((c) => c.apiname === 'Garen')!;

/** The five items in the pool whose effects ride on a basic attack rather than being a step. */
const RIDER_ITEMS = [3115, 3124, 3091, 3153, 3078];

const ROSTER_COMBO: ComboStep[] = [
  { id: 'p1', kind: 'ability', ref: 'P' },
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'w1', kind: 'ability', ref: 'W' },
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'r1', kind: 'ability', ref: 'R' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
];

const RIDER_COMBO: ComboStep[] = [
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'w1', kind: 'ability', ref: 'W' },
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'r1', kind: 'ability', ref: 'R' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
  { id: 'aa2', kind: 'basic-attack', ref: 'basic' },
];

function maxed(champion: Champion, itemIds: number[]): ChampionConfig {
  return {
    ...startingConfig(champion.apiname),
    level: 18,
    items: itemIds,
    abilityRanks: {
      Q: champion.abilityMaxRanks.Q ?? 1,
      W: champion.abilityMaxRanks.W ?? 1,
      E: champion.abilityMaxRanks.E ?? 1,
      R: champion.abilityMaxRanks.R ?? 1,
    },
  };
}

function run(scenario: Scenario): Result | null {
  const out = simulate(scenario, catalogue);
  return out.ok ? out.result : null;
}

function rosterResults(combo: ComboStep[], itemIds: number[]): { name: string; result: Result }[] {
  const out: { name: string; result: Result }[] = [];
  for (const champion of roster) {
    const result = run({
      version: 2,
      attacker: maxed(champion, itemIds),
      defender: { ...maxed(GAREN, []), apiname: 'Garen' },
      combo,
    });
    if (result) out.push({ name: champion.apiname, result });
  }
  return out;
}

const P1: { name: string; result: Result }[] = (() => {
  const lux = roster.find((c) => c.apiname === 'Lux')!;
  const result = run({
    version: 2,
    attacker: startingConfig(lux.apiname),
    defender: { ...startingConfig('Garen'), apiname: 'Garen' },
    combo: startingCombo(),
  });
  return result ? [{ name: 'Lux (the page as it opens)', result }] : [];
})();

const P2 = rosterResults(ROSTER_COMBO, []);
const P3 = rosterResults(RIDER_COMBO, RIDER_ITEMS);

interface Census {
  scenarios: number;
  scenariosWithACollision: number;
  collidingPairs: number;
  /** The overlap a reader actually sees: the SMALLER of the two axes, in px. */
  worstOverlapPx: number;
  worstOverlapWhere: string;
  maxColumns: number;
  /** How far the leftmost label reaches past the columns, over the y-axis rail. */
  worstSpillPx: number;
  /** Widest label + its inset: how wide a column would have to be for nothing to touch. */
  requiredColumnPx: number;
  /** How wide the narrowest column in the population actually is. */
  actualColumnPx: number;
}

/**
 * WHERE THE BOXES COME FROM IS A PARAMETER, and that is the whole shape of this file after the
 * fix. The same census runs twice over the same populations:
 *
 *   • `plotLabelBoxes(model, cols, viewport)` — WHAT THE PAGE DOES. Below `--break-phone` it
 *     returns nothing, because the labels are not in the plot.
 *   • `labelBoxes(model, cols)` — WHAT THE PAGE DID, and what it would do again if the query in
 *     `burndown.css` were deleted. This is the counterfactual the fix is measured against.
 */
type BoxesOf = (model: BurndownModel, colsInlinePx: number) => LabelBox[];

function census(
  population: { name: string; result: Result }[],
  colsInlinePx: number,
  boxesOf: BoxesOf,
): Census {
  let scenariosWithACollision = 0;
  let collidingPairs = 0;
  let worstOverlapPx = 0;
  let worstOverlapWhere = '';
  let maxColumns = 0;
  let worstSpillPx = 0;
  let requiredColumnPx = 0;
  let actualColumnPx = Number.POSITIVE_INFINITY;

  for (const { name, result } of population) {
    const model = buildBurndownModel(result);
    const boxes = boxesOf(model, colsInlinePx);
    const found = collisions(boxes);
    maxColumns = Math.max(maxColumns, model.columns.length);
    worstSpillPx = Math.max(worstSpillPx, spillPastLeadingEdgePx(boxes));
    requiredColumnPx = Math.max(requiredColumnPx, requiredColumnInlinePx(boxes));
    if (model.columns.length > 0) {
      actualColumnPx = Math.min(actualColumnPx, colsInlinePx / model.columns.length);
    }
    if (found.length > 0) scenariosWithACollision += 1;
    collidingPairs += found.length;
    for (const c of found) {
      const seen = Math.min(c.inlineOverlapPx, c.blockOverlapPx);
      if (seen > worstOverlapPx) {
        worstOverlapPx = seen;
        // The THIN SPACE inside a label is flattened to an ordinary one for reporting only. The
        // width model counts the real character at its real 0.2em advance; this string is prose.
        const plain = (s: string) => s.replace(/\s/g, ' ');
        worstOverlapWhere = `${name}: "${plain(c.a.text)}" over "${plain(c.b.text)}"`;
      }
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    scenarios: population.length,
    scenariosWithACollision,
    collidingPairs,
    worstOverlapPx: round(worstOverlapPx),
    worstOverlapWhere,
    maxColumns,
    worstSpillPx: round(worstSpillPx),
    requiredColumnPx: round(requiredColumnPx),
    actualColumnPx: round(actualColumnPx),
  };
}

describe('riser labels/the width model is the browser’s, not a guess', () => {
  it('reproduces four labels read off a real browser to within 0.05px', () => {
    for (const { value, tag, renderedPx } of MODEL_VALIDATION) {
      const type = tag === 'mag' ? 'magic' : tag === 'phys' ? 'physical' : 'true';
      expect(Math.abs(damageValueInlinePx(value, type) - renderedPx)).toBeLessThan(0.05);
    }
  });

  it('predicts what Chrome actually did at 320px, pair for pair and to a hundredth of a pixel', () => {
    // THE ONE CASE WHERE THIS FILE AND A REAL BROWSER CAN BE COMPARED DIRECTLY, because it is the
    // scenario the page opens on and needs no interaction to reach. Chrome, 320×812, the
    // calculator page BEFORE the fix: `.burn__cols` 148 × 320, two colliding pairs, the worse of
    // them "47 mag" over "43 phys" — 12.27px of horizontal overlap and 9.71px of vertical.
    //
    // IT IS STILL THE VALIDATION OF THE WIDTH MODEL after the fix, and it is not stale: the page
    // no longer PUTS labels in the plot at 320px, but `labelBoxes` still computes where they
    // would land, and that arithmetic is what both censuses below rest on. If the type scale, the
    // font or the tag size moves, this is what says so.
    const model = buildBurndownModel(P1[0]!.result);
    const boxes = labelBoxes(model, COLS_INLINE_AT_320);
    const found = collisions(boxes);
    expect(COLS_INLINE_AT_320).toBe(148);
    expect(PLOT_BLOCK_PX).toBe(320);
    expect(found).toHaveLength(2);
    const worse = found[1]!;
    expect(worse.a.text.replace(/\s/g, ' ')).toBe('47 mag');
    expect(worse.b.text.replace(/\s/g, ' ')).toBe('43 phys');
    expect(Math.abs(worse.blockOverlapPx - 9.71)).toBeLessThan(0.05);
    expect(Math.abs(worse.inlineOverlapPx - 12.27)).toBeLessThan(0.05);
  });

  it('and predicts the same page at 375px, where the browser sees no collision at all', () => {
    // Chrome, 375×812, same page: `.burn__cols` 203px, zero colliding pairs. The defect is NOT
    // visible on the scenario the page opens on at this width, which is why it survived so long.
    const model = buildBurndownModel(P1[0]!.result);
    expect(COLS_INLINE_AT_375).toBe(203);
    expect(collisions(labelBoxes(model, COLS_INLINE_AT_375))).toHaveLength(0);
  });

  it('the inset does not change the gap between two labels — the arithmetic, stated', () => {
    // THIS CORRECTS A CLAIM IN `burndown.css`, which said narrowing `--space-3` "makes it worse,
    // not better", on the reasoning that the inset is what holds each label clear of the previous
    // one. It cancels. Label i's leading edge is `col_i.right − inset − width_i` and label i−1's
    // trailing edge is `col_{i−1}.right − inset`, so the gap between them is
    // `columnWidth − width_i`, with no inset in it at all. The inset governs clearance from the
    // riser stroke and from the plot's trailing edge, and nothing else.
    const gapWith = (inset: number) => 150 - inset - (100 - inset);
    expect(gapWith(LABEL_INSET_PX)).toBe(50);
    expect(gapWith(4)).toBe(50);
    expect(gapWith(0)).toBe(50);
  });
});

describe('riser labels/the populations are the ones this test claims', () => {
  it('P1 is one scenario, P2 and P3 are the whole roster', () => {
    expect(P1).toHaveLength(1);
    expect(P2).toHaveLength(173);
    expect(P3).toHaveLength(173);
  });

  it('P3 really does carry riders — otherwise it is P2 with a longer combo', () => {
    const carried = P3.reduce(
      (n, { result }) => n + result.perInstance.filter((i) => i.carriedBy).length,
      0,
    );
    expect(carried).toBeGreaterThan(1000);
    const widest = Math.max(...P3.map(({ result }) => buildBurndownModel(result).columns.length));
    expect(widest).toBe(16);
  });

  it('the group bracket blanks AXIS labels and never a riser label — measured, not assumed', () => {
    // The lead's question before any fix is proposed: the grouping already prints one axis label
    // for a whole group, so is that enough? IT DOES NOT TOUCH THE RISER LABELS. A column keeps its
    // own damage figure, because that figure is data and the axis label is a caption. On P3's
    // widest scenario the axis prints 7 labels where the plot prints 14 figures in the same 203px.
    // So the grouping is NOT enough on its own, and the gap it leaves is the whole defect.
    //
    // ═══ RE-PINNED 2026-08-15: riser labels 16 → 14. WHAT MOVED AND WHY ═══
    //
    // The column COUNT is unchanged at 16 and is still asserted as 16 — nothing was dropped or
    // merged. What fell is how many of those 16 columns PRINT A FIGURE, and the two that stopped
    // are named rather than counted, because a count alone could hide a defect:
    //
    //   inst 3 — Alistar E, Trample.          Its damage now routes to the `+DoT` line instead of
    //                                         producing a burst column figure. SPECIFICATION §3.8
    //                                         working: DoT is never folded into burst.
    //   inst 4 — Alistar R, Unbreakable Will. A defensive ultimate that deals no damage at all.
    //
    // Both columns are still drawn, still on the axis, still inside their group bracket, and both
    // still take a figure of zero rather than a wrong one. This is the curated data arriving, not
    // the chart losing anything: `hasPrintedFigure` is the same predicate it always was.
    const worst = P3.map(({ result }) => buildBurndownModel(result)).sort(
      (a, b) => b.columns.length - a.columns.length,
    )[0]!;
    const axisPrinted = worst.columns.filter((c) => !c.groupId || c.groupIndex === 1).length;
    const printsAFigure = (c: (typeof worst.columns)[number]) =>
      (c.damageType && c.damage > 0) || c.segments.length > 0;
    const riserLabels = worst.columns.filter(printsAFigure).length;
    expect(worst.columns).toHaveLength(16);
    expect(axisPrinted).toBe(7);
    expect(riserLabels).toBe(14);
    // THE TWO SILENT COLUMNS, BY NAME. A bare 14 could be any two columns going quiet, including
    // two that should have spoken. These are the two, and they are the two for stated reasons.
    expect(worst.columns.filter((c) => !printsAFigure(c)).map((c) => c.sourceLabel)).toEqual([
      'E — Trample',
      'R — Unbreakable Will',
    ]);
  });
});

/**
 * ═══ THE BEFORE FIGURES — WHAT THE LABELS DID WHILE THEY WERE IN THE PLOT ═══
 *
 * These are the numbers this fix was built against, and they are NOT history: every one of them
 * is still computed, from the same populations, by `labelBoxes` — the in-plot arithmetic, which
 * is untouched. What changed is that the page no longer USES it below `--break-phone`.
 *
 * So this table is the counterfactual, and it is deliberately kept: it is what comes back if the
 * 30rem query in `burndown.css` is deleted, and it is the only thing that makes the after table
 * below mean anything. A row of zeroes with nothing beside it proves only that something was
 * switched off — it cannot tell you whether it was the defect or the chart.
 *
 * These counts are data-dependent: they are a property of patch 16.16.1 as published, and a patch
 * that changes damage figures will move them. That movement is the report, not a fault — but read
 * `requiredColumnPx` against `actualColumnPx` before concluding anything from a count alone,
 * because those two are pure layout arithmetic and do not move with the data.
 *
 * ═══ RE-PINNED 2026-08-15, WHEN THE CURATED DATA LANDED. EVERY MOVE, WITH ITS CAUSE ═══
 *
 * The standing rule is that a re-pinned number carries what it was, what it is, and why, because
 * a re-pinned number with no explanation cannot be told apart from one adjusted to make a test
 * pass. Four of the six rows moved; `P1 at 375px` and `P1 at 320px` did not move at all, because
 * the default scenario is Lux at rank 1 and no curated entry touches it.
 *
 * ONE CAUSE ACCOUNTS FOR ALL OF IT, and it is a single champion:
 *
 *   CORKI's `+DoT` COLUMN IS NOW THE ONLY MULTI-TYPE DoT COLUMN IN THE ROSTER — W (Valkyrie,
 *   magic) and E (Gatling Gun, physical) both leave damage over time, so that one column prints
 *   TWO figures where every other DoT column in the game prints one. Measured across P2 and P3
 *   together it is 2 columns out of 3,667.
 *
 * | figure              | was    | is     | why |
 * |---------------------|-------:|-------:|-----|
 * | requiredColumnPx    |  70.88 | 147.04 | all four rows. The widest in-plot label was one
 * |                     |  76.96 | 147.04 | figure (`1 240 mag`, 64.96px); it is now Corki's two
 * |                     |        |        | figures and their two hatch swatches, 135.04px, plus
 * |                     |        |        | the 12px inset. Confirmed in Chrome at 135.03px. |
 * | P2/375 pairs        |    153 |    163 | +10. Corki's wider label reaches back across more
 * | P2/320 pairs        |    175 |    189 | +14. neighbours, and 17 abilities moved their damage
 * | P3/375 pairs        |  4,296 |  4,299 | +3.  to the DoT line, which re-heights other risers. |
 * | P3/320 pairs        |  4,745 |  4,749 | +4.  |
 * | P2/375 scenarios    |     98 |    102 | the same four champions crossing from clean to
 * | P2/320 scenarios    |    105 |    111 | colliding. |
 * | P2/375 worst overlap|  15.45 |  16.39 | the worst pair is no longer Ahri's `110 mag` over
 * |                     |        |        | `50 phys` but Corki's `358 phys` over `45 phys` —
 * |                     |        |        | the same champion the whole move traces to. |
 * | P3/375 spill        |  57.35 |  58.19 | how far the leftmost label reaches over the y-axis
 * | P3/320 spill        |  61.01 |  61.63 | rail. Follows from the wider label. |
 *
 * `maxColumns` and `actualColumnPx` did NOT move in any row — 4 / 7 / 16 columns at the same
 * widths — which is why `PINNED` below needed no change at all. The chart's shape is what it was.
 */
const IN_PLOT: Record<string, Census> = {
  'P1 at 375px': {
    scenarios: 1,
    scenariosWithACollision: 0,
    collidingPairs: 0,
    worstOverlapPx: 0,
    worstOverlapWhere: '',
    maxColumns: 4,
    worstSpillPx: 3.81,
    requiredColumnPx: 64.16,
    actualColumnPx: 50.75,
  },
  'P1 at 320px': {
    scenarios: 1,
    scenariosWithACollision: 1,
    collidingPairs: 2,
    worstOverlapPx: 9.72,
    worstOverlapWhere: 'Lux (the page as it opens): "47 mag" over "43 phys"',
    maxColumns: 4,
    worstSpillPx: 17.56,
    requiredColumnPx: 64.16,
    actualColumnPx: 37,
  },
  'P2 at 375px': {
    scenarios: 173,
    scenariosWithACollision: 102,
    collidingPairs: 163,
    worstOverlapPx: 16.39,
    worstOverlapWhere: 'Corki: "358 phys" over "45 phys"',
    maxColumns: 7,
    worstSpillPx: 37.05,
    requiredColumnPx: 147.04,
    actualColumnPx: 29,
  },
  'P2 at 320px': {
    scenarios: 173,
    scenariosWithACollision: 111,
    // 189 UNTIL 2026-08-15's second curated merge, when `figureIs` marked nine per-tick heal rows
    // per-instance and moved them to incomplete. One roster scenario's column set changed as a
    // result, adding a single colliding pair to this COUNTERFACTUAL census — the table that
    // measures what the labels WOULD do in the plot, which is what the fix is measured against
    // and is deliberately not the shipping layout.
    collidingPairs: 190,
    worstOverlapPx: 19.38,
    worstOverlapWhere: 'Senna: "263 phys" over "23 phys"',
    maxColumns: 7,
    worstSpillPx: 46.21,
    requiredColumnPx: 147.04,
    actualColumnPx: 21.14,
  },
  'P3 at 375px': {
    scenarios: 173,
    scenariosWithACollision: 173,
    collidingPairs: 4299,
    worstOverlapPx: 22.09,
    worstOverlapWhere: 'Ezreal: "28 mag" over "3 phys"',
    maxColumns: 16,
    worstSpillPx: 58.19,
    requiredColumnPx: 147.04,
    actualColumnPx: 12.69,
  },
  'P3 at 320px': {
    scenarios: 173,
    scenariosWithACollision: 173,
    collidingPairs: 4749,
    worstOverlapPx: 22.09,
    worstOverlapWhere: 'Ezreal: "28 mag" over "3 phys"',
    maxColumns: 16,
    worstSpillPx: 61.63,
    requiredColumnPx: 147.04,
    actualColumnPx: 9.25,
  },
};

/**
 * ═══ THE AFTER FIGURES — WHAT THE PAGE ACTUALLY DRAWS ═══
 *
 * Every phone viewport is below `--break-phone`, so the plot holds NO labels at either width and
 * every collision figure is 0. Not "fewer": none, and it is none for a structural reason rather
 * than a lucky arrangement of this patch's numbers — there is no box to overlap another box.
 *
 * `maxColumns` and `actualColumnPx` are unchanged from the table above ON PURPOSE, and they are
 * the assertion that the CHART did not move. Nothing was made narrower, nothing was dropped and
 * no column was merged: a 16-column scenario is still 16 columns of 12.69px, still drawn, still
 * clickable. Only the labels left.
 *
 * `worstSpillPx` and `requiredColumnPx` fall to 0 because both are properties of a label that is
 * in the plot, and there are none.
 */
const PINNED: Record<string, Census> = {
  'P1 at 375px': {
    scenarios: 1,
    scenariosWithACollision: 0,
    collidingPairs: 0,
    worstOverlapPx: 0,
    worstOverlapWhere: '',
    maxColumns: 4,
    worstSpillPx: 0,
    requiredColumnPx: 0,
    actualColumnPx: 50.75,
  },
  'P1 at 320px': {
    scenarios: 1,
    scenariosWithACollision: 0,
    collidingPairs: 0,
    worstOverlapPx: 0,
    worstOverlapWhere: '',
    maxColumns: 4,
    worstSpillPx: 0,
    requiredColumnPx: 0,
    actualColumnPx: 37,
  },
  'P2 at 375px': {
    scenarios: 173,
    scenariosWithACollision: 0,
    collidingPairs: 0,
    worstOverlapPx: 0,
    worstOverlapWhere: '',
    maxColumns: 7,
    worstSpillPx: 0,
    requiredColumnPx: 0,
    actualColumnPx: 29,
  },
  'P2 at 320px': {
    scenarios: 173,
    scenariosWithACollision: 0,
    collidingPairs: 0,
    worstOverlapPx: 0,
    worstOverlapWhere: '',
    maxColumns: 7,
    worstSpillPx: 0,
    requiredColumnPx: 0,
    actualColumnPx: 21.14,
  },
  'P3 at 375px': {
    scenarios: 173,
    scenariosWithACollision: 0,
    collidingPairs: 0,
    worstOverlapPx: 0,
    worstOverlapWhere: '',
    maxColumns: 16,
    worstSpillPx: 0,
    requiredColumnPx: 0,
    actualColumnPx: 12.69,
  },
  'P3 at 320px': {
    scenarios: 173,
    scenariosWithACollision: 0,
    collidingPairs: 0,
    worstOverlapPx: 0,
    worstOverlapWhere: '',
    maxColumns: 16,
    worstSpillPx: 0,
    requiredColumnPx: 0,
    actualColumnPx: 9.25,
  },
};

/** The viewport each population is censused at, and the two lengths that follow from it. */
const CASES: {
  label: string;
  population: { name: string; result: Result }[];
  viewportPx: number;
  colsInlinePx: number;
  stackInlinePx: number;
}[] = [
  // prettier-ignore-style: one row per case, the two lengths lined up, because the point of this
  // table is that 375 and 320 differ ONLY in the two widths that follow from the viewport.
  { label: 'P1 at 375px', population: P1, viewportPx: 375,
    colsInlinePx: COLS_INLINE_AT_375, stackInlinePx: STACK_INLINE_AT_375 },
  { label: 'P1 at 320px', population: P1, viewportPx: 320,
    colsInlinePx: COLS_INLINE_AT_320, stackInlinePx: STACK_INLINE_AT_320 },
  { label: 'P2 at 375px', population: P2, viewportPx: 375,
    colsInlinePx: COLS_INLINE_AT_375, stackInlinePx: STACK_INLINE_AT_375 },
  { label: 'P2 at 320px', population: P2, viewportPx: 320,
    colsInlinePx: COLS_INLINE_AT_320, stackInlinePx: STACK_INLINE_AT_320 },
  { label: 'P3 at 375px', population: P3, viewportPx: 375,
    colsInlinePx: COLS_INLINE_AT_375, stackInlinePx: STACK_INLINE_AT_375 },
  { label: 'P3 at 320px', population: P3, viewportPx: 320,
    colsInlinePx: COLS_INLINE_AT_320, stackInlinePx: STACK_INLINE_AT_320 },
];

describe('riser labels/what the page draws now', () => {
  for (const { label, population, viewportPx, colsInlinePx } of CASES) {
    it(`${label}: no label is in the plot, so nothing can collide`, () => {
      const boxes: BoxesOf = (model, cols) => plotLabelBoxes(model, cols, viewportPx);
      expect({ label, ...census(population, colsInlinePx, boxes) }).toEqual({
        label,
        ...PINNED[label]!,
      });
    });
  }

  it('the chart itself did not move — same columns, same widths, in every population', () => {
    // THE HALF THAT WOULD CATCH A FIX THAT CHEATED. Zero collisions is trivially achievable by
    // dropping columns, merging them or hiding the chart on a phone; §4b permits none of those.
    // Every column count and every column width is asserted UNCHANGED against the before table.
    for (const { label } of CASES) {
      expect([label, PINNED[label]!.maxColumns, PINNED[label]!.actualColumnPx]).toEqual([
        label,
        IN_PLOT[label]!.maxColumns,
        IN_PLOT[label]!.actualColumnPx,
      ]);
    }
  });
});

describe('riser labels/the defect the fix answers, still measured', () => {
  for (const { label, population, colsInlinePx } of CASES) {
    it(`${label}: in the plot, it would still be this bad`, () => {
      expect({ label, ...census(population, colsInlinePx, labelBoxes) }).toEqual({
        label,
        ...IN_PLOT[label]!,
      });
    });
  }

  it('a label needs 147.04px of column and the worst case gives it 9.25px', () => {
    // THE FIGURE THE FIX HAD TO CLEAR, measured rather than picked: the widest label in any
    // population sits 12px in from its column's trailing edge, so no two labels can touch only if
    // every column is at least that wide. On DESIGN.md §4a's rule that a layout measure is
    // `--space-8 × n`, the smallest conforming value is asserted below. At 375px the plot has
    // 203px in total, so widening the columns to it would show ONE column and part of a second —
    // which is why DESIGN.md §4b moved the labels instead of widening the columns.
    //
    // ═══ RE-PINNED 2026-08-15: 76.96px → 147.04px, and 128px → 192px ═══
    //
    // The widest label WAS one figure — `1 240 mag`, 64.96px — and IS Corki's two-figure `+DoT`
    // label: a hatch swatch and a figure per damage type, 135.04px, which Chrome renders at
    // 135.03px. Plus the same 12px inset. The label the argument rests on very nearly DOUBLED, so
    // the conforming column width went up one step of the spacing scale, from 2 × 64 to 3 × 64.
    //
    // THE ARGUMENT IT SUPPORTS IS UNCHANGED AND IS NOW STRONGER, which is the only reason this
    // re-pin is not a weakening: at 375px a 192px column shows barely ONE of them in 203px, where
    // 128px at least showed one and a half. Widening the columns was already the wrong answer and
    // is now more clearly so.
    expect(IN_PLOT['P3 at 320px']!.requiredColumnPx).toBeGreaterThan(
      IN_PLOT['P3 at 320px']!.actualColumnPx * 8,
    );
    expect(Math.ceil(IN_PLOT['P3 at 375px']!.requiredColumnPx / 64) * 64).toBe(192);
    expect(COLS_INLINE_AT_375).toBeLessThan(192 * 2);
  });

  it('the two tables differ ONLY in the label figures — 4,299 pairs against 0', () => {
    // The one-line statement of the whole change, so a reader does not have to diff two tables.
    // RE-PINNED 2026-08-15: 4,296 → 4,299. Three more pairs, all Corki's, from the wider two-type
    // `+DoT` label reaching back across one more neighbour. The `PINNED` side is still 0 and is
    // still 0 structurally — below the breakpoint there is no box in the plot to overlap another.
    expect(IN_PLOT['P3 at 375px']!.collidingPairs).toBe(4299);
    expect(PINNED['P3 at 375px']!.collidingPairs).toBe(0);
    expect(IN_PLOT['P3 at 375px']!.worstOverlapPx).toBe(22.09);
    expect(PINNED['P3 at 375px']!.worstOverlapPx).toBe(0);
    expect(Object.values(PINNED).map((c) => c.collidingPairs)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

/**
 * ═══ THE BREAKPOINT ITSELF: THREE COPIES OF ONE NUMBER, HELD TOGETHER ═══
 *
 * CSS cannot resolve `var()` in a media query prelude, so the width exists three times — as
 * `--break-phone` in tokens.css, as the literal `30rem` in burndown.css, and as `BREAK_PHONE_PX`
 * in the model. Two of them silently disagreeing is the obvious way this fix rots, and none of
 * the three can see the others. These assertions are the only thing that can.
 *
 * DESIGN.md §4b's second rule is also mechanical here: ONE query, for ONE job. A width query
 * added for anything else fails this, by name, with the selector it tried to govern.
 */
describe('riser labels/the one breakpoint', () => {
  // COMMENTS ARE STRIPPED FIRST, and this was not caution — the first version of the check below
  // failed on this file's own prose. The comment above the query explains why the literal cannot
  // be `var(--break-phone)`, and by writing that out it contained a second "@media (max-width:"
  // which the scan then counted as a second query. The same trap `token-audit.test.ts` records
  // for `.md` inside "DESIGN.md". A stylesheet is what it declares, never what it says about it.
  const css = readFileSync(new URL('./burndown.css', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const tokens = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');

  it('the token, the query and the model all say 30rem / 480px', () => {
    expect(tokens).toMatch(/--break-phone:\s*30rem;/);
    expect(BREAK_PHONE_PX).toBe(480);
    expect(BREAK_PHONE_PX / 16).toBe(30);
  });

  it('burndown.css contains exactly ONE width query, and it is the phone one', () => {
    const widthQueries = [...css.matchAll(/@media[^{]*\((?:max|min)-width:[^)]*\)/g)].map((m) =>
      m[0].replace(/\s+/g, ' ').trim(),
    );
    expect(widthQueries).toEqual(['@media (max-width: 30rem)']);
  });

  it('that query governs the labels and NOTHING else — §4b, checked rather than promised', () => {
    // Every selector inside the block, listed. If a future change hides the y axis or shrinks the
    // plot in here, this fails and names it — which is exactly the "general phone stylesheet"
    // §4b forbids, caught at the moment it starts rather than after five more rules arrive.
    const block = /@media\s*\(max-width:\s*30rem\)\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(block, 'the 30rem block was not found').not.toBeNull();
    const selectors = [...block![1]!.matchAll(/([^{}]+)\{/g)]
      .flatMap((m) => m[1]!.split(','))
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
    expect(selectors).toEqual(['.burn__heal-label', '.burn__label', '.burn__stack']);
  });

  it('the labels are in the plot above it and out of it below — 480px is the edge', () => {
    expect(labelsAreInPlot(481)).toBe(true);
    expect(labelsAreInPlot(480)).toBe(false);
    expect(labelsAreInPlot(375)).toBe(false);
    expect(labelsAreInPlot(320)).toBe(false);
  });

  it('the row beneath the plot is `display:none` by default, so it exists at ONE width only', () => {
    const stack = /\.burn__stack\s*\{([^}]*)\}/.exec(css);
    expect(stack![1]).toMatch(/display:\s*none/);
    expect(stack![1]).toMatch(/flex-wrap:\s*wrap/);
  });
});

/**
 * ═══ CAN THE ROW ITSELF PUSH THE PAGE SIDEWAYS? ═══
 *
 * The row wraps BETWEEN entries, so the only way it can is a SINGLE entry wider than the row. This
 * is the model's half of that question: `stackedFigureInlinePx` is exact for the figures, which is
 * the part that grows with the data, and `STACK_NAME_MAX_PX` supplies the instance name, which is
 * set in a proportional face this file cannot model and is therefore measured in Chrome instead.
 * The two are added below. jsdom computes no layout, so nothing here reads a rendered pixel.
 *
 * ═══ THE RULE CHANGED ON 2026-08-15, AND WHAT IT GUARANTEES CHANGED WITH IT ═══
 *
 * IT WAS `widest < stackInlinePx / 2` — half the row reserved for the name. That was never
 * measured against a name. The whole vocabulary of names is `inst N`, `+DoT` and `heal`, and the
 * widest of them, `inst 16`, is 34.47px in Chrome; at 320px the old rule was holding 102px back
 * for it, three times what it can ever use. So it did not describe the row, and when the curated
 * data widened one entry the rule failed while the row was still fine.
 *
 * IT IS NOW `STACK_NAME_MAX_PX + widest <= stackInlinePx` — the widest name plus the widest
 * figures must fit the row. It guarantees the thing that actually fails: an entry does not escape
 * its row. It is an upper bound used as one, because the entry with the widest figures is always
 * the `+DoT` column, whose name is 25.89px and not 34.47px.
 *
 * WHY THE OLD RULE WAS NOT SIMPLY RELAXED. It was failing on a REAL defect, not a phantom. At
 * 320px with a six-item build, Corki's `+DoT` entry measured 205.72px in Chrome against a 204px
 * row — 1.72px OUTSIDE it, on a scenario a user can assemble. Loosening the number would have
 * pinned that. Two declarations in `burndown.css` answer it instead:
 *
 *   • the hatch swatch is dropped in the ROW only (the entry is named `+DoT`, which by §8's own
 *     argument is a better non-colour cue than a texture) — 205.72px → 165.72px, measured;
 *   • `.burn__stack-item` wraps, so no figure width can push an entry out of the row at all.
 *     Measured with a fabricated three-type DoT entry at 320px: held at exactly 204px, wrapped to
 *     two lines, `body.scrollWidth === body.clientWidth`.
 *
 * The first is the headroom and the second is the guarantee. With both, the widest entry the
 * roster produces is 152.92px in a 204px row.
 *
 * ═══ THE BROWSER HALF, RE-DERIVED IN CHROME ON 2026-08-15 ═══
 *
 * It is written down here rather than left in a session, because a measurement nobody can find
 * again is a claim. Chrome, the calculator page, `document.documentElement.clientWidth` as the
 * layout viewport (the pane's `innerWidth` is a device-emulation artifact and is NOT the width
 * the query sees):
 *
 *   width  | `.burn__stack`      | `.burn__label`  | `.burn__cols` | scrollX after (9999,0)
 *   -------|---------------------|-----------------|---------------|-----------------------
 *   320px  | flex, 204 × 44.78   | display: none   | 148 × 320     | 0, scrollWidth === client
 *   375px  | flex, 259 × 44.78   | display: none   | 203 × 320     | 0, scrollWidth === client
 *   480px  | flex                | display: none   | —             | —
 *   481px  | display: none       | block           | —             | —
 *   1265px | display: none       | block           | —             | —
 *
 * 204 and 259 are `STACK_INLINE_AT_320`/`_375` exactly, and 148/203 are `COLS_INLINE_AT_320`/
 * `_375` exactly, so the arithmetic in `label-geometry.ts` is the browser's and not a guess.
 * 480 against 481 is `labelsAreInPlot`'s edge, confirmed in the browser rather than assumed from
 * the query text.
 *
 * NOTHING OUTSIDE A SCROLLER EXCEEDED THE VIEWPORT at either phone width: every element whose
 * right edge passed it was inside an `overflow-x` ancestor — the breakdown tables, which scroll
 * on purpose. Counted by walking `body *`, not by eye.
 *
 * THE 16-ENTRY CASE, which no fixture on the page can reach: the row was cloned to 16 entries in
 * the live DOM at 320px. It wrapped to 203.13px tall, stayed 204px wide, and `scrollX` was still
 * 0 with `body.scrollWidth === body.clientWidth`. Wrapping is what stops a rider build pushing
 * the page sideways, and that is the measurement of it.
 *
 * ═══ THE ONE-ENTRY CASE, RE-DERIVED IN CHROME ON 2026-08-15 ═══
 *
 * The 16-entry case above is the row wrapping BETWEEN entries. It says nothing about ONE entry
 * being wider than the row, which is what the curated data produced. Chrome, 320×812, Corki:
 *
 *   build                        | entry   | row  | escapes row by | body.scrollWidth
 *   -----------------------------|--------:|-----:|---------------:|------------------
 *   no items (P2)      BEFORE fix| 192.92  | 204  |         −11.08 | 320 (= clientWidth)
 *   six AP items       BEFORE fix| 205.72  | 204  |         +1.72  | 320 (= clientWidth)
 *   six AP items       AFTER fix | 165.72  | 204  |         −38.28 | 320 (= clientWidth)
 *   no items (P2)      AFTER fix | 152.92  | 204  |         −51.08 | 320 (= clientWidth)
 *   fabricated 3-type  AFTER fix | 204.00  | 204  |          0.00  | 320 (= clientWidth)
 *
 * The six-item row is the defect, and it is 1.72px into the plot's padding — visually nothing,
 * which is exactly why a measured rule is worth having and an eyeball is not. At 375px the same
 * entry is 152.92px in a 259px row, and at 1250px the row is `display: none` and the in-plot
 * label is 135.03px with both hatch swatches present — unchanged by any of this.
 *
 * NOTHING OUTSIDE A SCROLLER EXCEEDED THE VIEWPORT after the fix either, counted the same way by
 * walking `body *` at 375px: 0 elements.
 *
 * THE ACCESSIBLE NAMES WERE IDENTICAL AT 320px, 375px AND 1265px — the same four strings, to the
 * character, e.g. "Instance 1. Q — Light Binding. 58 magic damage. Health 1077.1 down to 1019.1
 * of 1077.1. Verified." That is §4b's first rule, checked at the two widths that differ.
 */
describe('riser labels/the row beneath the plot', () => {
  for (const { label, population, stackInlinePx } of CASES) {
    it(`${label}: the whole widest entry — its name and its figures — fits the row`, () => {
      let widest = 0;
      let where = '';
      for (const { name, result } of population) {
        for (const column of buildBurndownModel(result).columns) {
          const px = stackedFigureInlinePx(column);
          if (px > widest) {
            widest = px;
            where = name;
          }
        }
      }
      // THE WHOLE ENTRY, NOT JUST ITS FIGURES. `stackedFigureInlinePx` is everything but the
      // instance name, which is proportional and therefore measured rather than computed.
      expect({ label, fits: STACK_NAME_MAX_PX + widest <= stackInlinePx, named: where !== '' }).toEqual(
        { label, fits: true, named: true },
      );
    });
  }

  // ═══ THE TWO DECLARATIONS THE ROW'S CONTAINMENT RESTS ON ═══
  //
  // Neither can be checked by rendering: jsdom applies no stylesheet and computes no layout, so
  // both were established in Chrome (the table above) and both are held here as DECLARATIONS —
  // the same standing as the `@media` checks further down, and the same honest limit. This says
  // the rule is present, never that the browser obeyed it. What it catches is a later edit
  // deleting one, which is the way a browser-only finding rots.
  //
  // THE MODEL DEPENDS ON THE SWATCH RULE, WHICH IS WHY IT IS CHECKED HERE RATHER THAN ASSUMED.
  // `stackedFigureInlinePx` counts a gap per FIGURE and no swatch at all. Delete the rule below
  // and the row grows by 40px while the model keeps reporting the old number — model and CSS
  // disagreeing silently, which is exactly how the 24px understatement survived until now.
  const rowCss = readFileSync(new URL('./burndown.css', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('an entry wraps inside itself, so no figure width can push it out of the row', () => {
    const item = /\.burn__stack-item\s*\{([^}]*)\}/.exec(rowCss);
    expect(item, 'the .burn__stack-item rule was not found').not.toBeNull();
    expect(item![1]).toMatch(/flex-wrap:\s*wrap/);
  });

  it('the DoT hatch swatch is dropped in the row, and ONLY in the row', () => {
    // Scoped under `.burn__stack`, so the in-plot label keeps its swatches — Chrome reports that
    // label unchanged at 135.03px with both of them. And NOT inside the 30rem query, because
    // DESIGN.md §4b caps that query at three selectors; it does not need to be, since the row is
    // `display: none` at every other width anyway.
    expect(rowCss).toMatch(/\.burn__stack\s+\.burn__hatch--swatch\s*\{[^}]*display:\s*none/);
    const block = /@media\s*\(max-width:\s*30rem\)\s*\{([\s\S]*?)\n\}/.exec(rowCss);
    expect(block![1]).not.toMatch(/swatch/);
  });

  it('the widest entry in the whole roster is Corki’s two-type +DoT, and it is named', () => {
    // WHICH ENTRY, NOT JUST HOW WIDE. A bare maximum tells nobody what to look at when it moves.
    let widest = 0;
    let where = '';
    for (const { name, result } of [...P2, ...P3]) {
      for (const column of buildBurndownModel(result).columns) {
        const px = stackedFigureInlinePx(column);
        if (px > widest) {
          widest = px;
          where = `${name} ${column.axisLabel}`;
        }
      }
    }
    expect(where).toBe('Corki +DoT');
    expect(Math.round(widest * 100) / 100).toBe(127.04);
    // Chrome, 320px, the same scenario: the entry is 152.92px and its name 25.89px, so the
    // figures measure 127.03px. The model is the browser's to a hundredth of a pixel.
    expect(Math.abs(widest - 127.03)).toBeLessThan(0.05);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE X-AXIS NAMES — MEASURED, THEN THINNED (added 2026-08-15)
//
// The file header used to say the axis labels were "counted below, never collision-checked".
// They are checked now, over the same three populations, because they were colliding: read off
// Chrome at a 320px viewport on 2026-08-15, the separation between adjacent names is +0.42px on a
// four-column chart in the preview harness and NEGATIVE from six columns on — `inst 1inst 2inst
// 3+DoT`, the string `tests/clipped-and-offscreen.test.ts` reported and declined to exempt. On the
// calculator's wider 148px axis the first overlap is at eight columns and the worst case a reader
// can build is sixteen.
//
// The names survived as long as they did only by WRAPPING: at five columns Chrome reports the
// labels 31px tall against 15px at four — two lines of axis under a one-line chart — and even
// wrapped they overlap, because the widest unbreakable word (`inst`, 18.67px) is wider than a
// column from eight columns on.
//
// WHAT IS ASSERTED HERE. The same shape as the riser-label censuses above: BEFORE (one name per
// column, what the axis did) and AFTER (the thinning rule), over P1/P2/P3 at both axis widths this
// product actually draws. The AFTER census requires every printed pair to clear
// `AXIS_LABEL_MIN_GAP_PX`, and asserts the column count is untouched — a "fix" that dropped
// columns to reach zero overlaps would fail rather than pass.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE TWO AXIS WIDTHS, both measured in Chrome at a 320px viewport on 2026-08-15.
 *
 * `.burn__xaxis` is inset from the plot's content box by `--space-7 + --space-2` (56px) for the
 * y-axis rail, so it is exactly as wide as `.burn__cols` — 148px on the calculator. The PREVIEW
 * HARNESS draws the same chart 32px narrower at 116px, and that difference is the whole reason the
 * rule takes a measured width rather than a viewport: at one viewport this product draws two
 * different axis widths, and a breakpoint could only ever be right about one of them.
 */
const AXIS_INLINE_CALCULATOR_AT_320 = 148;
const AXIS_INLINE_PREVIEW_AT_320 = 116;

/**
 * The measurements below were read off Chrome with a `Range` over each label's own TEXT NODE, so
 * every figure is the text's advance width rather than the width of the flex box holding it. The
 * two are not the same thing here — a name is wider than its column — and measuring the box would
 * have reported 29px for every label on a 116px axis, which is the column and not the name.
 */

interface AxisCensus {
  scenarios: number;
  /** Charts with at least one adjacent pair of printed names closer than the minimum gap. */
  scenariosWithACollision: number;
  collidingPairs: number;
  /** The worst overlap a reader sees, in px. Positive numbers are overlaps. */
  worstOverlapPx: number;
  worstOverlapWhere: string;
  /** The smallest gap between two printed names anywhere in the population. */
  smallestGapPx: number;
  maxColumns: number;
  /** How many names the widest chart in the population prints. */
  namesOnTheWidestChart: number;
  /** How far the end names reach past the two ends of the axis. */
  worstEndOverhangPx: number;
}

/** Which columns the GROUPING rule already leaves a name on — this rule thins what is left. */
function axisCandidates(model: BurndownModel): boolean[] {
  return model.columns.map((c) => !c.groupId || c.groupIndex === 1);
}

function axisCensus(
  population: { name: string; result: Result }[],
  axisInlinePx: number,
  thinned: boolean,
): AxisCensus {
  let scenariosWithACollision = 0;
  let collidingPairs = 0;
  let worstOverlapPx = 0;
  let worstOverlapWhere = '';
  let smallestGapPx = Number.POSITIVE_INFINITY;
  let maxColumns = 0;
  let namesOnTheWidestChart = 0;
  let worstEndOverhangPx = 0;

  for (const { name, result } of population) {
    const model = buildBurndownModel(result);
    const labels = model.columns.map((c) => c.axisLabel);
    const candidate = axisCandidates(model);
    const printed = thinned
      ? planAxisLabels(labels, candidate, axisInlinePx).printed
      : candidate;
    const gaps = axisLabelSeparations(labels, printed, axisInlinePx);
    const shown = printed.filter(Boolean).length;
    if (model.columns.length > maxColumns) {
      maxColumns = model.columns.length;
      namesOnTheWidestChart = shown;
    }
    const ends = axisEndOverhangPx(labels, printed, axisInlinePx);
    worstEndOverhangPx = Math.max(worstEndOverhangPx, ends.leadingPx, ends.trailingPx);
    let collided = false;
    gaps.forEach((gap, k) => {
      smallestGapPx = Math.min(smallestGapPx, gap);
      if (gap >= AXIS_LABEL_MIN_GAP_PX) return;
      collided = true;
      collidingPairs += 1;
      if (-gap > worstOverlapPx) {
        worstOverlapPx = -gap;
        const shownIdx = labels.map((_, i) => i).filter((i) => printed[i] === true);
        worstOverlapWhere = `${name}: "${labels[shownIdx[k]!]}" then "${labels[shownIdx[k + 1]!]}"`;
      }
    });
    if (collided) scenariosWithACollision += 1;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    scenarios: population.length,
    scenariosWithACollision,
    collidingPairs,
    worstOverlapPx: round(worstOverlapPx),
    worstOverlapWhere,
    smallestGapPx: round(smallestGapPx),
    maxColumns,
    namesOnTheWidestChart,
    worstEndOverhangPx: round(worstEndOverhangPx),
  };
}

describe('axis names/the width model is the browser’s, not a guess', () => {
  it('reproduces five axis names read off a real browser to within 0.05px', () => {
    for (const { text, renderedPx } of AXIS_MODEL_VALIDATION) {
      expect(Math.abs(axisLabelInlinePx(text) - renderedPx)).toBeLessThan(0.05);
    }
  });

  it('reproduces what Chrome drew on the CALCULATOR, where the product’s fonts are loaded', () => {
    // Chrome, 320px, the calculator page: four columns of 37px, each name 27.88px, so 9.12px
    // between them. That is the page's own default scenario and the reading the model is pinned
    // to, because it is the one rendered in IBM Plex Sans.
    const gapsFor = (labels: string[], axisPx: number) =>
      axisLabelSeparations(labels, labels.map(() => true), axisPx).map(
        (g) => Math.round(g * 100) / 100,
      );
    expect(gapsFor(['inst 1', 'inst 2', 'inst 3', 'inst 4'], AXIS_INLINE_CALCULATOR_AT_320)).toEqual(
      [9.12, 9.12, 9.12],
    );
  });

  it('AND SAYS WHY THE PREVIEW HARNESS MEASURES WIDER — it loads none of the fonts', () => {
    // ═══ A DISCREPANCY WORTH KEEPING, BECAUSE IT HAS ALREADY MISLED ONE SESSION ═══
    //
    // The same four-column chart on `/src/ui/burndown-preview.html` at the same 320px viewport
    // measures +0.42px between names where this model says +1.12px. The cause is not the model:
    // `document.fonts.size` is **0** on that page and **42** on the calculator, so the harness
    // renders the fallback (`system-ui`) at the same 11px, and every string comes out wider:
    //
    //   "inst 1"  27.88 → 28.58     "+DoT"  25.89 → 27.25
    //   "inst 16" 34.47 → 34.88     "heal"  21.67 → 22.48     "inst"  18.67 → 19.44
    //
    // The ratios differ per string (1.012 to 1.053), so there is no correction factor — which is
    // why the model is pinned to the SHIPPING face and the harness reading is recorded rather than
    // fitted. An earlier session's `+DoT` overhang figures were taken on that page and are 1.35px
    // wide per label for this reason.
    //
    // THE MARGIN SURVIVES IT ANYWAY, which is the part that matters: the widest fallback name is
    // 0.41px wider than the widest real one, so a pair the rule places 8px apart in the shipping
    // face is at worst ~6.6px apart in the fallback. Still a gap, still legible, and no name is
    // dropped or added by which font loaded.
    const FALLBACK: Record<string, number> = {
      'inst 1': 28.58,
      'inst 16': 34.88,
      '+DoT': 27.25,
      heal: 22.48,
    };
    for (const [text, fallbackPx] of Object.entries(FALLBACK)) {
      const shipping = axisLabelInlinePx(text);
      expect({ text, wider: fallbackPx > shipping, byUnder: fallbackPx - shipping < 1.5 }).toEqual({
        text,
        wider: true,
        byUnder: true,
      });
    }
  });

  it('the vocabulary is closed — every axis name in the roster is one of three shapes', () => {
    // THE WHOLE MODEL RESTS ON THIS. The widths above are browser measurements of three strings,
    // which measures every string the axis can print only for as long as `geometry.ts` writes no
    // fourth shape. A fourth would be sized as `inst NN` and drawn as something else.
    const unknown = new Set<string>();
    for (const { result } of [...P1, ...P2, ...P3]) {
      for (const column of buildBurndownModel(result).columns) {
        if (!axisNameIsKnown(column.axisLabel)) unknown.add(column.axisLabel);
      }
    }
    expect([...unknown]).toEqual([]);
  });
});

/**
 * ═══ BEFORE — ONE NAME PER COLUMN, WHICH IS WHAT THE AXIS DID ═══
 *
 * Every figure below is still computed, from the same populations, by the same functions. It is
 * the counterfactual: what comes back if `planAxisLabels` stops being called. `collidingPairs`
 * counts adjacent printed pairs closer than `AXIS_LABEL_MIN_GAP_PX` (8px), so a pair 2px apart is
 * counted even though its two names do not literally touch — two names 2px apart read as one.
 */
const AXIS_BEFORE: Record<string, AxisCensus> = {};
const AXIS_AFTER: Record<string, AxisCensus> = {};

describe('axis names/BEFORE — what one name per column does', () => {
  for (const [label, population, axisPx] of [
    ['P1 on the calculator', P1, AXIS_INLINE_CALCULATOR_AT_320],
    ['P1 on the preview harness', P1, AXIS_INLINE_PREVIEW_AT_320],
    ['P3 on the calculator', P3, AXIS_INLINE_CALCULATOR_AT_320],
    ['P3 on the preview harness', P3, AXIS_INLINE_PREVIEW_AT_320],
  ] as const) {
    it(`${label}: the census`, () => {
      const c = axisCensus(population, axisPx, false);
      AXIS_BEFORE[label] = c;
      // Reported, not asserted against a pinned number: these are what the fix is measured
      // against, and the assertions that matter are in the AFTER block.
      expect(c.scenarios).toBeGreaterThan(0);
      console.warn(`  BEFORE ${label}: ${JSON.stringify(c)}`);
    });
  }
});

describe('axis names/AFTER — first, last and every nth', () => {
  for (const [label, population, axisPx] of [
    ['P1 on the calculator', P1, AXIS_INLINE_CALCULATOR_AT_320],
    ['P1 on the preview harness', P1, AXIS_INLINE_PREVIEW_AT_320],
    ['P2 on the calculator', P2, AXIS_INLINE_CALCULATOR_AT_320],
    ['P2 on the preview harness', P2, AXIS_INLINE_PREVIEW_AT_320],
    ['P3 on the calculator', P3, AXIS_INLINE_CALCULATOR_AT_320],
    ['P3 on the preview harness', P3, AXIS_INLINE_PREVIEW_AT_320],
  ] as const) {
    it(`${label}: no two printed names are closer than 8px`, () => {
      const c = axisCensus(population, axisPx, true);
      AXIS_AFTER[label] = c;
      console.warn(`  AFTER  ${label}: ${JSON.stringify(c)}`);
      expect({ label, pairs: c.collidingPairs, scenarios: c.scenariosWithACollision }).toEqual({
        label,
        pairs: 0,
        scenarios: 0,
      });
    });
  }

  it('the chart is not thinned — the column count is identical either way', () => {
    // The one way a label rule could reach zero collisions dishonestly is by drawing fewer
    // columns. Both censuses see the same charts, so both report the same maxima.
    for (const label of Object.keys(AXIS_BEFORE)) {
      expect({ label, columns: AXIS_AFTER[label]!.maxColumns }).toEqual({
        label,
        columns: AXIS_BEFORE[label]!.maxColumns,
      });
    }
  });

  it('an end name never reaches past the plot’s own padding', () => {
    // The first and last names are centred on columns 9.25px wide, so they overhang the axis.
    // `.burn__plot` pads `--space-4` (16px) on both sides and the axis is inset 56px from the
    // leading edge for the y-axis rail, so an overhang under 16px cannot reach the panel edge.
    for (const [label, c] of Object.entries(AXIS_AFTER)) {
      expect({ label, fits: c.worstEndOverhangPx < 16 }).toEqual({ label, fits: true });
    }
  });

  it('THE DEFAULT SCENARIO KEEPS ALL FOUR OF ITS NAMES at the narrowest width', () => {
    // The rule must not thin a chart that has room. Four columns of 37px against names of
    // 27.88px: 35.88px of pitch required, 37px available, 1.12px of headroom.
    const model = buildBurndownModel(P1[0]!.result);
    const labels = model.columns.map((c) => c.axisLabel);
    const plan = planAxisLabels(labels, axisCandidates(model), AXIS_INLINE_CALCULATOR_AT_320);
    expect(labels).toEqual(['inst 1', 'inst 2', 'inst 3', 'inst 4']);
    expect(plan.stride).toBe(1);
    expect(plan.printed).toEqual([true, true, true, true]);
  });

  it('and thins the same scenario on the 32px-narrower preview harness — n comes from width', () => {
    // THE SAME CHART, THE SAME VIEWPORT, A DIFFERENT ANSWER. This is the case a breakpoint cannot
    // reach: 116px of axis leaves 29px per column against the same 35.88px requirement, so n is 2
    // and the middle names go. Nothing about the viewport changed between this test and the one
    // above.
    const model = buildBurndownModel(P1[0]!.result);
    const labels = model.columns.map((c) => c.axisLabel);
    const plan = planAxisLabels(labels, axisCandidates(model), AXIS_INLINE_PREVIEW_AT_320);
    expect(plan.stride).toBe(2);
    expect(labels.filter((_, i) => plan.printed[i])).toEqual(['inst 1', 'inst 4']);
  });

  it('THE `+DoT` NAME IS NEVER THE ONE DROPPED, on any chart in the roster', () => {
    // SPECIFICATION §3.8's second verdict hangs on a reader seeing where the burst ends and the
    // tail begins. It is anchored by NAME rather than by position, so this holds however the
    // column is ordered — and the same clause anchors `heal`.
    let charts = 0;
    for (const { name, result } of [...P2, ...P3]) {
      const model = buildBurndownModel(result);
      const labels = model.columns.map((c) => c.axisLabel);
      const dot = labels.indexOf('+DoT');
      if (dot === -1) continue;
      charts += 1;
      for (const axisPx of [AXIS_INLINE_CALCULATOR_AT_320, AXIS_INLINE_PREVIEW_AT_320]) {
        const plan = planAxisLabels(labels, axisCandidates(model), axisPx);
        expect({ name, axisPx, dotPrinted: plan.printed[dot] }).toEqual({
          name,
          axisPx,
          dotPrinted: true,
        });
      }
    }
    // The population is real: 27 ability components carry `overTime`, so this is not vacuous.
    expect(charts).toBeGreaterThan(20);
  });

  it('THE LAST NAME IS NEVER DROPPED — and "last" means the last NAME, not the last column', () => {
    // A basic attack's riders are columns with no name of their own, so a chart can end with
    // three columns the grouping rule has already blanked. Anchoring the last COLUMN would anchor
    // a column that prints nothing and leave the final moment's name free to be dropped. Measured
    // over the roster: charts whose last column is not a candidate are the ordinary case in P3.
    let endsOnABlankedColumn = 0;
    for (const { name, result } of [...P2, ...P3]) {
      const model = buildBurndownModel(result);
      const labels = model.columns.map((c) => c.axisLabel);
      const candidate = axisCandidates(model);
      const last = candidate.lastIndexOf(true);
      if (last !== labels.length - 1) endsOnABlankedColumn += 1;
      for (const axisPx of [AXIS_INLINE_CALCULATOR_AT_320, AXIS_INLINE_PREVIEW_AT_320]) {
        const plan = planAxisLabels(labels, candidate, axisPx);
        expect({ name, axisPx, lastPrinted: plan.printed[last] }).toEqual({
          name,
          axisPx,
          lastPrinted: true,
        });
      }
    }
    expect(endsOnABlankedColumn).toBeGreaterThan(0);
  });

  it('and the difference between the two readings of "last", stated as a case', () => {
    // THE ROSTER DOES NOT DISCRIMINATE BETWEEN THEM TODAY — the assertion above passes under both
    // readings, which is worth saying rather than leaving a test that looks stronger than it is.
    // The two part only when the last CANDIDATE is crowded by the name before it, so that case is
    // written out: six columns of 20px, names 27.88px wide, and the last two columns blanked by a
    // group. Anchoring the last COLUMN anchors a column that prints nothing, and `inst 5` — the
    // final moment on the chart — is dropped for sitting 20px from `inst 4`.
    const labels = ['inst 1', 'inst 2', 'inst 3', 'inst 4', 'inst 5', 'inst 6'];
    const candidate = [true, false, false, true, true, false];
    const plan = planAxisLabels(labels, candidate, 120);
    expect(labels.filter((_, i) => plan.printed[i])).toEqual(['inst 1', 'inst 5']);
  });

  it('the worst chart a reader can build: 16 columns, and what it prints', () => {
    const worst = P3.map(({ result }) => buildBurndownModel(result)).sort(
      (a, b) => b.columns.length - a.columns.length,
    )[0]!;
    const labels = worst.columns.map((c) => c.axisLabel);
    expect(labels).toHaveLength(16);
    const plan = planAxisLabels(
      labels,
      axisCandidates(worst),
      AXIS_INLINE_CALCULATOR_AT_320,
    );
    // 148px / 16 = 9.25px a column; the widest name is `inst 16` at 34.47px, so 42.47px of pitch
    // is required and n is 5. The grouping rule has already blanked 9 of the 16, and the thinning
    // takes what is left down to names that clear 8px of each other.
    expect(plan.stride).toBe(5);
    expect(axisCensus([{ name: 'worst', result: P3[0]!.result }], 148, true).collidingPairs).toBe(0);
    // WHAT IT ACTUALLY PRINTS, AND WHY IT IS THREE NAMES RATHER THAN FOUR. The grouping rule
    // leaves candidates at 0,1,2,3,4,10,15 — the first five instances stand alone and the rest are
    // bracketed under three basic attacks — so the positions are clumped rather than evenly
    // spread. From `inst 1` the next candidate that clears 42.47px is `inst 11` at 92.5px;
    // `inst 5` sits 37px along and misses by 5.47px. 148px of axis has room for at most
    // ⌊148 / 42.47⌋ = 3 names of this width, so three is the room rather than a shortfall.
    expect(labels.filter((_, i) => plan.printed[i])).toEqual(['inst 1', 'inst 11', '+DoT']);
  });

  it('IT REALLY IS "EVERY nth" — the rule and the stride agree where every column is a candidate', () => {
    // The ruling's own words are "the first, the last, and every nth in between". The rule is
    // implemented as a pitch test rather than a modulo, so this is what says the two are the same
    // thing wherever the grouping rule has not blanked anything: over every column count from 2 to
    // 16 and both axis widths, the printed set is exactly `0, n, 2n, …` plus the last column.
    for (const axisPx of [AXIS_INLINE_CALCULATOR_AT_320, AXIS_INLINE_PREVIEW_AT_320]) {
      for (let columns = 2; columns <= 16; columns += 1) {
        const labels = Array.from({ length: columns }, (_, i) => `inst ${i + 1}`);
        const plan = planAxisLabels(labels, labels.map(() => true), axisPx);
        const printed = labels.map((_, i) => i).filter((i) => plan.printed[i]);
        const strided = labels
          .map((_, i) => i)
          .filter((i) => i % plan.stride === 0 || i === columns - 1);
        // The one permitted difference is the tail: a strided name too close to the LAST column is
        // dropped, because the last is an anchor and never yields. Everything before it matches.
        expect({ axisPx, columns, printed: printed.filter((i) => i !== columns - 1) }).toEqual({
          axisPx,
          columns,
          printed: strided
            .filter((i) => i !== columns - 1)
            .filter((i) => (columns - 1 - i) * (axisPx / columns) >= axisRequiredPitchPx(labels)),
        });
      }
    }
  });

  it('an unmeasured axis prints every name — a chart nobody has measured is never thinned', () => {
    const labels = ['inst 1', 'inst 2', 'inst 3', '+DoT'];
    const plan = planAxisLabels(labels, labels.map(() => true), 0);
    expect(plan.printed).toEqual([true, true, true, true]);
  });
});
