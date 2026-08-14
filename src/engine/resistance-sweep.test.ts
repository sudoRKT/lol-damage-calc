// Known-answer tests for the DAMAGE-VERSUS-RESISTANCE curve (SPECIFICATION §11).
//
// Every expected number below is the §3.6 formula done by hand:
//
//     positive resistance R:  damage x 100 / (100 + R)
//     negative resistance R:  damage x (2 - 100 / (100 - R))
//     true damage:            unchanged, it meets no resistance at all
//
// and then rounded once, half away from zero (rounding.ts). Nothing here was obtained by
// running the engine, and no champion, item or ability figure comes from a data file — the
// catalogue is hand-authored in fixtures.ts.
//
// The arithmetic, written out once so the numbers below can be checked without a calculator:
//   100 physical against   0 armor = 100 x 1        = 100
//   100 physical against 100 armor = 100 x 100/200  =  50
//   100 physical against 200 armor = 100 x 100/300  =  33.333… -> 33
//   100 physical against -100 armor = 100 x (2 - 100/200) = 150
//   200 magic    against  50 MR    = 200 x 100/150  = 133.333… -> 133

import { describe, it, expect } from 'vitest';
import {
  championConfig,
  comboStep,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  scenario,
  statBlock,
} from './fixtures';
import {
  damageVsResistance,
  damageVsResistanceFromPlan,
  resistanceValues,
} from './resistance-sweep';
import { contiguousSegments } from './sweep';
import type { ComboPlan } from './combo';

// ---------------------------------------------------------------------------------------
// The hand-authored world these tests run in
// ---------------------------------------------------------------------------------------

const ATTACKER = fixtureChampion({ apiname: 'Sweeper', adBase: 60, adPerLevel: 3 });
/** Base armor of 40 so the base/bonus split of a swept value is visible and non-trivial. */
const DEFENDER = fixtureChampion({
  apiname: 'Dummy',
  hpBase: 3000,
  armorBase: 40,
  magicResistBase: 0,
});

const ABILITIES = [
  // Q: 100 physical at rank 1 (the only rank any test below uses).
  fixtureAbility({
    champion: 'Sweeper',
    slot: 'Q',
    damageType: 'physical',
    perRank: [100, 150, 200, 250, 300],
  }),
  // W: 200 magic at rank 1.
  fixtureAbility({
    champion: 'Sweeper',
    slot: 'W',
    damageType: 'magic',
    perRank: [200, 200, 200, 200, 200],
  }),
  // E: 50 true at rank 1 — the control for "true damage meets no resistance".
  fixtureAbility({
    champion: 'Sweeper',
    slot: 'E',
    damageType: 'true',
    perRank: [50, 50, 50, 50, 50],
  }),
  // R: incomplete. Contributes nothing and names why (SPECIFICATION §8).
  fixtureAbility({
    champion: 'Sweeper',
    slot: 'R',
    verification: 'incomplete',
    notes: 'fixture: the damage is stated in prose that has not been read',
  }),
];

const CATALOGUE = fixtureCatalogue({ champions: [ATTACKER, DEFENDER], abilities: ABILITIES });

function comboScenario(refs: string[]) {
  return scenario({
    attacker: championConfig({ apiname: 'Sweeper', level: 1 }),
    defender: championConfig({ apiname: 'Dummy', level: 1 }),
    combo: refs.map((ref, i) => comboStep(`s${i}`, { kind: 'ability', ref })),
  });
}

/** The computed arm of a point, or a failure naming the point that refused. */
function computedAt(series: ReturnType<typeof damageVsResistanceFromPlan>, x: number) {
  const point = series.points.find((p) => p.x === x);
  if (!point) throw new Error(`no point at x=${x}`);
  if (point.status !== 'computed') {
    throw new Error(`point at x=${x} refused: ${point.refusals.map((r) => r.reason).join('; ')}`);
  }
  return point;
}

// ---------------------------------------------------------------------------------------
// The curve itself
// ---------------------------------------------------------------------------------------

