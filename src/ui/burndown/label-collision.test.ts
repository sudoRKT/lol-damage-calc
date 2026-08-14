// @vitest-environment node
//
// DO THE RISER LABELS LAND ON TOP OF EACH OTHER ON A PHONE? — MEASURED, 2026-08-14.
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
// heals, because no population above produces one. Not the x-axis labels underneath, which are a
// different element with a different rule — counted below, never collision-checked.

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
import { buildBurndownModel } from './geometry';
import {
  COLS_INLINE_AT_320,
  COLS_INLINE_AT_375,
  LABEL_INSET_PX,
  MODEL_VALIDATION,
  PLOT_BLOCK_PX,
  collisions,
  damageValueInlinePx,
  labelBoxes,
  requiredColumnInlinePx,
  spillPastLeadingEdgePx,
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

function census(population: { name: string; result: Result }[], colsInlinePx: number): Census {
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
    const boxes = labelBoxes(model, colsInlinePx);
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
    // calculator page: `.burn__cols` 148 × 320, two colliding pairs, the worse of them
    // "47 mag" over "43 phys" — 12.27px of horizontal overlap and 9.71px of vertical.
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
    // for a whole group, so is that enough? IT DOES NOT TOUCH THE RISER LABELS. Every column keeps
    // its own damage figure, because that figure is data and the axis label is a caption. On P3's
    // widest scenario the axis prints 7 labels where the plot prints 16 figures in the same 203px.
    // So the grouping is NOT enough on its own, and the gap it leaves is the whole defect.
    const worst = P3.map(({ result }) => buildBurndownModel(result)).sort(
      (a, b) => b.columns.length - a.columns.length,
    )[0]!;
    const axisPrinted = worst.columns.filter((c) => !c.groupId || c.groupIndex === 1).length;
    const riserLabels = worst.columns.filter(
      (c) => (c.damageType && c.damage > 0) || c.segments.length > 0,
    ).length;
    expect(worst.columns).toHaveLength(16);
    expect(axisPrinted).toBe(7);
    expect(riserLabels).toBe(16);
  });
});

/**
 * THE CENSUS — THE SIZE OF THE DEFECT, PINNED.
 *
 * A red suite blocks every merge (SPECIFICATION §14), so a measured-but-unfixed defect is pinned
 * here rather than left failing, in the same device `tests/cross-area-seams.test.ts` uses for
 * known drift: pin the number so that a CHANGE in it is what reports.
 *
 * EVERY `collidingPairs` HERE MUST BECOME 0. They are the before-figures for a fix that has not
 * been made: it needs either a horizontally scrolling plot with a minimum column width, or the
 * labels moved out of the plot below some width — both of which need a length DESIGN.md does not
 * define, and DESIGN.md is the lead's file. `burndown.css` carries the costing.
 *
 * These counts are data-dependent: they are a property of patch 16.16.1 as published, and a patch
 * that changes damage figures will move them. That movement is the report, not a fault — but read
 * `requiredColumnPx` against `actualColumnPx` before concluding anything from a count alone,
 * because those two are pure layout arithmetic and do not move with the data.
 */
const PINNED: Record<string, Census> = {
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
    scenariosWithACollision: 98,
    collidingPairs: 153,
    worstOverlapPx: 15.45,
    worstOverlapWhere: 'Ahri: "110 mag" over "50 phys"',
    maxColumns: 7,
    worstSpillPx: 37.05,
    requiredColumnPx: 70.88,
    actualColumnPx: 29,
  },
  'P2 at 320px': {
    scenarios: 173,
    scenariosWithACollision: 105,
    collidingPairs: 175,
    worstOverlapPx: 19.38,
    worstOverlapWhere: 'Senna: "263 phys" over "23 phys"',
    maxColumns: 7,
    worstSpillPx: 46.21,
    requiredColumnPx: 70.88,
    actualColumnPx: 21.14,
  },
  'P3 at 375px': {
    scenarios: 173,
    scenariosWithACollision: 173,
    collidingPairs: 4296,
    worstOverlapPx: 22.09,
    worstOverlapWhere: 'Ezreal: "28 mag" over "3 phys"',
    maxColumns: 16,
    worstSpillPx: 57.35,
    requiredColumnPx: 76.96,
    actualColumnPx: 12.69,
  },
  'P3 at 320px': {
    scenarios: 173,
    scenariosWithACollision: 173,
    collidingPairs: 4745,
    worstOverlapPx: 22.09,
    worstOverlapWhere: 'Ezreal: "28 mag" over "3 phys"',
    maxColumns: 16,
    worstSpillPx: 61.01,
    requiredColumnPx: 76.96,
    actualColumnPx: 9.25,
  },
};

describe('riser labels/how big the defect is', () => {
  const cases: [string, { name: string; result: Result }[], number][] = [
    ['P1 at 375px', P1, COLS_INLINE_AT_375],
    ['P1 at 320px', P1, COLS_INLINE_AT_320],
    ['P2 at 375px', P2, COLS_INLINE_AT_375],
    ['P2 at 320px', P2, COLS_INLINE_AT_320],
    ['P3 at 375px', P3, COLS_INLINE_AT_375],
    ['P3 at 320px', P3, COLS_INLINE_AT_320],
  ];

  for (const [label, population, cols] of cases) {
    it(`${label}: matches the pinned measurement`, () => {
      expect({ label, ...census(population, cols) }).toEqual({ label, ...PINNED[label]! });
    });
  }

  it('a label needs 76.96px of column and the worst case gives it 9.25px', () => {
    // THE FIGURE A FIX HAS TO CLEAR, measured rather than picked: the widest label in any
    // population is 64.96px ("1 240 mag") and it sits 12px in from its column's trailing edge, so
    // no two labels can touch only if every column is at least 76.96px wide. On DESIGN.md §4a's
    // rule that a layout measure is `--space-8 × n`, the smallest conforming value is 128px.
    // At 375px the plot has 203px, so it would then show ONE full column and part of a second.
    expect(PINNED['P3 at 320px']!.requiredColumnPx).toBeGreaterThan(
      PINNED['P3 at 320px']!.actualColumnPx * 8,
    );
    expect(Math.ceil(PINNED['P3 at 375px']!.requiredColumnPx / 64) * 64).toBe(128);
  });
});
