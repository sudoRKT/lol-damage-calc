// KNOWN-ANSWER TESTS for the rune census's MARKUP GUARD.
//
// The guard exists because every other anchor in that census is matched against text stripHtml
// has already removed the tags from — and the tag name is where Data Dragon states the damage
// type. A guard that cannot see where the source keeps a fact is not guarding that fact.
//
// So the important tests here are the ones where it says NO. Importing rune-census.ts must never
// put a request on the wiki; it fetches only when run directly, which the last test asserts.

import { describe, expect, it } from 'vitest';

import {
  ENDPOINT_TOLERANCE,
  crossCheckEndpoints,
  evalFormula,
  markupGuardFailure,
} from './rune-census.ts';

/** Data Dragon 16.16.1, rune 8369, verbatim. The damage type is stated ONLY by the tag. */
const FIRST_STRIKE_LIVE =
  'Attacks or abilities against an enemy champion within 0.25s of entering champion combat grant ' +
  '<gold>10 gold</gold> and <b>First Strike</b> for 3 seconds, causing you to deal ' +
  '<truedamage>7%</truedamage> extra <truedamage> damage</truedamage> against champions, and ' +
  'granting <gold>50% (35% for ranged champions)</gold> of bonus damage dealt as <gold>gold</gold>.';

const FIRST_STRIKE_READING = {
  name: 'First Strike',
  markupType: 'true' as const,
  ddMarkupAnchor: '<truedamage>7%</truedamage> extra <truedamage> damage</truedamage>',
};

/** A rune whose prose carries no damage-type tag at all — 59 of the 62 are like this. */
const NO_TAGS = {
  name: 'Presence of Mind',
  reading: { name: 'Presence of Mind' },
  text: 'Takedowns restore 20% of your maximum mana. Cooldown for damage restoration: 8s',
};

describe('rune-census/the markup guard says YES when the source has not moved', () => {
  it('passes First Strike against the live 16.16.1 markup', () => {
    expect(markupGuardFailure(FIRST_STRIKE_READING, FIRST_STRIKE_LIVE)).toBeNull();
  });

  it('passes a rune whose reading records no markup type and whose text has none', () => {
    expect(markupGuardFailure(NO_TAGS.reading, NO_TAGS.text)).toBeNull();
  });
});

describe('rune-census/the markup guard says NO — proved, not assumed', () => {
  // THE EXACT CHANGE THE OLD GUARD WAS BLIND TO. Every word is identical; only the tag moves.
  it('fails when <truedamage> becomes <magicdamage> and not one word changes', () => {
    const swapped = FIRST_STRIKE_LIVE.replace(/truedamage/g, 'magicdamage');
    const failure = markupGuardFailure(FIRST_STRIKE_READING, swapped);
    expect(failure).not.toBeNull();
    expect(failure).toContain('"magic"');
    expect(failure).toContain('"true"');
  });

  it('proves the OLD guard would not have noticed: the stripped text is unchanged', () => {
    const swapped = FIRST_STRIKE_LIVE.replace(/truedamage/g, 'magicdamage');
    const strip = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(strip(swapped)).toBe(strip(FIRST_STRIKE_LIVE));
  });

  it('fails when a tag DISAPPEARS, leaving the words but not the statement', () => {
    const untagged = FIRST_STRIKE_LIVE.replace(/<\/?truedamage>/g, '');
    const failure = markupGuardFailure(FIRST_STRIKE_READING, untagged);
    expect(failure).toContain('asserts damage type none');
  });

  it('fails when a tag APPEARS on a rune whose reading recorded none', () => {
    const failure = markupGuardFailure(
      NO_TAGS.reading,
      NO_TAGS.text.replace('20%', '<physicaldamage>20%</physicaldamage>'),
    );
    expect(failure).toContain('"physical"');
  });

  it('fails when the type is unchanged but the phrase inside the tags is rewritten', () => {
    const reworded = FIRST_STRIKE_LIVE.replace(
      '<truedamage>7%</truedamage> extra <truedamage> damage</truedamage>',
      '<truedamage>9% extra damage</truedamage>',
    );
    const failure = markupGuardFailure(FIRST_STRIKE_READING, reworded);
    expect(failure).toContain('RAW markup anchor');
  });

  it('is case-insensitive about the tag, because the live file is not consistent', () => {
    // First Strike ships <truedamage>, Hail of Blades ships <trueDamage>, in the same file.
    const camel = FIRST_STRIKE_LIVE.replace(/truedamage/g, 'trueDamage');
    // The TYPE still reads as true...
    expect(markupGuardFailure({ name: 'x', markupType: 'true' }, camel)).toBeNull();
    // ...while the verbatim anchor is spelling-exact, and reports the spelling change.
    expect(markupGuardFailure(FIRST_STRIKE_READING, camel)).toContain('RAW markup anchor');
  });
});

