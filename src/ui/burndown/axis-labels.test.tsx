// @vitest-environment jsdom
//
// THE X AXIS, RENDERED — AND THE SIXTEEN INSTANCES A SCREEN READER STILL HEARS.
//
// ═══ WHY THIS FILE EXISTS SEPARATELY FROM `label-collision.test.ts` ═══
//
// That file is the ARITHMETIC: it runs `planAxisLabels` over the whole roster and asserts no two
// printed names land closer than 8px. It renders nothing. This file is the WIRING — that the
// component measures its own axis, asks that function, and draws what it answers — and the one
// assertion the ruling called the most important: **sixteen columns, all sixteen announced.**
//
// ═══ WHAT JSDOM CAN AND CANNOT SAY HERE ═══
//
// jsdom loads no stylesheet and computes no layout: `getBoundingClientRect()` returns zeroes for
// everything. So the measured width is STUBBED here, and what that proves is the wiring — given a
// width, the component prints the names the rule chooses. It is NOT evidence about what Chrome
// draws; that half was measured in a real browser and the readings are written down in
// `label-collision.test.ts` above the axis census.
//
// The zero-width case is not a gap in the test, it is a behaviour: an axis nobody has measured
// prints every name, so a chart can never be thinned by a measurement that failed.

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ChampionConfig, ComboStep, Result, Scenario } from '../../types';
import { MOCK_RESULT } from '../../types';
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
import { startingConfig } from '../app/App';
import { HpBurndown } from './HpBurndown';
import { buildBurndownModel } from './geometry';

/** jsdom implements no `matchMedia`; the chart is rendered in its settled state throughout. */
function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

/**
 * Give the axis element a width, the way the browser would.
 *
 * Everything else keeps jsdom's zeroes — only `.burn__xaxis` is measured by the component, so
 * only `.burn__xaxis` needs a figure. Installed BEFORE `render`, because the component measures in
 * a layout effect, which is exactly where a browser would measure it: before the first paint.
 */
function measureAxisAt(px: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const width = this.classList?.contains('burn__xaxis') ? px : 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() {} };
  });
}

const names = () =>
  [...document.querySelectorAll('.burn__xname')].map((n) => n.textContent);

