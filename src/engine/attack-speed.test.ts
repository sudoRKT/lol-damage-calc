// KNOWN-ANSWER TESTS FOR ATTACK SPEED.
//
// ═══ WHERE EVERY EXPECTED NUMBER BELOW COMES FROM ═══
//
// One source, read on 2026-08-15: https://wiki.leagueoflegends.com/en-us/Attack_speed
// Quoted in full where it matters, because the whole point of this file is that the numbers were
// taken from the article and not from what the engine returns.
//
//   "Let: b be the unit's base attack speed, m be the unit's attack speed ratio, x be the sum of
//    all attack speed bonuses on the unit, y be the unit's total attack speed. Then the total
//    attack speed is calculated through the equation y=mx+b"
//
//   "The growth coefficient (gained by leveling up) which is uniquely considered bonus attack
//    speed."
//
//   "Most champions' base attack speed and attack speed ratio are equal, meaning m can be replaced
//    with b, resulting in the equation y=b(x+1)"
//
//   "The maximum attack speed that units can have is precisely 3.003, or 1 basic attack per 0.333
//    seconds. The minimum attack speed that units can have is precisely 0.2, or 1 basic attack per
//    5 seconds."
//
// THE ARTICLE'S OWN WORKED EXAMPLE, which two tests below reproduce digit for digit:
//
//   Twisted Fate, base attack speed 0.625, attack speed ratio 0.651, growth coefficient 2.5%.
//   "At level 10, he would have gained 2.5% × 9 × (0.7025 + 0.0175 × 9) = 19.35% bonus attack
//    speed." With his other bonuses the example totals 112.35% and finishes:
//   "0.625 + 0.65100002288818 × 112.35 ÷ 100 ≈ 1.3563985257149".
//
// Those two champion figures are used here because they appear INSIDE the mechanics article's
// worked example, which CLAUDE.md names as the second source of authority. Nothing in this file
// reads `public/data/`, `/curated/` or Data Dragon, and the example's three item bonuses are not
// used individually — only the 112.35% total the article itself states, minus the 19.35% it
// attributes to levelling, leaving 93 percentage points from everything else.
//
// EVERY OTHER FIXTURE BELOW IS INVENTED. A champion with base 0.5 and ratio 0.5 is a round number
// chosen so the arithmetic can be checked on paper, not any champion in the game.

import { describe, expect, it } from 'vitest';

import {
  ATTACK_SPEED_MAXIMUM,
  ATTACK_SPEED_MINIMUM,
  bonusAttackSpeedFromLevel,
  resolveAttackSpeed,
} from './attack-speed.ts';
import { growthMultiplier } from './champion-stats.ts';
import { simulate, SIMULATION_EXCLUSIONS } from './simulate.ts';
import {
  championConfig,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  fixtureItem,
  scenario as makeScenario,
} from './fixtures.ts';
import type { StatBlock } from '../types/result.ts';

// ---------------------------------------------------------------------------------------
// The growth term — the whole of the defect this file was written for
// ---------------------------------------------------------------------------------------

