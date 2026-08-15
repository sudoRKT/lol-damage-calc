// Known-answer tests for the contested-rune reading. Every expected value below was
// observed on a live source on 2026-08-15 and is quoted in fixtures/rune-contested.ts.
//
// The suite is deliberately organised so that the classifier is proved able to say
// "genuinely contested" as well as to say "not contested". A detector that can only clear
// things is not a detector.

import { describe, expect, it } from 'vitest';

import {
  ABSOLUTE_FOCUS_LAUNCH_NOTE,
  ADAPTIVE_FORCE_ARTICLE,
  DDRAGON_LONG_DESC,
  FIRST_STRIKE_LAUNCH_NOTE,
  WIKI_TEMPLATE,
} from './fixtures/rune-contested.ts';
import {
  adaptiveForceTiebreakFromArticle,
  carriesLegacyAdaptiveTiebreak,
  carriesVariableDamageBlock,
  classifyDisagreement,
  dataDragonTypeFromMarkup,
  dataDragonTypeLostByStripping,
  runesExemptFromAdaptiveDamageFormula,
  variableDamageTiebreak,
  type DisagreementEvidence,
} from './rune-contested.ts';
import { OUTCOME, SIX } from './rune-contested-findings.ts';

const evidenceFor = (rune: string): DisagreementEvidence => {
  const found = SIX.find((e) => e.rune === rune);
  if (!found) throw new Error(`no evidence recorded for ${rune}`);
  return found;
};

describe('data-dragon-states-damage-type-in-markup', () => {
  it('reads true damage out of First Strike, whose stripped text names no type', () => {
    expect(dataDragonTypeFromMarkup(DDRAGON_LONG_DESC['First Strike']!)).toBe('true');
  });

  it('matches both live spellings of the tag, <truedamage> and <trueDamage>', () => {
    // First Strike ships lower-case, Hail of Blades ships camel-case, in the same file.
    expect(DDRAGON_LONG_DESC['First Strike']).toContain('<truedamage>');
    expect(DDRAGON_LONG_DESC['Hail of Blades']).toContain('<trueDamage>');
    expect(dataDragonTypeFromMarkup(DDRAGON_LONG_DESC['Hail of Blades']!)).toBe('true');
  });

  it('states no type for Summon Aery, which genuinely states none', () => {
    expect(dataDragonTypeFromMarkup(DDRAGON_LONG_DESC['Summon Aery']!)).toBeNull();
  });

  it('refuses a description carrying two different type tags rather than picking one', () => {
    const mixed = 'deals <magicDamage>50</magicDamage> then <trueDamage>10</trueDamage>';
    expect(dataDragonTypeFromMarkup(mixed)).toBeNull();
  });
});

describe('stripping-loses-the-damage-type', () => {
  it('fires on First Strike — the census defect this check generalises', () => {
    expect(dataDragonTypeLostByStripping(DDRAGON_LONG_DESC['First Strike']!)).toBe(true);
  });

  it('does NOT fire on Hail of Blades or Sudden Impact, which say the type in words', () => {
    expect(dataDragonTypeLostByStripping(DDRAGON_LONG_DESC['Hail of Blades']!)).toBe(false);
    expect(dataDragonTypeLostByStripping(DDRAGON_LONG_DESC['Sudden Impact']!)).toBe(false);
  });

  it('does NOT fire where no type is stated at all', () => {
    expect(dataDragonTypeLostByStripping(DDRAGON_LONG_DESC['Summon Aery']!)).toBe(false);
    expect(dataDragonTypeLostByStripping(DDRAGON_LONG_DESC['Electrocute']!)).toBe(false);
  });
});

describe('the-two-competing-adaptive-tiebreaks', () => {
  it('finds the 2017 line on all three flagged rune templates', () => {
    for (const rune of ['Absolute Focus', 'Waterwalking', 'Gathering Storm']) {
      expect(carriesLegacyAdaptiveTiebreak(WIKI_TEMPLATE[rune]!)).toBe(true);
    }
  });

  it('does NOT find it on Conqueror, which grants adaptive force and never carried it', () => {
    expect(carriesLegacyAdaptiveTiebreak(WIKI_TEMPLATE['Conqueror']!)).toBe(false);
  });

  it("reads the article's modern tiebreak as the champion's adaptive type", () => {
    expect(adaptiveForceTiebreakFromArticle(ADAPTIVE_FORCE_ARTICLE)).toBe('champion-adaptive-type');
  });

  it('returns null for an article that states no tiebreak, rather than guessing one', () => {
    expect(adaptiveForceTiebreakFromArticle('Adaptive force grants AD or AP.')).toBeNull();
  });
});

