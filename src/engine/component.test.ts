// Known-answer tests for the component evaluator — the layer that turns ONE stored
// `AbilityComponent` into a pre-mitigation damage number.
//
// EVERY EXPECTED VALUE BELOW WAS COMPUTED BY HAND from the documented formula and written
// out, step by step, in the comment above the assertion. Nothing here was obtained by running
// the engine. Where the arithmetic is not exact in binary floating point the assertion uses
// toBeCloseTo with an explicit precision, never a tolerance chosen to make a number fit.
//
// THE TWO FORMULAS UNDER TEST, AND WHERE THEY COME FROM
// ----------------------------------------------------
// 1. The progression rule — how `X to Y` becomes a value at a rank or a level — is NOT
//    reimplemented here. It lives once, in src/types/scaling.ts, read from
//    `Module:Ability progression` on wiki.leagueoflegends.com (2026-08-12). The expected
//    values below apply that published rule by hand:
//        value(x) = from + (to - from) / (steps - 1) * (x - 1)
//
// 2. The composition rule — a component's damage is its flat base plus each ratio's
//    percentage of the stat it names:
//        perHit = base + Σ (ratioPercent / 100) × statValue
//    Sources, both read 2026-08-13:
//      https://wiki.leagueoflegends.com/en-us/Attack_damage
//        "Effects may benefit from (scale off of) a percentage/ratio, of base AD, bonus AD,
//         or total AD."  and  "Total attack damage refers to base plus bonus attack damage."
//      https://wiki.leagueoflegends.com/en-us/Ability_power
//        "Effects may benefit from (scale off of) a percentage/ratio, of the total amount
//         of AP."  and  "Ability power stacks additively".
//
// 3. Multiplicity: `hits` is documented in the frozen contract (src/types/data.ts) as
//    "Number of times this component lands in one cast … One entry with a count, not N
//    copies", so the whole component — base and ratios together — lands that many times.
//    DATA-SOURCES §30 fix 1 confirms the arithmetic the harvester derives counts with:
//    a per-tick figure times the tick count equals the source's stated total
//    (Cassiopeia Q, 7 ticks).

import { describe, it, expect } from 'vitest';
import {
  evaluateComponent,
  unsupportedReasons,
  ComponentEvaluationError,
  type ComponentContext,
} from './component';
import { casterStats, component, flat, linear, perRank, ratio } from './fixtures';

