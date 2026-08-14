// Known-answer tests for rework detection (SPECIFICATION §9).
//
// The failure this check exists to prevent: a champion's kit is replaced, every base statistic
// moves by an amount the bounds accept, and the curated damage numbers quietly attach to
// abilities that no longer exist. Nothing arithmetic notices. Only identifier identity does.

import { describe, expect, it } from 'vitest';

import { detectRework, normaliseAbilityName, type CuratedAbilityIdentity } from './rework.ts';
import { aatrox, ashe } from './snapshot-fixtures.ts';

const roster = [aatrox(), ashe()];

/** The curated identities that exactly match the fixture roster. */
const matching: CuratedAbilityIdentity[] = [
  { champion: 'Aatrox', slot: 'P', abilityName: 'Deathbringer Stance' },
  { champion: 'Aatrox', slot: 'Q', abilityName: 'The Darkin Blade' },
  { champion: 'Aatrox', slot: 'W', abilityName: 'Infernal Chains' },
  { champion: 'Aatrox', slot: 'E', abilityName: 'Umbral Dash' },
  { champion: 'Aatrox', slot: 'R', abilityName: 'World Ender' },
];

/** Aatrox's Q aliases, which the module lists but which are not separate abilities. */
const aliasesOfQ = ['The Darkin Blade 2', 'The Darkin Blade 3'];

describe('rework: a curated file that matches the source', () => {
  it('reports no lost identifier when every curated name is in its slot', () => {
    const report = detectRework(matching, roster);
    expect(report.counts.matchedExactly).toBe(5);
    expect(report.findings.filter((f) => f.severity === 'halt')).toEqual([]);
    expect(report.suspectedReworks).toEqual([]);
  });

  it('flags the alias rows as uncurated, at review level only', () => {
    // DATA-SOURCES §18: "The Darkin Blade 2" is a second cast row of one template, not a
    // second ability. It has no curated entry and should never halt anything.
    const report = detectRework(matching, roster);
    const uncurated = report.findings.filter((f) => f.kind === 'source-ability-uncurated');
    expect(uncurated.map((f) => f.sourceNames[0])).toEqual(expect.arrayContaining(aliasesOfQ));
    expect(uncurated.every((f) => f.severity === 'review')).toBe(true);
  });

  it('says nothing about a champion the curated file has not covered at all', () => {
    const report = detectRework(matching, roster);
    expect(report.findings.some((f) => f.champion === 'Ashe')).toBe(false);
  });
});

describe('rework: a replaced kit', () => {
  const reworkedAatrox = aatrox({
    abilityNames: {
      P: ['Deathbringer Stance'],
      Q: ['Some New Ability'],
      W: ['Another New Ability'],
      E: ['Umbral Dash'],
      R: ['World Ender'],
    },
  });

  it('names every curated identifier the source no longer lists', () => {
    const report = detectRework(matching, [reworkedAatrox, ashe()]);
    const lost = report.findings.filter((f) => f.kind === 'ability-name-absent');
    expect(lost.map((f) => f.curatedName).sort()).toEqual(['Infernal Chains', 'The Darkin Blade']);
    expect(lost.every((f) => f.severity === 'halt')).toBe(true);
  });

  it('states both sides in the message: what was curated and what the source now lists', () => {
    const report = detectRework(matching, [reworkedAatrox, ashe()]);
    const q = report.findings.find((f) => f.kind === 'ability-name-absent' && f.slot === 'Q')!;
    expect(q.message).toContain('The Darkin Blade');
    expect(q.message).toContain('Some New Ability');
  });

  it('promotes the champion to a suspected kit replacement', () => {
    const report = detectRework(matching, [reworkedAatrox, ashe()]);
    expect(report.suspectedReworks).toEqual(['Aatrox']);
  });

  it('does NOT call it a rework when the source merely gained an ability', () => {
    const gained = aatrox({
      abilityNames: { ...aatrox().abilityNames, R: ['World Ender', 'Wind Slash'] },
    });
    const report = detectRework(matching, [gained, ashe()]);
    expect(report.suspectedReworks).toEqual([]);
    expect(report.findings.filter((f) => f.severity === 'halt')).toEqual([]);
  });
});

describe('rework: an ability that moved slot', () => {
  it('halts, and says which slot it moved to', () => {
    const moved = aatrox({
      abilityNames: {
        P: ['Deathbringer Stance'],
        Q: ['Infernal Chains'],
        W: ['The Darkin Blade'],
        E: ['Umbral Dash'],
        R: ['World Ender'],
      },
    });
    const report = detectRework(matching, [moved, ashe()]);
    const finding = report.findings.find((f) => f.kind === 'ability-moved-slot')!;
    expect(finding.curatedName).toBe('The Darkin Blade');
    expect(finding.slot).toBe('Q');
    expect(finding.foundInSlot).toBe('W');
    expect(finding.severity).toBe('halt');
    expect(finding.message).toContain('would look right');
  });
});

describe('rework: a name that differs only in formatting', () => {
  it('is a review, not a silent match and not a halt', () => {
    // The wiki really does move between apostrophe characters.
    const curly = aatrox({
      abilityNames: { ...aatrox().abilityNames, W: ['Infernal  Chains'] },
    });
    const report = detectRework(matching, [curly, ashe()]);
    const finding = report.findings.find((f) => f.kind === 'ability-name-formatting')!;
    expect(finding.severity).toBe('review');
    expect(finding.matchedSourceName).toBe('Infernal  Chains');
    expect(report.suspectedReworks).toEqual([]);
  });

  it('folds apostrophe style, dash style, case and spacing — and nothing else', () => {
    expect(normaliseAbilityName("Ranger's Focus")).toBe(normaliseAbilityName('Ranger’s Focus'));
    expect(normaliseAbilityName('Wind  Slash')).toBe(normaliseAbilityName('wind slash'));
    expect(normaliseAbilityName('Wind Slash')).not.toBe(normaliseAbilityName('Wind Slash 2'));
  });
});

describe('rework: a champion the roster no longer has', () => {
  it('halts, naming the orphaned curated entry', () => {
    const report = detectRework(matching, [ashe()]);
    const finding = report.findings.find((f) => f.kind === 'champion-absent')!;
    expect(finding.champion).toBe('Aatrox');
    expect(finding.severity).toBe('halt');
    expect(finding.message).toContain('would attach to nothing');
  });

  it('halts when a slot empties entirely', () => {
    const noQ = aatrox({ abilityNames: { ...aatrox().abilityNames, Q: [] } });
    const report = detectRework(matching, [noQ, ashe()]);
    const finding = report.findings.find((f) => f.kind === 'slot-absent')!;
    expect(finding.severity).toBe('halt');
  });
});

describe('rework: identity matching', () => {
  it('matches a curated entry written against the display name as well as the apiname', () => {
    const byDisplayName: CuratedAbilityIdentity[] = [
      { champion: 'Ashe', slot: 'Q', abilityName: "Ranger's Focus" },
    ];
    const report = detectRework(byDisplayName, roster);
    expect(report.counts.matchedExactly).toBe(1);
  });

  it('is deterministic: the same inputs produce the same findings in the same order', () => {
    const shuffled = [...matching].reverse();
    const a = JSON.stringify(detectRework(matching, roster).findings);
    const b = JSON.stringify(detectRework(shuffled, roster).findings);
    expect(a).toBe(b);
  });

  it('counts what it actually compared, so an empty curated file cannot read as a pass', () => {
    const report = detectRework([], roster);
    expect(report.counts.curatedAbilities).toBe(0);
    expect(report.counts.matchedExactly).toBe(0);
    expect(report.findings).toEqual([]);
  });
});
