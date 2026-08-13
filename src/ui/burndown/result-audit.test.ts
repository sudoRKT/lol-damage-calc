// THE SWEEP — every internal disagreement a Result can carry, checked in one place.
//
// WHY IT EXISTS. Drawing the burndown turned up a real contradiction in the canonical mock:
// instance 4 ("On-hit — true damage (mock)") is `verification: 'incomplete'`, it contributes
// 120 true damage to `runningTotal` and to `burst.byType.true`, AND it is listed in
// `incompleteContributors`, which src/types/result.ts describes as "every ability EXCLUDED
// from the totals above". SPECIFICATION §8 is explicit: "An incomplete ability contributes
// no damage to a result."
//
// CLAUDE.md's standing instruction is that the work is not to fix that one entry but to
// write the check that finds every other instance of it. `auditResult` is that check, and it
// runs over ANY Result — the mock today, the engine's output when it is wired — so the same
// class of defect cannot reach a chart unnoticed again.
//
// THE FIX IS NOT MINE TO MAKE. `src/types/mock-result.ts` is the lead's file and the type
// contract is frozen. This test records the finding as a known answer: exactly one finding,
// of exactly that kind. If the lead corrects the mock, this test fails and says so, which is
// the correct way for the record to be retired.

import { describe, expect, it } from 'vitest';
import { MOCK_RESULT } from '../../types';
import type { Result } from '../../types';
import { auditResult } from './geometry';
import { BURST_KILLS } from './mock-variants';

describe('result-audit/mock', () => {
  const findings = auditResult(MOCK_RESULT);

  it('finds NOTHING in the canonical mock — the disagreement it caught has been fixed', () => {
    // This test used to assert exactly one finding: instance 4 was marked `incomplete` while
    // contributing 120 true damage to the totals AND being listed as excluded from them. The
    // audit is what surfaced it; the lead corrected `src/types/mock-result.ts` on 2026-08-13,
    // and instance 4 now contributes nothing.
    //
    // PREMISE CHANGED, not the assertion. The audit still runs the same checks over the same
    // object — it simply no longer has anything to report, which is the outcome it existed to
    // produce. Inverting it rather than deleting it keeps the regression covered: if an
    // incomplete instance ever contributes damage again, this fails.
    expect(findings).toEqual([]);
  });

  it('confirms everything else in the mock reconciles', () => {
    // Stated positively so the count above means something: the running total, the burst
    // split, the DoT split and BOTH verdicts all agree with each other.
    const kinds = new Set(findings.map((f) => f.kind));
    for (const clean of [
      'running-total-length',
      'delta-disagrees-with-final',
      'running-total-tail',
      'burst-by-type',
      'burst-split-sum',
      'dot-split-sum',
      'hp-above-max',
      'verdict-hp',
      'verdict-damage',
      'verdict-lethal',
      'verdict-remaining',
      'lethal-instance',
    ]) {
      expect(kinds.has(clean), `unexpected finding: ${clean}`).toBe(false);
    }
  });

  it('the derived lethal variant reconciles too — a variant is not a broken Result', () => {
    // The variant changes only the defender's entry health and the two verdicts that are
    // statements about it. It inherits the corrected instances, so it has nothing to report
    // either — which is the point: a variant must not become a second source of truth.
    expect(auditResult(BURST_KILLS)).toEqual([]);
  });
});

describe('result-audit/detects', () => {
  // Each case below breaks ONE thing and asserts the sweep catches it. Without these the
  // "exactly one finding" result above could equally mean the check does nothing.

  const broken = (patch: (r: Result) => Result): string[] =>
    auditResult(patch(structuredClone(MOCK_RESULT) as Result)).map((f) => f.kind);

  it('catches a running total that disagrees with an instance’s final', () => {
    expect(
      broken((r) => ({
        ...r,
        runningTotal: r.runningTotal.map((p, i) => ({
          ...p,
          total: [241, 420, 620, 740, 890][i]!,
          byType: { ...p.byType, physical: [241, 420, 620, 740, 890][i]! - p.byType.magic },
        })),
      })),
    ).toContain('delta-disagrees-with-final');
  });

  it('catches a composition that does not sum to its total', () => {
    expect(
      broken((r) => ({
        ...r,
        burst: { ...r.burst, byType: { physical: 500, magic: 200, true: 120 } },
      })),
    ).toContain('burst-split-sum');
  });

  it('catches a verdict measured against the wrong health', () => {
    expect(
      broken((r) => ({
        ...r,
        verdict: { ...r.verdict, burstOnly: { ...r.verdict.burstOnly, defenderHp: 900 } },
      })),
    ).toContain('verdict-hp');
  });

  it('catches a lethal verdict pointing at the wrong instance', () => {
    expect(
      broken((r) => ({
        ...r,
        verdict: { ...r.verdict, burstOnly: { ...r.verdict.burstOnly, lethalAtInstance: 3 } },
      })),
    ).toContain('lethal-instance');
  });

  it('catches a DoT split that does not sum', () => {
    expect(
      broken((r) => ({
        ...r,
        dot: { ...r.dot, byType: { physical: 0, magic: 150, true: 0 } },
      })),
    ).toContain('dot-split-sum');
  });

  it('catches burst + DoT applying the wrong amount', () => {
    expect(
      broken((r) => ({
        ...r,
        verdict: {
          ...r.verdict,
          burstPlusDot: { ...r.verdict.burstPlusDot, damageApplied: 999 },
        },
      })),
    ).toContain('verdict-damage');
  });
});
