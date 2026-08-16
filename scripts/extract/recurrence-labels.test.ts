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
  SOURCE_HEADER_CENSUS,
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
    // ═══ ONE ON 2026-08-15. ZERO ON 2026-08-16, AND THE ZERO IS EARNED ═══
    //
    // The one was Cassiopeia W — `derived`, publishing 126 damage into the burst line that belongs
    // on the damage-over-time line. Every other member of the shape sat on an entry publishing
    // nothing.
    //
    // It is zero now because the curated file carries the `overTime` mark, merged 2026-08-16. The
    // count fell because the defect was FIXED, not because the sweep was narrowed: the detector is
    // unchanged, the 27 dormant members are still found and still reported, and the read population
    // is still exactly one entry.
    //
    // **The assertion below stays two-part on purpose.** `unread` being empty is the real check and
    // would have been satisfied yesterday too, when the answer was one — because that one had been
    // read. `U.live.length` pins the number so a NEW live instance appearing is visible as a moved
    // figure rather than silently absorbed into "nobody has read it yet".
    const unread = U.live.filter(
      (row) => !Object.keys(READ).some((k) => row.startsWith(k.split('/').slice(0, 2).join('/'))),
    );
    expect(
      unread,
      'A published entry has over-time damage landing in the burst total and nobody has read its ' +
        'sentence. SPECIFICATION §3.8. Read it; do not mark it from the label alone.',
    ).toEqual([]);
    expect(U.live.length).toBe(0);
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

describe('recurrence labels/the SOURCE vocabulary, not ours', () => {
  it('pins the source-header sweep, so a re-fetch that moves it is visible', () => {
    // DEFINITION: distinct `{{st|Header|…}}` leveling-row headers across all 937 fetched ability
    // pages, 2026-08-16. These are figures about the WIKI, so they move when the wiki moves — which
    // is exactly why they are pinned rather than remembered. A patch that adds a recurrence header
    // in a new wording will change `namingARecurrence` and this will say so.
    expect(SOURCE_HEADER_CENSUS.distinctHeaders).toBe(977);
    expect(SOURCE_HEADER_CENSUS.namingARecurrence).toBe(26);
    expect(SOURCE_HEADER_CENSUS.usingTrailingPerX).toBe(25);
  });

  it('THE VOCABULARY IS NARROW — 25 of the 26 use the trailing per-X form', () => {
    // This is the finding that decides whether the pattern is adequate. After Cassiopeia W the
    // pattern looked like the wrong SHAPE; the sweep says it is the right shape and was missing one
    // WORD in it. The single exception is Fiddlesticks W's "Last Tick of Damage", which names a
    // tick without "per" and which no trailing-form pattern can ever see.
    const exceptions =
      SOURCE_HEADER_CENSUS.namingARecurrence - SOURCE_HEADER_CENSUS.usingTrailingPerX;
    expect(exceptions).toBe(1);
  });

  it('hands three entries to a person and acts on none of them', () => {
    // The rule this obeys: a detector proposes, a person confirms. None of these three is written,
    // marked, or pattern-matched into the store — they are named here so somebody reads the
    // sentence. Growing this list by widening a pattern is the move CLAUDE.md forbids.
    expect(SOURCE_HEADER_CENSUS.forAPersonToRead).toHaveLength(3);
    expect(Object.keys(READ)).toHaveLength(1);
  });

  it('the broad net found 41 non-per-X headers and 38 are state durations, not recurrences', () => {
    // Recorded because the EXCLUSIONS are the substance of a sweep like this. "Stun Duration" and
    // "Root Duration" say how long a STATE lasts; "Second Cast Damage" uses second as an ORDINAL.
    // A sweep that counted those as recurrences would report 41 findings and be useless.
    expect(SOURCE_HEADER_CENSUS.broadNetNotTrailingPerX).toBe(41);
    expect(SOURCE_HEADER_CENSUS.ofWhichStateDuration).toBe(38);
  });
});
