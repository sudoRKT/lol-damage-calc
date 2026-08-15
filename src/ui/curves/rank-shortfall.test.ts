// THE RANK SHORTFALL, RE-DERIVED THROUGH THE REAL ENGINE RATHER THAN READ OFF A COMMENT.
//
// `rank-shortfall.ts` arrived with a table in its header naming seven champions and the ranks each
// one is drawn at. A table in a comment is a claim, and this project's rule is that nothing is true
// because someone believed it. So the first block below runs `allocateRanks` and `damageVsLevel`
// over all 173 published champions and reproduces every figure in that header independently: the
// seven names, each champion's configured and drawn ranks, and the count of champions that compute
// nothing under each policy.
//
// THE POPULATION, DEFINED ONCE. Every champion in the published roster, configured at level 18 with
// each ability at the rank the roster file records (`abilityMaxRanks` — never a rank invented here),
// running Q → W → E → R → basic attack against a level-18 Garen. That is the same population
// `roster-curves.test.ts` measures, chosen deliberately so the two files' counts can be read
// against each other.
//
// WHAT THIS FILE DOES NOT CHECK: any damage figure. Nothing in `rank-shortfall.ts` touches damage —
// it compares two sets of integers and produces sentences. Whether a damage number is right is the
// engine's own suite (CLAUDE.md).

import { describe, expect, it } from 'vitest';
import type { Champion, ChampionConfig, ComboStep, Scenario } from '../../types';
import {
  DEFAULT_RANK_SCHEDULE,
  allocateRanks,
  buildSeries,
  damageVsLevel,
  type LevelSweepSeries,
  type Ranks,
  type SweepPoint,
} from '../../engine';
import { buildCatalogue, loadAbilities, loadItems } from '../data/catalogue';
import { loadRoster } from '../data/roster';
import { fetchPublished } from '../data/published-files';
import {
  LEVELLING_ORDERS,
  TOP_OF_CURVE_NOTE,
  annotateNotes,
  appliedLevelRanks,
  levelRanges,
  noteConfirmation,
  noteContradictionText,
  orderPhrase,
  policyDetail,
  policyPhrase,
  rankShortfall,
  ranksPhrase,
  scheduleCap,
  shortfallAt,
  shortfallDescription,
  shortfallSentences,
  shortfallWarnings,
  unreachableSentence,
} from './rank-shortfall';

// ---------------------------------------------------------------------------------------
// The population
// ---------------------------------------------------------------------------------------

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
const catalogue = buildCatalogue({ champions: roster, items, abilities });

const COMBO: ComboStep[] = [
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'w1', kind: 'ability', ref: 'W' },
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'r1', kind: 'ability', ref: 'R' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
];

function maxed(champion: Champion): ChampionConfig {
  return {
    apiname: champion.apiname,
    level: 18,
    abilityRanks: {
      Q: champion.abilityMaxRanks.Q ?? 1,
      W: champion.abilityMaxRanks.W ?? 1,
      E: champion.abilityMaxRanks.E ?? 1,
      R: champion.abilityMaxRanks.R ?? 1,
    },
    items: [],
    runes: { keystone: null, primary: [], secondary: [], shards: [] },
    persistent: {},
    entryState: {},
  };
}

const GAREN = roster.find((c) => c.apiname === 'Garen')!;

function scenarioFor(champion: Champion): Scenario {
  return {
    version: 2,
    attacker: maxed(champion),
    defender: { ...maxed(GAREN), apiname: 'Garen' },
    combo: COMBO,
  };
}

/** The levelling order this file measures with. One order, stated, never a silent default. */
const ORDER = ['Q', 'W', 'E'] as const;

const priorityRuns = roster.map((champion) => ({
  champion,
  configured: scenarioFor(champion).attacker.abilityRanks as Ranks,
  outcome: damageVsLevel(scenarioFor(champion), catalogue, {
    who: 'both',
    ranks: { kind: 'priority', order: ORDER },
  }),
}));

const asConfiguredRuns = roster.map((champion) => ({
  champion,
  outcome: damageVsLevel(scenarioFor(champion), catalogue, {
    who: 'both',
    ranks: { kind: 'as-configured' },
  }),
}));

// ---------------------------------------------------------------------------------------
// 1. The header's table, reproduced from the engine
// ---------------------------------------------------------------------------------------