describe('attack speed gained from levelling', () => {
  it('is nothing at level 1', () => {
    // The growth bracket is (n - 1) * (0.7025 + 0.0175 * (n - 1)), which is 0 at level 1.
    expect(bonusAttackSpeedFromLevel(2.74, 1)).toBe(0);
  });

  it("reproduces the article's own figure: 2.5% growth at level 10 is 19.35% bonus", () => {
    // Quoted: "2.5% × 9 × (0.7025 + 0.0175 × 9) = 19.35%".
    // By hand: 0.7025 + 0.1575 = 0.86; 9 × 0.86 = 7.74; 2.5 × 7.74 = 19.35 percentage points.
    // This function returns a FRACTION, so 19.35% is 0.1935.
    expect(bonusAttackSpeedFromLevel(2.5, 10)).toBeCloseTo(0.1935, 10);
  });

  it('is exactly 17 growths at level 18, the identity the growth bracket is checked against', () => {
    // growthMultiplier(18) is exactly 17, so a 2.74% growth is 2.74 × 17 = 46.58 percentage
    // points = 0.4658 as a fraction.
    expect(growthMultiplier(18)).toBeCloseTo(17, 10);
    expect(bonusAttackSpeedFromLevel(2.74, 18)).toBeCloseTo(0.4658, 10);
  });

  it('uses the SAME non-linear bracket as every other per-level statistic', () => {
    // Not a separate formula. The article's own expansion is growth × the identical bracket, so a
    // level-10 champion has 7.74 growths of attack speed just as it has 7.74 growths of health.
    for (const level of [2, 5, 9, 13, 17, 18]) {
      expect(bonusAttackSpeedFromLevel(3, level)).toBeCloseTo(0.03 * growthMultiplier(level), 12);
    }
  });

  it('is zero for a champion whose growth coefficient is zero', () => {
    // Two champions in the shipped roster have no attack speed growth at all. Nothing special
    // happens to them: the term is simply 0.
    expect(bonusAttackSpeedFromLevel(0, 18)).toBe(0);
  });

  it('refuses a level outside 1..18 rather than extrapolating', () => {
    expect(() => bonusAttackSpeedFromLevel(2.5, 0)).toThrow(RangeError);
    expect(() => bonusAttackSpeedFromLevel(2.5, 19)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------
// The total — y = mx + b, not b(x + 1)
// ---------------------------------------------------------------------------------------

describe('total attack speed', () => {
  it("matches the article's Twisted Fate worked example to seven decimal places", () => {
    // x = 112.35% = 1.1235, of which 19.35 points come from level 10 and 93 points from the
    // example's other bonuses. y = 0.625 + 0.651 × 1.1235.
    // By hand: 0.651 × 1.1235 = 0.7313985; 0.625 + 0.7313985 = 1.3563985.
    // The article prints 1.3563985257149, its trailing digits coming from a ratio stored as
    // 0.65100002288818 rather than 0.651.
    const resolved = resolveAttackSpeed({
      base: 0.625,
      ratio: 0.651,
      growthPercentPerLevel: 2.5,
      level: 10,
      bonusFromSources: 0.93,
    });
    expect(resolved.bonus).toBeCloseTo(1.1235, 10);
    expect(resolved.total).toBeCloseTo(1.3563985, 7);
  });

  it('is NOT base × (1 + bonus) when the ratio differs from the base', () => {
    // The same worked example, computed the way this engine computed it until 2026-08-15:
    // 0.625 × (1 + 1.1235) = 0.625 × 2.1235 = 1.3271875. That is 0.029211 lower than the
    // article's answer, and it is wrong for every champion whose ratio is not its base.
    const resolved = resolveAttackSpeed({
      base: 0.625,
      ratio: 0.651,
      growthPercentPerLevel: 2.5,
      level: 10,
      bonusFromSources: 0.93,
    });
    expect(resolved.total).not.toBeCloseTo(1.3271875, 5);
    expect(resolved.total - 1.3271875).toBeCloseTo(0.029211, 6);
  });

  it('collapses to base × (1 + bonus) when ratio and base are equal, as most champions are', () => {
    // "Most champions' base attack speed and attack speed ratio are equal, meaning m can be
    // replaced with b, resulting in the equation y=b(x+1)". Base 0.6, ratio 0.6, x = 0.5:
    // 0.6 + 0.6 × 0.5 = 0.9, which is also 0.6 × 1.5.
    const resolved = resolveAttackSpeed({
      base: 0.6,
      ratio: 0.6,
      growthPercentPerLevel: 0,
      level: 1,
      bonusFromSources: 0.5,
    });
    expect(resolved.total).toBeCloseTo(0.9, 12);
    expect(resolved.total).toBeCloseTo(0.6 * 1.5, 12);
  });

  it('is the base alone at level 1 with no items', () => {
    // x = 0, so y = m × 0 + b = b. Invented figures: base 0.658, ratio 0.658, growth 2.74.
    const resolved = resolveAttackSpeed({
      base: 0.658,
      ratio: 0.658,
      growthPercentPerLevel: 2.74,
      level: 1,
      bonusFromSources: 0,
    });
    expect(resolved.total).toBe(0.658);
  });

  it('RISES WITH LEVEL ON ITS OWN, with no item involved — the defect this file exists for', () => {
    // Invented figures shaped like a real champion's: base 0.658, ratio 0.658, growth 2.74%.
    // At level 18: x = 0.4658, y = 0.658 + 0.658 × 0.4658 = 0.658 + 0.3064964 = 0.9644964.
    // The engine reported 0.658 at every level until this was written.
    const atOne = resolveAttackSpeed({
      base: 0.658, ratio: 0.658, growthPercentPerLevel: 2.74, level: 1, bonusFromSources: 0,
    });
    const atEighteen = resolveAttackSpeed({
      base: 0.658, ratio: 0.658, growthPercentPerLevel: 2.74, level: 18, bonusFromSources: 0,
    });
    expect(atEighteen.total).toBeCloseTo(0.9644964, 10);
    expect(atEighteen.total).toBeGreaterThan(atOne.total);
  });

  it('scales the LEVEL growth by the ratio too, not by the base', () => {
    // The growth is bonus attack speed, and every bonus is multiplied by m. For a champion whose
    // ratio exceeds its base, levelling is therefore worth more than base × growth.
    // Base 0.625, ratio 0.651, growth 2.5%, level 18: x = 0.425, y = 0.625 + 0.651 × 0.425
    // = 0.625 + 0.276675 = 0.901675. Scaling the growth by the base instead would give
    // 0.625 + 0.625 × 0.425 = 0.890625.
    const resolved = resolveAttackSpeed({
      base: 0.625, ratio: 0.651, growthPercentPerLevel: 2.5, level: 18, bonusFromSources: 0,
    });
    expect(resolved.bonus).toBeCloseTo(0.425, 10);
    expect(resolved.total).toBeCloseTo(0.901675, 10);
    expect(resolved.total).not.toBeCloseTo(0.890625, 5);
  });

  it('gives a ratio of zero no benefit from any bonus at all', () => {
    // y = 0 × x + b = b. One champion in the shipped roster is stored this way — the fetcher's
    // bounds evidence records "Jhin is 0 by design" for the ratio and "Jhin's attack speed is
    // fixed by his kit" for the growth (scripts/fetch/bounds.ts, read 2026-08-15). Under the old
    // arithmetic a build handed him 300% attack speed anyway.
    const resolved = resolveAttackSpeed({
      base: 0.625, ratio: 0, growthPercentPerLevel: 0, level: 18, bonusFromSources: 2,
    });
    expect(resolved.total).toBe(0.625);
  });

  it('sums every bonus into one x before multiplying, rather than multiplying each separately', () => {
    // x is "the sum of all attack speed bonuses on the unit". Level growth of 0.4658 plus items
    // of 0.4 is one bonus of 0.8658: y = 0.658 + 0.658 × 0.8658 = 0.658 + 0.5696964 = 1.2276964.
    const resolved = resolveAttackSpeed({
      base: 0.658, ratio: 0.658, growthPercentPerLevel: 2.74, level: 18, bonusFromSources: 0.4,
    });
    expect(resolved.bonus).toBeCloseTo(0.8658, 10);
    expect(resolved.total).toBeCloseTo(1.2276964, 10);
  });
});

// ---------------------------------------------------------------------------------------
// The two caps
// ---------------------------------------------------------------------------------------

describe('the attack speed caps', () => {
  it('are the two figures the article states precisely', () => {
    expect(ATTACK_SPEED_MAXIMUM).toBe(3.003);
    expect(ATTACK_SPEED_MINIMUM).toBe(0.2);
  });

  it('holds a build over the ceiling at exactly 3.003', () => {
    // base 0.658, ratio 0.658, growth 2.74%, level 18, 400% from items.
    // x = 0.4658 + 4 = 4.4658; 0.658 × 4.4658 = 2.9384964; y = 3.5964964 before the cap.
    const resolved = resolveAttackSpeed({
      base: 0.658, ratio: 0.658, growthPercentPerLevel: 2.74, level: 18, bonusFromSources: 4,
    });
    expect(resolved.uncapped).toBeCloseTo(3.5964964, 10);
    expect(resolved.total).toBe(3.003);
    expect(resolved.capped).toBe('maximum');
  });

  it('applies the ceiling to the TOTAL, after level and items, not to either part', () => {
    // The article states the limit as what "units can have", i.e. on y. Base 3.0 is impossible in
    // game, so the check is the other way round: a total that lands just under the ceiling is left
    // alone. 0.5 + 0.5 × 5 = 3.0, which is below 3.003 and must not be touched.
    const resolved = resolveAttackSpeed({
      base: 0.5, ratio: 0.5, growthPercentPerLevel: 0, level: 1, bonusFromSources: 5,
    });
    expect(resolved.total).toBe(3);
    expect(resolved.capped).toBe(null);
  });

  it('holds a build under the floor at exactly 0.2', () => {
    // A slow large enough to take the total negative: 0.5 + 0.5 × (-2) = -0.5.
    const resolved = resolveAttackSpeed({
      base: 0.5, ratio: 0.5, growthPercentPerLevel: 0, level: 1, bonusFromSources: -2,
    });
    expect(resolved.uncapped).toBeCloseTo(-0.5, 12);
    expect(resolved.total).toBe(0.2);
    expect(resolved.capped).toBe('minimum');
  });

  it('leaves a slowed total that is still above the floor alone', () => {
    // 0.5 + 0.5 × (-0.5) = 0.25, which is above 0.2.
    const resolved = resolveAttackSpeed({
      base: 0.5, ratio: 0.5, growthPercentPerLevel: 0, level: 1, bonusFromSources: -0.5,
    });
    expect(resolved.total).toBeCloseTo(0.25, 12);
    expect(resolved.capped).toBe(null);
  });
});

// ---------------------------------------------------------------------------------------
// End to end: the figure a user is actually shown in the stat panel
// ---------------------------------------------------------------------------------------
//
// The arithmetic above is only worth having if the stat block uses it. These run a scenario
// through `simulate` and read `Result.attackerStats.attackSpeed` — the exact field the interface
// prints. Every champion below is invented; the shape of the first one (a base equal to its ratio,
// with a growth coefficient near the middle of the roster's stated 0–6 range) is the shape the
// defect was worst for.

/** An attacker and a defender, with the attacker's attack-speed figures stated. */
function statsFor(opts: {
  level: number;
  asBase: number;
  asPerLevel: number;
  asRatio: number;
  items?: number[];
  itemAttackSpeed?: number;
}): { attacker: StatBlock; defender: StatBlock } {
  const outcome = simulate(
    makeScenario({
      attacker: championConfig({ apiname: 'Striker', level: opts.level, items: opts.items ?? [] }),
      defender: championConfig({ apiname: 'Warden', level: opts.level }),
      combo: [],
    }),
    fixtureCatalogue({
      champions: [
        fixtureChampion({
          apiname: 'Striker',
          asBase: opts.asBase,
          asPerLevel: opts.asPerLevel,
          asRatio: opts.asRatio,
        }),
        fixtureChampion({
          apiname: 'Warden',
          asBase: opts.asBase,
          asPerLevel: opts.asPerLevel,
          asRatio: opts.asRatio,
        }),
      ],
      abilities: [fixtureAbility({ champion: 'Striker', slot: 'Q' })],
      items:
        opts.itemAttackSpeed !== undefined
          ? [fixtureItem(1, 'Attack Speed Fixture', { PercentAttackSpeedMod: opts.itemAttackSpeed })]
          : [],
    }),
  );
  if (!outcome.ok) throw new Error(`scenario refused: ${JSON.stringify(outcome.refusals)}`);
  return { attacker: outcome.result.attackerStats, defender: outcome.result.defenderStats };
}

describe('the attack speed on the stat block', () => {
  it('is the base figure at level 1 with no items', () => {
    const { attacker } = statsFor({ level: 1, asBase: 0.658, asPerLevel: 2.74, asRatio: 0.658 });
    expect(attacker.attackSpeed).toBe(0.658);
  });

  it('IS HIGHER AT LEVEL 18 THAN AT LEVEL 1 — the live defect, stated as a number', () => {
    // base 0.658, ratio 0.658, growth 2.74%: at 18, x = 0.4658 and
    // y = 0.658 + 0.658 × 0.4658 = 0.9644964.
    // The engine printed 0.658 here until 2026-08-15 — 31.8% below the true figure.
    const { attacker } = statsFor({ level: 18, asBase: 0.658, asPerLevel: 2.74, asRatio: 0.658 });
    expect(attacker.attackSpeed).toBeCloseTo(0.9644964, 10);
  });

  it('rises at every level in between, never in one step at 18', () => {
    let previous = 0;
    for (let level = 1; level <= 18; level += 1) {
      const { attacker } = statsFor({ level, asBase: 0.658, asPerLevel: 2.74, asRatio: 0.658 });
      expect(attacker.attackSpeed).toBeGreaterThan(previous);
      previous = attacker.attackSpeed;
    }
  });

  it('adds an item bonus to the level growth, in one sum', () => {
    // x = 0.4658 + 0.4; y = 0.658 + 0.658 × 0.8658 = 1.2276964.
    const { attacker } = statsFor({
      level: 18, asBase: 0.658, asPerLevel: 2.74, asRatio: 0.658,
      items: [1], itemAttackSpeed: 0.4,
    });
    expect(attacker.attackSpeed).toBeCloseTo(1.2276964, 10);
  });

  it("reproduces the article's worked example through the whole engine", () => {
    // base 0.625, ratio 0.651, growth 2.5%, level 10, 93 points of other bonuses = 1.3563985.
    const { attacker } = statsFor({
      level: 10, asBase: 0.625, asPerLevel: 2.5, asRatio: 0.651,
      items: [1], itemAttackSpeed: 0.93,
    });
    expect(attacker.attackSpeed).toBeCloseTo(1.3563985, 7);
  });

  it('caps a build at 3.003 rather than printing an impossible figure', () => {
    // x = 0.4658 + 4 = 4.4658; y = 3.5964964 before the cap.
    const { attacker } = statsFor({
      level: 18, asBase: 0.658, asPerLevel: 2.74, asRatio: 0.658,
      items: [1], itemAttackSpeed: 4,
    });
    expect(attacker.attackSpeed).toBe(ATTACK_SPEED_MAXIMUM);
  });

  it('gives a champion with a zero ratio no attack speed from an item at all', () => {
    const { attacker } = statsFor({
      level: 18, asBase: 0.625, asPerLevel: 0, asRatio: 0,
      items: [1], itemAttackSpeed: 2,
    });
    expect(attacker.attackSpeed).toBe(0.625);
  });

  it('resolves the DEFENDER the same way — one code path, not two', () => {
    const { attacker, defender } = statsFor({
      level: 18, asBase: 0.658, asPerLevel: 2.74, asRatio: 0.658,
    });
    expect(defender.attackSpeed).toBeCloseTo(0.9644964, 10);
    expect(defender.attackSpeed).toBe(attacker.attackSpeed);
  });
});

// ---------------------------------------------------------------------------------------
// What is disclosed, and the boundary that must not be crossed
// ---------------------------------------------------------------------------------------

describe('what a result says about attack speed', () => {
  it('names the ceiling as something a few effects can raise, since none of them is modelled', () => {
    // The article: "Some effects are allowed to modify these values", naming a handful of champion
    // abilities and one rune. None is harvested, so a build carrying one is shown 3.003 where the
    // game would show more — a clipped figure with nothing to explain it, unless it is stated.
    const line = SIMULATION_EXCLUSIONS.find((l) => /3\.003/.test(l));
    expect(line).toBeDefined();
    expect(line!.toLowerCase()).toContain('attack speed');
  });

  it('still states that attack speed does not produce a number of attacks (SPECIFICATION §3.2)', () => {
    // The boundary this change had to stay behind. Attack speed is a displayed statistic; nothing
    // in the engine may turn it into "how many autos fit in three seconds".
    const line = SIMULATION_EXCLUSIONS.find((l) => /number of attacks/i.test(l));
    expect(line).toBeDefined();
    expect(line!.toLowerCase()).toContain('sequence rather than elapsed time');
  });
});
