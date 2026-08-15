// The six, read. One `DisagreementEvidence` per rune, every field measured on 2026-08-15
// against Data Dragon 16.16.1 and wiki.leagueoflegends.com/en-us — never inferred from a
// neighbouring rune.
//
// This file holds FACTS ONLY. The verdict is computed by `classifyDisagreement` in
// rune-contested.ts, so nobody can write a verdict here and have it stick: change a date or
// a count and the verdict moves with it. That is deliberate. The one thing a reader of this
// project must never be able to do is quietly pick the tidier source.
//
// Dates come from the wiki's own revision history (`prop=revisions`, timestamps and edit
// comments) and, for Data Dragon, from walking 87 patch lines of runesReforged.json back to
// 13.1.1 and finding the newest version whose string differs.

import type { DisagreementEvidence } from './rune-contested.ts';

/**
 * How the wiki's Adaptive force article, the single page that states the modern tiebreak,
 * dates. Shared by the three adaptive-force runes so the comparison is against one measured
 * date rather than three copies of it.
 */
const ADAPTIVE_FORCE_ARTICLE_SIDE = {
  source: 'wiki article "Adaptive force"',
  text:
    "If the bonus attack damage and the ability power of the unit are equal, the stat granted " +
    'depends on the adaptive type of the champion.',
  // The adaptive-type explanation was written in this edit, comment: "'adaptive type' is in
  // every champion's info panel but it's not explained anywhere, so I tr[ied]…"
  introduced: '2026-05-02',
  // Newest edit to the page, tagged [[V26.11]].
  pageLastEdited: '2026-05-27',
};