describe('rank-shortfall/re-derivation — the header table is a measurement, not a memory', () => {
  it('measures a real roster, so it cannot pass by finding nothing to look at', () => {
    expect(roster.length).toBeGreaterThan(150);
    expect(priorityRuns.every((r) => r.outcome.ok)).toBe(true);
    expect(asConfiguredRuns.every((r) => r.outcome.ok)).toBe(true);
  });

  it('names exactly the seven champions whose level-18 build the schedule cannot express', () => {
    const short = priorityRuns
      .filter(({ configured }) => {
        const drawn = allocateRanks(configured, 18, ORDER);
        return (['Q', 'W', 'E', 'R'] as const).some((slot) => drawn[slot] < configured[slot]);
      })
      .map((r) => r.champion.apiname)
      .sort();
    expect(short).toEqual(['Aphelios', 'Elise', 'Jayce', 'Karma', 'Nidalee', 'Udyr', 'Yuumi']);
  });

  it('reproduces every configured-versus-drawn pair the header prints', () => {
    // The header's own table, transcribed here so a failure names the row that moved. Measured
    // through `allocateRanks` at level 18 with the order above; nothing is hand-computed.
    const expected: Record<string, { configured: string; drawn: string }> = {
      Aphelios: { configured: 'Q6 W6 E6 R3', drawn: 'Q5 W5 E5 R3' },
      Elise: { configured: 'Q5 W5 E5 R4', drawn: 'Q5 W5 E5 R3' },
      Jayce: { configured: 'Q6 W6 E6 R1', drawn: 'Q5 W5 E5 R1' },
      Karma: { configured: 'Q5 W5 E5 R4', drawn: 'Q5 W5 E5 R3' },
      Nidalee: { configured: 'Q5 W5 E5 R4', drawn: 'Q5 W5 E5 R3' },
      Udyr: { configured: 'Q6 W6 E6 R6', drawn: 'Q5 W5 E5 R3' },
      Yuumi: { configured: 'Q6 W5 E5 R3', drawn: 'Q5 W5 E5 R3' },
    };
    const measured: Record<string, { configured: string; drawn: string }> = {};
    for (const name of Object.keys(expected)) {
      const run = priorityRuns.find((r) => r.champion.apiname === name)!;
      measured[name] = {
        configured: ranksPhrase(run.configured),
        drawn: ranksPhrase(allocateRanks(run.configured, 18, ORDER)),
      };
    }
    expect(measured).toEqual(expected);
  });

  it('THE DEFECT IS NOW FIXED AT SOURCE, and the same seven are refused under BOTH policies', () => {
    // ═══ RE-BASELINED 2026-08-15, AND THIS IS A FALLING COUNT THAT IS THE SYSTEM WORKING ═══
    //
    // When this file was written, `priority` drew all seven of these champions a full curve at a
    // LOWER build than the one configured — that was the defect `rank-shortfall.ts` exists to make
    // visible. `src/engine/level-sweep.ts` then fixed it at source: a build no champion level can
    // hold is refused at every level under both policies rather than quietly lowered.
    //
    // DEFINITION of "computes nothing": the series was produced (no wholesale refusal) and its
    // `computedCount` is 0, so the chart draws no line at all and every row states a reason.
    const emptyUnder = (
      runs: ReadonlyArray<{ champion: Champion; outcome: { ok: true; series: LevelSweepSeries } | { ok: false } }>,
    ) =>
      runs
        .filter((r) => r.outcome.ok && r.outcome.series.computedCount === 0)
        .map((r) => r.champion.apiname)
        .sort();

    const SEVEN = ['Aphelios', 'Elise', 'Jayce', 'Karma', 'Nidalee', 'Udyr', 'Yuumi'];
    expect(emptyUnder(asConfiguredRuns)).toEqual(SEVEN);
    // The line that used to read `toEqual([])`. A refusal is the honest answer and the interface
    // already draws it: eighteen hatched bands and eighteen stated reasons.
    expect(emptyUnder(priorityRuns)).toEqual(SEVEN);
  });

  it('so NO computed point anywhere on the roster is short by `beyond-schedule` any more', () => {
    // The invariant the engine's fix installs, measured rather than taken from its header. This is
    // also why the plot mark is no longer keyed on that cause — see `RankShortfall.markedPoints`.
    const causes = new Set<string>();
    for (const run of priorityRuns) {
      if (!run.outcome.ok) continue;
      for (const point of rankShortfall(run.outcome.series, run.configured).points) {
        for (const slot of point.short) causes.add(slot.cause);
      }
    }
    expect([...causes].sort()).toEqual(['level-cap', 'order-priority']);
  });

  it('and no curve in the roster now has a top below the configured build', () => {
    const flagged = priorityRuns
      .filter((r) => r.outcome.ok && rankShortfall(r.outcome.series, r.configured).topBelowConfigured)
      .map((r) => r.champion.apiname);
    expect(flagged).toEqual([]);
  });

  it('reads no ranks at all out of an `as-configured` series it can still compare', () => {
    // A defence against the check silently doing nothing. Every point of a level sweep carries an
    // AppliedLevel, refused points included, so the readable count equals the computed count.
    for (const run of priorityRuns) {
      if (!run.outcome.ok) continue;
      const shortfall = rankShortfall(run.outcome.series, run.configured);
      expect(shortfall.unreadableCount).toBe(0);
      expect(shortfall.readableCount).toBe(run.outcome.series.computedCount);
    }
  });
});