describe('damageVsResistance — the armor axis', () => {
  const outcome = damageVsResistance(comboScenario(['Q']), CATALOGUE, {
    axis: 'armor',
    values: [-100, 0, 100, 200],
  });
  if (!outcome.ok) throw new Error('the base scenario refused, which no test here intends');
  const series = outcome.series;

  it('gives 150 / 100 / 50 / 33 for a 100-damage physical ability at -100 / 0 / 100 / 200 armor', () => {
    expect(computedAt(series, -100).summary.burst.total).toBe(150);
    expect(computedAt(series, 0).summary.burst.total).toBe(100);
    expect(computedAt(series, 100).summary.burst.total).toBe(50);
    expect(computedAt(series, 200).summary.burst.total).toBe(33);
  });

  it('states the swept value on every point, in the order it was asked for', () => {
    expect(series.points.map((p) => p.x)).toEqual([-100, 0, 100, 200]);
    expect(series.computedCount).toBe(4);
    expect(series.refusedCount).toBe(0);
  });

  it('holds the defender base armor fixed and moves the BONUS portion', () => {
    // The defender's own base armor at level 1 is 40 (fixture). Reaching a total of 200 is a
    // build carrying 160 bonus armor; reaching 0 requires the bonus portion to be -40, which is
    // what armor reduction does in game.
    expect(computedAt(series, 200).applied.armor).toEqual({ total: 200, base: 40, bonus: 160 });
    expect(computedAt(series, 0).applied.armor).toEqual({ total: 0, base: 40, bonus: -40 });
  });

  it('leaves the magic resistance axis alone', () => {
    expect(computedAt(series, 200).applied.magicResist).toBeUndefined();
  });
});

describe('damageVsResistance — what the axis may not touch', () => {
  it('leaves TRUE damage identical at every armor value (§3.6: it bypasses both)', () => {
    const outcome = damageVsResistance(comboScenario(['E']), CATALOGUE, {
      axis: 'armor',
      values: [0, 100, 300],
    });
    if (!outcome.ok) throw new Error('the base scenario refused');
    for (const x of [0, 100, 300]) {
      expect(computedAt(outcome.series, x).summary.burst.byType.true).toBe(50);
      expect(computedAt(outcome.series, x).summary.burst.total).toBe(50);
    }
  });

  it('leaves MAGIC damage identical at every armor value', () => {
    const outcome = damageVsResistance(comboScenario(['W']), CATALOGUE, {
      axis: 'armor',
      values: [0, 100, 300],
    });
    if (!outcome.ok) throw new Error('the base scenario refused');
    for (const x of [0, 100, 300]) {
      expect(computedAt(outcome.series, x).summary.burst.byType.magic).toBe(200);
    }
  });

  it('leaves PHYSICAL damage identical at every magic-resistance value, to within the ' +
    'documented one-point apportionment', () => {
    const outcome = damageVsResistance(comboScenario(['Q', 'W']), CATALOGUE, {
      axis: 'magicResist',
      values: [0, 50],
    });
    if (!outcome.ok) throw new Error('the base scenario refused');

    // THE ARITHMETIC, IN FULL, AND IT TAKES TWO DOCUMENTED RULES RATHER THAN ONE.
    //
    // §3.6 gives the unrounded figures. Q meets the defender's own 40 base armor at both points:
    //     physical = 100 x 100/140 = 71.4285…  (the same at both points, as it must be)
    //     magic at  0 MR = 200
    //     magic at 50 MR = 200 x 100/150 = 133.3333…
    //
    // rounding.ts then rounds the TOTAL once and divides it among the types by the
    // largest-remainder method, so that the split always sums to the total it is a split of:
    //     at  0 MR: exact total 271.4285… -> 271; floors 71 + 200 = 271; nothing left over
    //               -> physical 71, magic 200
    //     at 50 MR: exact total 204.7619… -> 205; floors 71 + 133 = 204; ONE point left over,
    //               which goes to the largest remainder: physical .4285 beats magic .3333
    //               -> physical 72, magic 133
    //
    // So the physical figure reads 71 at one point and 72 at the other while the physical damage
    // has not changed at all. The naive expectation of 71 at both points applies §3.6 and forgets
    // rounding.ts. THIS IS WHY THE AUDIT'S "an untouched type moved" detector allows one point of
    // movement and flags anything larger (sweep-audit.ts): a per-type series can wobble by a
    // point when the OTHER type changes, and a chart drawing one type alone will show a step that
    // is an apportionment artefact rather than a mechanic.
    expect(computedAt(outcome.series, 0).summary.burst.byType.physical).toBe(71);
    expect(computedAt(outcome.series, 50).summary.burst.byType.physical).toBe(72);
    expect(computedAt(outcome.series, 0).summary.burst.byType.magic).toBe(200);
    expect(computedAt(outcome.series, 50).summary.burst.byType.magic).toBe(133);
    expect(computedAt(outcome.series, 0).summary.burst.total).toBe(271);
    expect(computedAt(outcome.series, 50).summary.burst.total).toBe(205);
  });
});

