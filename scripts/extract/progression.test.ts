// Known-answer tests for the progression parser.
//
// Every expected series below was CONFIRMED against the wiki's own Lua by asking the wiki to
// render the same shorthand through its api.php `action=parse` endpoint on 2026-08-12, e.g.
//   {{ap|80 to 240}}             -> 80 / 120 / 160 / 200 / 240
//   {{ap|675|675|775}}           -> 675 / 675 / 775
//   {{ap|50*0.35 to 170*0.35}}   -> 17.5 / 28 / 38.5 / 49 / 59.5
//   {{ap|10 to 70}}              -> 10 / 25 / 40 / 55 / 70
//   {{pp|60 to 100 for 3|1 to 13}} -> 60 / 80 / 100 (based on level)
// These are the wiki's numbers, not this parser's.

import { describe, expect, it } from 'vitest';

import { expandByRank, levelBreakpoints } from '../../src/types/scaling.ts';
import {
  ProgressionError,
  asLinearIfEven,
  evaluateArithmetic,
  evaluateAt,
  parseLevelProgression,
  parseRankProgression,
} from './progression.ts';

/** What the stored Scaling actually expands to — the round-trip, in one line. */
const ranks = (inner: string, maxRank: number): number[] => {
  const s = parseRankProgression(inner, maxRank);
  return expandByRank(s, s.scaling === 'explicit' ? s.perRank.length : maxRank);
};

describe('the arithmetic evaluator (never eval — this input is community-editable)', () => {
  it('handles precedence, parentheses and unary minus', () => {
    expect(evaluateArithmetic('2+3*4')).toBe(14);
    expect(evaluateArithmetic('(2+3)*4')).toBe(20);
    expect(evaluateArithmetic('50*0.35')).toBeCloseTo(17.5, 10);
    expect(evaluateArithmetic('(50/12)*4')).toBeCloseTo(16.666666, 5);
    expect(evaluateArithmetic('-5+2')).toBe(-3);
  });

  it('refuses anything that is not arithmetic', () => {
    expect(() => evaluateArithmetic('process.exit(1)')).toThrow(ProgressionError);
    expect(() => evaluateArithmetic('80 to 240')).toThrow(ProgressionError);
    expect(() => evaluateArithmetic('(2+3')).toThrow(ProgressionError);
    expect(() => evaluateArithmetic('5/0')).toThrow(ProgressionError);
  });

  it('refuses two numbers separated only by a space instead of joining them', () => {
    // REGRESSION. Xerath R is written {{ap|20 to 30 3}}. Stripping whitespace turned the
    // right-hand operand "30 3" into 303, and the ability shipped 20 -> 303 instead of
    // 20 -> 30. Gate 2 caught it against the wiki's own rendering (20 / 25 / 30), but the
    // evaluator must refuse the ambiguity outright rather than pick a reading.
    expect(() => evaluateArithmetic('30 3')).toThrow(/separated only by a space/);
    expect(() => evaluateArithmetic('1 2')).toThrow(ProgressionError);
    // Ordinary spacing around operators is still fine.
    expect(evaluateArithmetic('50 * 0.35')).toBeCloseTo(17.5, 10);
    expect(evaluateArithmetic(' 240 ')).toBe(240);
  });
});