// ---------------------------------------------------------------------------------------
// 2. What the module claims about itself
// ---------------------------------------------------------------------------------------

describe('rank-shortfall/causes — three causes, because they have three fixes', () => {
  it('calls a rank no level can reach `beyond-schedule`', () => {
    const short = shortfallAt({ Q: 6, W: 5, E: 5, R: 3 }, { Q: 5, W: 5, E: 5, R: 3 }, 18);
    expect(short).toEqual([{ slot: 'Q', configured: 6, drawn: 5, cause: 'beyond-schedule' }]);
  });

  it('calls a rank this level has not unlocked `level-cap`', () => {
    // Rank 3 of a basic needs level 5, so at level 4 it is the level that is short, not the order.
    const short = shortfallAt({ Q: 3, W: 0, E: 0, R: 0 }, { Q: 2, W: 0, E: 0, R: 0 }, 4);
    expect(short).toEqual([{ slot: 'Q', configured: 3, drawn: 2, cause: 'level-cap' }]);
  });

  it('calls a rank the level allows but the order did not buy `order-priority`', () => {
    const short = shortfallAt({ Q: 3, W: 3, E: 0, R: 0 }, { Q: 3, W: 1, E: 0, R: 0 }, 9);
    expect(short).toEqual([{ slot: 'W', configured: 3, drawn: 1, cause: 'order-priority' }]);
  });

  it('reports nothing when the drawn ranks meet or exceed the build', () => {
    expect(shortfallAt({ Q: 5, W: 5, E: 5, R: 3 }, { Q: 5, W: 5, E: 5, R: 3 }, 18)).toEqual([]);
    expect(shortfallAt({ Q: 1, W: 1, E: 1, R: 1 }, { Q: 5, W: 5, E: 5, R: 3 }, 18)).toEqual([]);
  });

  it('reads the schedule’s ceiling from the schedule, not from a constant', () => {
    expect(scheduleCap('Q', DEFAULT_RANK_SCHEDULE)).toBe(5);
    expect(scheduleCap('R', DEFAULT_RANK_SCHEDULE)).toBe(3);
    const sixRank = { basicRankLevels: [1, 3, 5, 7, 9, 11], ultimateRankLevels: [6, 11, 16] };
    expect(scheduleCap('Q', sixRank)).toBe(6);
    // Udyr's own schedule makes his Q6 reachable, so the shortfall disappears rather than being
    // suppressed — which is the fix the `beyond-schedule` cause points at.
    expect(shortfallAt({ Q: 6, W: 5, E: 5, R: 3 }, { Q: 6, W: 5, E: 5, R: 3 }, 18, sixRank)).toEqual(
      [],
    );
  });
});