beforeEach(() => setReducedMotion(true));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('axis names/the component asks the rule and draws the answer', () => {
  it('prints every name when nothing has been measured', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(names()).toEqual(['inst 1', 'inst 2', 'inst 3', 'inst 4', 'inst 5', '+DoT']);
  });

  it('thins to the first, the last and every nth on a 116px axis', () => {
    // Six columns of 19.33px against names 27.88px wide: 35.88px of pitch required, so n is 2 —
    // and the pair that would sit either side of `+DoT` yields to it, because `+DoT` is an anchor.
    measureAxisAt(116);
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(names()).toEqual(['inst 1', 'inst 3', '+DoT']);
  });

  it('prints all six on a 480px axis — a wide chart is never thinned', () => {
    measureAxisAt(480);
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(names()).toEqual(['inst 1', 'inst 2', 'inst 3', 'inst 4', 'inst 5', '+DoT']);
  });

  it('KEEPS A TICK PER COLUMN, so a thinned axis reads as six columns and not as three', () => {
    // DESIGN.md §6's own means: brightness and weight, never hue. Every column keeps a mark; the
    // mark under a printed name is the taller steel one, the rest are hairlines. An axis that
    // silently dropped its labels would be a table silently dropping rows.
    measureAxisAt(116);
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    expect(container.querySelectorAll('.burn__xtick')).toHaveLength(6);
    expect(container.querySelectorAll('.burn__xtick--named')).toHaveLength(3);
  });

  it('the names it keeps are the ones the rule chose — not the first three', () => {
    measureAxisAt(116);
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    const printed = [...container.querySelectorAll('.burn__xlabel')].map((l) =>
      l.querySelector('.burn__xname') ? l.textContent : null,
    );
    expect(printed).toEqual(['inst 1', null, 'inst 3', null, null, '+DoT']);
  });

  it('THE AXIS IS OUT OF THE ACCESSIBILITY TREE AT EVERY WIDTH, thinned or not', () => {
    measureAxisAt(116);
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    expect(container.querySelector('.burn__xaxis')!.getAttribute('aria-hidden')).toBe('true');
    // And the risers still say everything: six columns, six names, none of them shortened.
    expect(screen.getAllByRole('button')).toHaveLength(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SIXTEEN COLUMNS, ON REAL DATA
//
// The worst chart a reader can assemble: a champion at level 18 holding the five items whose
// effects RIDE on a basic attack, running Q → W → E → R → basic → basic. Each rider is its own
// column, so six steps become sixteen columns of 9.25px on a 148px axis.
//
// It is simulated through the real engine against the published catalogue rather than assembled
// as a fixture, because the thing under test is what the ROSTER produces — a fixture would carry
// the column shape somebody expected rather than the one the engine writes.
// ═══════════════════════════════════════════════════════════════════════════════════════════

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
const catalogue = buildCatalogue({
  champions: roster,
  items,
  abilities,
  itemEffects: itemEffectsById(await loadItemEffects(fetchPublished)),
});

/** The five items in the pool whose effects ride on a basic attack rather than being a step. */
const RIDER_ITEMS = [3115, 3124, 3091, 3153, 3078];

function maxed(apiname: string, itemIds: number[]): ChampionConfig {
  const champion = roster.find((c) => c.apiname === apiname)!;
  return {
    ...startingConfig(apiname),
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

const RIDER_COMBO: ComboStep[] = [
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'w1', kind: 'ability', ref: 'W' },
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'r1', kind: 'ability', ref: 'R' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
  { id: 'aa2', kind: 'basic-attack', ref: 'basic' },
];

const scenario: Scenario = {
  version: 2,
  attacker: maxed('Alistar', RIDER_ITEMS),
  defender: { ...maxed('Garen', []), apiname: 'Garen' },
  combo: RIDER_COMBO,
};
const outcome = simulate(scenario, catalogue);
const SIXTEEN: Result = outcome.ok ? outcome.result : (null as never);

describe('axis names/sixteen columns', () => {
  it('the scenario really does produce sixteen columns', () => {
    // If this ever stops being true the two assertions below are measuring something else, so it
    // is stated first rather than assumed.
    expect(outcome.ok).toBe(true);
    expect(buildBurndownModel(SIXTEEN).columns).toHaveLength(16);
  });

  it('ALL SIXTEEN ARE ANNOUNCED, however few names the axis prints', () => {
    // ═══ THE ASSERTION THIS WHOLE CHANGE IS MEASURED BY ═══
    //
    // The thinning is VISUAL. Every column keeps its riser, and every riser keeps the whole
    // sentence `riserName` builds for it — the same rule DESIGN.md §4b states for the riser
    // labels below the breakpoint: moving or thinning a label is a visual answer to a visual
    // problem, and it must not shorten what a screen reader hears.
    measureAxisAt(148);
    render(<HpBurndown result={SIXTEEN} />);
    const spoken = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')!);
    expect(spoken).toHaveLength(16);
    // Fifteen instances in order, then the damage-over-time tail — which is the sixteenth column
    // and the one the axis's `+DoT` name is about. Sixteen columns, sixteen spoken names, and the
    // axis printed three of them.
    expect(spoken.map((s) => s.split('.')[0])).toEqual([
      ...Array.from({ length: 15 }, (_, i) => `Instance ${i + 1}`),
      'Damage over time, after the combo',
    ]);
    // And each one still carries what it did and what health it left, not just a number.
    expect(spoken.every((s) => /of \d/.test(s))).toBe(true);
  });

  it('while the axis prints three names and sixteen ticks', () => {
    measureAxisAt(148);
    const { container } = render(<HpBurndown result={SIXTEEN} />);
    expect(names()).toEqual(['inst 1', 'inst 11', '+DoT']);
    expect(container.querySelectorAll('.burn__xtick')).toHaveLength(16);
  });
});
