// Known-answer tests for the DAMAGE-VERSUS-LEVEL curve (SPECIFICATION §11).
//
// TWO DOCUMENTED RULES SUPPLY EVERY EXPECTED NUMBER HERE.
//
// 1. PER-LEVEL GROWTH (champion-stats.ts, from the wiki's Champion statistic article):
//
//        stat(n) = base + growth x (n - 1) x (0.7025 + 0.0175 x (n - 1))
//
//    so with a base of 60 attack damage and 3 per level:
//        level  1: 60 + 3 x 0                                   = 60
//        level  3: 60 + 3 x 2 x (0.7025 + 0.035)  = 60 + 4.425  = 64.425 -> 64
//        level 18: 60 + 3 x 17 x 1                = 60 + 51     = 111
//    and with 40 base armor and 5 per level: level 18 = 40 + 85 = 125.
//
// 2. WHEN AN ABILITY MAY BE RANKED (https://wiki.leagueoflegends.com/en-us/Champion_ability,
//    read from the page's own wikitext through the MediaWiki API on 2026-08-14):
//      "One skill point is obtained each time the champion levels up, with the first being
//       granted at level 1 always, and a maximum of 18 possible from leveling up."
//      "Beyond level 1, the current rank of any ability cannot exceed half the champion's
//       current level rounded down. This rule practically limits each new rank for the same
//       ability to every odd, single-digit level."
//      "Ultimate abilities can only be learned/ranked upon reaching levels 6, 11, 16."
//    The first sentence of that middle quote contradicts its own second sentence — see the
//    note in level-sweep.ts. The ranks-at-odd-levels reading is the one implemented, so rank r
//    of a basic ability first exists at level 2r - 1: 1, 3, 5, 7, 9.
//
// Nothing below was obtained by running the engine, and no figure comes from a data file.

import { describe, it, expect } from 'vitest';
import {
  championConfig,
  comboStep,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  scenario,
} from './fixtures';
import {
  DEFAULT_RANK_SCHEDULE,
  damageVsLevel,
  maxRankAtLevel,
  rankProblems,
  allocateRanks,
} from './level-sweep';

const ATTACKER = fixtureChampion({ apiname: 'Sweeper', adBase: 60, adPerLevel: 3 });
/** No resistances and a large health pool: the level axis is the only thing moving. */
const FLAT_DEFENDER = fixtureChampion({ apiname: 'Dummy0', hpBase: 3000 });
/** Health and armor that grow, for the "whose level" question. */
const GROWING_DEFENDER = fixtureChampion({
  apiname: 'Grower',
  hpBase: 1000,
  hpPerLevel: 100,
  armorBase: 40,
  armorPerLevel: 5,
});

const ABILITIES = [
  fixtureAbility({
    champion: 'Sweeper',
    slot: 'Q',
    damageType: 'physical',
    perRank: [100, 150, 200, 250, 300],
  }),
  fixtureAbility({
    champion: 'Sweeper',
    slot: 'W',
    damageType: 'magic',
    perRank: [200, 200, 200, 200, 200],
  }),
  fixtureAbility({
    champion: 'Sweeper',
    slot: 'E',
    damageType: 'true',
    perRank: [50, 50, 50, 50, 50],
  }),
];

const CATALOGUE = fixtureCatalogue({
  champions: [ATTACKER, FLAT_DEFENDER, GROWING_DEFENDER],
  abilities: ABILITIES,
});

const NO_RANKS = { Q: 0, W: 0, E: 0, R: 0 };

function levelScenario(opts: {
  ranks?: Record<'Q' | 'W' | 'E' | 'R', number>;
  combo?: Array<{ kind: 'ability' | 'basic-attack'; ref: string }>;
  defender?: string;
  attackerLevel?: number;
  defenderLevel?: number;
}) {
  return scenario({
    attacker: championConfig({
      apiname: 'Sweeper',
      level: opts.attackerLevel ?? 1,
      abilityRanks: opts.ranks ?? NO_RANKS,
    }),
    defender: championConfig({
      apiname: opts.defender ?? 'Dummy0',
      level: opts.defenderLevel ?? 1,
    }),
    combo: (opts.combo ?? [{ kind: 'basic-attack', ref: 'basic' }]).map((s, i) =>
      comboStep(`s${i}`, s),
    ),
  });
}

