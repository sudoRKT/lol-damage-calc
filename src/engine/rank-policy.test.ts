// Known-answer tests for the RANK POLICY of the damage-versus-level curve (SPECIFICATION §11).
//
// ═══ WHERE EVERY EXPECTED NUMBER BELOW COMES FROM ═══
//
// https://wiki.leagueoflegends.com/en-us/Champion_ability, read from the page's own wikitext
// through the MediaWiki API on 2026-08-15. Four sentences carry the whole file:
//
//   (a) "One skill point is obtained each time the champion levels up, with the first being
//        granted at level 1 always, and a maximum of 18 possible from leveling up."
//   (b) "Beyond level 1, the current rank of any ability cannot exceed half the champion's
//        current level rounded down. This rule practically limits each new rank for the same
//        ability to every odd, single-digit level."
//   (c) "Ultimate abilities can only be learned/ranked upon reaching levels 6, 11, 16."
//   (d) "The first skill point can be spent on any basic ability."
//
// From (a): a champion has AT MOST 18 skill points, so a build costing 19 exists at no level.
// From (b): rank r of a basic ability first exists at level 2r - 1 -> levels 1, 3, 5, 7, 9, so
//           the default schedule tops out at rank 5.
// From (c): the ultimate tops out at rank 3.
// From (d): the point granted at level 1 cannot go to the ultimate, even under a schedule that
//           makes an ultimate available at level 1.
//
// (b) contradicts itself and level-sweep.ts records that rather than hiding it; the odd-level
// reading is the one implemented and the one used here.
//
// ═══ THE DEFECT THESE TESTS PIN ═══
//
// `allocateRanks` caps each slot at `Math.min(target, maxRankAtLevel(...))`. A build the schedule
// cannot express — Udyr's Q6 W6 E6 R6 — was therefore quietly LOWERED to Q5 W5 E5 R3 and drawn as
// though it were the user's build. Seven champions on the published roster are in that class. The
// rule these tests fix in place: A BUILD NO CHAMPION LEVEL CAN HOLD IS REFUSED AT EVERY LEVEL,
// UNDER EVERY POLICY. A levelling order may only ever draw a build the user is on the way TO.
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
  MAX_CHAMPION_LEVEL,
  allocateRanks,
  damageVsLevel,
  impossibleBuildProblems,
  priorityProblems,
  rankProblems,
  rankShortfallAt,
  scheduleRankCap,
  type LevelSweepOptions,
  type RankSchedule,
  type Ranks,
} from './level-sweep';

// ---------------------------------------------------------------------------------------
// Fixtures. Nothing here is a real champion.
// ---------------------------------------------------------------------------------------

/** A five-rank kit — the ordinary case the default schedule describes. */
const FIVER = fixtureChampion({ apiname: 'Fiver' });
/** A six-rank kit, the shape Udyr, Jayce, Aphelios and Yuumi's Q have on the real roster. */
const SIXER = fixtureChampion({ apiname: 'Sixer' });
const DUMMY = fixtureChampion({ apiname: 'Dummy0', hpBase: 5000 });

const ABILITIES = [
  // Explicit per-rank lists, so a test's expected damage is a number a reader can see.
  fixtureAbility({
    champion: 'Fiver',
    slot: 'Q',
    damageType: 'physical',
    perRank: [100, 150, 200, 250, 300],
  }),
  fixtureAbility({
    champion: 'Fiver',
    slot: 'W',
    damageType: 'magic',
    perRank: [10, 10, 10, 10, 10],
  }),
  fixtureAbility({
    champion: 'Fiver',
    slot: 'E',
    damageType: 'true',
    perRank: [20, 20, 20, 20, 20],
  }),
  fixtureAbility({
    champion: 'Sixer',
    slot: 'Q',
    damageType: 'physical',
    perRank: [100, 150, 200, 250, 300, 350],
  }),
  fixtureAbility({
    champion: 'Sixer',
    slot: 'W',
    damageType: 'magic',
    perRank: [10, 10, 10, 10, 10, 10],
  }),
  fixtureAbility({
    champion: 'Sixer',
    slot: 'E',
    damageType: 'true',
    perRank: [20, 20, 20, 20, 20, 20],
  }),
];

const CATALOGUE = fixtureCatalogue({ champions: [FIVER, SIXER, DUMMY], abilities: ABILITIES });