/** A context with no caster stats at all — for cases where only the base matters. */
function context(over: Partial<ComponentContext> = {}): ComponentContext {
  return {
    rank: 1,
    maxRank: 5,
    level: 1,
    caster: casterStats({}),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Family S2 — a flat base and exactly one AD or AP ratio.
// 634 of the 930 stored damage components (DATA-SOURCES §19, measured over 937 distinct
// ability pages after alias dedupe, damage rows only, summary and non-champion rows dropped).
// ---------------------------------------------------------------------------

describe('S2 — flat base plus one ratio', () => {
  const luxLike = component({
    id: 'q-magic-damage',
    damageType: 'magic',
    base: linear(80, 240), // {{ap|80 to 240}} across 5 ranks
    ratios: [ratio('AP', flat(75))], // (+ 75% AP)
  });

  it('resolves a rank-3-of-5 base plus a 75% AP ratio to 310', () => {
    // Base, by the published progression rule, from = 80, to = 240, steps = 5, x = 3:
    //   80 + (240 - 80) / (5 - 1) * (3 - 1) = 80 + 40 * 2 = 160
    // Ratio: 75% of 200 ability power = 0.75 * 200 = 150
    // perHit = 160 + 150 = 310, hits = 1 (absent), raw = 310
    const result = evaluateComponent(
      luxLike,
      context({ rank: 3, maxRank: 5, caster: casterStats({ abilityPower: 200 }) }),
    );
    expect(result.base).toBe(160);
    expect(result.ratios).toHaveLength(1);
    expect(result.ratios[0]!.stat).toBe('AP');
    expect(result.ratios[0]!.statValue).toBe(200);
    expect(result.ratios[0]!.damage).toBe(150);
    expect(result.perHit).toBe(310);
    expect(result.hits).toBe(1);
    expect(result.raw).toBe(310);
  });

  it('resolves both endpoints of the same component: 230 at rank 1, 390 at rank 5', () => {
    // rank 1: base 80  + 0.75 * 200 = 80 + 150  = 230
    // rank 5: base 240 + 0.75 * 200 = 240 + 150 = 390
    const stats = casterStats({ abilityPower: 200 });
    expect(evaluateComponent(luxLike, context({ rank: 1, caster: stats })).raw).toBe(230);
    expect(evaluateComponent(luxLike, context({ rank: 5, caster: stats })).raw).toBe(390);
  });

  it('carries the component id and damage type through untouched', () => {
    const result = evaluateComponent(luxLike, context({ rank: 1 }));
    expect(result.componentId).toBe('q-magic-damage');
    expect(result.damageType).toBe('magic');
  });

  it('reads a ratio that itself scales per rank, rather than treating it as flat', () => {
    // 183 measured ratios scale per rank (DATA-SOURCES §18). Reading this one as a flat 100%
    // would understate rank 2 by 10 percentage points of the caster's total attack damage.
    // Base:  20 + (100 - 20) / 4 * (2 - 1) = 20 + 20 = 40
    // Ratio: 100 + (140 - 100) / 4 * (2 - 1) = 110 percentage points
    //        total AD = 60 base + 190 bonus = 250 ; 1.10 * 250 = 275
    // perHit = 40 + 275 = 315
    const darius = component({
      base: linear(20, 100),
      ratios: [ratio('totalAD', linear(100, 140))],
    });
    const result = evaluateComponent(
      darius,
      context({ rank: 2, caster: casterStats({ baseAD: 60, bonusAD: 190 }) }),
    );
    expect(result.base).toBe(40);
    expect(result.ratios[0]!.percent).toBe(110);
    expect(result.ratios[0]!.damage).toBe(275);
    expect(result.raw).toBe(315);
  });

  it('uses an explicit per-rank list verbatim instead of interpolating it', () => {
    // A list is stored precisely because the progression is NOT an even line
    // (src/types/data.ts, `explicit`). [100, 100, 250] at rank 2 is 100, not 175.
    // rank 2: 100 + 0.50 * 90 bonus AD = 100 + 45 = 145
    // rank 3: 250 + 45 = 295
    const kayleLike = component({
      base: perRank([100, 100, 250]),
      ratios: [ratio('bonusAD', flat(50))],
    });
    const stats = casterStats({ baseAD: 60, bonusAD: 90 });
    expect(evaluateComponent(kayleLike, context({ rank: 2, maxRank: 3, caster: stats })).raw).toBe(
      145,
    );
    expect(evaluateComponent(kayleLike, context({ rank: 3, maxRank: 3, caster: stats })).raw).toBe(
      295,
    );
  });

  it('treats baseAD, bonusAD and totalAD as three different stats', () => {
    // This is the trap the wiki warns about by naming all three separately. With
    // base 60 / bonus 100 / total 160, one 50% ratio gives three different answers:
    //   baseAD  : 0.5 * 60  = 30
    //   bonusAD : 0.5 * 100 = 50
    //   totalAD : 0.5 * 160 = 80
    const stats = casterStats({ baseAD: 60, bonusAD: 100 });
    const withRatio = (stat: 'baseAD' | 'bonusAD' | 'totalAD') =>
      evaluateComponent(
        component({ base: flat(0), ratios: [ratio(stat, flat(50))] }),
        context({ caster: stats }),
      ).raw;
    expect(withRatio('baseAD')).toBe(30);
    expect(withRatio('bonusAD')).toBe(50);
    expect(withRatio('totalAD')).toBe(80);
  });

  it('sums two core ratios additively (family S3, 103 components)', () => {
    // "Ability power stacks additively" and AD ratios likewise: the two contributions are
    // added, never multiplied together.
    // Base 100 ; 60% of 200 AP = 120 ; 40% of 150 bonus AD = 60 ; total 100 + 120 + 60 = 280
    const both = component({
      base: flat(100),
      ratios: [ratio('AP', flat(60)), ratio('bonusAD', flat(40))],
    });
    const result = evaluateComponent(
      both,
      context({ caster: casterStats({ abilityPower: 200, bonusAD: 150 }) }),
    );
    expect(result.ratios.map((r) => r.damage)).toEqual([120, 60]);
    expect(result.raw).toBe(280);
  });

  it('keeps full precision — the evaluator never rounds', () => {
    // Rounding happens once, at the reporting boundary, in rounding.ts (SPECIFICATION §3.7).
    // Base: 10 + (100 - 10) / 4 * (2 - 1) = 10 + 22.5 = 32.5
    // Ratio: 33% of 1 ability power = 0.33
    // perHit = 32.83 — and NOT 33.
    const result = evaluateComponent(
      component({ base: linear(10, 100), ratios: [ratio('AP', flat(33))] }),
      context({ rank: 2, caster: casterStats({ abilityPower: 1 }) }),
    );
    expect(result.raw).toBeCloseTo(32.83, 10);
    expect(Number.isInteger(result.raw)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multiplicity — `hits`.
// ---------------------------------------------------------------------------

describe('hits — multiplicity within one cast', () => {
  const perTick = component({
    base: flat(15),
    ratios: [ratio('AP', flat(10))],
    hits: 7,
  });

  it('multiplies the whole component, base and ratio alike, by the hit count', () => {
    // perHit = 15 + 0.10 * 100 AP = 15 + 10 = 25
    // raw    = 25 * 7 = 175
    // Storing one tick as the whole ability is defect class 1 of DATA-SOURCES §29, measured
    // at 64 components at risk; this is the arithmetic that fixes it.
    const result = evaluateComponent(perTick, context({ caster: casterStats({ abilityPower: 100 }) }));
    expect(result.perHit).toBe(25);
    expect(result.hits).toBe(7);
    expect(result.raw).toBe(175);
  });

  it('reports per-hit and total separately, so a breakdown can show "25 x 7"', () => {
    // Written this way on purpose. Asserting `perHit * hits === raw` would hold even for an
    // engine that ignored the stored count entirely (1 x 25 = 25), so it is asserted against
    // the hand-computed pair instead: 25 per landing, 175 for the cast.
    const result = evaluateComponent(perTick, context({ caster: casterStats({ abilityPower: 100 }) }));
    expect(result.perHit).toBe(25);
    expect(result.raw).toBe(175);
    expect(result.raw).not.toBe(result.perHit);
  });

  it('treats an absent hit count as exactly one', () => {
    // Same component with `hits` removed: 15 + 10 = 25, once.
    const once = component({ base: flat(15), ratios: [ratio('AP', flat(10))] });
    const result = evaluateComponent(once, context({ caster: casterStats({ abilityPower: 100 }) }));
    expect(result.hits).toBe(1);
    expect(result.raw).toBe(25);
  });

  it('refuses a hit count that is zero, negative or fractional', () => {
    // A component that lands 0 or 2.5 times is a defect in the stored data, not a number to
    // guess at. Refusing is loud; silently coercing it to 1 would understate the ability.
    for (const bad of [0, -1, 2.5]) {
      const broken = component({ base: flat(15), hits: bad });
      expect(() => evaluateComponent(broken, context())).toThrow(ComponentEvaluationError);
    }
  });
});

// ---------------------------------------------------------------------------
// The two level-scaled Scaling arms.
// 38 stored components have a level-scaled base (DATA-SOURCES §19: "stored component whose
// base is byLevel/byLevelExplicit").
// ---------------------------------------------------------------------------

describe('level-scaled bases and ratios', () => {
  // The worked example recorded in the frozen contract (src/types/data.ts) for the wiki's
  // `{{pp|60 to 100 for 3|1 to 13}}`: three values, at levels 1, 7 and 13, being 60, 80, 100.
  // Level positions come from the same interpolation rule: 1 + (13 - 1) / (3 - 1) * (2 - 1) = 7.
  const headshotLike = component({
    base: { scaling: 'byLevel', from: 60, to: 100, atLevels: [1, 13], steps: 3 },
  });

  it('holds the value of the highest breakpoint at or below the champion level', () => {
    // levels 1-6  -> 60 ; levels 7-12 -> 80 ; levels 13-18 -> 100
    const at = (level: number) => evaluateComponent(headshotLike, context({ level })).raw;
    expect(at(1)).toBe(60);
    expect(at(6)).toBe(60);
    expect(at(7)).toBe(80);
    expect(at(12)).toBe(80);
    expect(at(13)).toBe(100);
    expect(at(18)).toBe(100);
  });

  it('ignores ability rank entirely when the base is level-scaled', () => {
    // A level-scaled component does not scale by rank at all — 95 measured damage sources
    // are innate passives that have no rank (src/types/data.ts). Same level, different rank,
    // same answer.
    const atRank1 = evaluateComponent(headshotLike, context({ level: 9, rank: 1 })).raw;
    const atRank5 = evaluateComponent(headshotLike, context({ level: 9, rank: 5 })).raw;
    expect(atRank1).toBe(80);
    expect(atRank5).toBe(80);
  });

  it('reads a level-scaled RATIO sitting on a rank-scaled base', () => {
    // byLevelExplicit: literal values at literal levels — 10% at level 1, 20% at 6, 30% at 11.
    // At level 8 the highest breakpoint at or below is level 6, so 20%.
    //   base 30 (flat) + 0.20 * 150 bonus AD = 30 + 30 = 60
    // At level 11: 30 + 0.30 * 150 = 30 + 45 = 75
    // At level 5 : 30 + 0.10 * 150 = 30 + 15 = 45
    const apheliosLike = component({
      base: flat(30),
      ratios: [
        ratio('bonusAD', {
          scaling: 'byLevelExplicit',
          values: [10, 20, 30],
          atLevels: [1, 6, 11],
        }),
      ],
    });
    const stats = casterStats({ bonusAD: 150 });
    expect(evaluateComponent(apheliosLike, context({ level: 8, caster: stats })).raw).toBe(60);
    expect(evaluateComponent(apheliosLike, context({ level: 11, caster: stats })).raw).toBe(75);
    expect(evaluateComponent(apheliosLike, context({ level: 5, caster: stats })).raw).toBe(45);
  });

  it('resolves a rank-scaled base and a level-scaled ratio on their own axes at once', () => {
    // Base by RANK: 40 + (200 - 40) / 4 * (4 - 1) = 40 + 120 = 160
    // Ratio by LEVEL: 20% at level 8 (breakpoint 6)  ; 0.20 * 150 = 30
    // perHit = 190
    const mixed = component({
      base: linear(40, 200),
      ratios: [
        ratio('bonusAD', {
          scaling: 'byLevelExplicit',
          values: [10, 20, 30],
          atLevels: [1, 6, 11],
        }),
      ],
    });
    const result = evaluateComponent(
      mixed,
      context({ rank: 4, level: 8, caster: casterStats({ bonusAD: 150 }) }),
    );
    expect(result.base).toBe(160);
    expect(result.ratios[0]!.damage).toBe(30);
    expect(result.raw).toBe(190);
  });
});

// ---------------------------------------------------------------------------
// What this evaluator REFUSES, and why refusing is the point.
//
// Every refusal below is a case where returning a number would return a WRONG number that
// looks itemised and complete. Silently dropping a ratio understates an ability; guessing
// whose stat it reads can double or halve it (DATA-SOURCES §16). The refusals are also
// available without throwing, as `unsupportedReasons`, so the same rule can be run across a
// whole ability list to count the population it excludes.
// ---------------------------------------------------------------------------

describe('refusals — a component this evaluator cannot resolve is never partially resolved', () => {
  it('refuses a health-pool ratio rather than returning the base alone', () => {
    // 106 stored ratios scale off a health pool (DATA-SOURCES §19, S6). Resolving them needs
    // the TARGET's stat block, which this function is not given. Dropping the ratio would
    // return a plausible, itemised, far-too-small number.
    const belvethLike = component({
      base: flat(0),
      ratios: [ratio('missingHP', flat(20), { owner: 'target' })],
    });
    expect(() => evaluateComponent(belvethLike, context())).toThrow(ComponentEvaluationError);
    expect(unsupportedReasons(belvethLike).join(' ')).toContain('missingHP');
  });

  it('refuses a ratio carrying a per-100 multiplier (the coefficient shape, §17)', () => {
    // `10-20% (+ 2.5% per 100 AP) of target's maximum health` — the multiplier raises the
    // ratio's own magnitude. 34 abilities / 53 damage rows carry one. The contract can hold
    // it (RatioMultiplier) but this evaluator does not resolve it, so it refuses.
    const withMultiplier = component({
      base: flat(0),
      ratios: [
        ratio('AP', flat(75), {
          multipliers: [{ per: 'bonusHP', owner: 'caster', per100: flat(0.4) }],
        }),
      ],
    });
    expect(() => evaluateComponent(withMultiplier, context())).toThrow(ComponentEvaluationError);
    expect(unsupportedReasons(withMultiplier).join(' ')).toContain('multiplier');
  });

  it("refuses a core ratio marked as reading the TARGET's attack damage or ability power", () => {
    // The contract states these four stats "belong to whoever cast the ability and have no
    // second reading" (src/types/data.ts). A stored `owner: 'target'` on one contradicts the
    // contract, so it is a defect to surface rather than a value to resolve.
    const wrongOwner = component({
      base: flat(0),
      ratios: [ratio('AP', flat(75), { owner: 'target' })],
    });
    expect(() => evaluateComponent(wrongOwner, context())).toThrow(ComponentEvaluationError);
  });

  it('refuses a stack-counter ratio, which needs the scenario\'s persistent state', () => {
    // 1 stored component scales off a stack counter (DATA-SOURCES §19, S9). The count comes
    // from ChampionConfig.persistent (SPECIFICATION §3.3), which this function is not given.
    const nasusLike = component({
      base: flat(0),
      ratios: [ratio('stacks', flat(100), { counter: 'nasusQ' })],
    });
    expect(() => evaluateComponent(nasusLike, context())).toThrow(ComponentEvaluationError);
  });

  it('refuses a rank outside the ability\'s own rank count', () => {
    const fiveRank = component({ base: linear(80, 240) });
    expect(() => evaluateComponent(fiveRank, context({ rank: 6, maxRank: 5 }))).toThrow(
      ComponentEvaluationError,
    );
  });

  it('refuses an explicit list whose length disagrees with the ability\'s rank count', () => {
    // A wrong rank count does not fail loudly by itself — it silently moves every middle
    // value (DATA-SOURCES §11, §22). Here it is made to fail loudly.
    const threeValues = component({ base: perRank([100, 200, 300]) });
    expect(() => evaluateComponent(threeValues, context({ rank: 1, maxRank: 5 }))).toThrow(
      ComponentEvaluationError,
    );
  });

  it('names EVERY reason a component is unsupported, not just the first', () => {
    // The population check: run this over a list of abilities and it tells you how many
    // components this evaluator cannot take, and why, without evaluating any of them.
    const messy = component({
      base: flat(10),
      hits: 0,
      ratios: [
        ratio('maxHP', flat(8), { owner: 'target' }),
        ratio('AP', flat(75), { multipliers: [{ per: 'AP', per100: flat(2.5) }] }),
      ],
    });
    const reasons = unsupportedReasons(messy);
    expect(reasons).toHaveLength(3);
    expect(reasons.join(' ')).toContain('maxHP');
    expect(reasons.join(' ')).toContain('multiplier');
    expect(reasons.join(' ')).toContain('hits');
  });

  it('returns no reasons at all for a component it can take', () => {
    const fine = component({ base: linear(80, 240), ratios: [ratio('AP', flat(75))] });
    expect(unsupportedReasons(fine)).toEqual([]);
  });

  it('accepts a core ratio explicitly owned by the caster, which is merely redundant', () => {
    // 'caster' on an AD/AP ratio says nothing the contract does not already say. It is not a
    // defect, so it is not refused.
    const redundant = component({
      base: flat(0),
      ratios: [ratio('AP', flat(50), { owner: 'caster' })],
    });
    expect(unsupportedReasons(redundant)).toEqual([]);
    expect(evaluateComponent(redundant, context({ caster: casterStats({ abilityPower: 80 }) })).raw)
      .toBe(40);
  });
});

// ---------------------------------------------------------------------------
// What the evaluator deliberately does NOT do.
// ---------------------------------------------------------------------------

describe('boundaries of this layer', () => {
  it('evaluates an alternative component exactly as it evaluates an adding one', () => {
    // `relation` says how a component COMBINES with its siblings, not what it is worth.
    // Choosing between alternatives is an ability-level decision and is not built (see the
    // coverage report): a single component's own value is the same either way.
    const alternative = component({
      id: 'handle',
      base: flat(100),
      relation: { kind: 'alternativeTo', componentId: 'blade' },
    });
    const adding = component({ id: 'blade', base: flat(100), relation: { kind: 'adds' } });
    expect(evaluateComponent(alternative, context()).raw).toBe(100);
    expect(evaluateComponent(adding, context()).raw).toBe(100);
  });

  it('applies no resistance, no crit and no rounding — raw damage only', () => {
    // The figure this returns is pre-mitigation (Result.raw, src/types/result.ts). Every
    // later step is a separate, already-tested function.
    const result = evaluateComponent(
      component({ base: flat(100), ratios: [ratio('AP', flat(50))] }),
      context({ caster: casterStats({ abilityPower: 101 }) }),
    );
    // 100 + 0.50 * 101 = 100 + 50.5 = 150.5, unrounded and unmitigated.
    expect(result.raw).toBe(150.5);
  });
});