describe('rank progressions — matching the wiki renderer', () => {
  it('Lux Q: 80 to 240 over 5 ranks', () => {
    expect(ranks('80 to 240', 5)).toEqual([80, 120, 160, 200, 240]);
  });

  it('Aatrox Q first cast: 10 to 70 over 5 ranks', () => {
    expect(ranks('10 to 70', 5)).toEqual([10, 25, 40, 55, 70]);
  });

  it('Darius Q handle: 50*0.35 to 170*0.35, arithmetic on both sides of "to"', () => {
    const got = ranks('50*0.35 to 170*0.35', 5);
    [17.5, 28, 38.5, 49, 59.5].forEach((want, k) => expect(got[k]).toBeCloseTo(want, 9));
  });

  it('a span wrapped in outer arithmetic: (60 to 100)/10', () => {
    // The "to" is INSIDE the parentheses and the /10 applies to the whole rewritten span.
    // Reducing this to a from/to pair by inspection would get the middle ranks wrong.
    const got = ranks('(60 to 100)/10', 5);
    [6, 7, 8, 9, 10].forEach((want, k) => expect(got[k]).toBeCloseTo(want, 9));
  });

  it('Rumble Q: (50/12)*4 to (150/12)*4', () => {
    const got = ranks('(50/12)*4 to (150/12)*4', 5);
    expect(got[0]).toBeCloseTo((50 / 12) * 4, 9);
    expect(got[4]).toBeCloseTo((150 / 12) * 4, 9);
    expect(got[2]).toBeCloseTo(((50 / 12) * 4 + (150 / 12) * 4) / 2, 9);
  });

  it('an ultimate uses 3 ranks, and the rank count is never inferred', () => {
    expect(ranks('150 to 350', 3)).toEqual([150, 250, 350]);
    expect(ranks('150 to 350', 5)).toEqual([150, 200, 250, 300, 350]);
  });

  it('Kayle R: an explicit list is used verbatim, not interpolated', () => {
    expect(ranks('675|675|775', 3)).toEqual([675, 675, 775]);
    expect(parseRankProgression('675|675|775', 3)).toEqual({
      scaling: 'explicit',
      perRank: [675, 675, 775],
    });
  });

  it('Anivia W: a decreasing explicit curve survives verbatim', () => {
    expect(ranks('133.33|125|120|116.67|114.29', 5)).toEqual([
      133.33, 125, 120, 116.67, 114.29,
    ]);
  });

  it('Caitlyn W / Gangplank E: 3|3|4|4|5 is not an even progression', () => {
    expect(ranks('3|3|4|4|5', 5)).toEqual([3, 3, 4, 4, 5]);
  });

  it('"X to Y by Z" derives its rank count from the span', () => {
    expect(ranks('10 to 50 by 10', 5)).toEqual([10, 20, 30, 40, 50]);
  });

  it('"X to Y for N" interpolates across exactly N values', () => {
    expect(ranks('60 to 100 for 3', 5)).toEqual([60, 80, 100]);
  });

  it('"X to Y N" — a bare trailing count, which the wiki also writes', () => {
    // 54 occurrences across the roster. Xerath R is {{ap|20 to 30 3}} and the wiki renders
    // 20 / 25 / 30. Jayce writes every ability this way because his abilities have SIX
    // ranks: {{ap|60 to 310 6}}. Reading the trailing number as part of the value, or
    // ignoring it, gets both champions wrong.
    expect(ranks('20 to 30 3', 3)).toEqual([20, 25, 30]);
    expect(ranks('60 to 310 6', 5)).toEqual([60, 110, 160, 210, 260, 310]);
    expect(ranks('35 to 55 3', 3)).toEqual([35, 45, 55]);
  });

  it('a bare constant repeats across every rank rather than becoming a progression', () => {
    expect(ranks('1200', 5)).toEqual([1200, 1200, 1200, 1200, 1200]);
  });

  it('honours a round= argument the way the wiki does', () => {
    // Cassiopeia Q: {{ap|75/7 to 215/7|round=2}}
    const got = ranks('75/7 to 215/7|round=2', 5);
    expect(got[0]).toBeCloseTo(10.71, 6);
    expect(got[4]).toBeCloseTo(30.71, 6);
  });

  it('ignores display-only named arguments', () => {
    expect(ranks('80 to 240|key=%', 5)).toEqual([80, 120, 160, 200, 240]);
  });
});

describe('choosing linear vs explicit storage', () => {
  it('stores an even series as two numbers', () => {
    expect(asLinearIfEven([80, 120, 160, 200, 240])).toEqual({
      scaling: 'linear',
      from: 80,
      to: 240,
    });
  });

  it('stores an uneven series verbatim — this is the Kayle R case', () => {
    expect(asLinearIfEven([675, 675, 775])).toEqual({
      scaling: 'explicit',
      perRank: [675, 675, 775],
    });
  });

  it('never silently linearises a series whose middle value would move', () => {
    const s = asLinearIfEven([100, 130, 160, 200, 240]);
    expect(s.scaling).toBe('explicit');
  });
});