export const SIX: DisagreementEvidence[] = [
  // -------------------------------------------------------------------------------------
  {
    rune: 'Electrocute',
    censusBlocker: 'sources-disagree-on-tiebreak',
    claim:
      'what decides the damage type when the AD and AP contributions are equal — the ' +
      "champion's adaptive type, or magic damage",
    sideA: {
      source: 'wiki Template:Tip data/Adaptive damage',
      text:
        'If the damage contribution of AD and AP are zero or otherwise equal, the damage type ' +
        "depends on the champion's adaptive type.",
      introduced: '2026-04-29',
      pageLastEdited: '2026-05-02',
    },
    sideB: {
      source: 'wiki Template:Rune data Electrocute, "Variable Damage" block',
      text:
        'If the damage contribution of AD and AP are zero or otherwise equal, the damage type ' +
        'defaults to magic damage.',
      introduced: '2026-05-02',
      pageLastEdited: '2026-05-02',
    },
    // "Despite also having variable damage types, Arcane Comet and Electrocute do not
    // utilize the adaptive damage formula to determine their damage types." — the Adaptive
    // force article says which rule reaches which rune, in its own words.
    exemptedBySourceItself: true,
    factSurvivesInRawMarkup: false,
    sideAReproducedInItsLaunchNote: false,
    sideACarriers: { carriers: 5, outOf: 62 },
    patchNoteDocumentsChange: false,
  },
  // -------------------------------------------------------------------------------------
  {
    rune: 'Arcane Comet',
    censusBlocker: 'sources-disagree-on-tiebreak',
    claim: 'as Electrocute — which of the two adaptive rules governs the tie',
    sideA: {
      source: 'wiki Template:Tip data/Adaptive damage',
      text:
        'If the damage contribution of AD and AP are zero or otherwise equal, the damage type ' +
        "depends on the champion's adaptive type.",
      introduced: '2026-04-29',
      pageLastEdited: '2026-05-02',
    },
    sideB: {
      source: 'wiki Template:Rune data Arcane Comet, "Variable Damage" block',
      text:
        'If the damage contribution of AD and AP are zero or otherwise equal, the damage type ' +
        'defaults to magic damage.',
      introduced: '2026-05-02',
      pageLastEdited: '2026-05-31',
    },
    exemptedBySourceItself: true,
    factSurvivesInRawMarkup: false,
    sideAReproducedInItsLaunchNote: false,
    sideACarriers: { carriers: 5, outOf: 62 },
    patchNoteDocumentsChange: false,
  },
  // -------------------------------------------------------------------------------------
  {
    rune: 'Absolute Focus',
    censusBlocker: 'sources-disagree-on-tiebreak',
    claim:
      'which stat adaptive FORCE grants when bonus attack damage and ability power are equal ' +
      "— attack damage (the first listed), or the champion's adaptive type",
    sideA: {
      source: 'wiki Template:Rune data Absolute Focus, description2',
      text:
        'Adaptive: Grants bonuses based on which stat you already have the most bonuses for. ' +
        'Defaults to the first listed.',
      // Emptylord, one day after the rune's page was created; the wording is the V7.22
      // launch note, reproduced in the rune article's own Patch History to this day.
      introduced: '2017-09-26',
      pageLastEdited: '2026-01-23',
    },
    sideB: ADAPTIVE_FORCE_ARTICLE_SIDE,
    exemptedBySourceItself: false,
    factSurvivesInRawMarkup: false,
    sideAReproducedInItsLaunchNote: true,
    // Measured over all 62 current rune templates on 2026-08-15: exactly 3 still carry it.
    sideACarriers: { carriers: 3, outOf: 62 },
    patchNoteDocumentsChange: false,
  },
  // -------------------------------------------------------------------------------------
  {
    rune: 'Waterwalking',
    censusBlocker: 'sources-disagree-on-tiebreak',
    claim: 'as Absolute Focus — the adaptive FORCE tie',
    sideA: {
      source: 'wiki Template:Rune data Waterwalking, description2',
      text:
        'Adaptive: Grants bonuses based on which stat you already have the most bonuses for. ' +
        'Defaults to the first listed.',
      introduced: '2018-11-18',
      pageLastEdited: '2026-01-23',
    },
    sideB: ADAPTIVE_FORCE_ARTICLE_SIDE,
    exemptedBySourceItself: false,
    factSurvivesInRawMarkup: false,
    sideAReproducedInItsLaunchNote: true,
    sideACarriers: { carriers: 3, outOf: 62 },
    patchNoteDocumentsChange: false,
  },
  // -------------------------------------------------------------------------------------
  {
    rune: 'Gathering Storm',
    censusBlocker: 'sources-disagree-on-tiebreak',
    claim: 'as Absolute Focus — the adaptive FORCE tie',
    sideA: {
      source: 'wiki Template:Rune data Gathering Storm, description2',
      text:
        'Adaptive: Grants bonuses based on which stat you already have the most bonuses for. ' +
        'Defaults to the first listed.',
      // Present in all 40 revisions fetched, back to the page's creation on 2018-11-04.
      introduced: '2018-11-04',
      pageLastEdited: '2026-04-22',
    },
    sideB: ADAPTIVE_FORCE_ARTICLE_SIDE,
    exemptedBySourceItself: false,
    factSurvivesInRawMarkup: false,
    sideAReproducedInItsLaunchNote: true,
    sideACarriers: { carriers: 3, outOf: 62 },
    patchNoteDocumentsChange: false,
  },
  // -------------------------------------------------------------------------------------
  {
    rune: 'First Strike',
    censusBlocker: 'sources-disagree-on-kind',
    claim:
      'whether the rune AMPLIFIES damage by 7% or adds a separate instance of 7% TRUE damage',
    sideA: {
      source: 'Data Dragon runesReforged.json 16.16.1, longDesc',
      text:
        'causing you to deal <truedamage>7%</truedamage> extra <truedamage> damage</truedamage> ' +
        'against champions',
      // Data Dragon's string last moved at 16.16.1 > … > 14.12.1, where 8% became 7% —
      // exactly the change patch note V14.12 documents. It is current, not stale.
      introduced: '2024-06-11',
      pageLastEdited: '2024-06-11',
    },
    sideB: {
      source: 'wiki Template:Rune data First Strike',
      text:
        'causing all of your post-mitigation damage dealt against champions to deal 7% bonus ' +
        'true damage',
      introduced: '2021-11-20',
      pageLastEdited: '2025-11-23',
    },
    exemptedBySourceItself: false,
    // <truedamage> wraps both "7%" and " damage". Both sources say true damage; `stripHtml`
    // deleted the tags before the census compared them.
    factSurvivesInRawMarkup: true,
    sideAReproducedInItsLaunchNote: false,
    sideACarriers: { carriers: 3, outOf: 62 },
    patchNoteDocumentsChange: false,
  },
];