describe('the-article-names-its-own-exceptions', () => {
  it('reads Arcane Comet and Electrocute out of the exemption sentence', () => {
    expect(runesExemptFromAdaptiveDamageFormula(ADAPTIVE_FORCE_ARTICLE).sort()).toEqual([
      'Arcane Comet',
      'Electrocute',
    ]);
  });

  it('finds a Variable Damage block on exactly those two templates', () => {
    expect(carriesVariableDamageBlock(WIKI_TEMPLATE['Electrocute']!)).toBe(true);
    expect(carriesVariableDamageBlock(WIKI_TEMPLATE['Arcane Comet']!)).toBe(true);
    expect(carriesVariableDamageBlock(WIKI_TEMPLATE['Absolute Focus']!)).toBe(false);
  });

  it('reads their stated tiebreak as magic damage', () => {
    expect(variableDamageTiebreak(WIKI_TEMPLATE['Electrocute']!)).toBe('magic');
    expect(variableDamageTiebreak(WIKI_TEMPLATE['Arcane Comet']!)).toBe('magic');
  });
});

describe('the-launch-note-is-where-the-2017-wording-is-datable', () => {
  it('Absolute Focus V7.22 reproduces the disputed sentence verbatim', () => {
    expect(ABSOLUTE_FOCUS_LAUNCH_NOTE).toContain('Defaults to the first listed');
  });

  it("First Strike V11.23 says bonus TRUE damage, matching the wiki and not the amplifier reading", () => {
    expect(FIRST_STRIKE_LAUNCH_NOTE).toContain("bonus''' true damage");
  });
});

describe('classify-the-six', () => {
  const cases: [string, string][] = [
    ['Electrocute', 'not-contested-scope-misread'],
    ['Arcane Comet', 'not-contested-scope-misread'],
    ['First Strike', 'not-contested-markup-stripped'],
    ['Absolute Focus', 'stale-on-one-side'],
    ['Waterwalking', 'stale-on-one-side'],
    ['Gathering Storm', 'stale-on-one-side'],
  ];

  for (const [rune, expected] of cases) {
    it(`${rune} classifies as ${expected}`, () => {
      expect(classifyDisagreement(evidenceFor(rune))).toBe(expected);
    });
  }

  it('records all six and no more', () => {
    expect(SIX).toHaveLength(6);
    expect(Object.keys(OUTCOME).sort()).toEqual(SIX.map((e) => e.rune).sort());
  });

  it('none of the six is left genuinely contested', () => {
    expect(SIX.filter((e) => classifyDisagreement(e) === 'genuinely-contested')).toHaveLength(0);
  });
});

describe('the-classifier-can-still-say-contested', () => {
  // Proving the detector can fail is the point of this block. Each case takes a real
  // finding and removes exactly one measured fact.
  const base = evidenceFor('Absolute Focus');

  it('says contested when the older wording is NOT verbatim launch-note text', () => {
    expect(
      classifyDisagreement({ ...base, sideAReproducedInItsLaunchNote: false }),
    ).toBe('genuinely-contested');
  });

  it('says contested when the older wording still covers most of the population', () => {
    expect(
      classifyDisagreement({ ...base, sideACarriers: { carriers: 40, outOf: 62 } }),
    ).toBe('genuinely-contested');
  });

  it('says contested when both texts are the same age', () => {
    expect(
      classifyDisagreement({
        ...base,
        sideA: { ...base.sideA, introduced: '2026-06-01' },
      }),
    ).toBe('genuinely-contested');
  });

  it('two current sources flatly disagreeing stay contested', () => {
    const genuine: DisagreementEvidence = {
      rune: '(fabricated control case)',
      censusBlocker: 'sources-disagree-on-kind',
      claim: 'a value two current sources state differently',
      sideA: { source: 'A', text: '30', introduced: '2026-08-01', pageLastEdited: '2026-08-01' },
      sideB: { source: 'B', text: '33', introduced: '2026-08-01', pageLastEdited: '2026-08-01' },
      exemptedBySourceItself: false,
      factSurvivesInRawMarkup: false,
      sideAReproducedInItsLaunchNote: false,
      sideACarriers: { carriers: 31, outOf: 62 },
      patchNoteDocumentsChange: false,
    };
    expect(classifyDisagreement(genuine)).toBe('genuinely-contested');
  });
});

describe('the-markup-test-is-checked-before-the-scope-test', () => {
  // Order matters: First Strike is a defect in THIS pipeline. Diagnosing it as a scope
  // misread would declare the rune resolved and leave `stripHtml` eating damage types.
  it('markup wins over scope when both would fire', () => {
    const both = { ...evidenceFor('First Strike'), exemptedBySourceItself: true };
    expect(classifyDisagreement(both)).toBe('not-contested-markup-stripped');
  });
});
