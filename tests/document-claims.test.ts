// Fails when a document states a number the code disagrees with.
//
// See document-claims.ts for why this exists. In short: six statements in the project's own
// documents were found wrong in a single session, every one of them because nothing re-derived
// the number. This is the check for that class.

import { describe, expect, it } from 'vitest';
import { CLAIMS, UNCOVERED, readDoc, type Claim } from './document-claims.ts';

/** Pulls the claimed number out of its document. Throws if the anchor no longer matches. */
function claimed(claim: Claim): number {
  const text = readDoc(claim.doc);
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
        `${declaredUncovered} groups declared uncovered with reasons. ` +
        `The largest uncovered group is every roster-wide ability figure, which needs a ` +
        `937-page network harvest — see UNCOVERED['ability-roster-figures'].`,
    );
    expect(covered).toBeGreaterThan(0);
    expect(declaredUncovered).toBeGreaterThan(0);
  });
});