describe('damageVsResistance — the "both" axis', () => {
  it('applies the swept value to armor AND magic resistance at once', () => {
    const outcome = damageVsResistance(comboScenario(['Q', 'W']), CATALOGUE, {
      axis: 'both',
      values: [100],
    });
    if (!outcome.ok) throw new Error('the base scenario refused');
    const point = computedAt(outcome.series, 100);
    // Q: 100 x 100/200 = 50.  W: 200 x 100/200 = 100.  Total 150.
    expect(point.summary.burst.byType.physical).toBe(50);
    expect(point.summary.burst.byType.magic).toBe(100);
    expect(point.summary.burst.total).toBe(150);
    expect(point.applied.armor?.total).toBe(100);
    expect(point.applied.magicResist?.total).toBe(100);
  });
});

describe('damageVsResistance — the per-type split always sums to its own total', () => {
  it('holds at a value where both types round with a remainder', () => {
    // Q 100 physical and W 200 magic against 200 of both:
    //   physical 100 x 100/300 =  33.333…
    //   magic    200 x 100/300 =  66.666…
    //   exact total            = 100 -> 100, and the split must still read 33 + 67.
    const outcome = damageVsResistance(comboScenario(['Q', 'W']), CATALOGUE, {
      axis: 'both',
      values: [200],
    });
    if (!outcome.ok) throw new Error('the base scenario refused');
    const { burst } = computedAt(outcome.series, 200).summary;
    expect(burst.total).toBe(100);
    expect(burst.byType.physical + burst.byType.magic + burst.byType.true).toBe(burst.total);
    expect(burst.byType.physical).toBe(33);
    expect(burst.byType.magic).toBe(67);
  });
});

// ---------------------------------------------------------------------------------------
// Honesty: what the curve says about what it left out
// ---------------------------------------------------------------------------------------

describe('damageVsResistance — an incomplete ability is named at every point, never dropped', () => {
  const outcome = damageVsResistance(comboScenario(['Q', 'R']), CATALOGUE, {
    axis: 'armor',
    values: [0, 100],
  });
  if (!outcome.ok) throw new Error('the base scenario refused');
  const series = outcome.series;

  it('marks every computed point as PARTIAL and names the contributor', () => {
    for (const x of [0, 100]) {
      const point = computedAt(series, x);
      expect(point.summary.partial).toBe(true);
      expect(point.summary.incompleteContributors).toEqual(['R — Sweeper R']);
      expect(point.summary.verification).toBe('incomplete');
    }
  });

  it('reports the same missing ability at EVERY point rather than at some', () => {
    expect(series.incompleteEverywhere).toEqual(['R — Sweeper R']);
    expect(series.incompleteSetVaries).toBe(false);
  });

  it('still gives the damage the modelled part of the combo dealt', () => {
    expect(computedAt(series, 0).summary.burst.total).toBe(100);
    expect(computedAt(series, 100).summary.burst.total).toBe(50);
  });
});

describe('damageVsResistance — what the series says about itself', () => {
  const outcome = damageVsResistance(comboScenario(['Q']), CATALOGUE, {
    axis: 'armor',
    values: [0, 100],
    include: 'result',
  });
  if (!outcome.ok) throw new Error('the base scenario refused');
  const series = outcome.series;

  it('carries the excluded mechanics rather than leaving them to be looked up (§11)', () => {
    expect(series.excludedMechanics.length).toBeGreaterThan(0);
  });

  it('states the conventions it applied, in words', () => {
    expect(series.notes.some((n) => /base armor/i.test(n))).toBe(true);
    expect(series.notes.some((n) => /Health, level, build and the combo/i.test(n))).toBe(true);
  });

  it('attaches the full Result only when asked, and it carries the swept resistance', () => {
    expect(computedAt(series, 100).result?.defenderStats.armor).toBe(100);
    const withoutResults = damageVsResistance(comboScenario(['Q']), CATALOGUE, {
      axis: 'armor',
      values: [0],
    });
    if (!withoutResults.ok) throw new Error('the base scenario refused');
    expect(computedAt(withoutResults.series, 0).result).toBeUndefined();
  });

  it('names the axis in words', () => {
    expect(series.axisLabel).toBe('target armor');
    expect(computedAt(series, 100).label).toBe('100 armor');
  });
});

// ---------------------------------------------------------------------------------------
// A REFUSED POINT. The whole reason these shapes are unions.
// ---------------------------------------------------------------------------------------

/**
 * A plan carrying percentage BONUS armor penetration, which `simulate` cannot yet produce
 * (item passives and runes are not merged, so `buildStatBlock` writes zero penetration). The
 * plan-level entry point exists so the refusal it causes is testable at all.
 */
