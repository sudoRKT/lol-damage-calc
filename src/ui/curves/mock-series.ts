// TWO CANONICAL SWEEP SERIES, hand-authored, for previews and for the area-wide sweeps.
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

import { buildSeries, type SweepPoint, type SweepSeries } from '../../engine';

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
