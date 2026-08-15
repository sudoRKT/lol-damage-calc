// THREE CANONICAL SWEEP SERIES, hand-authored, for previews and for the area-wide sweeps.
//
// WHY THESE EXIST RATHER THAN "RUN THE ENGINE IN THE TEST". `../responsive-overflow.test.tsx` and
// the other area-wide sweeps render every table-bearing component in the area, and they must be
// able to do that without loading the published data files or building a catalogue. The burndown
// solved the same problem with `../burndown/mock-variants.ts`; this is that, for curves.
//
// THEY ARE NOT A CLAIM ABOUT ANY CHAMPION. The figures are chosen to exercise the SHAPES a curve
// has to survive — a refusal in the middle of a range, a partial point, damage over time on some
// points and not others — and are deliberately round numbers no champion produces. Real engine
// output is exercised at roster scale in `roster-curves.test.ts`.

import {
  buildSeries,
  type AppliedLevel,
  type Ranks,
  type SweepPoint,
  type SweepSeries,
} from '../../engine';

function point(
  x: number,
  label: string,
  burst: { physical: number; magic: number; true: number },
  options: { dot?: number; hp?: number; lethal?: boolean; excludes?: string[] } = {},
): SweepPoint<null> {
  const total = burst.physical + burst.magic + burst.true;
  const dot = options.dot ?? 0;
  const hp = options.hp ?? 2100;
  const lethal = options.lethal ?? false;
  return {
    x,
    label,
    applied: null,
    status: 'computed',
    summary: {
      burst: { total, byType: burst },
      dot: { total: dot, byType: { physical: 0, magic: dot, true: 0 } },
      verdict: {
        burstOnly: {
          lethal,
          lethalAtInstance: lethal ? 4 : null,
          remainingHp: lethal ? 0 : hp - total,
          damageApplied: lethal ? hp : total,
          healingApplied: 0,
        },
        burstPlusDot: {
          lethal: lethal || hp - total - dot <= 0,
          lethalAtInstance: lethal ? 4 : null,
          remainingHp: Math.max(0, hp - total - dot),
          damageApplied: Math.min(hp, total + dot),
          healingApplied: 0,
        },
      },
      attackerLevel: 11,
      defenderLevel: 11,
      defenderHp: hp,
      verification: 'derived',
      partial: (options.excludes ?? []).length > 0,
      incompleteContributors: options.excludes ?? [],
    },
  };
}

/**
 * A damage-versus-armor curve with a refusal in it.
 *
 * The refusal is the real one `resistance-sweep.ts` produces: below the defender's own base armor
 * the bonus portion goes negative, and percentage BONUS armor penetration has no defined meaning
 * against a negative pool, so the engine refuses that point by name instead of returning a number.
 */
export const MOCK_RESISTANCE_SERIES: SweepSeries<null> = buildSeries<null>({
  kind: 'resistance',
  axisLabel: 'target armor',
  points: [
    {
      x: 0,
      label: '0 armor',
      applied: null,
      status: 'refused',
      refusals: [
        {
          path: 'defender.armor',
          reason:
            'a total of 0 armor is below this defender’s own base armor of 42.5, so reaching it ' +
            'requires -42.5 bonus armor, and the attacker carries percentage bonus armor ' +
            'penetration (18%), which has no defined meaning against a negative bonus pool',
        },
      ],
    },
    point(50, '50 armor', { physical: 780, magic: 240, true: 60 }, { dot: 90, lethal: false }),
    point(100, '100 armor', { physical: 620, magic: 240, true: 60 }, { dot: 90 }),
    point(150, '150 armor', { physical: 520, magic: 240, true: 60 }, { dot: 90 }),
    point(200, '200 armor', { physical: 440, magic: 240, true: 60 }, { dot: 90 }),
    point(250, '250 armor', { physical: 380, magic: 240, true: 60 }, { dot: 90 }),
    point(300, '300 armor', { physical: 340, magic: 240, true: 60 }, { dot: 90 }),
  ],
  excludedMechanics: ['item passives that change on-hit damage', 'defender shields'],
  notes: [
    'Only the target’s resistance moves along this curve. Health, level, build and the combo are ' +
      'identical at every point — so this is not a curve of "buying armor items", which would ' +
      'also add health.',
  ],
});