function computedAt(series: { points: readonly any[] }, level: number) {
  const point = series.points.find((p) => p.x === level);
  if (!point) throw new Error(`no point at level ${level}`);
  if (point.status !== 'computed') {
    throw new Error(
      `level ${level} refused: ${point.refusals.map((r: any) => r.reason).join('; ')}`,
    );
  }
  return point;
}

// ---------------------------------------------------------------------------------------
// The rank rules, on their own
// ---------------------------------------------------------------------------------------

describe('maxRankAtLevel — a basic ability gains a rank at levels 1, 3, 5, 7, 9', () => {
  it('allows rank 1 at level 1 and rank 5 only from level 9', () => {
    expect(maxRankAtLevel('Q', 1)).toBe(1);
    expect(maxRankAtLevel('Q', 2)).toBe(1);
    expect(maxRankAtLevel('Q', 3)).toBe(2);
    expect(maxRankAtLevel('Q', 4)).toBe(2);
    expect(maxRankAtLevel('Q', 7)).toBe(4);
    expect(maxRankAtLevel('Q', 8)).toBe(4);
    expect(maxRankAtLevel('Q', 9)).toBe(5);
    expect(maxRankAtLevel('Q', 18)).toBe(5);
  });

  it('allows the ultimate only from levels 6, 11 and 16', () => {
    expect(maxRankAtLevel('R', 5)).toBe(0);
    expect(maxRankAtLevel('R', 6)).toBe(1);
    expect(maxRankAtLevel('R', 10)).toBe(1);
    expect(maxRankAtLevel('R', 11)).toBe(2);
    expect(maxRankAtLevel('R', 15)).toBe(2);
    expect(maxRankAtLevel('R', 16)).toBe(3);
  });

  it('honours a schedule for the four-rank ultimates the wiki names (Elise, Karma, Nidalee)', () => {
    // "Spider Form / Human Form (Elise), Mantra (Karma) and Aspect of the Cougar (Nidalee) are
    // all available at level 1 and each has four ranks (levels 1, 6, 11, and 16)."
    const schedule = { ...DEFAULT_RANK_SCHEDULE, ultimateRankLevels: [1, 6, 11, 16] };
    expect(maxRankAtLevel('R', 1, schedule)).toBe(1);
    expect(maxRankAtLevel('R', 6, schedule)).toBe(2);
    expect(maxRankAtLevel('R', 16, schedule)).toBe(4);
  });
});

describe('rankProblems — the two things that make a build impossible at a level', () => {
  it('accepts a build that fits', () => {
    expect(rankProblems({ Q: 5, W: 0, E: 0, R: 0 }, 9)).toEqual([]);
  });

  it('names the ability whose rank is too high for the level', () => {
    const problems = rankProblems({ Q: 5, W: 0, E: 0, R: 0 }, 8);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Q/);
    expect(problems[0]).toMatch(/rank 5/);
  });

  it('names the skill-point budget when the ranks are individually legal but too many', () => {
    // Q5 and W5 are both legal at level 9, but they cost 10 points and level 9 grants 9.
    const problems = rankProblems({ Q: 5, W: 5, E: 0, R: 0 }, 9);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/10 skill points/);
    expect(rankProblems({ Q: 5, W: 5, E: 0, R: 0 }, 10)).toEqual([]);
  });
});

