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
import type { Result } from '../../types';

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
 * **THE BURNDOWN DOES NOT DRAW HEALING, AND THIS FIXTURE IS WHERE THAT IS VISIBLE.** DESIGN.md
 * §7 specifies the trace as remaining HP falling — grey plateaus, coloured risers dropping — and
 * says nothing about a plateau that RISES. So `buildBurndownModel` walks the running total down
 * from entry health and ends this fixture's last tread at 30, while the verdict printed beside
 * the plot reads 120. Those are the same quantity said two ways, which §41.2 records as worse
 * than not drawing it at all.
 *
 * It is NOT fixed here. Where a heal sits between two instances is a design decision DESIGN.md
 * has not taken, and inventing one in the geometry would be this area deciding it. Raised, with
 * a fixture that makes the gap reproducible rather than theoretical.
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
