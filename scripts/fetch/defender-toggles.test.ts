// Known-answer tests for the defender-toggle measurement.
//
// TWO KINDS OF TEST HERE, and the difference matters.
//
//   - Tests on hand-built entries, which pin the COUNTING RULE. They are the ones that catch a
//     definition quietly changing: an always-active effect creeping into the toggle count, or a
//     champion with none being dropped from the distribution instead of counted as zero.
//   - Tests against the real census on disk, which pin the OBSERVED NUMBERS. If the census is
//     re-run and a figure moves, these fail and the movement is looked at rather than absorbed.
//     A falling count is usually the system working (CLAUDE.md); it is still looked at.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  allyMentionCandidates,
  countPerChampion,
  distributionOf,
  isHealthGrantOnly,
  isToggle,
  measureDefenderToggles,
  type CensusEntry,
} from './defender-toggles.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function entry(
  key: string,
  kinds: string[],
  activation: CensusEntry['activation'] = 'conditional',
): CensusEntry {
  return { key, champion: key.split('/')[0]!, kinds, activation };
}

describe('the counting rule: what is and is not a defender control', () => {
  it('counts a conditional defensive ability', () => {
    expect(isToggle(entry('Alistar/R/Unbreakable Will', ['damage-reduction']))).toBe(true);
  });

  it('does NOT count an always-active effect — it resolves into the stat block', () => {
    // Fizz P is one of the six the census measures as always-active. There is nothing for a user
    // to answer, so a control for it would be a control that does nothing.
    expect(isToggle(entry('Fizz/P/Nimble Fighter', ['damage-reduction'], 'always-active'))).toBe(
      false,
    );
  });

  it("does NOT count a 'not-stated' effect — a refusal is not a control", () => {
    // Xin Zhao R's condition is a DISTANCE and Kayn P's is a location outside combat. An
    // unchecked box would say "you could turn this on", and neither can ever be turned on.
    expect(isToggle(entry('Xin Zhao/R/Crescent Guard', ['immunity'], 'not-stated'))).toBe(false);
  });

  it('does NOT count an entry whose only kind is a bonus-maximum-health grant', () => {
    expect(isHealthGrantOnly(entry('Someone/W/Big Health', ['max-health-grant']))).toBe(true);
    expect(isToggle(entry('Someone/W/Big Health', ['max-health-grant']))).toBe(false);
  });

  it('DOES count an entry that grants health alongside a real defensive effect', () => {
    expect(isToggle(entry('Someone/W/Both', ['shield', 'max-health-grant']))).toBe(true);
  });

  it('counts one ability as ONE control however many kinds it carries', () => {
    // Garen W states one condition and grants three things at once. A user answers one question.
    const garen = entry('Garen/W/Courage', ['damage-reduction', 'resistance-grant', 'shield']);
    const { counts } = countPerChampion(['Garen'], [garen], isToggle);
    expect(counts.get('Garen')).toBe(1);
  });
});

describe('the distribution counts champions with none, not just champions with some', () => {
  it('gives a champion with no defensive effect a zero rather than omitting them', () => {
    const { counts } = countPerChampion(
      ['Alistar', 'Draven'],
      [entry('Alistar/R/Unbreakable Will', ['damage-reduction'])],
      isToggle,
    );
    expect(counts.get('Draven')).toBe(0);
    expect(distributionOf(counts).withNone).toBe(1);
    expect(distributionOf(counts).champions).toBe(2);
  });

  it('MEASURES THE DIFFERENCE the choice of population makes, rather than asserting it', () => {
    // Three champions, one with two toggles, two with none. Over the whole roster the median is
    // 0; over only the champions that appear in the census it is 2. Same data, different claim.
    const entries = [
      entry('Alistar/R/Unbreakable Will', ['damage-reduction']),
      entry('Alistar/W/Headbutt', ['shield']),
    ];
    const whole = distributionOf(countPerChampion(['Alistar', 'Draven', 'Teemo'], entries, isToggle).counts);
    const onlyPresent = distributionOf(countPerChampion(['Alistar'], entries, isToggle).counts);
    expect(whole.median).toBe(0);
    expect(onlyPresent.median).toBe(2);
  });

  it('names every champion at the maximum, not just one', () => {
    const { counts } = countPerChampion(
      ['A', 'B', 'C'],
      [entry('A/Q/x', ['shield']), entry('B/Q/y', ['shield'])],
      isToggle,
    );
    expect(distributionOf(counts).worstCase).toEqual(['A', 'B']);
  });

  it('reports a census champion the roster does not contain instead of dropping it', () => {
    const { notInRoster } = countPerChampion(
      ['Alistar'],
      [entry('Nobody/Q/x', ['shield'])],
      isToggle,
    );
    expect(notInRoster).toEqual(['Nobody']);
  });

  it('takes the median of an even-sized population as the mean of the middle two', () => {
    const counts = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 3],
      ['d', 4],
    ]);
    expect(distributionOf(counts).median).toBe(2);
  });
});

