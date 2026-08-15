/**
 * THE HEAL COUNTS, CHECKED (2026-08-15).
 *
 * Nine per-instance heal rows were `incomplete` for one missing fact: a per-occurrence figure
 * needs a number of occurrences before a whole-duration total can be formed. Seven of them now
 * carry one. This file is what stops those seven being seven numbers somebody typed.
 *
 * Two things are worth testing about a hand-read count, and "does the table contain the number I
 * put in it" is neither of them:
 *
 *   1. THE RULE REFUSES. Every clause of `checkCountRule` is shown failing on a fabricated row
 *      before the real readings are asked. A check that has never reported anything is not
 *      evidence that there is nothing to report.
 *   2. THE QUOTES ARE REAL. Every sentence a count rests on must be a literal substring of the
 *      cached wikitext of that exact ability. A paraphrase that drifted, or a sentence attributed
 *      to the wrong page, fails here.
 *
 * The last block runs the whole reading against the real 937-page cache, with no fixture.
 */

import { describe, expect, it } from 'vitest';

import {
  SHAPES_READ,
  checkCountRule,
  countReadFragments,
  type CountRead,
  type ShapeReading,
} from './defensive-shapes.ts';
import { loadPages } from './per-tick-read.ts';

const COUNT: CountRead = {
  durationSeconds: 4,
  intervalSeconds: 0.5,
  impliedInstances: 8,
  rowArithmetic: 'the Total row is written 15*8',
  verbatim: ['channels for up to 4 seconds', 'Total Heal|15*8'],
};

const reading = (over: Partial<ShapeReading['rows'][number]['overTime']> = {}): ShapeReading => ({
  key: 'Test/W/Thing',
  kind: 'heal',
  read: 'it heals every half second for four seconds',
  rows: [
    {
      label: 'Heal Per Tick',
      overTime: {
        sourceSays: 'channels for up to 4 seconds, healing himself every 0.5 seconds',
        figureIs: 'per-instance',
        totalInstances: 8,
        countRead: COUNT,
        ...over,
      },
    },
  ],
});

describe('checkCountRule — a count reconciles with the source, or it is not written', () => {
  it('is silent on a per-occurrence row whose count the page states twice', () => {
    expect(checkCountRule([reading()])).toEqual([]);
  });

  it('refuses a count with no reading behind it — a bare number nobody can re-derive', () => {
    const wrong = checkCountRule([reading({ countRead: undefined })]);
    expect(wrong.some((w) => w.includes('no reading behind it'))).toBe(true);
  });

  it('refuses a count that disagrees with its own duration and interval', () => {
    const wrong = checkCountRule([
      reading({ countRead: { ...COUNT, impliedInstances: 9 }, totalInstances: 9 }),
    ]);
    expect(wrong.some((w) => w.includes('and it is 8'))).toBe(true);
  });

  it('refuses a written count that disagrees with the reading it cites', () => {
    const wrong = checkCountRule([reading({ totalInstances: 10 })]);
    expect(wrong.some((w) => w.includes('writes 10 while its own reading implies 8'))).toBe(true);
  });

  it('refuses a count resting on one quoted sentence, because the two must agree', () => {
    const wrong = checkCountRule([
      reading({ countRead: { ...COUNT, verbatim: ['channels for up to 4 seconds'] } }),
    ]);
    expect(wrong.some((w) => w.includes('cannot be checked against the source'))).toBe(true);
  });

  it('refuses a count of occurrences hung on a figure that already covers all of them', () => {
    const wrong = checkCountRule([reading({ figureIs: 'full-duration' })]);
    expect(wrong.some((w) => w.includes('ONE occurrence'))).toBe(true);
  });

  it('refuses a per-occurrence row with no count and no stated reason', () => {
    const wrong = checkCountRule([
      reading({ totalInstances: undefined, countRead: undefined }),
    ]);
    expect(wrong.some((w) => w.includes('no stated reason'))).toBe(true);
  });

  it('refuses a row claiming both that a count exists and that none ever can', () => {
    const wrong = checkCountRule([reading({ countUnresolvable: 'no duration is stated' })]);
    expect(wrong.some((w) => w.includes('no count can ever exist'))).toBe(true);
  });

  it('refuses a contested count that does not quote what was contested', () => {
    const wrong = checkCountRule([
      reading({ totalInstances: undefined, countRead: undefined, countContested: 'they disagree' }),
    ]);
    expect(wrong.some((w) => w.includes('nothing records what was contested'))).toBe(true);
  });

  it('refuses a row that is contested AND permanently unresolvable at once', () => {
    const wrong = checkCountRule([
      reading({
        totalInstances: undefined,
        countContested: 'the page says 24 and 25',
        countUnresolvable: 'no duration exists',
      }),
    ]);
    expect(wrong.some((w) => w.includes('only one can be true'))).toBe(true);
  });
});

