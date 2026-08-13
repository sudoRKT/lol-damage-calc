// Fails when a document states a number the code disagrees with.
//
// See document-claims.ts for why this exists. In short: six statements in the project's own
// documents were found wrong in a single session, every one of them because nothing re-derived
// the number. This is the check for that class.

import { describe, expect, it } from 'vitest';
import {
  CLAIMS,
  UNCOVERED,
  measurements,
  measurementsAreCurrent,
  readDoc,
  type Claim,
} from './document-claims.ts';

/** Pulls the claimed number out of its document. Throws if the anchor no longer matches. */
function claimed(claim: Claim): number {
  let text = readDoc(claim.doc);
  if (claim.section) {
    // Slice from the named heading to the next top-level heading. A claim that names a section
    // and cannot find it FAILS — a renamed section must not silently widen the search back to
    // the whole document, which is how a current-state anchor matched a superseded table.
    const start = text.indexOf(`\n${claim.section}`);
    if (start < 0) {
      throw new Error(
        `claim '${claim.id}' names section '${claim.section}' of ${claim.doc}, which no longer exists.`,
      );
    }
    const rest = text.slice(start + 1);
    const end = rest.indexOf('\n## ', 1);
    text = end < 0 ? rest : rest.slice(0, end);
  }
  const m = claim.anchor.exec(text);
  if (!m) {
    throw new Error(
      `The anchor for claim '${claim.id}' no longer matches anything in ${claim.doc}.\n` +
        `This is a FAILURE, not a skip: a reworded sentence must not silently switch a check ` +
        `off. Either restore the wording or update the anchor in tests/document-claims.ts.\n` +
        `  anchor: ${claim.anchor}`,
    );
  }
  const n = Number(m[1]);
  if (!Number.isFinite(n)) throw new Error(`claim '${claim.id}' captured a non-number: ${m[1]}`);
  return n;
}

describe('document claims agree with the code', () => {
  it.each(CLAIMS.map((c) => [c.id, c] as const))(
    '%s — the document and the re-derivation agree',
    (_id, claim) => {
      const stated = claimed(claim);
      const derived = claim.derive();
      expect(
        stated,
        `${claim.doc} states ${stated}; re-deriving it gives ${derived}.\n` +
          `DEFINITION: ${claim.definition}\n` +
          `Fix the DOCUMENT if the code is right. Fix the CODE if the document is right. Do ` +
          `not change this test to make them agree — that is how the original six survived.`,
      ).toBe(derived);
    },
  );
});

describe('the roster measurements are fit to check against', () => {
  // The roster claims are only as trustworthy as the file they re-derive from. These fail
  // rather than skip, because a missing or stale measurement file silently turns nine of the
  // checks above into no-ops — which is precisely the failure mode this suite exists to close.
  it('a full-roster measurement exists and was taken on the patch now shipping', () => {
    const { ok, why } = measurementsAreCurrent();
    expect(
      ok,
      `verification/measurements.json cannot be checked against: ${why}\n` +
        `Re-run a full-roster batch: xargs -0 node scripts/extract/run-batch.ts < <every champion>`,
    ).toBe(true);
  });

  it('the parts sum the way the definitions say they do', () => {
    // Internal consistency of the file itself. Every ability page carries exactly one
    // verification status, and every storable entry is confirmed, disagreed, or has no
    // evidence — no fourth bucket, no double counting.
    const m = measurements();
    const v = m.verification;
    expect(v.verified + v.derived + v.incomplete + v.noDamage).toBe(m.abilityPages);
    expect(m.gate2.confirmed + m.gate2.disagreed + m.gate2.noEvidence).toBe(m.storable);
    expect(m.gate7.underSum + m.gate7.overSum).toBe(m.gate7.failures);
  });
});

describe('the check cannot quietly stop checking', () => {
  it('every claim anchor still matches its document', () => {
    const broken = CLAIMS.filter((c) => {
      try {
        claimed(c);
        return false;
      } catch {
        return true;
      }
    });
    expect(broken.map((c) => c.id)).toEqual([]);
  });

  it('no two claims share an id', () => {
    const ids = CLAIMS.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('every claim states a definition of what it counts', () => {
    // A count without a definition is not a count. That rule binds this file too.
    const undefinedClaims = CLAIMS.filter((c) => c.definition.trim().length < 40);
    expect(undefinedClaims.map((c) => c.id)).toEqual([]);
  });

  it('every uncovered claim states why, and what would cover it', () => {
    const vague = UNCOVERED.filter((u) => u.reason.trim().length < 60);
    expect(vague.map((u) => u.id)).toEqual([]);
  });

  it('reports its own coverage rather than implying it is complete', () => {
    // Not an assertion about a target — it prints the ratio so a reader of the test output
    // knows how much of the documents this actually guards. Coverage is a fact to be stated,
    // not a number to be maximised.
    const covered = CLAIMS.length;
    const declaredUncovered = UNCOVERED.length;
    // eslint-disable-next-line no-console
    console.log(
      `[document-claims] ${covered} claims re-derived and checked; ` +
        `${declaredUncovered} groups declared uncovered with reasons: ` +
        `${UNCOVERED.map((u) => u.id).join(', ')}.`,
    );
    expect(covered).toBeGreaterThan(0);
    expect(declaredUncovered).toBeGreaterThan(0);
  });
});