describe('rank-shortfall/reading a series it was not given', () => {
  const point = (x: number, applied: unknown): SweepPoint<unknown> => ({
    x,
    label: `level ${x}`,
    applied,
    status: 'computed',
    summary: {
      burst: { total: 100, byType: { physical: 100, magic: 0, true: 0 } },
      dot: { total: 0, byType: { physical: 0, magic: 0, true: 0 } },
      verdict: {
        burstOnly: { lethal: false, lethalAtInstance: null, remainingHp: 900, damageApplied: 100, healingApplied: 0 },
        burstPlusDot: { lethal: false, lethalAtInstance: null, remainingHp: 900, damageApplied: 100, healingApplied: 0 },
      },
      attackerLevel: x,
      defenderLevel: x,
      defenderHp: 1000,
      verification: 'derived',
      partial: false,
      incompleteContributors: [],
    },
  });

  it('reads ranks out of a real AppliedLevel', () => {
    expect(appliedLevelRanks({ attackerLevel: 9, defenderLevel: 9, ranks: { Q: 5, W: 2, E: 0, R: 1 } }))
      .toEqual({ attackerLevel: 9, ranks: { Q: 5, W: 2, E: 0, R: 1 }, configuredRanks: null });
  });

  it('reads the point’s OWN record of the configured build when the engine supplies one', () => {
    expect(
      appliedLevelRanks({
        attackerLevel: 9,
        ranks: { Q: 5, W: 2, E: 0, R: 1 },
        configuredRanks: { Q: 5, W: 5, E: 5, R: 3 },
      })?.configuredRanks,
    ).toEqual({ Q: 5, W: 5, E: 5, R: 3 });
  });

  it('returns null rather than guessing, for every payload that is not one', () => {
    expect(appliedLevelRanks(null)).toBeNull();
    expect(appliedLevelRanks(undefined)).toBeNull();
    expect(appliedLevelRanks({ armor: 100, magicResistance: 50 })).toBeNull();
    expect(appliedLevelRanks({ attackerLevel: 9, ranks: { Q: 5, W: 2, E: 0 } })).toBeNull();
    expect(appliedLevelRanks({ ranks: { Q: 5, W: 2, E: 0, R: 1 } })).toBeNull();
  });

  it('COUNTS the points it could not compare instead of calling them clean', () => {
    const series = buildSeries<unknown>({
      kind: 'resistance',
      axisLabel: 'target armor',
      points: [point(0, { armor: 0 }), point(50, { armor: 50 })],
    });
    const shortfall = rankShortfall(series, { Q: 6, W: 6, E: 6, R: 6 });
    expect(shortfall.computedCount).toBe(2);
    expect(shortfall.readableCount).toBe(0);
    expect(shortfall.unreadableCount).toBe(2);
    expect(shortfall.points).toEqual([]);
    expect(shortfall.topBelowConfigured).toBe(false);
    // And it SAYS so, rather than printing nothing and reading as "all clear".
    expect(shortfallWarnings(shortfall).join(' ')).toContain('could not be compared with your build');
  });

  it('a mixed series compares the points it can and counts the rest', () => {
    const series = buildSeries<unknown>({
      kind: 'level',
      axisLabel: 'attacker level',
      points: [
        point(17, { attackerLevel: 17, ranks: { Q: 5, W: 5, E: 5, R: 3 } }),
        point(18, null),
      ],
    });
    const shortfall = rankShortfall(series, { Q: 6, W: 5, E: 5, R: 3 });
    expect(shortfall.readableCount).toBe(1);
    expect(shortfall.unreadableCount).toBe(1);
    expect(shortfall.points).toHaveLength(1);
    expect(shortfall.top?.attackerLevel).toBe(17);
  });
});