describe('allocateRanks — the stated leveling order, spent one point per level', () => {
  const target = { Q: 5, W: 5, E: 5, R: 3 };

  it('gives Q3 W2 at level 5 for the order Q, W, E', () => {
    expect(allocateRanks(target, 5, ['Q', 'W', 'E'])).toEqual({ Q: 3, W: 2, E: 0, R: 0 });
  });

  it('takes the ultimate the moment the game allows it', () => {
    expect(allocateRanks(target, 6, ['Q', 'W', 'E'])).toEqual({ Q: 3, W: 2, E: 0, R: 1 });
  });

  it('arrives at exactly the configured build at level 18', () => {
    expect(allocateRanks(target, 18, ['Q', 'W', 'E'])).toEqual(target);
  });

  it('never spends more points than the level grants', () => {
    for (let level = 1; level <= 18; level += 1) {
      const ranks = allocateRanks(target, level, ['Q', 'W', 'E']);
      const spent = ranks.Q + ranks.W + ranks.E + ranks.R;
      expect(spent).toBeLessThanOrEqual(level);
    }
  });
});

// ---------------------------------------------------------------------------------------
// The curve
// ---------------------------------------------------------------------------------------

describe('damageVsLevel — the attacker levels and nothing else does', () => {
  const outcome = damageVsLevel(levelScenario({}), CATALOGUE, {
    who: 'attacker',
    ranks: { kind: 'as-configured' },
    levels: [1, 3, 18],
  });
  if (!outcome.ok) throw new Error('the base scenario refused, which no test here intends');
  const series = outcome.series;

  it('gives a basic attack of 60 / 64 / 111 at levels 1 / 3 / 18', () => {
    expect(computedAt(series, 1).summary.burst.total).toBe(60);
    expect(computedAt(series, 3).summary.burst.total).toBe(64);
    expect(computedAt(series, 18).summary.burst.total).toBe(111);
  });

  it('holds the defender at its configured level', () => {
    expect(computedAt(series, 18).summary.defenderLevel).toBe(1);
    expect(computedAt(series, 18).summary.defenderHp).toBe(3000);
    expect(computedAt(series, 18).summary.attackerLevel).toBe(18);
  });
});

describe('damageVsLevel — who levels is stated, never assumed', () => {
  it('moves only the defender when asked to', () => {
    const outcome = damageVsLevel(
      levelScenario({ defender: 'Grower', attackerLevel: 1 }),
      CATALOGUE,
      { who: 'defender', ranks: { kind: 'as-configured' }, levels: [1, 18] },
    );
    if (!outcome.ok) throw new Error('the base scenario refused');
    // Attacker stays at level 1, so its attack damage stays 60.
    //   level  1 defender: 40 armor  -> 60 x 100/140 = 42.857… -> 43
    //   level 18 defender: 125 armor -> 60 x 100/225 = 26.666… -> 27
    expect(computedAt(outcome.series, 1).summary.burst.total).toBe(43);
    expect(computedAt(outcome.series, 18).summary.burst.total).toBe(27);
    expect(computedAt(outcome.series, 18).summary.attackerLevel).toBe(1);
    expect(computedAt(outcome.series, 18).summary.defenderLevel).toBe(18);
  });

  it('moves both when asked to, and the verdict follows the defender health pool', () => {
    const outcome = damageVsLevel(levelScenario({ defender: 'Grower' }), CATALOGUE, {
      who: 'both',
      ranks: { kind: 'as-configured' },
      levels: [1, 18],
    });
    if (!outcome.ok) throw new Error('the base scenario refused');
    //   level  1: 60 attack damage vs 40 armor  -> 42.857… -> 43, against 1000 health
    //             1000 - 42.857… = 957.14…                 -> 957 remaining
    //   level 18: 111 vs 125 armor -> 111 x 100/225 = 49.333… -> 49, against 2700 health
    //             2700 - 49.333… = 2650.66…                -> 2651 remaining
    expect(computedAt(outcome.series, 1).summary.burst.total).toBe(43);
    expect(computedAt(outcome.series, 1).summary.verdict.burstOnly.remainingHp).toBe(957);
    expect(computedAt(outcome.series, 18).summary.burst.total).toBe(49);
    expect(computedAt(outcome.series, 18).summary.defenderHp).toBe(2700);
    expect(computedAt(outcome.series, 18).summary.verdict.burstOnly.remainingHp).toBe(2651);
  });
});

