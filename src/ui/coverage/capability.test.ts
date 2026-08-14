// THE CAPABILITY FIGURES ARE RE-DERIVED HERE, ON EVERY RUN.
//
// `capability.json` is committed so the pages can print it at first paint. A committed derived
// file that nobody recomputes is a hand-typed file with extra steps, so this recomputes all of it
// from the published data and the engine's own read population, and fails if one figure has moved.
//
// ═══ WHY IT MATTERS MORE THAN A STALENESS CHECK ═══
//
// These figures are CAPABILITY claims, and a capability claim ages in the dangerous direction. An
// ability count going stale makes the site's own record wrong. A capability count going stale makes
// the site say a mechanic is not modelled when it now is, or — much worse — that one is modelled
// when it has been withdrawn. A reader plans around the second and never finds out.
//
// ═══ THERE IS NO GENERATOR SCRIPT, AND THAT IS A GAP, NOT A DESIGN ═══
//
// `coverage.json` is written by `scripts/site/build-coverage.ts`. This file has no counterpart
// there because `scripts/` belongs to another area. So on a mismatch this test PRINTS the JSON to
// paste, rather than leaving a maintainer to work out twenty figures by hand. The right home for
// the writer is `scripts/site/build-coverage.ts`, alongside the coverage one.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import committed from './capability.json';
import {
  summariseCapability,
  itemEffectsAddUp,
  burnsAddUp,
  statesAPerTickFigure,
  type CapabilityInputs,
  DEFENSIVE_APPLIED_MEASURED,
} from './capability';
import { BURN_TRIGGERS } from '../../engine/simulate';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));

/**
 * Does the catalogue the calculator actually runs against carry defensive entries?
 *
 * Read from `src/ui/app/App.tsx`, which is where the one catalogue a visitor's browser uses is
 * built. It belongs to another area and is READ ONLY here. The day somebody adds the lookup, this
 * flips and the committed `defensiveApplied` figure goes red — which is the point: the page must
 * not keep saying "none of them is applied" after they are.
 */
function defensiveEffectsReachTheCalculator(): boolean {
  const app = readFileSync(join(REPO, 'src/ui/app/App.tsx'), 'utf8');
  const call = app.slice(app.indexOf('buildCatalogue('));
  return /(^|[^.\w])defensiveEffects\s*:/.test(call.slice(0, call.indexOf('});')));
}

function derive(): ReturnType<typeof summariseCapability> {
  const abilityDir = join(REPO, 'public/data/abilities');
  const abilities = readdirSync(abilityDir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(readFileSync(join(abilityDir, f), 'utf8')).abilities);

  const curated = read('curated/curated-data.json');
  const input: CapabilityInputs = {
    patch: read('public/data/manifest.json').patch,
    itemEffects: read('public/data/item-effects.json').itemEffects,
    burnTriggers: BURN_TRIGGERS,
    runesPublished: read('public/data/runes.json').runes.length,
    runeEffectsCurated: curated.runes.length,
    defensiveEffects: curated.defensiveEffects,
    defensiveEffectsReachTheCalculator: defensiveEffectsReachTheCalculator(),
    // The engine's own number, not the ready count — see DEFENSIVE_APPLIED_MEASURED.
    defensiveAppliedMeasured: DEFENSIVE_APPLIED_MEASURED,
    abilities,
  };
  return summariseCapability(input);
}

