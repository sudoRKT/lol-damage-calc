// VARIANTS OF THE CANONICAL MOCK — not a second mock.
//
// `MOCK_RESULT` is the one canonical Result and this area does not write its own. But one
// canonical object can only be one shape, and DESIGN.md §7 specifies two: a burst that kills,
// with its solid lethal rule and `LETHAL · instance N` chip, and a burst that does not, with
// the neutral `SURVIVES` chip and the SECOND, DASHED rule for a kill that only damage over time
// completes. Whichever the canonical object is, the other has no data behind it and would ship
// untested — the one thing CLAUDE.md's completion rule forbids.
//
// So this file derives the missing one BY MODIFYING THE CANONICAL OBJECT and nothing else. No
// damage figure is invented: every number below is still MOCK_RESULT's. Only the defender's
// entry health moves, and the two verdicts move with it because they are statements about that
// health. `auditResult` runs over each variant in the test suite, so a variant that was
// internally inconsistent would fail rather than quietly become a second source of truth.
//
// WHICH ONE IS DERIVED HAS FLIPPED, and the reason is worth keeping. Until 2026-08-13 the
// canonical mock was a LETHAL burst, so the variant here was the surviving case. Correcting the
// mock — instance 4 is `incomplete` and must contribute nothing (SPECIFICATION §8) — dropped the
// burst from 890 to 770, which the defender's 800 entry health survives. The canonical object is
// now the surviving case and the LETHAL one is derived. Nothing about §7 changed; the fixture
// did.

import { MOCK_RESULT } from '../../types';
import type { InstanceResult, Result } from '../../types';

/** The mock's instance 4 — the one instance that deals nothing. Every variant below moves it. */
const FOURTH: InstanceResult = MOCK_RESULT.perInstance[3]!;

/** The same list with instance 4 replaced. No other instance is touched by any variant here. */
function withFourth(replacement: InstanceResult): InstanceResult[] {
  return MOCK_RESULT.perInstance.map((instance, i) => (i === 3 ? replacement : instance));
}

/**
 * The same 770 burst against a defender entering on 700 health instead of 800.
 *
 * The burst crosses zero on the fifth instance — the running total reaches 770 there, having
 * stood at 620 through instances 3 and 4 (instance 4 is incomplete and contributes nothing).
 * This is the shape DESIGN.md §7 describes for the SOLID lethal rule and the
 * `LETHAL · instance 5` chip, and it is the only fixture in the project that reaches them.
 */
export const BURST_KILLS: Result = {
  ...MOCK_RESULT,
  defenderStats: { ...MOCK_RESULT.defenderStats, hp: 700 },
  verdict: {
    burstOnly: {
      defenderHp: 700,
      damageApplied: 770,
      healingApplied: 0,
      lethal: true,
      lethalAtInstance: 5,
      remainingHp: 0,
    },
    burstPlusDot: {
      defenderHp: 700,
      damageApplied: 930,
      healingApplied: 0,
      lethal: true,
      lethalAtInstance: 5,
      remainingHp: 0,
    },
  },
};

/**
 * A DEFENDER WHO HEALS. The same 770 burst against the same 800 health, with 90 restored.
 *
 * SPECIFICATION §5 requires the defender's own kit modelled, and DATA-SOURCES §40 confirmed 121
 * defensive heals across the roster, so this state is real and will arrive. It is kept OUT of
 * the canonical mock and given its own fixture on purpose, because of what it exposes:
 *
 * **IT USED TO BE THE FIXTURE THAT PROVED THE BURNDOWN COULD NOT DRAW HEALING** — the trace
 * ended at 30 while the verdict beside it read 120. That is fixed (DESIGN.md §7, "a trace that
 * can also go up"; DATA-SOURCES §45), and the same fixture is now what proves it: the trace
 * RISES from 800 to 890 in a `heal` column before instance 1, then falls, and ends at 120 —
 * the number the verdict states. `auditResult` compares the two on every Result.
 */
export const DEFENDER_HEALS: Result = {
  ...MOCK_RESULT,
  sustain: {
    ...MOCK_RESULT.sustain,
    defenderHealing: 90,
    sources: [
      ...MOCK_RESULT.sustain.sources,
      {
        // ATTACHED TO NO INSTANCE. It is the defender's own kit, not a response to a hit, and
        // §3.2 gives the engine no axis on which to place it between instances.
        label: 'Grasp of the Undying (defender)',
        icon: null,
        kind: 'heal',
        restoresTo: 'defender',
        amount: 90,
        fromInstance: null,
        verification: 'derived',
      },
    ],
  },
  verdict: {
    // 800 - 770 + 90 = 120 survives; 800 - 930 + 90 = -40, floored to 0 and lethal.
    burstOnly: {
      defenderHp: 800,
      damageApplied: 770,
      healingApplied: 90,
      lethal: false,
      lethalAtInstance: null,
      remainingHp: 120,
    },
    burstPlusDot: {
      defenderHp: 800,
      damageApplied: 930,
      healingApplied: 90,
      lethal: true,
      lethalAtInstance: null,
      remainingHp: 0,
    },
  },
};

