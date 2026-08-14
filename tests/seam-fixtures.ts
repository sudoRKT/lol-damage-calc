// Real output from each area, for the cross-area seam checks in cross-area-seams.test.ts.
//
// WHY THIS FILE IS NOT IN ANY AREA'S DIRECTORY. It deliberately imports from `src/engine/`,
// `src/ui/`, `src/url/`, `scripts/extract/` and `scripts/fetch/` at once, which no agent may do
// (CLAUDE.md, the partition). `tests/` belongs to no area and therefore to the lead, which is the
// only place a check that crosses the partition can live.
//
// EVERY PLAN BELOW IS HAND-AUTHORED. No data file is read to build them, so a seam failure is a
// disagreement between two areas' rules rather than a symptom of the data moving.

import type { ComboPlan, PlannedInstance } from '../src/engine';
import { component, flat, scenario, statBlock } from '../src/engine/fixtures';
import type { DamageType } from '../src/types';

type Kind = DamageType;

function damaging(
  stepId: string,
  parts: Array<[number, Kind]>,
  extra: Partial<PlannedInstance> = {},
): PlannedInstance {
  return {
    stepId,
    sourceLabel: stepId,
    instanceType: 'damaging-ability',
    verification: 'derived',
    damage: {
      components: parts.map(([amount, damageType], i) =>
        component({ id: `${stepId}-${i}`, damageType, base: flat(amount) }),
      ),
      rank: 1,
      maxRank: 5,
    },
    ...extra,
  };
}

function plan(over: Partial<ComboPlan> & { instances: PlannedInstance[] }): ComboPlan {
  return {
    patch: '16.16.1',
    scenario: scenario(),
    attacker: statBlock({ hp: 2000, maxHp: 2000, maxHpBonus: 700, attackDamage: { base: 100, bonus: 60, total: 160 } }),
    defender: statBlock({ armor: 50, magicResist: 40, hp: 1200, maxHp: 1800, maxHpBonus: 300 }),
    ...over,
  };
}

/**
 * The battery. Each case is chosen because it produces a SHAPE some consumer treats specially —
 * a multi-type aggregate, a zero, a lethal crossing, an empty list, a fractional split. A seam
 * check over a single tidy result proves almost nothing; these are the awkward ones.
 */
export const SEAM_PLANS: ReadonlyArray<{ name: string; why: string; plan: ComboPlan }> = [
  {
    name: 'one single-type instance',
    why: 'the baseline. A running total that has touched one type is NOT a multi-type aggregate',
    plan: plan({ instances: [damaging('q', [[300, 'physical']])] }),
  },
  {
    name: 'three types in one instance, fractional',
    why:
      'the case that exposed the split-rounding disagreement: 1 / 100 / 0.5 against 0 armor and ' +
      '50 magic resistance does not divide evenly, so a split rounded independently of its total ' +
      'does not add up',
    plan: plan({
      defender: statBlock({ armor: 0, magicResist: 50, hp: 5000, maxHp: 5000 }),
      instances: [damaging('q', [[1, 'physical'], [100, 'magic'], [0.5, 'true']])],
    }),
  },
  {
    name: 'a mixed instance then a single-type one',
    why: 'the running total changes from multi-type to still-multi-type; both rows must reconcile',
    plan: plan({
      instances: [damaging('q', [[137, 'physical'], [213, 'magic']]), damaging('w', [[91, 'true']])],
    }),
  },
  {
    name: 'the burst crosses zero mid-combo',
    why: 'a lethal crossing, which the burndown and the verdict compute independently of each other',
    plan: plan({
      defender: statBlock({ armor: 0, magicResist: 0, hp: 400, maxHp: 1800 }),
      instances: [
        damaging('q', [[300, 'physical']]),
        damaging('w', [[300, 'physical']]),
        damaging('e', [[300, 'magic']]),
      ],
    }),
  },
  {
    name: 'an empty combo',
    why: 'every consumer that indexes a list, sums one, or takes its last element meets zero of them',
    plan: plan({ instances: [] }),
  },
  {
    name: 'an incomplete instance among complete ones',
    why:
      'SPECIFICATION §8 — an incomplete ability contributes NO damage and is named instead. The ' +
      'interface asserts it never appears in a total AND in the excluded list at once',
    plan: plan({
      instances: [
        damaging('q', [[300, 'physical']], {
          verification: 'incomplete',
          incompleteReason: { kind: 'pending', note: 'a hand-authored seam probe' },
        }),
        damaging('w', [[150, 'magic']]),
      ],
    }),
  },
  {
    name: 'awkward decimals in every channel',
    why:
      'three equal figures against three unequal resistances, so every rounding boundary in the ' +
      'result is exercised at once',
    plan: plan({
      defender: statBlock({ armor: 37, magicResist: 23, hp: 1234, maxHp: 1999 }),
      instances: [
        damaging('a', [[333, 'physical']]),
        damaging('b', [[333, 'magic']]),
        damaging('c', [[333, 'true']]),
      ],
    }),
  },
  {
    name: 'a damage-over-time source alongside burst',
    why:
      'DoT is never folded into burst (§3.8) and the verdict is given twice. The burndown draws ' +
      'the tail from a different field than the totals come from',
    plan: plan({
      defender: statBlock({ armor: 0, magicResist: 0, hp: 700, maxHp: 1800 }),
      instances: [
        damaging('q', [[300, 'physical']]),
        {
          stepId: 'burn',
          sourceLabel: 'burn',
          instanceType: 'dot-application',
          verification: 'derived',
          dot: {
            label: 'burn',
            verification: 'derived',
            // The components state the FULL-DURATION total, never one tick (§3.8).
            damage: {
              components: [component({ id: 'burn-c', damageType: 'magic', base: flat(160) })],
              rank: 1,
              maxRank: 5,
            },
          },
        },
      ],
    }),
  },
  {
    name: 'an instance that deals nothing at all',
    why:
      "`ReportedDamageType` has a 'none' arm, and a consumer that indexes a three-key split by " +
      'the reported type would land on `physical` for it',
    plan: plan({ instances: [damaging('q', [[0, 'physical']]), damaging('w', [[200, 'magic']])] }),
  },
];