describe('rank-shortfall/the caller can be comparing against the wrong build', () => {
  // `configured` is an ARGUMENT, so nothing stops a page passing one champion's build beside
  // another champion's curve. Since the engine started recording `AppliedLevel.configuredRanks`
  // the two can be compared, and a disagreement is reported rather than quietly resolved.
  const garen = roster.find((c) => c.apiname === 'Garen')!;
  const real = damageVsLevel(scenarioFor(garen), catalogue, {
    who: 'both',
    ranks: { kind: 'priority', order: ORDER },
  });
  const series = (real as { ok: true; series: LevelSweepSeries }).series;

  it('agrees silently when the caller passes the build the curve was drawn against', () => {
    const right = rankShortfall(series, scenarioFor(garen).attacker.abilityRanks as Ranks);
    expect(right.configuredMismatch).toBeNull();
    expect(shortfallWarnings(right).join(' ')).not.toContain('may be against the wrong build');
  });

  it('REPORTS a disagreement, naming both builds, and adjusts neither', () => {
    const wrong = rankShortfall(series, { Q: 6, W: 6, E: 6, R: 6 });
    expect(wrong.configuredMismatch).toEqual({
      stated: { Q: 6, W: 6, E: 6, R: 6 },
      seriesSays: { Q: 5, W: 5, E: 5, R: 3 },
    });
    const first = shortfallWarnings(wrong)[0]!;
    expect(first).toContain('may be against the wrong build');
    expect(first).toContain('Q6 W6 E6 R6');
    expect(first).toContain('Q5 W5 E5 R3');
    expect(first).toContain('Nothing below has been adjusted');
    // And it is said FIRST, because every later sentence is about the build the caller stated.
    expect(shortfallWarnings(wrong).indexOf(first)).toBe(0);
  });

  it('treats a series that records no configured build as SILENCE, not agreement', () => {
    const handBuilt = buildSeries<unknown>({
      kind: 'level',
      axisLabel: 'attacker level',
      points: [
        {
          x: 18,
          label: 'attacker level 18',
          applied: { attackerLevel: 18, ranks: { Q: 5, W: 5, E: 5, R: 3 } },
          status: 'computed',
          summary: {
            burst: { total: 100, byType: { physical: 100, magic: 0, true: 0 } },
            dot: { total: 0, byType: { physical: 0, magic: 0, true: 0 } },
            verdict: {
              burstOnly: { lethal: false, lethalAtInstance: null, remainingHp: 900, damageApplied: 100, healingApplied: 0 },
              burstPlusDot: { lethal: false, lethalAtInstance: null, remainingHp: 900, damageApplied: 100, healingApplied: 0 },
            },
            attackerLevel: 18,
            defenderLevel: 18,
            defenderHp: 1000,
            verification: 'derived',
            partial: false,
            incompleteContributors: [],
          },
        },
      ],
    });
    expect(rankShortfall(handBuilt, { Q: 6, W: 6, E: 6, R: 6 }).configuredMismatch).toBeNull();
  });
});

describe('rank-shortfall/refusals stay refused', () => {
  it('never inspects, counts or reports a refused point', () => {
    const series = buildSeries<unknown>({
      kind: 'level',
      axisLabel: 'attacker level',
      points: [
        {
          x: 1,
          label: 'level 1',
          applied: { attackerLevel: 1, defenderLevel: 1, ranks: { Q: 1, W: 0, E: 0, R: 0 } },
          status: 'refused',
          refusals: [{ path: 'combo[3]', reason: 'the combo casts R' }],
        },
        {
          x: 18,
          label: 'level 18',
          applied: { attackerLevel: 18, defenderLevel: 18, ranks: { Q: 5, W: 5, E: 5, R: 3 } },
          status: 'computed',
          summary: {
            burst: { total: 100, byType: { physical: 100, magic: 0, true: 0 } },
            dot: { total: 0, byType: { physical: 0, magic: 0, true: 0 } },
            verdict: {
              burstOnly: { lethal: false, lethalAtInstance: null, remainingHp: 900, damageApplied: 100, healingApplied: 0 },
              burstPlusDot: { lethal: false, lethalAtInstance: null, remainingHp: 900, damageApplied: 100, healingApplied: 0 },
            },
            attackerLevel: 18,
            defenderLevel: 18,
            defenderHp: 1000,
            verification: 'derived',
            partial: false,
            incompleteContributors: [],
          },
        },
      ],
    });
    const shortfall = rankShortfall(series, { Q: 6, W: 6, E: 6, R: 6 });
    // The refused level-1 point holds ranks far below the build and is NOT reported: it drew
    // nothing, and marking it would put a second mark where a refusal already is.
    expect(shortfall.computedCount).toBe(1);
    expect(shortfall.shortXs).toEqual([18]);
    expect(shortfall.points.map((p) => p.attackerLevel)).toEqual([18]);
  });
});

// ---------------------------------------------------------------------------------------
// 3. The words the chart prints
// ---------------------------------------------------------------------------------------

