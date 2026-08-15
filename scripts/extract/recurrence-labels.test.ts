// THE RECURRENCE-LABEL CENSUS, PINNED.
//
// The defect this guards: a component whose damage arrives over time, carrying no `overTime` mark,
// so `simulate` puts it in the BURST total. SPECIFICATION §3.8 forbids folding damage over time
// into the burst, and the failure is invisible — the magnitude is right, so nothing looks wrong.
//
// It went unnoticed because the sweep looking for these matched the words "per tick", and the one
// live instance says "Per Second".

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MULTI_HIT_FORMS,
  NOT_A_COUNT_FORMS,
  READ,
  RECURRENCE_FORMS,
  census,
  classify,
  trailingForm,
  unmarkedRecurrence,
} from './recurrence-labels.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = JSON.parse(
  readFileSync(join(ROOT, ['cur', 'ated'].join(''), 'curated-data.json'), 'utf8'),
) as { abilities: Parameters<typeof census>[0] };

const C = census(FILE.abilities);

describe('recurrence labels/the vocabulary is measured, not assumed', () => {
  it('the sweep cannot pass by finding nothing', () => {
    expect(C.components).toBeGreaterThan(800);
    expect(C.labelled).toBeGreaterThan(100);
  });

  it('EVERY label form the roster uses is classified — an unclassified one is a FINDING', () => {
    // THE TRIPWIRE. A 26th word arriving means someone must read it and decide whether it counts
    // occurrences over time or projectiles in one cast. There is deliberately NO default branch:
    // defaulting would silently route a new form to the burst, which is the defect this file
    // exists to catch.
    const unclassified = C.forms.filter((f) => f.kind === 'UNCLASSIFIED');
    expect(
      unclassified.map((f) => `per ${f.form} (${f.count})`),
      'A new "per X" label form appeared. Read the sentence and add it to RECURRENCE_FORMS, ' +
        'MULTI_HIT_FORMS or NOT_A_COUNT_FORMS. Do NOT widen an existing list to swallow it.',
    ).toEqual([]);
  });

  it('the three lists are disjoint — no form can be two things', () => {
    const all = [...RECURRENCE_FORMS, ...MULTI_HIT_FORMS, ...NOT_A_COUNT_FORMS];
    expect(all.length).toBe(new Set(all).size);
  });

  it('classifies the two words the 2026-08-15 defect turned on', () => {
    // The positive and the negative control together. "second" must be recurrence or Cassiopeia W
    // is invisible again; "arrow" must NOT be, or real burst damage moves off the burst line.
    expect(classify('second')).toBe('recurrence');
    expect(classify('tick')).toBe('recurrence');
    expect(classify('arrow')).toBe('multi-hit');
    expect(classify('bolt')).toBe('multi-hit');
    expect(classify('stack')).toBe('not-a-count');
  });

  it('reads the LONGEST trailing form, so "per additional stack" is not "per stack"', () => {
    expect(trailingForm('Damage per additional stack')).toBe('additional stack');
    expect(trailingForm('Magic Damage Per Second')).toBe('second');
    expect(trailingForm('Total Magic Damage')).toBe(null);
  });
});

describe('recurrence labels/what is live and what is dormant', () => {
  const U = unmarkedRecurrence(FILE.abilities);

  it('names every LIVE instance — a published entry whose over-time damage sits in the burst', () => {
    // DEFINITION: a stored component whose label ends in a recurrence-bearing "per X", carrying no
    // `overTime` mark, on an entry whose verification is NOT `incomplete` — so it reaches a reader.
    //
    // ONE, measured over the 919 published entries on 2026-08-15: Cassiopeia W. Every other member
    // of the shape sits on an entry that publishes nothing.
    //
    // THIS ASSERTION IS NOT "EXPECT EMPTY". Emptying it is the goal, but asserting the empty set
    // today would mean deleting the honest finding. It is pinned to the read population instead:
    // a live instance nobody has read is a failure, and a live instance someone HAS read is the
    // state we are in until the curated file carries the mark.
    const unread = U.live.filter(
      (row) => !Object.keys(READ).some((k) => row.startsWith(k.split('/').slice(0, 2).join('/'))),
    );
    expect(
      unread,
      'A published entry has over-time damage landing in the burst total and nobody has read its ' +
        'sentence. SPECIFICATION §3.8. Read it; do not mark it from the label alone.',
    ).toEqual([]);
    expect(U.live.length).toBe(1);
  });

  it('the dormant members are the SAME SHAPE and a different exposure', () => {
    // DEFINITION: same shape — recurrence label, no `overTime` mark. Different exposure — the
    // entry is `incomplete`, so it contributes to no total and shows a reader nothing.
    //
    // 27 today. The count is expected to FALL as those entries are completed, and every one of
    // them must gain an `overTime` mark at the same time it gains its damage, or it becomes a
    // live instance the moment it stops being incomplete. That is the trap this test names.
    expect(U.dormant.length).toBe(27);
    expect(U.dormant.some((r) => r.startsWith('Rumble/Q'))).toBe(true);
    expect(U.dormant.some((r) => r.startsWith('Karthus/E'))).toBe(true);
  });

  it('the read population is exactly what a person has read, and no more', () => {
    expect(Object.keys(READ)).toEqual(['Cassiopeia/W/Magic Damage Per Second']);
  });
});