describe('level progressions', () => {
  it('Caitlyn Headshot: 60 to 100 for 3, at levels 1 to 13', () => {
    const s = parseLevelProgression('60 to 100 for 3|1 to 13');
    expect(s).toEqual({ scaling: 'byLevel', from: 60, to: 100, atLevels: [1, 13], steps: 3 });
    expect(levelBreakpoints(s)).toEqual([
      { level: 1, value: 60 },
      { level: 7, value: 80 },
      { level: 13, value: 100 },
    ]);
  });

  it('Vladimir: values at levels 1/6/11/16', () => {
    // This asserts the BREAKPOINTS, not which of the two level arms stores them. Vladimir's
    // values (10/20/30/40) and levels (1/6/11/16) are both evenly spaced, so the compact
    // `byLevel` form and the explicit form expand to exactly the same thing. Pinning the
    // storage choice would test a representation detail; pinning the breakpoints tests the
    // number the user is shown.
    const s = parseLevelProgression('10%;20%;30%;40%|1;6;11;16');
    expect(levelBreakpoints(s)).toEqual([
      { level: 1, value: 10 },
      { level: 6, value: 20 },
      { level: 11, value: 30 },
      { level: 16, value: 40 },
    ]);
  });

  it('Akshan Dirty Fighting: an UNEVEN value series must be stored verbatim', () => {
    // {{pp|15;40;80;150|1;6;11;16}} — 15/40/80/150 is not an even progression, so the
    // compact form cannot represent it. Linearising would give 60 at level 6 instead of 40.
    const s = parseLevelProgression('15;40;80;150|1;6;11;16');
    expect(s).toEqual({
      scaling: 'byLevelExplicit',
      values: [15, 40, 80, 150],
      atLevels: [1, 6, 11, 16],
    });
    expect(levelBreakpoints(s)[1]).toEqual({ level: 6, value: 40 });
  });

  it('Gangplank Powder Keg: a decreasing series at levels 1/7/13', () => {
    const s = parseLevelProgression('2;1;0.5|1;7;13');
    expect(levelBreakpoints(s)).toEqual([
      { level: 1, value: 2 },
      { level: 7, value: 1 },
      { level: 13, value: 0.5 },
    ]);
  });

  it('refuses a {{pp}} whose second axis is not champion levels', () => {
    // Hwei's Grim Visage indexes 0-1100 ability power; Kai'Sa's Supercharge indexes 0-100
    // percent. Both use {{pp}}. Storing either as levels would be silently wrong, so the
    // parser refuses and the ability goes to the hand-authored worklist.
    expect(() => parseLevelProgression('70;78;86;94;99|0;300;600;900;1100')).toThrow(
      /not champion levels/,
    );
    expect(() => parseLevelProgression('1.2;1.155;0.6|0;3.90;100')).toThrow(/not champion levels/);
  });

  it('strips the display-only key=% argument', () => {
    const s = parseLevelProgression('key=%|60 to 100 for 3|1 to 13');
    expect(s).toEqual({ scaling: 'byLevel', from: 60, to: 100, atLevels: [1, 13], steps: 3 });
  });

  it('refuses a value list and level list of different lengths', () => {
    expect(() => parseLevelProgression('1;2;3|1;6')).toThrow(ProgressionError);
  });
});

describe('evaluateAt follows the documented rewrite', () => {
  it('reproduces the formula exactly at every index', () => {
    for (let x = 1; x <= 5; x += 1) {
      expect(evaluateAt('80 to 240', x, 5)).toBeCloseTo(80 + ((240 - 80) / 4) * (x - 1), 10);
    }
  });

  it('a single step returns the left operand rather than dividing by zero', () => {
    expect(evaluateAt('80 to 240', 1, 1)).toBe(80);
  });
});