describe('damageVsLevel — a build that cannot exist at a level REFUSES that level', () => {
  const outcome = damageVsLevel(
    levelScenario({ ranks: { Q: 5, W: 0, E: 0, R: 0 }, combo: [{ kind: 'ability', ref: 'Q' }] }),
    CATALOGUE,
    { who: 'attacker', ranks: { kind: 'as-configured' } },
  );
  if (!outcome.ok) throw new Error('the base scenario refused');
  const series = outcome.series;

  it('sweeps all 18 levels by default', () => {
    expect(series.points.map((p) => p.x)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
  });

  it('refuses levels 1 to 8, where rank 5 of a basic ability does not exist', () => {
    for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const point = series.points.find((p) => p.x === level)!;
      expect(point.status).toBe('refused');
      if (point.status !== 'refused') throw new Error('unreachable');
      expect(point.refusals[0]!.reason).toMatch(/rank 5/);
      expect('summary' in point).toBe(false);
    }
    expect(series.refusedCount).toBe(8);
    expect(series.computedCount).toBe(10);
  });

  it('computes levels 9 to 18 at the rank-5 figure of 300', () => {
    for (const level of [9, 12, 18]) {
      expect(computedAt(series, level).summary.burst.total).toBe(300);
    }
  });
});

describe('damageVsLevel — the stated leveling order', () => {
  const outcome = damageVsLevel(
    levelScenario({
      ranks: { Q: 5, W: 5, E: 5, R: 3 },
      combo: [{ kind: 'ability', ref: 'Q' }],
    }),
    CATALOGUE,
    {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
      levels: [1, 5, 6, 18],
    },
  );
  if (!outcome.ok) throw new Error('the base scenario refused');
  const series = outcome.series;

  it('casts Q at the rank the leveling path has reached', () => {
    // Q is rank 1 at level 1, rank 3 at levels 5 and 6, rank 5 at level 18.
    expect(computedAt(series, 1).summary.burst.total).toBe(100);
    expect(computedAt(series, 5).summary.burst.total).toBe(200);
    expect(computedAt(series, 6).summary.burst.total).toBe(200);
    expect(computedAt(series, 18).summary.burst.total).toBe(300);
  });

  it('states the ranks it used on every point, and that they are not the configured ones', () => {
    expect(computedAt(series, 5).applied.ranks).toEqual({ Q: 3, W: 2, E: 0, R: 0 });
    expect(computedAt(series, 5).applied.ranksDifferFromScenario).toBe(true);
    expect(computedAt(series, 18).applied.ranks).toEqual({ Q: 5, W: 5, E: 5, R: 3 });
    expect(computedAt(series, 18).applied.ranksDifferFromScenario).toBe(false);
  });

  it('discloses that the leveling order is a convention the caller supplied', () => {
    expect(series.notes.some((n) => /leveling order/i.test(n))).toBe(true);
  });
});

describe('damageVsLevel — a combo that casts an ability the level has not learned', () => {
  it('refuses the level rather than casting it at rank 1', () => {
    const outcome = damageVsLevel(
      levelScenario({
        ranks: { Q: 5, W: 5, E: 5, R: 3 },
        combo: [
          { kind: 'ability', ref: 'Q' },
          { kind: 'ability', ref: 'E' },
        ],
      }),
      CATALOGUE,
      {
        who: 'attacker',
        ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
        levels: [5, 13, 18],
      },
    );
    if (!outcome.ok) throw new Error('the base scenario refused');
    const series = outcome.series;

    // At level 5 the path has spent its points on Q and W, so E is unlearned and cannot be cast.
    const early = series.points.find((p) => p.x === 5)!;
    expect(early.status).toBe('refused');
    if (early.status !== 'refused') throw new Error('unreachable');
    expect(early.refusals[0]!.reason).toMatch(/E/);
    expect(early.refusals[0]!.reason).toMatch(/0 points|unlearned|not learned/i);

    // By level 13 E is rank 1. Q is rank 5 by then: 300 physical + 50 true = 350.
    expect(computedAt(series, 13).summary.burst.total).toBe(350);
    expect(computedAt(series, 18).summary.burst.total).toBe(350);
  });
});
