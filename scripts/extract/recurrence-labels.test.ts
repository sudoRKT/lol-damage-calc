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
  accountForDormant,
  census,
  classify,
  trailingForm,
  unmarkedRecurrence,
} from './recurrence-labels.ts';
import {
  DECLINED_RECURRENCE,
  READ_RECURRENCE_BEYOND_PER_TICK,
} from './per-tick-read.ts';

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
    // 27 in the curated file on 2026-08-16; 25 in the merge proposal of the same day, because two
    // of the 27 have since been read and marked. Both numbers are asserted by the accounting test
    // below rather than pinned here — see the comment there for why a pinned total was the weaker
    // check AND the one that broke under `premerge:check`.
    expect(U.dormant.length).toBeGreaterThan(0);
    expect(U.dormant.some((r) => r.startsWith('Rumble/Q'))).toBe(true);
    expect(U.dormant.some((r) => r.startsWith('Karthus/E'))).toBe(true);
  });

  it('EVERY DORMANT COMPONENT IS ONE A PERSON HAS READ — an unread one is a FINDING', () => {
    // ═══ THE GATE THAT REPLACED A PINNED TOTAL OF 27, 2026-08-16 ═══
    //
    // DEFINITION of `unaccounted`: a stored component whose label ends in a recurrence-bearing
    // "per X", carrying no `overTime` mark, on an entry whose verification is `incomplete`, whose
    // COMPONENT ID appears in neither hand-written table — `READ_RECURRENCE_BEYOND_PER_TICK` (read
    // and marked) nor `DECLINED_RECURRENCE` (read and refused, with the reason and the sentence).
    //
    // This is stronger than the count it replaces in the direction that matters. A total cannot
    // tell a member somebody read from one nobody looked at; this names the difference, per
    // component, and the only way to clear a row is to type its id into a table that demands the
    // sentence. Widening `RECURRENCE_FORMS` or `PER_TICK_LABEL` does not satisfy it.
    //
    // MEASURED both ways on 2026-08-16, by `accountForDormant` over both files:
    //   curated-data.json  27 dormant = 25 declined + 2 marked, 0 unaccounted
    //   merged-proposal    25 dormant = 25 declined + 2 marked, 0 unaccounted
    // (A marked component is no longer dormant, which is why the proposal is two lower.)
    const A = accountForDormant(
      FILE.abilities,
      READ_RECURRENCE_BEYOND_PER_TICK,
      DECLINED_RECURRENCE,
    );
    expect(
      A.unaccounted,
      'A component whose damage recurs over time carries no `overTime` mark and nobody has read ' +
        'its sentence. It publishes nothing only because its entry is `incomplete`, and it ' +
        'becomes a live wrong number the moment somebody completes it (SPECIFICATION §3.8). Read ' +
        'the page and add it to READ_RECURRENCE_BEYOND_PER_TICK or DECLINED_RECURRENCE, naming ' +
        'the component ids. Do NOT widen a pattern.',
    ).toEqual([]);
    expect(A.accounted.length).toBe(A.dormant.length);
  });

  it('a component cannot be both marked and declined', () => {
    for (const [key, ids] of Object.entries(READ_RECURRENCE_BEYOND_PER_TICK)) {
      const declined = DECLINED_RECURRENCE[key]?.componentIds ?? [];
      for (const id of ids) expect(declined).not.toContain(id);
    }
  });

  it('the read population is exactly what a person has read, and no more', () => {
    // Three on 2026-08-16, and this asserted one until then — Fiddlesticks W was marked on
    // 2026-08-16 and never added, so the list said one person-read member while two were marked.
    // DEFINITION: label-keyed summaries of the entries a person has read AND marked. The
    // authoritative, component-id-keyed tables are in `per-tick-read.ts`.
    expect(Object.keys(READ)).toEqual([
      'Cassiopeia/W/Magic Damage Per Second',
      'Fiddlesticks/W/Damage per second',
      'Gangplank/R/Magic Damage Per Wave',
    ]);
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
    expect(SOURCE_HEADER_CENSUS.usingTrailingPerX).toBe(26);
  });

  it('THE VOCABULARY IS NARROW — ALL 26 use the trailing per-X form', () => {
    // This is the finding that decides whether the pattern is adequate. After Cassiopeia W the
    // pattern looked like the wrong SHAPE; the sweep says it is the right shape and was missing one
    // WORD in it — "second".
    //
    // THIS ASSERTED ONE EXCEPTION UNTIL 2026-08-16, and reading the sentence removed it.
    // Fiddlesticks W's "Last Tick of Damage" was recorded as a tick named without "per" that no
    // trailing-form pattern could see. It is a SECOND header on that ability naming ONE specific
    // instance — its own page says "the final tick at the end of the channel deals additional magic
    // damage" — not a rate. A recurrence pattern is right to ignore it.
    const exceptions =
      SOURCE_HEADER_CENSUS.namingARecurrence - SOURCE_HEADER_CENSUS.usingTrailingPerX;
    expect(exceptions).toBe(0);
  });

  it('the three handed to a person were read, and none was acted on by pattern', () => {
    // The rule this obeys: a detector proposes, a person confirms. None of these three is written,
    // marked, or pattern-matched into the store — they are named here so somebody reads the
    // sentence. Growing this list by widening a pattern is the move CLAUDE.md forbids.
    expect(SOURCE_HEADER_CENSUS.readAndSettled).toHaveLength(3);
    // Every member of READ is an entry whose SENTENCE a person quoted, never one a pattern
    // matched. It grows only by someone reading a page — three as of 2026-08-16.
    expect(Object.keys(READ)).toHaveLength(3);
    expect(Object.keys(READ_RECURRENCE_BEYOND_PER_TICK)).toHaveLength(3);
  });

  it('the broad net found 41 non-per-X headers and 38 are state durations, not recurrences', () => {
    // Recorded because the EXCLUSIONS are the substance of a sweep like this. "Stun Duration" and
    // "Root Duration" say how long a STATE lasts; "Second Cast Damage" uses second as an ORDINAL.
    // A sweep that counted those as recurrences would report 41 findings and be useless.
    expect(SOURCE_HEADER_CENSUS.broadNetNotTrailingPerX).toBe(41);
    expect(SOURCE_HEADER_CENSUS.ofWhichStateDuration).toBe(38);
  });
});
