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
      lethal: true,
      lethalAtInstance: 5,
      remainingHp: 0,
    },
    burstPlusDot: {
      defenderHp: 700,
      damageApplied: 930,
      lethal: true,
      lethalAtInstance: 5,
      remainingHp: 0,
    },
  },
};