/** A scenario whose combo is a single Q cast, so the only thing moving is the Q rank. */
function qOnly(apiname: string, ranks: Ranks) {
  return scenario({
    attacker: championConfig({ apiname, level: 18, abilityRanks: ranks }),
    defender: championConfig({ apiname: 'Dummy0', level: 18 }),
    combo: [comboStep('s0', { kind: 'ability', ref: 'Q' })],
  });
}

function sweep(sc: ReturnType<typeof scenario>, options: LevelSweepOptions) {
  const outcome = damageVsLevel(sc, CATALOGUE, options);
  if (!outcome.ok) {
    throw new Error(`refused wholesale: ${outcome.refusals.map((r) => r.reason).join('; ')}`);
  }
  return outcome.series;
}

function pointAt(series: ReturnType<typeof sweep>, level: number) {
  const point = series.points.find((p) => p.x === level);
  if (!point) throw new Error(`no point at level ${level}`);
  return point;
}

function computedAt(series: ReturnType<typeof sweep>, level: number) {
  const point = pointAt(series, level);
  if (point.status !== 'computed') {
    throw new Error(`level ${level} refused: ${point.refusals.map((r) => r.reason).join('; ')}`);
  }
  return point;
}

/** The seven real shapes on the published roster, written out as ranks and nothing else. */
const ROSTER_SHAPES: ReadonlyArray<{ name: string; ranks: Ranks; problems: number }> = [
  // problems = one entry per slot whose rank exceeds the default schedule's ceiling, PLUS one
  // for the skill-point budget when the build costs more than 18 points.
  // Udyr: Q6 W6 E6 R6 -> four slots over the ceiling (5, 5, 5, 3), and 24 points against 18.
  { name: 'Udyr', ranks: { Q: 6, W: 6, E: 6, R: 6 }, problems: 5 },
  // Aphelios: Q6 W6 E6 R3 -> three slots over, and 21 points against 18.
  { name: 'Aphelios', ranks: { Q: 6, W: 6, E: 6, R: 3 }, problems: 4 },
  // Jayce: Q6 W6 E6 R1 -> three slots over, and 19 points against 18.
  { name: 'Jayce', ranks: { Q: 6, W: 6, E: 6, R: 1 }, problems: 4 },
  // Yuumi: Q6 W5 E5 R3 -> one slot over, and 19 points against 18.
  { name: 'Yuumi', ranks: { Q: 6, W: 5, E: 5, R: 3 }, problems: 2 },
  // Elise / Karma / Nidalee: Q5 W5 E5 R4 -> R over the ceiling of 3, and 19 points against 18.
  { name: 'Elise', ranks: { Q: 5, W: 5, E: 5, R: 4 }, problems: 2 },
  { name: 'Karma', ranks: { Q: 5, W: 5, E: 5, R: 4 }, problems: 2 },
  { name: 'Nidalee', ranks: { Q: 5, W: 5, E: 5, R: 4 }, problems: 2 },
];

/** The ordinary maxed build: 5 + 5 + 5 + 3 = exactly the 18 points level 18 grants. */
const MAXED: Ranks = { Q: 5, W: 5, E: 5, R: 3 };

// ---------------------------------------------------------------------------------------
// A. Which builds no champion level can hold
// ---------------------------------------------------------------------------------------

describe('scheduleRankCap — the highest rank a schedule describes at all', () => {
  it('is 5 for a basic ability and 3 for the ultimate, under the default schedule', () => {
    // Levels 1, 3, 5, 7, 9 -> five ranks; levels 6, 11, 16 -> three ranks.
    expect(scheduleRankCap('Q', DEFAULT_RANK_SCHEDULE)).toBe(5);
    expect(scheduleRankCap('W', DEFAULT_RANK_SCHEDULE)).toBe(5);
    expect(scheduleRankCap('E', DEFAULT_RANK_SCHEDULE)).toBe(5);
    expect(scheduleRankCap('R', DEFAULT_RANK_SCHEDULE)).toBe(3);
  });

  it('is 4 for the ultimate under the four-rank schedule the wiki names', () => {
    // "Spider Form / Human Form (Elise), Mantra (Karma) and Aspect of the Cougar (Nidalee) are
    // all available at level 1 and each has four ranks (levels 1, 6, 11, and 16)."
    const schedule: RankSchedule = { ...DEFAULT_RANK_SCHEDULE, ultimateRankLevels: [1, 6, 11, 16] };
    expect(scheduleRankCap('R', schedule)).toBe(4);
  });
});