describe('capability/the committed figures match the data and the engine', () => {
  it('recomputes every figure and gets the same answer', () => {
    const fresh = derive();
    // If this fails, paste what it prints into capability.json AND update the sentences on the
    // landing page and /checks/ that state the figure. A number moving usually means a claim moved.
    expect(fresh, `capability.json is stale. Current:\n${JSON.stringify(fresh, null, 2)}`).toEqual(
      committed,
    );
  });

  it('the item deliveries account for every stored effect, with none left over', () => {
    expect(itemEffectsAddUp(committed)).toBe(true);
    expect(
      committed.itemRiders +
        committed.itemActives +
        committed.itemBurns +
        committed.itemEffectsWithNoStatedDelivery,
    ).toBe(committed.itemEffectsStored);
    expect(committed.itemOnHit + committed.itemSpellblade).toBe(committed.itemRiders);
  });

  it('every burn is either firing or named as unable to, with none unaccounted for', () => {
    // The failure this prevents: a burn that quietly falls through both arms and appears nowhere,
    // so the page's burn figures no longer add to the burn population while all looking plausible.
    expect(burnsAddUp(committed)).toBe(true);
  });

  it('is counting real populations, so it cannot pass by finding nothing', () => {
    expect(committed.itemEffectsStored).toBeGreaterThan(0);
    expect(committed.runesPublished).toBeGreaterThan(0);
    expect(committed.defensiveStored).toBeGreaterThan(0);
    expect(committed.perTickComponents).toBeGreaterThan(0);
    expect(committed.patch).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('capability/the summariser refuses what it does not understand', () => {
  const base = {
    patch: '16.16.1',
    burnTriggers: new Map<number, 'ability-damage' | 'not-stated'>(),
    runesPublished: 0,
    runeEffectsCurated: 0,
    defensiveEffects: [],
    defensiveEffectsReachTheCalculator: false,
    abilities: [],
  };

  it('THROWS on an item delivery it has no arm for', () => {
    expect(() =>
      summariseCapability({
        ...base,
        itemEffects: [{ itemId: 1, appliesAs: 'telepathy', verification: 'derived' }],
      }),
    ).toThrow(/unknown item delivery/);
  });

  it('counts an effect with no stated delivery rather than dropping it', () => {
    const c = summariseCapability({
      ...base,
      itemEffects: [{ itemId: 1, verification: 'derived' }],
    });
    expect(c.itemEffectsWithNoStatedDelivery).toBe(1);
    expect(itemEffectsAddUp(c)).toBe(true);
  });

  it('a burn with a tick count but no stated trigger does not count as firing', () => {
    // Malignance and Zeke's Convergence are the live cases. Both state how much and how often and
    // neither says what sets it off, so firing them would assert they always happen.
    const c = summariseCapability({
      ...base,
      itemEffects: [
        {
          itemId: 3118,
          appliesAs: 'periodic',
          verification: 'derived',
          overTime: { totalInstances: 12 },
          components: [{}],
        },
      ],
      burnTriggers: new Map([[3118, 'not-stated']]),
    });
    expect([c.itemBurnsThatFire, c.itemBurnsWithNoStatedTrigger]).toEqual([0, 1]);
  });

  it('a burn with a stated trigger but no tick count does not count as firing either', () => {
    const c = summariseCapability({
      ...base,
      itemEffects: [
        { itemId: 9, appliesAs: 'periodic', verification: 'derived', components: [{}] },
      ],
      burnTriggers: new Map([[9, 'ability-damage']]),
    });
    expect([c.itemBurnsThatFire, c.itemBurnsWithNoTickCount]).toEqual([0, 1]);
  });

  it('reads "per tick" from the label, and does not mistake other hit counts for it', () => {
    // The two shapes are the same field and opposite meanings: "per Tick" recurs over time, "per
    // Arrow" and "per Wave" land at once and belong in burst.
    expect(statesAPerTickFigure('Magic Damage per Tick')).toBe(true);
    expect(statesAPerTickFigure('Physical Damage per Arrow')).toBe(false);
    expect(statesAPerTickFigure('Magic Damage per Wave')).toBe(false);
    expect(statesAPerTickFigure(null)).toBe(false);
  });

  it('a defensive entry is only ready if it states a number, is complete, and has a step', () => {
    const c = summariseCapability({
      ...base,
      itemEffects: [],
      defensiveEffects: [
        { kind: 'shield', verification: 'derived', value: { perRank: [10] } }, // ready
        { kind: 'heal', verification: 'incomplete', value: { perRank: [10] } }, // incomplete
        { kind: 'immunity', verification: 'derived', value: { perRank: [1] } }, // no engine step
        { kind: 'heal', verification: 'derived' }, // states no number
      ],
    });
    expect([c.defensiveStored, c.defensiveReadyToApply]).toEqual([4, 1]);
  });

  it('NOTHING DEFENSIVE IS APPLIED while the calculator is never given the entries', () => {
    // The trap this closes: reporting the ready count as if it were the applied count. 90 entries
    // being ready says nothing about whether one has ever changed a result.
    const ready = { kind: 'shield', verification: 'derived', value: { perRank: [10] } };
    expect(
      summariseCapability({ ...base, itemEffects: [], defensiveEffects: [ready] }).defensiveApplied,
    ).toBe(0);
    expect(
      summariseCapability({
        ...base,
        itemEffects: [],
        defensiveEffects: [ready],
        defensiveEffectsReachTheCalculator: true,
      }).defensiveApplied,
    ).toBe(1);
  });
});