/**
 * A damage-versus-level curve whose early levels refuse, which is what a configured level-18 build
 * actually does: it cannot exist at level 3, so the engine refuses rather than inventing ranks.
 *
 * It also carries a contributor excluded at SOME points and not others, which is the case
 * `SweepSeries.incompleteSetVaries` exists to catch — the one hazard in a curve with no visual
 * signature at all.
 */
export const MOCK_LEVEL_SERIES: SweepSeries<null> = buildSeries<null>({
  kind: 'level',
  axisLabel: 'both champions’ level',
  points: [
    ...[1, 2, 3, 4, 5].map(
      (level): SweepPoint<null> => ({
        x: level,
        label: `level ${level}`,
        applied: null,
        status: 'refused',
        refusals: [
          {
            path: 'combo[3]',
            reason:
              'the combo casts R, and at this level the build has 0 points in R — an unlearned ' +
              'ability cannot be cast',
          },
        ],
      }),
    ),
    point(6, 'level 6', { physical: 210, magic: 180, true: 0 }, { hp: 1200, excludes: ['E — Chain'] }),
    point(9, 'level 9', { physical: 320, magic: 260, true: 0 }, { hp: 1450, excludes: ['E — Chain'] }),
    point(12, 'level 12', { physical: 470, magic: 340, true: 0 }, { hp: 1700 }),
    point(15, 'level 15', { physical: 640, magic: 420, true: 0 }, { hp: 1950 }),
    point(18, 'level 18', { physical: 820, magic: 500, true: 0 }, { hp: 2100, lethal: false }),
  ],
  excludedMechanics: ['runes'],
  notes: [
    'Both champions level together.',
    'Ability ranks are held exactly as configured. A level at which that build cannot legally ' +
      'exist is refused rather than adjusted.',
  ],
});

// ---------------------------------------------------------------------------------------
// A LEVEL CURVE THAT RECORDS THE RANKS IT WAS DRAWN AT
// ---------------------------------------------------------------------------------------
//
// The two series above carry `applied: null`, which is all `DamageCurve` needed until it grew a
// rank column. This one carries a real `AppliedLevel` on every point, so the rank comparison, the
// shortfall marks and the table's rank cells can be rendered without loading a data file.
//
// THE RANKS ARE HAND-TRACED, NOT TAKEN FROM `allocateRanks`. One skill point per level, ultimate
// first whenever the game allows it, then Q, then W, then E — written out in full so a reader can
// check every row against the levelling rules rather than against the engine that is being drawn:
//
//   L1 Q1 · L2 W1 · L3 Q2 · L4 W2 · L5 Q3 · L6 R1 · L7 Q4 · L8 W3 · L9 Q5
//   L10 W4 · L11 R2 · L12 W5 · L13 E1 · L14 E2 · L15 E3 · L16 R3 · L17 E4 · L18 E5
//
// Levels 1–12 REFUSE because the combo casts E and no point has been spent on it yet, which is the
// engine's real behaviour and the reason a curve like this starts at 13.

/** Cumulative ranks at each level of the trace above, from level 13 up. */
const TRACE: ReadonlyArray<{ level: number; ranks: Ranks }> = [
  { level: 13, ranks: { Q: 5, W: 5, E: 1, R: 2 } },
  { level: 14, ranks: { Q: 5, W: 5, E: 2, R: 2 } },
  { level: 15, ranks: { Q: 5, W: 5, E: 3, R: 2 } },
  { level: 16, ranks: { Q: 5, W: 5, E: 3, R: 3 } },
  { level: 17, ranks: { Q: 5, W: 5, E: 4, R: 3 } },
  { level: 18, ranks: { Q: 5, W: 5, E: 5, R: 3 } },
];