describe('the ally candidate count is reported and never applied', () => {
  it('flags a page that mentions an ally, and does not subtract it from anything', () => {
    const entries = [entry('Milio/E/Warm Hugs', ['shield']), entry('Olaf/W/Vicious Strikes', ['heal'])];
    const out = allyMentionCandidates(entries, (key) =>
      key.startsWith('Milio') ? 'Shields an allied champion for 45.' : 'Heals Olaf for 12%.',
    );
    expect(out.candidates).toEqual(['Milio/E/Warm Hugs']);
    // The measurement itself is untouched: both are still toggles.
    const m = measureDefenderToggles(['Milio', 'Olaf'], entries);
    expect(m.acrossTheWholeRoster.togglesUnderThisDefinition).toBe(2);
  });

  it('reports an entry whose page text is missing rather than treating it as no mention', () => {
    const out = allyMentionCandidates([entry('Ghost/Q/x', ['shield'])], () => undefined);
    expect(out.candidates).toEqual([]);
    expect(out.noTextFound).toEqual(['Ghost/Q/x']);
  });
});

// ---------------------------------------------------------------------------
// Against the real files on disk. These are the observed numbers of 2026-08-13.
// ---------------------------------------------------------------------------

describe('the live measurement, against the census and roster on disk', () => {
  const census = JSON.parse(
    readFileSync(join(ROOT, 'build', 'proposed-curated', 'defensive-census.json'), 'utf8'),
  ) as { entries: CensusEntry[] };
  const roster = (
    JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'champions.json'), 'utf8')) as {
      name: string;
    }[]
  ).map((c) => c.name);

  const m = measureDefenderToggles(roster, census.entries);

  it('measures 173 champions and joins every census champion to one of them', () => {
    expect(roster).toHaveLength(173);
    expect(m.notInRoster).toEqual([]);
  });

  it('finds 212 toggles across the whole roster', () => {
    // §40 reports 210 conditional over its 218-entry population; this file measures 212 over the
    // 226-entry file, which includes the bonus-health entries that are ALSO something else.
    expect(m.acrossTheWholeRoster.togglesUnderThisDefinition).toBe(212);
  });

  it('THE HEADLINE: no single champion exceeds FOUR, and the median is ONE', () => {
    expect(m.perChampionByAbility.max).toBe(4);
    expect(m.perChampionByAbility.median).toBe(1);
    expect(m.perChampionByAbility.min).toBe(0);
  });

  it('names the seven worst-case champions', () => {
    expect(m.perChampionByAbility.worstCase).toEqual([
      'Briar',
      'Dr. Mundo',
      'Nilah',
      'Olaf',
      'Trundle',
      'Warwick',
      'Yuumi',
    ]);
  });

  it('finds 42 champions with no conditional defensive effect at all', () => {
    expect(m.perChampionByAbility.withNone).toBe(42);
    expect(m.perChampionByAbility.histogram).toEqual({ '0': 42, '1': 76, '2': 36, '3': 12, '4': 7 });
  });

  it('reaches 6 at most even counting one control per KIND — still not 200', () => {
    // The choice of unit is the one place this measurement could have been argued down. Even the
    // most generous unit tops out at six controls for one champion.
    expect(m.perChampionByKind.max).toBe(6);
    expect(m.perChampionByKind.median).toBe(1);
  });
});
