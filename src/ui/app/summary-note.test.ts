// THE SENTENCE BESIDE THE RESULT MUST NOT APOLOGISE FOR THE READER'S OWN BUILD.
//
// `summaryNote` printed one sentence for every `incomplete` result: "At least one ability in this
// combo could not be modelled." That became false the moment an unlearned ability started being
// excluded — a reader who chose not to put a point in their ultimate was told the PRODUCT had
// failed to model it.
//
// The two are told apart by `IncompleteReason.cause`, never by matching on prose.

import { describe, expect, it } from 'vitest';
import type { IncompleteReason, Result } from '../../types/result';
import { summaryNote } from './App';

const unlearned = (label: string) => ({
  sourceLabel: label,
  reason: { kind: 'pending', cause: 'unlearned', note: 'no point has been put into R' } as IncompleteReason,
});
const unmodelled = (label: string) => ({
  sourceLabel: label,
  reason: { kind: 'pending', note: 'the damage is stated in prose nobody has read' } as IncompleteReason,
});
const permanent = (label: string) => ({
  sourceLabel: label,
  reason: { kind: 'permanent', missingFacts: [] } as IncompleteReason,
});

type Excluded = Result['incompleteContributors'];

describe('summary-note/an unlearned ability is the reader’s choice, not our shortcoming', () => {
  it('says it is their build, and does not say we failed to model anything', () => {
    const note = summaryNote('incomplete', [unlearned('R — Final Spark')] as Excluded);
    expect(note).toContain('your build, not a gap in our data');
    expect(note).toContain('raise its rank');
    // The apology, gone.
    expect(note).not.toContain('could not be modelled');
  });

  it('counts them, and reads correctly for one and for several', () => {
    expect(summaryNote('incomplete', [unlearned('R — A')] as Excluded)).toContain(
      'One ability in this combo has',
    );
    expect(
      summaryNote('incomplete', [unlearned('R — A'), unlearned('W — B')] as Excluded),
    ).toContain('2 abilities in this combo have');
  });
});

describe('summary-note/an ability we cannot model still says so plainly', () => {
  it('keeps the honest sentence when that is the only cause', () => {
    const note = summaryNote('incomplete', [unmodelled('Q — Orb')] as Excluded);
    expect(note).toContain('could not be modelled');
    expect(note).not.toContain('your build');
  });

  it('treats a PERMANENT exclusion as ours, not the reader’s', () => {
    // `cause` is absent on a permanent reason, and absent means "a gap in what we know".
    const note = summaryNote('incomplete', [permanent('E — Something')] as Excluded);
    expect(note).toContain('could not be modelled');
    expect(note).not.toContain('your build');
  });
});

describe('summary-note/a combo containing both says BOTH', () => {
  it('names each cause with its own count, rather than collapsing them', () => {
    // Collapsing loses whichever fact the reader needed. They are different facts with different
    // remedies — one is a keystroke, the other is work on our side.
    const note = summaryNote('incomplete', [
      unlearned('R — Final Spark'),
      unmodelled('Q — Orb'),
      unmodelled('W — Other'),
    ] as Excluded);
    expect(note).toContain('One ability in this combo has');
    expect(note).toContain('your build, not a gap in our data');
    expect(note).toContain('Separately, 2 abilities');
    expect(note).toContain('could not be modelled');
  });
});

describe('summary-note/the other statuses are untouched', () => {
  it('derived still reads as the ordinary, well-evidenced state', () => {
    expect(summaryNote('derived', [])).toContain('the ordinary state');
  });

  it('verified is an additional assurance, never the bar others fell short of', () => {
    expect(summaryNote('verified', [])).toContain('rarer than derived rather than better');
  });

  it('incomplete with an empty list still says something true', () => {
    // The status can come from somewhere this list does not cover. It must not print a count
    // that is not there.
    const note = summaryNote('incomplete', []);
    expect(note).toContain('At least one ability');
    expect(note).not.toContain('0 abilities');
  });
});