/**
 * What stands once the verdict is applied, and what the verdict does NOT establish.
 *
 * These are written per rune rather than derived, because "what wins" is a statement about
 * League of Legends and "what the evidence shows" is a statement about two web pages. The
 * classifier does the second. This does the first, and names its own limits.
 */
export const OUTCOME: Record<string, { valueThatStands: string | null; residual: string | null }> = {
  Electrocute: {
    valueThatStands:
      'Physical or magic by which RATIO contributes more damage; magic on a tie or when both ' +
      'contributions are zero. The adaptive-damage rule does not reach this rune.',
    residual:
      "Data Dragon calls it 'adaptive damage' and states no rule at all, so it neither agrees " +
      'nor disagrees. The `adaptive-type-unresolved` blocker still stands: the RULE is known ' +
      'and the resolution step that applies it does not exist yet.',
  },
  'Arcane Comet': {
    valueThatStands:
      'As Electrocute. Both sources also carry the V26.09 rework (15–100 base, amplification ' +
      'to 100% at 750 range), so neither is a patch behind on the numbers.',
    residual:
      'The `needs-position` blocker is untouched by this: the amplification is a distance the ' +
      'scenario has no way to state.',
  },
  'Absolute Focus': {
    valueThatStands:
      "The champion's adaptive type decides the tie — bonus AD for a physical-adaptive " +
      'champion, AP for a magic-adaptive one. `adaptivetype` is already in ' +
      'public/data/champions.json.',
    residual:
      'NO PATCH NOTE DOCUMENTS THE CHANGE from "first listed" to adaptive type. The staleness ' +
      'is established from the wording being verbatim 2017 launch text, from the competing ' +
      'text being rewritten in 2026, and from only 3 of 62 current runes still carrying it — ' +
      'not from a note. §15 names the patch notes as the tie-break, and here they are silent.',
  },
  Waterwalking: {
    valueThatStands: "As Absolute Focus — the champion's adaptive type decides the tie.",
    residual:
      'Same silence in the patch notes. Separately, this rune only applies while in the river, ' +
      'which the scenario does not model; the census records that in its reading but attaches ' +
      'no blocker to it.',
  },
  'Gathering Storm': {
    valueThatStands: "As Absolute Focus — the champion's adaptive type decides the tie.",
    residual:
      'Resolving the tie does not unblock this rune. `needs-elapsed-time` stands on its own: ' +
      'the value grows every 10 minutes and the engine models sequence, not time.',
  },
  'First Strike': {
    valueThatStands:
      'A separate instance of TRUE damage equal to 7% of post-mitigation damage dealt to ' +
      'champions. Both sources say so; the wiki says it in words, Data Dragon in markup. ' +
      "Riot's own launch note (V11.23) says 'bonus true damage' and every later note moves " +
      'only the percentage: 10% → 9% (V12.15) → 8% (V13.20) → 7% (V13.21) → 8% (V14.10) → 7% ' +
      '(V14.12).',
    residual:
      'The `self-referential-percentage` blocker stands and is the real obstacle: where a ' +
      'percentage of already-mitigated damage lands in the fixed four-step order is a ' +
      'decision nobody has taken.',
  },
};