/**
 * A build the default rank schedule CANNOT express — six ranks of every basic and of the ultimate.
 * This is Udyr's shape, and it is the case where the curve's own top is below what was asked for.
 *
 * READING THE SERIES AGAINST THIS ALSO TRIPS THE CONFIGURED-BUILD CROSS-CHECK, deliberately. Every
 * point below records `configuredRanks: MOCK_RANK_BUILD_REACHABLE`, because a point can only record
 * one build and the series is meant to be read against two. So a chart given this build is being
 * told something the curve itself contradicts — and `RankShortfall.configuredMismatch` says so,
 * which is the third thing this fixture demonstrates rather than a flaw in it.
 */
export const MOCK_RANK_BUILD_UNREACHABLE: Ranks = { Q: 6, W: 6, E: 6, R: 6 };

/**
 * A build the schedule CAN express, reached exactly at level 18. This is the build every point
 * below records as its own `configuredRanks`.
 *
 * The same series read against this build is short at levels 13–17 and whole at 18 — which is what
 * a levelling curve is, and is the case that must NOT be marked. Two builds over one series is
 * deliberate: it puts the difference between "a defect" and "levelling" in one place.
 */
export const MOCK_RANK_BUILD_REACHABLE: Ranks = { Q: 5, W: 5, E: 5, R: 3 };

export const MOCK_RANK_LEVEL_SERIES: SweepSeries<AppliedLevel> = buildSeries<AppliedLevel>({
  kind: 'level',
  axisLabel: 'attacker level',
  points: [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((level): SweepPoint<AppliedLevel> => ({
      x: level,
      label: `attacker level ${level}`,
      applied: {
        attackerLevel: level,
        defenderLevel: 18,
        ranks: { Q: 0, W: 0, E: 0, R: 0 },
        ranksDifferFromScenario: true,
        configuredRanks: MOCK_RANK_BUILD_REACHABLE,
        rankShortfall: [],
      },
      status: 'refused',
      refusals: [
        {
          path: 'combo[2]',
          reason:
            'the combo casts E, and at this level the build has 0 points in E — an unlearned ' +
            'ability cannot be cast',
        },
      ],
    })),
    ...TRACE.map(({ level, ranks }): SweepPoint<AppliedLevel> => {
      const burst = { physical: 40 * level, magic: 30 * level, true: 0 };
      const total = burst.physical + burst.magic + burst.true;
      return {
        x: level,
        label: `attacker level ${level}`,
        applied: {
          attackerLevel: level,
          defenderLevel: 18,
          ranks,
          ranksDifferFromScenario: true,
          configuredRanks: MOCK_RANK_BUILD_REACHABLE,
          rankShortfall: [],
        },
        status: 'computed',
        summary: {
          burst: { total, byType: burst },
          dot: { total: 0, byType: { physical: 0, magic: 0, true: 0 } },
          verdict: {
            burstOnly: {
              lethal: false,
              lethalAtInstance: null,
              remainingHp: 2400 - total,
              damageApplied: total,
              healingApplied: 0,
            },
            burstPlusDot: {
              lethal: false,
              lethalAtInstance: null,
              remainingHp: 2400 - total,
              damageApplied: total,
              healingApplied: 0,
            },
          },
          attackerLevel: level,
          defenderLevel: 18,
          defenderHp: 2400,
          verification: 'derived',
          partial: false,
          incompleteContributors: [],
        },
      };
    }),
  ],
  excludedMechanics: ['runes'],
  notes: [
    'Only the attacker levels. The defender stays at its configured level.',
    'Ability ranks follow the leveling order Q > W > E, one point per level, taking the ultimate ' +
      'at the first level the game allows. That order is a convention supplied with the request, ' +
      'not a fact about this champion; each point states the ranks it used.',
    'No ability is ranked above the build the scenario states, so the top of this curve is the ' +
      'configured build rather than a maxed one.',
  ],
});