describe('rank-shortfall/wording', () => {
  it('writes a levelling order in speech, never with a greater-than sign', () => {
    expect(orderPhrase(['Q', 'W', 'E'])).toBe('Q then W then E');
    expect(orderPhrase(['Q', 'W', 'E'])).not.toContain('>');
  });

  it('offers all six orders of the three basics, none marked as preferred', () => {
    expect(LEVELLING_ORDERS).toHaveLength(6);
    expect(new Set(LEVELLING_ORDERS.map((o) => o.join('')))).toEqual(
      new Set(['EQW', 'EWQ', 'QEW', 'QWE', 'WEQ', 'WQE']),
    );
  });

  it('prints the policy as the one line a reader needs to judge the curve', () => {
    expect(policyPhrase({ kind: 'priority', order: ['Q', 'W', 'E'] })).toBe(
      'Levelling order: Q then W then E',
    );
    expect(policyPhrase({ kind: 'as-configured' })).toBe(
      'Ability ranks: held exactly as configured',
    );
    expect(policyDetail({ kind: 'as-configured' })).toContain('refused rather than adjusted');
    expect(policyDetail({ kind: 'priority', order: ['Q'] })).toContain(
      'not a fact about this champion',
    );
  });

  it('prints a set of ranks the way a player reads their own ability bar', () => {
    expect(ranksPhrase({ Q: 5, W: 5, E: 5, R: 3 })).toBe('Q5 W5 E5 R3');
    expect(ranksPhrase({ Q: 0, W: 0, E: 0, R: 0 })).toBe('Q0 W0 E0 R0');
  });

  it('compresses levels into runs so a full curve is one short phrase', () => {
    expect(levelRanges([1, 2, 3, 4, 5])).toBe('1–5');
    expect(levelRanges([6, 9, 12])).toBe('6, 9 and 12');
    expect(levelRanges([1, 2, 3, 7, 8, 15])).toBe('1–3, 7–8 and 15');
    expect(levelRanges([4])).toBe('4');
    expect(levelRanges([])).toBe('');
    expect(levelRanges([9, 3, 3, 1])).toBe('1, 3 and 9');
  });

  it('groups slots that are short in the same way into ONE sentence', () => {
    const sentences = shortfallSentences([
      { slot: 'Q', configured: 6, drawn: 5, cause: 'beyond-schedule' },
      { slot: 'W', configured: 6, drawn: 5, cause: 'beyond-schedule' },
      { slot: 'E', configured: 6, drawn: 5, cause: 'beyond-schedule' },
      { slot: 'R', configured: 6, drawn: 3, cause: 'beyond-schedule' },
    ]);
    expect(sentences).toEqual([
      'Q, W and E are drawn at rank 5, and your build states rank 6.',
      'R is drawn at rank 3, and your build states rank 6.',
    ]);
  });

  it('says how many ranks the schedule it used actually describes', () => {
    expect(unreachableSentence()).toContain('5 ranks for a basic ability and 3 for the ultimate');
  });
});

describe('rank-shortfall/warnings — a TRUNCATED sweep, end to end through the engine', () => {
  // THE CASE THE ENGINE'S FIX DOES NOT COVER, and therefore the one the mark now exists for.
  //
  // `damageVsLevel` takes the levels to evaluate. Stop a curve at level 14 and its top is level 14,
  // which for a level-18 build is BELOW what the user configured — no rank is out of reach, the
  // curve simply never gets there. Nothing refuses, the line is full and continuous, and without a
  // mark a reader would take the right-hand end for their build. That is the same failure the
  // original defect had, arriving by a different route.
  const garen = roster.find((c) => c.apiname === 'Garen')!;
  const configured = scenarioFor(garen).attacker.abilityRanks as Ranks;
  const outcome = damageVsLevel(scenarioFor(garen), catalogue, {
    who: 'both',
    ranks: { kind: 'priority', order: ORDER },
    levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  });
  const series = (outcome as { ok: true; series: LevelSweepSeries }).series;
  const shortfall = rankShortfall(series, configured);

  it('measures a curve that really does stop short — 2 drawn points, top at level 14', () => {
    expect(configured).toEqual({ Q: 5, W: 5, E: 5, R: 3 });
    expect(shortfall.readableCount).toBe(2);
    expect(shortfall.top?.attackerLevel).toBe(14);
    expect(shortfall.topBelowConfigured).toBe(true);
    // And no rank is unreachable — the engine's fix guarantees that on a computed point.
    expect(shortfall.anyUnreachable).toBe(false);
  });

  it('leads with the top of the curve, because that is the number a reader trusts most', () => {
    const lines = shortfallWarnings(shortfall);
    expect(lines[0]).toContain('BELOW the build you configured');
    expect(lines[0]).toContain('level 14');
  });

  it('names every short slot with both ranks', () => {
    const text = shortfallWarnings(shortfall).join(' ');
    expect(text).toContain('E is drawn at rank 2, and your build states rank 5.');
    expect(text).toContain('R is drawn at rank 2, and your build states rank 3.');
  });

  it('does NOT claim the ranks are out of reach, because they are not', () => {
    expect(shortfallWarnings(shortfall).join(' ')).not.toContain('No level on this curve can reach');
  });

  it('ends with a count against a stated denominator', () => {
    const last = shortfallWarnings(shortfall).at(-1)!;
    expect(last).toMatch(/^Marked on the plot: \d+ of the \d+ points this curve draws/);
    expect(shortfall.markedPoints.length).toBe(shortfall.readableCount);
    expect(last).toContain('every one of them');
  });

  it('describes the marks for a reader who cannot see the plot', () => {
    expect(shortfallDescription(shortfall)).toContain('dotted vertical rule');
    expect(shortfallDescription(shortfall)).toContain('never reaches your configured rank in');
  });
});