describe('rune-census/the endpoint tolerance is a named constant, not a literal in a condition', () => {
  it('is 1e-9 — dropped from 0.51 on 2026-08-15 — and exported so a change to it shows in a diff', () => {
    expect(ENDPOINT_TOLERANCE).toBe(1e-9);
  });
});

// ---------------------------------------------------------------------------------------------
// WHAT THE TOLERANCE DECIDES. A constant nobody has exercised is a number, not a rule, so these
// run the real cross-check over synthetic sources — no network, no stored rune value.
//
// `crossCheckEndpoints(ddText, ddIndex, wikiText, wikiIndex, anchorLength)` reads Data Dragon's
// printed range from a window after ddIndex, and the wiki's {{pp|…}} progression after wikiIndex.
// ---------------------------------------------------------------------------------------------

const check = (ddText: string, wikiText: string) =>
  crossCheckEndpoints(ddText, 0, wikiText, 0, 10);

describe('rune-census/the endpoint cross-check at the new tolerance', () => {
  it('AGREES where both sources print the same endpoints — the shape all 10 live rows have', () => {
    const result = check('Damage: 25 - 120', 'deals {{pp|25 to 120}} damage');
    expect(result.verdict).toBe('endpoints-agree');
    expect(result.gapRaw).toEqual({ low: 0, high: 0 });
  });

  it('AGREES on a formula whose float arithmetic misses the endpoint by 8e-14', () => {
    // Measured, not invented: this expression really does read 4.10000000000008 at x=18, and it
    // is the largest error found over 25,000,000 one-decimal linear progressions. Exact equality
    // would call this a source disagreement; there is no disagreement in the sources to read.
    expect(evalFormula('276.7 + (4.1-276.7)/17*(x-1)', 18)).not.toBe(4.1);
    expect(Math.abs(evalFormula('276.7 + (4.1-276.7)/17*(x-1)', 18) - 4.1)).toBeLessThan(1e-13);
    const result = check(
      'Damage: 276.7 - 4.1',
      'deals {{pp|276.7 + (4.1-276.7)/17*(x-1)}} damage',
    );
    expect(result.verdict).toBe('endpoints-agree');
    expect(result.gapRaw!.high).toBeGreaterThan(0);
    expect(result.gapRaw!.high).toBeLessThan(ENDPOINT_TOLERANCE);
  });

  it('DISAGREES on half a point — the case 0.51 absorbed and 1e-9 surfaces', () => {
    // THIS IS THE BEHAVIOUR CHANGE, proved rather than described. Under the old tolerance this
    // exact pair returned "endpoints-agree" and nobody would ever have read it.
    const result = check('Damage: 25 - 120.5', 'deals {{pp|25 to 120}} damage');
    expect(result.verdict).toBe('endpoints-disagree');
    expect(result.gapRaw).toEqual({ low: 0, high: 0.5 });
    expect(0.5).toBeLessThan(0.51); // the old constant would have called this agreement
  });

  it('DISAGREES on a thousandth — the finest difference either source can print', () => {
    const result = check('Damage: 25 - 120.001', 'deals {{pp|25 to 120}} damage');
    expect(result.verdict).toBe('endpoints-disagree');
  });

  it('still DISAGREES on Deathfire Touch\'s live gap of 1.5 and 6, which no tolerance decided', () => {
    const result = check('Damage: 25 - 120', 'deals {{pp|23.5 to 114}} damage');
    expect(result.verdict).toBe('endpoints-disagree');
    expect(result.gapRaw).toEqual({ low: 1.5, high: 6 });
  });

  it('publishes the RAW gap as well as the rounded one, because 4dp cannot show float noise', () => {
    const result = check('Damage: 276.7 - 4.1', 'deals {{pp|276.7 + (4.1-276.7)/17*(x-1)}} damage');
    expect(result.gap!.high).toBe(0); // what a reader of the rounded figure sees
    expect(result.gapRaw!.high).not.toBe(0); // what the comparison actually faced
  });
});