describe('the real readings, against the real cached source', () => {
  it('every count in the read population reconciles', () => {
    expect(checkCountRule()).toEqual([]);
  });

  // THE POPULATION IS PINNED SO A COUNT CANNOT APPEAR WITHOUT SOMEBODY NOTICING.
  //
  // DEFINITION of the 7: rows whose figure is ONE occurrence and which now carry a number of
  // occurrences, all seven of them equal to the ability's own duration divided by its own
  // interval AND to the multiplier its own leveling row prints. Milio W is deliberately not among
  // them — its two statements give 24 and 25 — and Swain R never can be.
  it('holds 7 written counts, 1 contested and 1 permanently unresolvable', () => {
    const perInstance = SHAPES_READ.flatMap((s) =>
      s.rows.filter((r) => r.overTime?.figureIs === 'per-instance').map((r) => ({ s, r })),
    );
    expect(perInstance).toHaveLength(9);
    expect(perInstance.filter(({ r }) => r.overTime!.totalInstances !== undefined)).toHaveLength(7);
    expect(perInstance.filter(({ r }) => r.overTime!.countContested)).toHaveLength(1);
    expect(perInstance.filter(({ r }) => r.overTime!.countUnresolvable)).toHaveLength(1);
  });

  it('the counts are the ones the seven pages state', () => {
    const written = new Map(
      SHAPES_READ.flatMap((s) =>
        s.rows
          .filter((r) => r.overTime?.figureIs === 'per-instance' && r.overTime.totalInstances)
          .map((r) => [`${s.key} ${r.label}`, r.overTime!.totalInstances!] as const),
      ),
    );
    expect([...written.entries()].sort()).toEqual([
      ['Briar/E/Chilling Scream Heal Per Tick', 4],
      ['Fiora/R/Grand Challenge Heal per Tick', 20],
      ['Janna/R/Monsoon Heal Per Tick', 12],
      ['Lissandra/R/Frozen Tomb Maximum Heal per Tick', 10],
      ['Lissandra/R/Frozen Tomb Minimum Heal per Tick', 10],
      ['Master Yi/W/Meditate Maximum Heal Per Tick', 8],
      ['Master Yi/W/Meditate Minimum Heal Per Tick', 8],
    ]);
  });

  it('every sentence a count rests on is literally in that ability\'s cached wikitext', async () => {
    const pages = await loadPages();
    const byKey = new Map(
      pages.map((p) => [`${p.champion}/${p.slot}/${p.abilityName}`, p.wikitext]),
    );
    const missing: string[] = [];
    let checked = 0;
    for (const f of countReadFragments()) {
      const text = byKey.get(f.key);
      if (text === undefined) {
        missing.push(`${f.key}: no cached source page`);
        continue;
      }
      for (const v of f.verbatim) {
        checked += 1;
        if (!text.includes(v)) missing.push(`${f.key} "${f.label}": not in the source: ${v}`);
      }
    }
    expect(missing).toEqual([]);
    // 8 readings (7 written + Milio's contested one), two sentences each, minus the two shared
    // objects counted once per row they appear on.
    expect(checked).toBe(16);
  });
});