/**
 * ═══ AN INSTANCE WHOSE DAMAGE IS ALL OVER TIME ═══ (added 2026-08-15)
 *
 * THE SHAPE THE ROSTER ACTUALLY PRODUCES, AND THE FIXTURE THIS AREA DID NOT HAVE. Measured in
 * a browser on 2026-08-15 over the five real scenarios in `preview.tsx`: Renekton R, Corki W,
 * Corki E, Alistar E and Cassiopeia Q all report `damageType: 'none'` with a burst of zero,
 * because every point of their damage is in the `+DoT` column (SPECIFICATION §3.8 never folds
 * it into burst). Nothing in `MOCK_RESULT` has that shape — its one zero instance carries a
 * damage TYPE — so the chart's own accessible-name sweep passed while four of the five real
 * scenarios announced `0  damage` at a screen reader, with the doubled space of an empty type.
 *
 * NO NUMBER IS INVENTED. The 160 magic tail is `MOCK_RESULT`'s own, and instance 4's figure is
 * still zero. What moves is the ATTRIBUTION: the tail is credited to instance 4, which is what
 * makes this the Cassiopeia Q shape — a derived ability that deals nothing on impact and
 * everything afterwards.
 */
export const DOT_ONLY_INSTANCE: Result = {
  ...MOCK_RESULT,
  perInstance: withFourth({
    ...FOURTH,
    damageType: 'none',
    // It is not incomplete: the source states this ability's damage in full, and all of it is
    // over time. `incompleteReason` goes with the status it belongs to (src/types/result.ts).
    verification: 'derived',
    incompleteReason: undefined,
  }),
  dot: {
    ...MOCK_RESULT.dot,
    sources: MOCK_RESULT.dot.sources.map((source, i) =>
      i === 0 ? { ...source, label: FOURTH.sourceLabel } : source,
    ),
  },
  incompleteContributors: MOCK_RESULT.incompleteContributors.filter(
    (c) => c.sourceLabel !== FOURTH.sourceLabel,
  ),
};

/**
 * ═══ AN INSTANCE NOBODY HAS MODELLED, WITH NO DAMAGE TYPE ═══ (added 2026-08-15)
 *
 * The other half of the same measurement: Alistar R (Unbreakable Will) and Renekton Q report
 * `damageType: 'none'` with `verification: 'incomplete'`, and Alistar R's stated reason is that
 * *no source says what damage type it deals*. A zero here is not a fact about the ability — it
 * is the absence of one, and announcing it as a figure of zero states the opposite of what the
 * excluded-contributor note printed under the same chart says.
 *
 * `MOCK_RESULT`'s instance 4 is already incomplete and already contributes nothing, so this
 * variant changes exactly one field: its damage type, from `true` to `none`.
 */
export const UNTYPED_INCOMPLETE_INSTANCE: Result = {
  ...MOCK_RESULT,
  perInstance: withFourth({ ...FOURTH, damageType: 'none' }),
};

/**
 * ═══ AN INSTANCE THAT DEALT TWO TYPES AT ONCE ═══ (added 2026-08-15)
 *
 * `ReportedDamageType` carries `'mixed'` for the 13 abilities that deal more than one type in
 * one instance, and `InstanceResult.byType` is REQUIRED when it does. No fixture in the project
 * had ever set it, so every mixed branch in this area was written against a shape nothing
 * produced. This one exists so the riser's spoken name can be tested on it.
 *
 * The 200 magic of instance 3 is split 120 magic / 80 physical — the same 200, redistributed,
 * so `burst.byType` still sums to the same 770 total it always did.
 */
export const MIXED_INSTANCE: Result = {
  ...MOCK_RESULT,
  perInstance: MOCK_RESULT.perInstance.map((instance, i) =>
    i === 2
      ? { ...instance, damageType: 'mixed' as const, byType: { physical: 80, magic: 120, true: 0 } }
      : instance,
  ),
  burst: {
    ...MOCK_RESULT.burst,
    byType: {
      physical: MOCK_RESULT.burst.byType.physical + 80,
      magic: MOCK_RESULT.burst.byType.magic - 120,
      true: MOCK_RESULT.burst.byType.true,
    },
  },
};