describe('rank-shortfall/the mark is not put on all 173 curves', () => {
  // THE MEASUREMENT THAT FORCED THE RULE, pinned so it cannot be lost. Under a levelling order
  // every champion's low levels sit below their level-18 build, because that is what levelling is.
  // A mark on all of them would be a mark on every curve in the product, saying nothing.
  const garen = priorityRuns.find((r) => r.champion.apiname === 'Garen')!;
  const clean = rankShortfall(
    (garen.outcome as { ok: true; series: LevelSweepSeries }).series,
    garen.configured,
  );

  it('Garen over 1–18: 5 of his 6 drawn points ARE below his build, and NONE is marked', () => {
    expect(clean.readableCount).toBe(6);
    expect(clean.points).toHaveLength(5);
    expect(clean.markedPoints).toEqual([]);
    expect(clean.markedXs).toEqual([]);
    expect(clean.topBelowConfigured).toBe(false);
    expect(shortfallDescription(clean)).toBeNull();
  });

  it('and it still SAYS so, in the sentence that says it is not a defect', () => {
    const text = shortfallWarnings(clean).join(' ');
    expect(text).toContain('5 further points are below your build only because the level has not');
    expect(text).toContain('The curve does reach your build above them, so they are not marked.');
    expect(text).not.toContain('BELOW the build you configured');
  });

  it('across the whole roster at levels 1–18, NOT ONE curve carries a mark', () => {
    // The honest consequence of the engine's fix: every curve that draws at all now reaches the
    // configured build at its top. The mark fires on a truncated range and on nothing else, which
    // is the block above. Pinned so that if a curve ever starts carrying one, someone is told.
    const marked = priorityRuns
      .filter((r) => r.outcome.ok && rankShortfall(r.outcome.series, r.configured).markedXs.length > 0)
      .map((r) => r.champion.apiname);
    expect(marked).toEqual([]);
  });

  it('while 166 curves DO carry a short point that is deliberately left unmarked', () => {
    const unmarkedButShort = priorityRuns.filter((r) => {
      if (!r.outcome.ok) return false;
      const s = rankShortfall(r.outcome.series, r.configured);
      return s.markedXs.length === 0 && s.points.length > 0;
    });
    expect(unmarkedButShort.length).toBe(166);
  });
});

// ---------------------------------------------------------------------------------------
// 4. The cross-check against the engine's own notes
// ---------------------------------------------------------------------------------------