describe('impossibleBuildProblems — a build that exists at NO level, told apart from "not yet"', () => {
  it('accepts the ordinary maxed build: 18 points, every rank inside the ceiling', () => {
    expect(impossibleBuildProblems(MAXED)).toEqual([]);
  });

  it('accepts a build that is illegal EARLY but legal at 18 — that is "not yet", not "never"', () => {
    // Q5 costs 5 points and needs level 9. It cannot exist at level 3 and can at level 18.
    // This distinction is the whole fix: only the second kind may be re-ranked by an order.
    const build: Ranks = { Q: 5, W: 0, E: 0, R: 0 };
    expect(rankProblems(build, 3).length).toBeGreaterThan(0);
    expect(impossibleBuildProblems(build)).toEqual([]);
  });

  it('probes at level 18, the maximum a champion can reach', () => {
    expect(MAX_CHAMPION_LEVEL).toBe(18);
  });

  it.each(ROSTER_SHAPES)('refuses $name ($ranks.Q/$ranks.W/$ranks.E/$ranks.R)', (shape) => {
    const problems = impossibleBuildProblems(shape.ranks);
    expect(problems).toHaveLength(shape.problems);
    for (const problem of problems) {
      expect(problem).toMatch(/no champion level can hold this build/);
    }
  });

  it('still refuses Elise under her OWN four-rank schedule — for the skill-point budget', () => {
    // THIS IS A FINDING, NOT A DETAIL. Giving Elise the four-rank ultimate schedule the wiki
    // names removes the rank ceiling problem but not the other one: Q5 + W5 + E5 + R4 = 19 skill
    // points and level 18 grants 18. The wiki says her ultimate is "available at level 1", and
    // separately that R-slot abilities already learned at the start "still" leave the first skill
    // point free for a basic — which reads as the first rank being FREE. Nothing states that
    // outright, so the engine does not assume it and this build stays refused.
    const schedule: RankSchedule = { ...DEFAULT_RANK_SCHEDULE, ultimateRankLevels: [1, 6, 11, 16] };
    const problems = impossibleBuildProblems({ Q: 5, W: 5, E: 5, R: 4 }, schedule);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/19 skill points/);
  });
});

// ---------------------------------------------------------------------------------------
// B. Refused levels stay refused — the property the whole task turns on
// ---------------------------------------------------------------------------------------

describe('damageVsLevel — a build no level can hold is refused at EVERY level, under BOTH policies', () => {
  const UDYR: Ranks = { Q: 6, W: 6, E: 6, R: 6 };

  const asConfigured = sweep(qOnly('Sixer', UDYR), {
    who: 'attacker',
    ranks: { kind: 'as-configured' },
  });
  const priority = sweep(qOnly('Sixer', UDYR), {
    who: 'attacker',
    ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
  });

  it('computes nothing under as-configured — 0 of 18 levels', () => {
    expect(asConfigured.computedCount).toBe(0);
    expect(asConfigured.refusedCount).toBe(18);
  });

  it('computes nothing under priority either — the order does not rescue an impossible build', () => {
    expect(priority.computedCount).toBe(0);
    expect(priority.refusedCount).toBe(18);
  });

  it('never draws the LOWERED build the old allocation produced (Q5 W5 E5 R3 at level 18)', () => {
    // The defect in one assertion: at level 18 the sweep must still be describing Q6, not Q5.
    const top = pointAt(priority, 18);
    expect(top.status).toBe('refused');
    expect(top.applied.ranks).toEqual(UDYR);
    expect(top.applied.ranksDifferFromScenario).toBe(false);
    expect(top.applied.rankShortfall).toEqual([]);
  });

  it('says on every refused level that no champion level can hold this build', () => {
    for (const point of priority.points) {
      if (point.status !== 'refused') throw new Error(`level ${point.x} computed`);
      expect(point.refusals.some((r) => /no champion level can hold this build/.test(r.reason))).toBe(
        true,
      );
    }
  });

  it('says, once, why the levelling order was NOT applied', () => {
    const level10 = pointAt(priority, 10);
    if (level10.status !== 'refused') throw new Error('level 10 computed');
    expect(level10.refusals.some((r) => /LOWER build/.test(r.reason))).toBe(true);
  });

  it('reports the impossibility on the series, not only point by point', () => {
    expect(priority.rankReport.impossible.length).toBeGreaterThan(0);
    expect(priority.rankReport.top).toBeNull();
    expect(priority.rankReport.topBelowConfigured).toBe(false);
  });

  it('does not refuse the whole sweep — the axis still has 18 positions to draw refusals at', () => {
    expect(priority.points).toHaveLength(18);
    expect(asConfigured.points).toHaveLength(18);
  });
});