function bonusPenetrationPlan(): ComboPlan {
  return {
    patch: 'fixture',
    scenario: scenario({
      attacker: championConfig({ apiname: 'Sweeper' }),
      defender: championConfig({ apiname: 'Dummy' }),
      combo: [comboStep('s0', { kind: 'ability', ref: 'Q' })],
    }),
    attacker: statBlock({
      attackDamage: { base: 60, bonus: 0, total: 60 },
      penetration: {
        flatArmor: 0,
        percentArmor: 0,
        percentBonusArmor: 0.4,
        flatMagic: 0,
        percentMagic: 0,
      },
    }),
    defender: statBlock({ hp: 3000, maxHp: 3000, armor: 40, armorBase: 40, armorBonus: 0 }),
    instances: [
      {
        stepId: 's0',
        sourceLabel: 'Q — Sweeper Q',
        instanceType: 'damaging-ability',
        verification: 'derived',
        damage: {
          components: [
            {
              id: 'q1',
              damageType: 'physical',
              base: { scaling: 'explicit', perRank: [100] },
              ratios: [],
            },
          ],
          rank: 1,
          maxRank: 1,
        },
      },
    ],
  };
}

describe('damageVsResistance — a point that cannot be modelled REFUSES', () => {
  const series = damageVsResistanceFromPlan(bonusPenetrationPlan(), {
    axis: 'armor',
    values: [100, 0],
  });

  it('computes the point where the bonus portion is positive', () => {
    // 40 base + 60 bonus; 40% bonus penetration leaves 40 + 36 = 76 effective armor.
    // 100 x 100/176 = 56.818… -> 57.
    expect(computedAt(series, 100).summary.burst.total).toBe(57);
  });

  it('refuses the point whose bonus portion would be negative, and says why', () => {
    const point = series.points.find((p) => p.x === 0)!;
    expect(point.status).toBe('refused');
    if (point.status !== 'refused') throw new Error('unreachable');
    expect(point.refusals).toHaveLength(1);
    expect(point.refusals[0]!.reason).toMatch(/percentage bonus armor penetration/i);
  });

  it('carries NO damage figure on the refused point at all', () => {
    const point = series.points.find((p) => p.x === 0)!;
    // The refused arm has no `summary` key whatsoever — not a zero, not a null. A renderer
    // reading `point.summary.burst.total` gets undefined and a type error, rather than a 0
    // that would draw as a real data point.
    expect('summary' in point).toBe(false);
    expect(series.refusedCount).toBe(1);
    expect(series.computedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------
// Segmentation — the mechanism that stops a renderer drawing through a hole
// ---------------------------------------------------------------------------------------

describe('contiguousSegments — a refused point breaks the line rather than being skipped', () => {
  it('does not begin the line at a leading refusal', () => {
    const series = damageVsResistanceFromPlan(bonusPenetrationPlan(), {
      axis: 'armor',
      // Sorted ascending: 0 and 30 refuse (base armor is 40, so the bonus portion is negative),
      // 100 and 200 compute.
      values: [100, 0, 200, 30],
      sort: true,
    });
    expect(series.points.map((p) => p.x)).toEqual([0, 30, 100, 200]);
    const segments = contiguousSegments(series);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.map((p) => p.x)).toEqual([100, 200]);
  });
});

// ---------------------------------------------------------------------------------------
// The range helper
// ---------------------------------------------------------------------------------------

describe('resistanceValues', () => {
  it('walks from..to inclusive by step', () => {
    expect(resistanceValues(0, 100, 25)).toEqual([0, 25, 50, 75, 100]);
  });

  it('includes the final value when the step does not divide the range evenly', () => {
    expect(resistanceValues(0, 30, 20)).toEqual([0, 20, 30]);
  });

  it('refuses a step of zero or less rather than looping forever', () => {
    expect(() => resistanceValues(0, 100, 0)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------
// A scenario the catalogue cannot answer refuses WHOLESALE — there is no series to draw
// ---------------------------------------------------------------------------------------

describe('damageVsResistance — a scenario the catalogue cannot answer', () => {
  it('returns no series at all, and names the missing champion', () => {
    const outcome = damageVsResistance(
      scenario({
        attacker: championConfig({ apiname: 'NotInCatalogue' }),
        defender: championConfig({ apiname: 'Dummy' }),
        combo: [],
      }),
      CATALOGUE,
      { axis: 'armor', values: [0, 100] },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.refusals[0]!.path).toBe('attacker.apiname');
    expect('series' in outcome).toBe(false);
  });
});