describe('rank-shortfall/notes — checked against the strings the engine really writes', () => {
  const notesFor = (options: Parameters<typeof damageVsLevel>[2]) => {
    const outcome = damageVsLevel(scenarioFor(GAREN), catalogue, options);
    if (!outcome.ok) throw new Error('the probe scenario refused wholesale');
    return outcome.series.notes;
  };

  const priorityNotes = notesFor({ who: 'both', ranks: { kind: 'priority', order: ORDER } });
  const configuredNotes = notesFor({ who: 'both', ranks: { kind: 'as-configured' } });
  const defenderNotes = notesFor({ who: 'defender', ranks: { kind: 'priority', order: ORDER } });

  it('confirms a priority series against the order the caller says produced it', () => {
    expect(noteConfirmation(priorityNotes, { kind: 'priority', order: ORDER })).toBe('confirmed');
  });

  it('confirms an as-configured series', () => {
    expect(noteConfirmation(configuredNotes, { kind: 'as-configured' })).toBe('confirmed');
  });

  it('contradicts a caller printing an order the series was not computed with', () => {
    expect(noteConfirmation(priorityNotes, { kind: 'priority', order: ['E', 'W', 'Q'] })).toBe(
      'contradicted',
    );
    expect(noteContradictionText(priorityNotes)).toContain('Q then W then E');
  });

  it('CATCHES THE DEFENDER-SWEEP TRAP, which is a real caller mistake and not a hypothetical', () => {
    // `damageVsLevel` applies a rank policy only where the attacker moves. Pass `priority` with
    // `who: 'defender'` and the engine holds the ranks as configured — so a chart printing
    // "Levelling order: Q then W then E" beside it would be naming a policy that did nothing.
    expect(noteConfirmation(defenderNotes, { kind: 'priority', order: ORDER })).toBe('contradicted');
    expect(noteContradictionText(defenderNotes)).toContain('held exactly as configured');
  });

  it('treats absent notes as absent, never as agreement', () => {
    expect(noteConfirmation([], { kind: 'priority', order: ORDER })).toBe('absent');
    expect(noteConfirmation([], { kind: 'as-configured' })).toBe('absent');
    expect(noteConfirmation(['Both champions level together.'], { kind: 'as-configured' })).toBe(
      'absent',
    );
  });
});

describe('rank-shortfall/annotateNotes — a guard the engine has made dormant', () => {
  // This correction answered a note `level-sweep.ts` used to write and no longer does. Both facts
  // are pinned: that the engine is now correct, and that the guard still fires if it stops being.
  const garen = roster.find((c) => c.apiname === 'Garen')!;
  const configured = scenarioFor(garen).attacker.abilityRanks as Ranks;
  const truncated = damageVsLevel(scenarioFor(garen), catalogue, {
    who: 'both',
    ranks: { kind: 'priority', order: ORDER },
    levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  });
  const series = (truncated as { ok: true; series: LevelSweepSeries }).series;
  const shortfall = rankShortfall(series, configured);

  it('THE ENGINE NO LONGER WRITES THE FALSE NOTE, even on a curve whose top IS below the build', () => {
    expect(shortfall.topBelowConfigured).toBe(true);
    expect(series.notes.some((note) => note.includes(TOP_OF_CURVE_NOTE))).toBe(false);
    // It writes the truth instead, which is why nothing needs contradicting.
    expect(series.notes.join(' ')).toContain('the top of this curve is BELOW the configured build');
  });

  it('so it appends its own statement rather than rewriting anything', () => {
    const annotated = annotateNotes(series.notes, shortfall);
    expect(annotated).toHaveLength(series.notes.length + 1);
    expect(annotated.slice(0, -1)).toEqual([...series.notes]);
    expect(annotated.at(-1)).toContain('the top of this curve is BELOW the configured build');
    expect(annotated.at(-1)).toContain('E is drawn at rank 2');
  });

  it('and it STILL contradicts the old wording in place, if a series ever carries it again', () => {
    const stale = [
      'Both champions level together.',
      'No ability is ranked above the build the scenario states, so the top of this curve is the ' +
        'configured build rather than a maxed one.',
    ];
    const annotated = annotateNotes(stale, shortfall);
    expect(annotated).toHaveLength(2);
    expect(annotated[0]).toBe(stale[0]);
    expect(annotated[1]).toContain('THIS DOES NOT APPLY TO THIS CURVE');
    // The engine's own words are QUOTED, so a reader can audit the correction against the source.
    expect(annotated[1]).toContain('No ability is ranked above the build the scenario states');
  });

  it('leaves the notes untouched when the top of the curve IS the configured build', () => {
    const garenFull = priorityRuns.find((r) => r.champion.apiname === 'Garen')!;
    const clean = (garenFull.outcome as { ok: true; series: LevelSweepSeries }).series;
    expect(annotateNotes(clean.notes, rankShortfall(clean, garenFull.configured))).toEqual([
      ...clean.notes,
    ]);
  });
});