describe('damageVsLevel — each of the seven roster shapes, refused under priority', () => {
  it.each(ROSTER_SHAPES)('$name computes 0 of 18 levels', (shape) => {
    const series = sweep(qOnly('Sixer', shape.ranks), {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
    });
    expect(series.computedCount).toBe(0);
    expect(series.refusedCount).toBe(18);
  });
});

// ---------------------------------------------------------------------------------------
// C. A reachable build still gets its full curve — the fix must not over-refuse
// ---------------------------------------------------------------------------------------

describe('damageVsLevel — a build a level CAN hold still gets every point', () => {
  // Order Q > W > E, ultimate at the first level the game allows. Walked by hand, one point per
  // level, each slot capped by the level and by the target build:
  //   L1  Q1              L7  Q4              L13 E1
  //   L2  W1              L8  W3              L14 E2
  //   L3  Q2              L9  Q5              L15 E3
  //   L4  W2              L10 W4              L16 R3
  //   L5  Q3              L11 R2              L17 E4
  //   L6  R1              L12 W5              L18 E5
  // so Q is at rank 1, 1, 2, 2, 3, 3, 4, 4, 5, 5... and the Q damage list is
  // [100, 150, 200, 250, 300].
  const series = sweep(qOnly('Fiver', MAXED), {
    who: 'attacker',
    ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
  });

  it('computes all 18 levels and refuses none', () => {
    expect(series.computedCount).toBe(18);
    expect(series.refusedCount).toBe(0);
  });

  it('casts Q at the rank the walk above reached', () => {
    expect(computedAt(series, 1).summary.burst.total).toBe(100);
    expect(computedAt(series, 2).summary.burst.total).toBe(100);
    expect(computedAt(series, 3).summary.burst.total).toBe(150);
    expect(computedAt(series, 4).summary.burst.total).toBe(150);
    expect(computedAt(series, 5).summary.burst.total).toBe(200);
    expect(computedAt(series, 6).summary.burst.total).toBe(200);
    expect(computedAt(series, 7).summary.burst.total).toBe(250);
    expect(computedAt(series, 8).summary.burst.total).toBe(250);
    expect(computedAt(series, 9).summary.burst.total).toBe(300);
    expect(computedAt(series, 18).summary.burst.total).toBe(300);
  });

  it('arrives at exactly the configured build at level 18', () => {
    expect(computedAt(series, 18).applied.ranks).toEqual(MAXED);
    expect(computedAt(series, 18).applied.ranksDifferFromScenario).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// D. A point below the configured build says so, per slot and per level
// ---------------------------------------------------------------------------------------

describe('rankShortfallAt — the three causes, told apart', () => {
  it('calls it beyond-schedule when NO level reaches the configured rank', () => {
    // Q6 against a schedule whose ceiling is 5.
    const short = rankShortfallAt({ Q: 6, W: 0, E: 0, R: 0 }, { Q: 5, W: 0, E: 0, R: 0 }, 18);
    expect(short).toEqual([{ slot: 'Q', configured: 6, applied: 5, cause: 'beyond-schedule' }]);
  });

  it('calls it level-cap when the level has not unlocked the rank yet', () => {
    // At level 5 a basic ability tops out at rank 3 (levels 1, 3, 5 reached).
    const short = rankShortfallAt(MAXED, { Q: 3, W: 2, E: 0, R: 0 }, 5);
    expect(short.map((s) => s.cause)).toEqual([
      'level-cap',
      'level-cap',
      'level-cap',
      'level-cap',
    ]);
    expect(short.map((s) => `${s.slot}${s.applied}/${s.configured}`)).toEqual([
      'Q3/5',
      'W2/5',
      'E0/5',
      'R0/3',
    ]);
  });

  it('calls it order-priority when the level allows the rank and the order spent elsewhere', () => {
    // At level 13 a basic tops out at rank 5 and the ultimate at rank 2 (levels 6 and 11).
    // E is at 1 because Q and W were maxed first — the order's doing, not the level's.
    // R is at 2 because level 13 has not reached 16 — the level's doing, not the order's.
    const short = rankShortfallAt(MAXED, { Q: 5, W: 5, E: 1, R: 2 }, 13);
    expect(short).toEqual([
      { slot: 'E', configured: 5, applied: 1, cause: 'order-priority' },
      { slot: 'R', configured: 3, applied: 2, cause: 'level-cap' },
    ]);
  });

  it('is empty when the drawn ranks are the configured ones', () => {
    expect(rankShortfallAt(MAXED, MAXED, 18)).toEqual([]);
  });
});

describe('damageVsLevel — every drawn point carries its own shortfall', () => {
  const series = sweep(qOnly('Fiver', MAXED), {
    who: 'attacker',
    ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
  });

  it('echoes the configured build on every point, drawn or refused', () => {
    for (const point of series.points) {
      expect(point.applied.configuredRanks).toEqual(MAXED);
    }
  });

  it('reports all four slots short at level 5, every one of them level-capped', () => {
    const short = computedAt(series, 5).applied.rankShortfall;
    expect(short).toEqual([
      { slot: 'Q', configured: 5, applied: 3, cause: 'level-cap' },
      { slot: 'W', configured: 5, applied: 2, cause: 'level-cap' },
      { slot: 'E', configured: 5, applied: 0, cause: 'level-cap' },
      { slot: 'R', configured: 3, applied: 0, cause: 'level-cap' },
    ]);
  });

  it('separates the order`s doing from the level`s at level 13', () => {
    expect(computedAt(series, 13).applied.rankShortfall).toEqual([
      { slot: 'E', configured: 5, applied: 1, cause: 'order-priority' },
      { slot: 'R', configured: 3, applied: 2, cause: 'level-cap' },
    ]);
  });

  it('reports nothing short at level 18', () => {
    expect(computedAt(series, 18).applied.rankShortfall).toEqual([]);
  });

  it('NEVER carries a beyond-schedule shortfall on a computed point', () => {
    // The invariant the fix installs: a rank no level can reach is a refusal, never a drawn
    // point. If this ever fails, the engine is silently lowering a build again.
    const offenders = series.points
      .filter((p) => p.status === 'computed')
      .flatMap((p) =>
        p.applied.rankShortfall
          .filter((s) => s.cause === 'beyond-schedule')
          .map((s) => `level ${p.x} ${s.slot}`),
      );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
// E. The note that used to be false in the wrong direction
// ---------------------------------------------------------------------------------------

describe('damageVsLevel — the note about the top of the curve', () => {
  it('claims the top IS the configured build only when level 18 reaches it', () => {
    const series = sweep(qOnly('Fiver', MAXED), {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
    });
    expect(series.notes.some((n) => /the top of this curve is the configured build/.test(n))).toBe(
      true,
    );
    expect(series.rankReport.topBelowConfigured).toBe(false);
  });

  it('says the top is BELOW the configured build when the curve stops short of level 18', () => {
    // Levels 1-10 only. At level 10 the walk above has Q5 W4 E0 R1 against a configured
    // Q5 W5 E5 R3, so the top of this curve is three slots below the user's build.
    const series = sweep(qOnly('Fiver', MAXED), {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
      levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(computedAt(series, 10).applied.ranks).toEqual({ Q: 5, W: 4, E: 0, R: 1 });
    expect(series.rankReport.topBelowConfigured).toBe(true);
    expect(series.rankReport.top?.attackerLevel).toBe(10);
    expect(series.rankReport.top?.short.map((s) => s.slot)).toEqual(['W', 'E', 'R']);

    expect(series.notes.some((n) => /BELOW the configured build/.test(n))).toBe(true);
    expect(series.notes.some((n) => /the top of this curve is the configured build/.test(n))).toBe(
      false,
    );
  });

  it('keeps the phrase the interface matches on, so a correction can still find the note', () => {
    // src/ui/curves/rank-shortfall.ts matches TOP_OF_CURVE_NOTE = 'ranked above the build the
    // scenario states'. Both forms of the note carry it, so the interface's annotation keeps
    // working whichever branch was taken.
    const reaching = sweep(qOnly('Fiver', MAXED), {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
    });
    const short = sweep(qOnly('Fiver', MAXED), {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
      levels: [1, 10],
    });
    for (const series of [reaching, short]) {
      expect(
        series.notes.some((n) => n.includes('ranked above the build the scenario states')),
      ).toBe(true);
    }
  });

  it('keeps the phrase the interface parses the ORDER out of, in all three branches', () => {
    // The same file reads `leveling order Q > W > E,` back out of the notes to check that the
    // policy printed on the chart is the policy that produced the line.
    const reaching = sweep(qOnly('Fiver', MAXED), {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
    });
    const impossible = sweep(qOnly('Sixer', { Q: 6, W: 6, E: 6, R: 6 }), {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
    });
    for (const series of [reaching, impossible]) {
      expect(series.notes.some((n) => n.includes('leveling order Q > W > E,'))).toBe(true);
    }
  });

  it('says plainly, on an impossible build, that the order was not applied', () => {
    const series = sweep(qOnly('Sixer', { Q: 6, W: 6, E: 6, R: 6 }), {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
    });
    expect(series.notes.some((n) => /NOT APPLIED/.test(n))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// F. The order is reportable as data, not only as prose
// ---------------------------------------------------------------------------------------

describe('damageVsLevel — the series carries the rank policy it actually used', () => {
  it('reports the caller`s order, the ultimate rule, the schedule and the configured build', () => {
    const series = sweep(qOnly('Fiver', MAXED), {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['E', 'Q', 'W'] },
    });
    expect(series.rankReport.policy).toBe('priority');
    expect(series.rankReport.order).toEqual(['E', 'Q', 'W']);
    expect(series.rankReport.ultimate).toBe('first-available');
    expect(series.rankReport.schedule).toEqual(DEFAULT_RANK_SCHEDULE);
    expect(series.rankReport.configuredRanks).toEqual(MAXED);
    expect(series.rankReport.applied).toBe(true);
  });

  it('reports as-configured with no order at all, rather than an invented one', () => {
    const series = sweep(qOnly('Fiver', MAXED), {
      who: 'attacker',
      ranks: { kind: 'as-configured' },
    });
    expect(series.rankReport.policy).toBe('as-configured');
    expect(series.rankReport.order).toEqual([]);
    expect(series.rankReport.ultimate).toBe('not-applicable');
    expect(series.rankReport.applied).toBe(false);
  });

  it('reports that a defender-only sweep never applied the order, even when one was given', () => {
    // The attacker stands still, so its build is the user's untouched. Printing a levelling
    // order beside such a curve would describe a thing that did not happen.
    const series = sweep(qOnly('Fiver', MAXED), {
      who: 'defender',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
    });
    expect(series.rankReport.applied).toBe(false);
    expect(series.rankReport.order).toEqual(['Q', 'W', 'E']);
  });
});

// ---------------------------------------------------------------------------------------
// G. The order is the CALLER's, and a malformed one is refused rather than half-obeyed
// ---------------------------------------------------------------------------------------

describe('priorityProblems — an order that cannot produce the build is refused', () => {
  it('accepts an order covering every basic slot the build ranks', () => {
    expect(priorityProblems({ order: ['Q', 'W', 'E'] }, MAXED)).toEqual([]);
  });

  it('does not require a slot the build leaves unranked', () => {
    expect(priorityProblems({ order: ['Q', 'W'] }, { Q: 5, W: 5, E: 0, R: 3 })).toEqual([]);
  });

  it('names a slot the build ranks that the order never spends a point on', () => {
    const problems = priorityProblems({ order: ['Q', 'W'] }, MAXED);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/E/);
  });

  it('names a repeated slot', () => {
    const problems = priorityProblems({ order: ['Q', 'Q', 'W', 'E'] }, MAXED);
    expect(problems.some((p) => /twice/.test(p))).toBe(true);
  });

  it('refuses R inside the order while the ultimate rule is taking it first', () => {
    // Property 1 in one test: the caller stating where R goes and the engine ignoring it is
    // exactly the hard-coded convention this work removes. Say so instead of overriding.
    const problems = priorityProblems({ order: ['Q', 'R', 'W', 'E'] }, MAXED);
    expect(problems.some((p) => /in-order/.test(p))).toBe(true);
  });

  it('requires R in the order when the caller asked for it in-order', () => {
    const problems = priorityProblems({ order: ['Q', 'W', 'E'], ultimate: 'in-order' }, MAXED);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/R/);
  });

  it('makes damageVsLevel refuse the whole sweep, not draw 18 wrong points', () => {
    const outcome = damageVsLevel(qOnly('Fiver', MAXED), CATALOGUE, {
      who: 'attacker',
      ranks: { kind: 'priority', order: ['Q', 'W'] },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.refusals[0]!.path).toBe('options.ranks.order');
  });
});

// ---------------------------------------------------------------------------------------
// H. Where the ultimate goes is the caller's choice too
// ---------------------------------------------------------------------------------------

describe('allocateRanks — the ultimate placement is stated, not assumed', () => {
  it('takes the ultimate at the first level the game allows, by default', () => {
    // Level 6 is the first ultimate level, and the walk has Q3 W2 by then.
    expect(allocateRanks(MAXED, 6, ['Q', 'W', 'E'])).toEqual({ Q: 3, W: 2, E: 0, R: 1 });
    expect(allocateRanks(MAXED, 12, ['Q', 'W', 'E'])).toEqual({ Q: 5, W: 5, E: 0, R: 2 });
  });

  it('leaves the ultimate to its place in the order when asked to', () => {
    // Order Q > W > E > R, ultimate in-order. Walked by hand:
    //   L1 Q1  L2 W1  L3 Q2  L4 W2  L5 Q3  L6 W3  L7 Q4  L8 W4  L9 Q5
    //   L10 W5  L11 E1  L12 E2  L13 E3  L14 E4  L15 E5  L16 R1  L17 R2  L18 R3
    // R waits until Q, W and E are all at the configured rank, which is level 16.
    const order = ['Q', 'W', 'E', 'R'] as const;
    expect(allocateRanks(MAXED, 12, order, DEFAULT_RANK_SCHEDULE, 'in-order')).toEqual({
      Q: 5,
      W: 5,
      E: 2,
      R: 0,
    });
    expect(allocateRanks(MAXED, 15, order, DEFAULT_RANK_SCHEDULE, 'in-order')).toEqual({
      Q: 5,
      W: 5,
      E: 5,
      R: 0,
    });
    expect(allocateRanks(MAXED, 18, order, DEFAULT_RANK_SCHEDULE, 'in-order')).toEqual(MAXED);
  });

  it('the two placements really do differ at level 12', () => {
    const first = allocateRanks(MAXED, 12, ['Q', 'W', 'E']);
    const inOrder = allocateRanks(MAXED, 12, ['Q', 'W', 'E', 'R'], DEFAULT_RANK_SCHEDULE, 'in-order');
    expect(first).not.toEqual(inOrder);
  });
});

describe('allocateRanks — the first skill point can only be spent on a BASIC ability', () => {
  // "The first skill point can be spent on any basic ability." (wiki, read 2026-08-15)
  const ELISE_SCHEDULE: RankSchedule = {
    ...DEFAULT_RANK_SCHEDULE,
    ultimateRankLevels: [1, 6, 11, 16],
  };
  const target: Ranks = { Q: 5, W: 5, E: 5, R: 4 };

  it('spends level 1 on a basic even when the schedule offers the ultimate at level 1', () => {
    expect(allocateRanks(target, 1, ['Q', 'W', 'E'], ELISE_SCHEDULE)).toEqual({
      Q: 1,
      W: 0,
      E: 0,
      R: 0,
    });
  });

  it('takes that ultimate at level 2 instead', () => {
    expect(allocateRanks(target, 2, ['Q', 'W', 'E'], ELISE_SCHEDULE)).toEqual({
      Q: 1,
      W: 0,
      E: 0,
      R: 1,
    });
  });

  it('changes nothing under the default schedule, where no ultimate exists at level 1', () => {
    expect(allocateRanks(MAXED, 1, ['Q', 'W', 'E'])).toEqual({ Q: 1, W: 0, E: 0, R: 0 });
    expect(allocateRanks(MAXED, 5, ['Q', 'W', 'E'])).toEqual({ Q: 3, W: 2, E: 0, R: 0 });
  });
});

// ---------------------------------------------------------------------------------------
// I. `beyond-schedule` on a DRAWN point is impossible under ANY schedule
// ---------------------------------------------------------------------------------------

describe('damageVsLevel — the invariant rule 3 installs, swept across schedules and builds', () => {
  // WHY THIS IS A SWEEP AND NOT AN ARGUMENT. `impossibleBuildProblems` refuses exactly when some
  // slot's configured rank exceeds the schedule's ceiling, and `rankShortfallAt` says
  // `beyond-schedule` on exactly the same condition. The two are complements by construction, so
  // the invariant holds for every schedule and not only the default — but "by construction" is a
  // claim, and this is the measurement of it.
  const SCHEDULES: ReadonlyArray<{ name: string; schedule: RankSchedule }> = [
    { name: 'default (5 basic ranks, 3 ultimate)', schedule: DEFAULT_RANK_SCHEDULE },
    {
      name: 'four-rank ultimate (Elise, Karma, Nidalee)',
      schedule: { basicRankLevels: [1, 3, 5, 7, 9], ultimateRankLevels: [1, 6, 11, 16] },
    },
    {
      name: 'six-rank basics (Udyr, Jayce, Aphelios, Yuumi Q)',
      schedule: { basicRankLevels: [1, 3, 5, 7, 9, 11], ultimateRankLevels: [6, 11, 16] },
    },
    {
      name: 'a schedule naming a level no champion reaches',
      schedule: { basicRankLevels: [1, 3, 5, 7, 9, 25], ultimateRankLevels: [6, 11, 16] },
    },
  ];

  const BUILDS: ReadonlyArray<Ranks> = [
    { Q: 5, W: 5, E: 5, R: 3 },
    { Q: 6, W: 6, E: 6, R: 6 },
    { Q: 6, W: 5, E: 5, R: 3 },
    { Q: 5, W: 5, E: 5, R: 4 },
    { Q: 4, W: 4, E: 4, R: 2 },
    { Q: 6, W: 6, E: 5, R: 1 },
  ];

  it('never draws a point whose rank NO level could reach — 4 schedules x 6 builds x 18 levels', () => {
    const offenders: string[] = [];
    let computed = 0;
    let refused = 0;

    for (const { name, schedule } of SCHEDULES) {
      for (const build of BUILDS) {
        for (const policy of [
          { kind: 'as-configured' } as const,
          { kind: 'priority', order: ['Q', 'W', 'E'] } as const,
        ]) {
          const series = sweep(qOnly('Sixer', build), {
            who: 'attacker',
            ranks: policy,
            schedule,
          });
          for (const point of series.points) {
            if (point.status !== 'computed') {
              refused += 1;
              continue;
            }
            computed += 1;
            for (const short of point.applied.rankShortfall) {
              if (short.cause === 'beyond-schedule') {
                offenders.push(`${name} / ${policy.kind} / level ${point.x} / ${short.slot}`);
              }
            }
          }
        }
      }
    }

    expect(offenders).toEqual([]);
    // It cannot pass by finding nothing to check: 4 x 6 x 2 x 18 = 864 points, and both a real
    // computed population and a real refused one have to be in there.
    expect(computed + refused).toBe(864);
    expect(computed).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
  });

  it('a defender-only sweep draws the configured build exactly, so nothing can be short', () => {
    const series = sweep(qOnly('Fiver', MAXED), {
      who: 'defender',
      ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
    });
    for (const point of series.points) {
      expect(point.applied.ranks).toEqual(MAXED);
      expect(point.applied.rankShortfall).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------
// J. The documented trap in allocateRanks, pinned so it cannot be forgotten
// ---------------------------------------------------------------------------------------

describe('allocateRanks — it caps at the schedule, so callers must check impossibility FIRST', () => {
  it('LOWERS an unreachable target rather than refusing — this is why damageVsLevel checks', () => {
    // Kept as a test rather than fixed inside allocateRanks, because the function is the pure
    // schedule walk and refusing is the sweep's job. The assertion below IS the original defect;
    // what changed is that damageVsLevel no longer reaches this call with such a target.
    expect(allocateRanks({ Q: 6, W: 6, E: 6, R: 6 }, 18, ['Q', 'W', 'E'])).toEqual({
      Q: 5,
      W: 5,
      E: 5,
      R: 3,
    });
    expect(impossibleBuildProblems({ Q: 6, W: 6, E: 6, R: 6 })).not.toEqual([]);
  });
});
