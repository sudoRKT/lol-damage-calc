// THE RUNE CENSUS — what the sources actually STATE about rune damage.
//   node scripts/fetch/rune-census.ts
//
// This is a census, not an extraction. It writes public/data/rune-census.json and authors
// NOT ONE rune value. Every row records what a source says and what it declines to say.
//
// WHY IT EXISTS
// DATA-SOURCES §6 recorded that every rune number lives in Data Dragon prose and that no wiki
// rune data MODULE exists — both still true, and the 683-page module enumeration was repeated
// here and still returns nothing. What §6 did not record is that the wiki states rune values in
// TEMPLATE space instead: `Template:Rune data <Name>`, one page per rune, in the same
// `{{as|…}}` / `{{pp|…}}` markup as `Module:ItemData/data`. So this census reads BOTH sources
// and reports each count twice, because they disagree about which runes deal damage at all.
//
// HOW A ROW IS JUDGED
// A person read all 62 runes in both sources and recorded the judgment in RUNE_READINGS below.
// The machine's only job is to prove the reading was made against the text that is live now:
// every row names an ANCHOR — a verbatim substring — and the runner refuses the row if the
// anchor is absent from the fetched source. The stored quote is a window cut from the live
// source around that anchor, so no quote in the output was retyped by hand.
// This is the shape CLAUDE.md fixes: a detector proposes, a person confirms.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join as joinPath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { stripHtml } from './effect-text.ts';
import { dataDragonTypeFromMarkup } from './rune-contested.ts';
import { VERSIONS_URL, ddragonRunesUrl, fetchJson } from './sources.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = joinPath(HERE, '..', '..', 'public', 'data');

const WIKI_API = 'https://wiki.leagueoflegends.com/en-us/api.php';
const USER_AGENT = 'LimitTest/0.1 (League of Legends damage calculator; https://limittest.site)';

/** Characters of live source text kept either side of an anchor. */
const QUOTE_WINDOW = 150;

// ---------------------------------------------------------------------------------------------
// The vocabulary. Every count below is defined here and nowhere else.
// ---------------------------------------------------------------------------------------------

/** What the rune does to a damage number, as its PRIMARY effect. */
export type RuneRole =
  | 'damage-instance'
  | 'damage-amplifier'
  | 'damage-reduction'
  | 'heal'
  | 'shield'
  | 'stat'
  | 'resource'
  | 'utility';

/** How reachable the value is in a given source. */
export type ValueReach =
  | 'labelled-line' // Data Dragon: "Damage: 70 - 240 …" on its own line. A parser can find it by label.
  | 'in-sentence' // the number is in ordinary prose with no label a parser can key on
  | 'templated' // wiki: the value is inside {{pp|…}} / {{as|…}} markup this project already parses
  | 'placeholder' // the source ships an unexpanded token (@HealAmount@) — it states no value at all
  | 'not-applicable';

/** The damage type the source names. `adaptive` and `variable` are NOT DamageType arms. */
export type StatedDamageType =
  | 'physical'
  | 'magic'
  | 'true'
  | 'adaptive'
  | 'variable'
  | 'not-stated'
  | 'not-applicable';

/** What the source says the base value scales on. */
export type StatedAxis =
  | 'level-stated' // the words "based on level" (or equivalent) appear
  | 'level-explicit' // wiki: {{pp|formula|1 to 20 by 1}} — the basis is a written parameter
  | 'level-by-template-default' // wiki: {{pp|…}} with no basis; Template:Passive progression fills it and renders "(based on level)"
  | 'range-no-axis' // a range like "70 - 240" with nothing saying what moves it
  | 'no-progression' // one value, or a percentage — no axis is needed
  | 'not-applicable';

/** Which of the three DIFFERENT adaptive rules the source invokes. They are not interchangeable. */
export type AdaptiveRule =
  | 'adaptive-damage-tip'
  | 'variable-damage-inline'
  | 'adaptive-force-stat'
  | null;

interface ClassDefinition {
  bucket: 'source-silent' | 'contract' | 'model' | 'out-of-champion-scope' | 'contested';
  definition: string;
}

/**
 * Every blocker named in this census, with the bucket saying WHOSE problem it is. The buckets
 * are the ones effect-refusal-census.json uses, plus `model`, because runes hit the
 * sequence-not-time rule harder than items do.
 */
export const BLOCKER_CLASSES: Record<string, ClassDefinition> = {
  'ratio-owner-unstated': {
    bucket: 'source-silent',
    definition:
      'The source names one of the ten owner-bearing stats (DATA-SOURCES §16) and says whose it ' +
      'is nowhere, in EITHER source. Nobody can supply it; SPECIFICATION §8 says present it as ' +
      '"cannot be completed", never as a worklist.',
  },
  'needs-elapsed-time': {
    bucket: 'model',
    definition:
      'The stated value is per unit of time, or changes after a stated number of seconds. The ' +
      'engine models sequence and not elapsed time (CLAUDE.md), so the number of instances is ' +
      'not a fact the model can hold. Nothing is missing from the source.',
  },
  'needs-attack-speed': {
    bucket: 'model',
    definition:
      'The stated value is multiplied by bonus attack speed. Attack speed is excluded from the ' +
      'damage-relevant stats (SPECIFICATION §3.2, effect-census `modifiesDamageRelevantStat`), ' +
      'so the multiplier has no input. A decision could add one — raise it, do not take it.',
  },
  'needs-shield-amount': {
    bucket: 'contract',
    definition:
      'The value is a percentage of a shield the holder gained from somewhere else. `Result.sustain` ' +
      '(DATA-SOURCES §42.2) carries healing, not shielding, so there is no figure to take a ' +
      'percentage of.',
  },
  'needs-position': {
    bucket: 'contract',
    definition:
      'The stated amplification depends on distance travelled. The scenario has no geometry.',
  },
  'needs-stack-count': {
    bucket: 'contract',
    definition:
      'The value grows with a stack the user must state (souls, Legend stacks). §42.1 fixed the ' +
      'stacks unit, so the shape exists; what is missing is the scenario field.',
  },
  'self-referential-percentage': {
    bucket: 'contract',
    definition:
      'The rune adds a percentage of the post-mitigation damage the holder already dealt. Where ' +
      'that lands in the fixed four-step order is a decision nobody has taken.',
  },
  'turret-only': {
    bucket: 'out-of-champion-scope',
    definition:
      'The source restricts the damage to turrets. A two-champion fight (SPECIFICATION §1) ' +
      'contains none, so storing it would be storing damage this product can never deal.',
  },
  'ally-only': {
    bucket: 'out-of-champion-scope',
    definition: 'The effect applies to allied champions. A two-champion scenario has no ally.',
  },
  'adaptive-type-unresolved': {
    bucket: 'contract',
    definition:
      "`DamageType` is 'physical' | 'magic' | 'true' (src/types/data.ts:4). The source names the " +
      'damage adaptive or variable, which is neither. The RULE for resolving it is stated (see ' +
      '`adaptiveRules` in this file), and its inputs are scenario facts the engine already has, ' +
      'so this is a resolution step that does not exist yet — NOT a missing fact.',
  },
  'sources-disagree-on-tiebreak': {
    bucket: 'contested',
    definition:
      'Two wiki texts state different tiebreaks for the same adaptive resolution. Surfaced, not ' +
      'reconciled (CLAUDE.md: a disagreement is a finding).',
  },
  'sources-disagree-on-kind': {
    bucket: 'contested',
    definition:
      'The two sources disagree about whether the rune deals damage or amplifies it. Both counts ' +
      'are reported; neither is silently preferred. EMPTY SINCE 2026-08-15, and kept rather than ' +
      'deleted: its only member was First Strike, and the disagreement turned out to be one this ' +
      'pipeline manufactured by stripping the markup Data Dragon states the damage type in. A ' +
      'class with no members is a statement — the next rune that lands here should be checked ' +
      'against the raw markup before anyone calls it contested.',
  },
};

// ---------------------------------------------------------------------------------------------
// The hand reading. One entry per rune, in Data Dragon's own order.
// ---------------------------------------------------------------------------------------------

interface Reading {
  name: string;
  /** Wiki page title where it differs from Data Dragon's spelling. */
  wikiTitle?: string;
  role: RuneRole;
  /** Does the rune's own text say it causes damage? Answered separately per source. */
  dealsDamage: { ddragon: boolean; wiki: boolean };
  reach: { ddragon: ValueReach; wiki: ValueReach };
  damageType: { ddragon: StatedDamageType; wiki: StatedDamageType };
  axis: { ddragon: StatedAxis; wiki: StatedAxis };
  adaptiveRule: AdaptiveRule;
  blockers: string[];
  /**
   * Verbatim substring that must be present in the live Data Dragon longDesc AFTER stripHtml.
   * This guards the WORDS. It cannot guard the markup — see `ddMarkupAnchor`.
   */
  ddAnchor: string;
  /**
   * THE DAMAGE TYPE DATA DRAGON'S RAW MARKUP ASSERTS, or null where it asserts none.
   *
   * ADDED 2026-08-15, because the guard above could not see the place the source keeps this
   * fact. Data Dragon states damage type in TAG NAMES — First Strike's type is stated nowhere
   * but `<truedamage>`. Riot could change `<truedamage>` to `<magicdamage>` and not one anchor
   * in this file would move, because every anchor is matched against text the tags have already
   * been stripped from.
   *
   * It is recorded for EVERY rune, including the 59 that assert nothing: `null` is a claim too,
   * and a tag appearing where a person recorded none fails the guard just as loudly as a tag
   * changing colour. Absent means null.
   */
  markupType?: 'physical' | 'magic' | 'true' | null;
  /**
   * Verbatim substring of the RAW longDesc, tags included. Required wherever `markupType` is
   * non-null, so the exact tag spelling around the phrase is pinned and not merely its presence.
   */
  ddMarkupAnchor?: string;
  /** Verbatim substring that must be present in the live wiki template wikitext. */
  wikiAnchor: string;
  /** What the reader concluded, in one sentence. */
  note: string;
  /**
   * Present only where this reading CORRECTS something a previous run published. It carries
   * what was published and why it was wrong, so the correction is auditable in the output file
   * rather than only in a commit message.
   */
  correctedFrom?: {
    date: string;
    was: Record<string, string>;
    why: string;
    confirmedBy: string;
  };
}

const READINGS: Reading[] = [
  // ---- Domination -------------------------------------------------------------------------
  {
    name: 'Electrocute',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'labelled-line', wiki: 'templated' },
    damageType: { ddragon: 'adaptive', wiki: 'variable' },
    axis: { ddragon: 'range-no-axis', wiki: 'level-explicit' },
    adaptiveRule: 'variable-damage-inline',
    blockers: ['adaptive-type-unresolved', 'sources-disagree-on-tiebreak'],
    ddAnchor: 'Damage: 70 - 240',
    wikiAnchor: '{{pp|60 + 10 * x|1 to 20 by 1}}',
    note: 'Data Dragon states a range and never says what moves it; the wiki states the formula with level as a written parameter.',
  },
  {
    name: 'Dark Harvest',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'labelled-line', wiki: 'templated' },
    damageType: { ddragon: 'adaptive', wiki: 'adaptive' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: 'adaptive-damage-tip',
    blockers: ['adaptive-type-unresolved', 'needs-stack-count'],
    ddAnchor: 'Dark Harvest damage: 30',
    wikiAnchor: "deals 30 {{as|(+ 11 per Soul)}}",
    note: 'A flat base with a per-soul stack term. No level axis is stated because none is needed.',
  },
  {
    name: 'Hail of Blades',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'labelled-line', wiki: 'templated' },
    damageType: { ddragon: 'true', wiki: 'true' },
    axis: { ddragon: 'range-no-axis', wiki: 'level-by-template-default' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'On-Hit Damage: 2 - 20',
    // The words "bonus true damage" sit INSIDE the tag, so stripping loses nothing here. The
    // markup is still pinned: the tag is where the type lives even when the words agree.
    markupType: 'true',
    ddMarkupAnchor: '<trueDamage>bonus true damage</trueDamage>',
    wikiAnchor: '{{pp|2 + (20-2)/17*(x-1) for 20|color=true damage}}',
    note: 'Damage type is stated and holdable. Data Dragon leaves the range unaxed; the wiki formula supplies it.',
  },
  {
    name: 'Cheap Shot',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'true', wiki: 'true' },
    axis: { ddragon: 'level-stated', wiki: 'level-explicit' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'deals 10 - 45 bonus true damage (based on level)',
    wikiAnchor: '{{pp|10 + (45-10)/17*(x-1)|1 to 20 by 1}}',
    note: 'Complete in BOTH sources: type, value and axis all stated. The value is simply not on a labelled line.',
  },
  {
    name: 'Taste of Blood',
    role: 'heal',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'level-stated', wiki: 'level-explicit' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Healing: 16-40',
    wikiAnchor: '{{pp|16 + (40-16)/17*(x-1)|1 to 20 by 1|color=heal}}',
    note: 'Healing on the rune holder. Deals no damage.',
  },
  {
    name: 'Sudden Impact',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'true', wiki: 'true' },
    axis: { ddragon: 'level-stated', wiki: 'level-by-template-default' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'bonus 20 - 80 True Damage based on level',
    markupType: 'true',
    ddMarkupAnchor: '<trueDamage>20 - 80 True Damage</trueDamage>',
    wikiAnchor: "{{pp|20 to 80}} '''bonus''' true damage",
    note: 'Type and axis stated by both. The wiki writes the range without a basis parameter and lets the template default fill it.',
  },
  {
    name: 'Sixth Sense',
    role: 'utility',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Automatically sense a nearby untracked and unseen ward',
    wikiAnchor: 'it is automatically tracked with a',
    note: 'Vision. Touches no damage number.',
  },
  {
    name: 'Grisly Mementos',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Gain 6 Trinket Haste for each collected',
    wikiAnchor: "Gain 6 [[trinket haste]] per ''Memento'' stack",
    note: 'Trinket haste. Not a damage-relevant stat under the sequence model.',
  },
  {
    name: 'Deep Ward',
    role: 'utility',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Your wards in the enemy jungle are Deep',
    wikiAnchor: "are considered ''Deep''",
    note: 'Wards. Note the wiki names a scaling basis this project has met nowhere else: "average champion level".',
  },
  {
    name: 'Treasure Hunter',
    role: 'utility',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Gain an additional 50 gold',
    wikiAnchor: 'per unique takedown',
    note: 'Gold.',
  },
  {
    name: 'Relentless Hunter',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Gain 8 Move Speed out of combat per Bounty Hunter stack',
    wikiAnchor: "8 '''bonus''' movement speed",
    note: 'Movement speed. Excluded from damage-relevant stats.',
  },
  {
    name: 'Ultimate Hunter',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Your ultimate gains 6 Ability Haste',
    wikiAnchor: '[[ultimate haste]]',
    note: 'Ability haste. The engine models sequence, so cooldowns change no damage number.',
  },

  // ---- Inspiration ------------------------------------------------------------------------
  {
    name: 'Glacial Augment',
    role: 'damage-reduction',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: ['ally-only'],
    ddAnchor: 'reduce their damage by 15% against your allies',
    wikiAnchor: 'have their damage reduced by 15% against your allies',
    note: 'A 15% damage reduction that BOTH sources say excludes the holder. In a two-champion fight it protects nobody.',
  },
  {
    name: 'Unsealed Spellbook',
    role: 'utility',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'placeholder', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'initial swap cooldown is @f3@ seconds',
    wikiAnchor: 'you can swap one of your equipped [[summoner spell]]s',
    note: 'Summoner spells. Carries one of the three unexpanded Data Dragon placeholder tokens.',
  },
  {
    name: 'First Strike',
    role: 'damage-instance',
    // CORRECTED 2026-08-15. Both sources say true damage; Data Dragon says it in the tag.
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'true', wiki: 'true' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: ['self-referential-percentage'],
    ddAnchor: 'causing you to deal 7% extra damage against champions',
    markupType: 'true',
    ddMarkupAnchor: '<truedamage>7%</truedamage> extra <truedamage> damage</truedamage>',
    wikiAnchor: "to deal {{as|7% '''bonus''' true damage}}",
    note:
      'BOTH SOURCES SAY TRUE DAMAGE. Data Dragon states the type in markup — ' +
      '"<truedamage>7%</truedamage> extra <truedamage> damage</truedamage>" — and the wiki states ' +
      'it in words: "causing all of your post-mitigation damage dealt against champions to deal 7% ' +
      'bonus true damage". The percentage is the same and so is what it means.',
    correctedFrom: {
      date: '2026-08-15',
      was: {
        'dealsDamage.ddragon': 'false',
        'damageType.ddragon': "'not-stated'",
        blockers: "['sources-disagree-on-kind', 'self-referential-percentage']",
        note:
          'The single rune the two sources classify differently: Data Dragon calls it 7% extra ' +
          'damage (an amplifier), the wiki calls it 7% bonus TRUE damage (an added instance of a ' +
          'different type). The percentage is the same; what it MEANS is not.',
        'published counts': 'dealsDamage.sourcesDisagree ["First Strike"]; byDataDragon 15; bothAgree 15; typeNotStatedAtAll.ddragon ["First Strike", "Summon Aery"]',
      },
      why:
        'The hand reading was written against text this pipeline had already stripped of HTML, so ' +
        'it recorded "not-stated" for a type the source does state. The comparison then reported a ' +
        'conflict the pipeline had manufactured itself, and the census published First Strike as ' +
        'the one rune whose KIND the two sources disagree about. Nothing in either source ever ' +
        'disagreed.',
      confirmedBy:
        'public/data/rune-contested.json, finding "First Strike", verdict ' +
        '"not-contested-markup-stripped", with both sources verbatim, their edit dates, and Riot\'s ' +
        'own launch note (V11.23) saying "bonus true damage".',
    },
  },
  {
    name: 'Hextech Flashtraption',
    role: 'utility',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'While Flash is on cooldown it is replaced by Hexflash',
    wikiAnchor: "it is replaced by ''{{si|Hexflash}}''",
    note: 'Mobility.',
  },
  {
    name: 'Magical Footwear',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'You get free Slightly Magical Footwear at 12 min',
    wikiAnchor: '{{ii|Slightly Magical Boots}}',
    note: 'Boots and movement speed.',
  },
  {
    name: 'Cash Back',
    role: 'utility',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Get 7.5% Gold back when you purchase Legendary Items',
    wikiAnchor: 'you are automatically refunded',
    note: 'Gold.',
  },
  {
    name: 'Triple Tonic',
    role: 'utility',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Upon reaching level 3, gain an Elixir of Avarice',
    wikiAnchor: "Gain an ''Elixir'' upon reaching each of the following levels",
    note: 'Grants elixirs. Whatever those do is stated on the ITEMS, not here.',
  },
  {
    name: 'Time Warp Tonic',
    role: 'heal',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Consuming a potion grants 40% of its health restoration',
    wikiAnchor: "equal to 40% of its '''total''' health restoration",
    note: 'Healing, expressed as a percentage of a potion.',
  },
  {
    name: 'Biscuit Delivery',
    role: 'heal',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Biscuits restore 20 + 2% of your maximum health',
    wikiAnchor: 'will permanently increase your',
    note: 'Healing plus permanent maximum health. The health grant is damage-relevant; the healing is not damage.',
  },
  {
    name: 'Cosmic Insight',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    // Data Dragon wraps the number in an inline element, so the stripped text reads "+ 18".
    ddAnchor: '+ 18 Summoner Spell Haste',
    wikiAnchor: 'Gain 18 [[ability haste#Increasing summoner spell haste|summoner spell haste]]',
    note: 'Haste.',
  },
  {
    name: 'Approach Velocity',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Gain 7.5% Move Speed towards nearby enemy champions',
    wikiAnchor: "'''bonus total''' movement speed",
    note: 'Movement speed.',
  },
  {
    name: 'Jack Of All Trades',
    wikiTitle: 'Jack of All Trades',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: 'adaptive-force-stat',
    blockers: [],
    ddAnchor: 'Gain 8 or 20 bonus Adaptive Force at 5 and 10 stacks',
    wikiAnchor: "At 5 ''Jack'' stacks, gain {{adaptive|8}}",
    note: 'Adaptive FORCE — a stat, not damage. Note the wiki spells the rune "Jack of All Trades" and Data Dragon "Jack Of All Trades"; the census had to carry the override.',
  },

  // ---- Precision --------------------------------------------------------------------------
  {
    name: 'Press the Attack',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'adaptive', wiki: 'adaptive' },
    axis: { ddragon: 'level-stated', wiki: 'level-explicit' },
    adaptiveRule: 'adaptive-damage-tip',
    blockers: ['adaptive-type-unresolved'],
    ddAnchor: 'deals 40 - 160 bonus adaptive damage (based on level)',
    wikiAnchor: '{{pp|40 + (160-40)/17*(x-1)|1 to 20 by 1}}',
    note: 'Also carries an 8% damage amplifier as a rider on the same effect. Value and axis complete; only the type is unholdable.',
  },
  {
    name: 'Lethal Tempo',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'adaptive', wiki: 'adaptive' },
    axis: { ddragon: 'range-no-axis', wiki: 'level-by-template-default' },
    adaptiveRule: 'adaptive-damage-tip',
    blockers: ['adaptive-type-unresolved', 'needs-attack-speed'],
    ddAnchor: 'bonus adaptive damage On-Attack',
    wikiAnchor: '{{rd|9 + (30-9)/17*(x-1) for 20|6 + (24-6)/17*(x-1) for 20|pp=true}}',
    note: 'Melee and ranged carry different values, stated by both sources. The whole figure is then multiplied by bonus attack speed, which the model has no input for.',
  },
  {
    name: 'Fleet Footwork',
    role: 'heal',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'range-no-axis', wiki: 'level-by-template-default' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Energized attacks heal you for 10 - 130',
    wikiAnchor: 'empowering your next {{tip|basic attack}} to {{tip|heal}} you',
    note: 'Healing only.',
  },
  {
    name: 'Conqueror',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'range-no-axis', wiki: 'level-explicit' },
    adaptiveRule: 'adaptive-force-stat',
    blockers: [],
    ddAnchor: 'gaining 1.8-4 Adaptive Force per stack',
    wikiAnchor: "Each stack of ''Conqueror'' grants {{adaptive|1.8 + (4-1.8)/17*(x-1)|20}}",
    note: 'Adaptive FORCE per stack, plus healing at full stacks. Grants a stat; deals no damage of its own.',
  },
  {
    name: 'Absorb Life',
    role: 'heal',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'placeholder', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'not-applicable', wiki: 'level-explicit' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Killing a target heals you for @HealAmount@',
    wikiAnchor: 'Killing an enemy {{tip|heals}} you for',
    note: 'Data Dragon states NO value at all — it ships the unexpanded token @HealAmount@. The wiki states a four-segment piecewise progression in full.',
  },
  {
    name: 'Triumph',
    role: 'heal',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Takedowns restore 5% of your missing health',
    wikiAnchor: "{{as|{{fd|2.5}}% of your '''maximum''' health}}",
    note: 'Healing on takedown. Both sources state the owner of both health pools ("your").',
  },
  {
    name: 'Presence of Mind',
    role: 'resource',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'range-no-axis', wiki: 'level-by-template-default' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Damaging an enemy champion restores 6-50',
    wikiAnchor: "restores {{as|15% of your '''maximum''' mana}}",
    note: 'Mana and energy. Relevant only to abilities that read a mana pool.',
  },
  {
    name: 'Legend: Alacrity',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Gain 3% attack speed plus an additional 1.5%',
    wikiAnchor: 'basealacrity',
    note: 'Attack speed. Excluded from damage-relevant stats by the sequence model.',
  },
  {
    name: 'Legend: Haste',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Gain 1.5 basic ability haste for every Legend stack',
    wikiAnchor: "basic ability haste}} per ''Legend''",
    note: 'Ability haste.',
  },
  {
    name: 'Legend: Bloodline',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Gain 0.45% Life Steal for every Legend stack',
    wikiAnchor: 'scalingbloodline',
    note: 'Life steal and maximum health — the life steal lands in Result.sustain (§42.2), the health in the survival verdict.',
  },
  {
    name: 'Coup de Grace',
    role: 'damage-amplifier',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Deal 8% more damage to champions who have less than 40% health',
    wikiAnchor: 'Deal 8% increased damage to champions below',
    note: 'An amplifier with a health threshold on the TARGET. The wiki states the pool ("maximum health"); Data Dragon says only "health".',
  },
  {
    name: 'Cut Down',
    role: 'damage-amplifier',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Deal 8% more damage to champions who have more than 60% health',
    wikiAnchor: 'Deal 8% increased damage to champions above',
    note: 'The mirror of Coup de Grace, same shape.',
  },
  {
    name: 'Last Stand',
    role: 'damage-amplifier',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Deal 5% - 11% increased damage to champions while you are below 60% health',
    wikiAnchor: 'up to 11% increased damage while below',
    note: 'An amplifier whose size moves on the HOLDER\'s missing health — an axis that is neither level nor rank.',
  },

  // ---- Resolve ----------------------------------------------------------------------------
  {
    name: 'Grasp of the Undying',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'magic', wiki: 'magic' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Deal bonus magic damage equal to 3.5% of your max health',
    wikiAnchor: "{{as|'''bonus''' magic damage}} equal to {{as|{{rd|{{fd|3.5}}%|{{fd|1.4}}%}} of your '''maximum''' health}}",
    note: 'The most complete damaging rune in either source: holdable type, no axis needed, and the health pool is attributed ("your maximum health"). Data Dragon expresses the ranged case as "40% effective"; the wiki writes the ranged number out.',
  },
  {
    name: 'Aftershock',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'labelled-line', wiki: 'templated' },
    damageType: { ddragon: 'magic', wiki: 'magic' },
    axis: { ddragon: 'range-no-axis', wiki: 'level-by-template-default' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Damage: 25 - 120 (+8% of your bonus health)',
    wikiAnchor: "deals {{as|{{pp|25 to 120}}|magic damage}} {{as|(+ 8% of your '''bonus''' health)}}",
    note: 'Holdable type, attributed bonus-health ratio. Data Dragon states the range with no axis; the wiki lets the progression template supply level.',
  },
  {
    name: 'Guardian',
    role: 'shield',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'labelled-line', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'range-no-axis', wiki: 'level-by-template-default' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Shield: 40 - 150 + 20% of your ability power',
    wikiAnchor: 'you both gain a {{tip|shield}} for',
    note: 'A shield, which changes the survival verdict but is not damage. Nothing in the contract holds shields today.',
  },
  {
    name: 'Demolish',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'physical', wiki: 'physical' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: ['turret-only'],
    ddAnchor: 'Your third attack against towers deals',
    wikiAnchor: 'to deal {{as|{{rd|85|50}}|physical damage}}',
    note: 'The only rune stating PHYSICAL damage — and both sources restrict it to turrets, so it can never reach the defender in a two-champion fight.',
  },
  {
    name: 'Font of Life',
    role: 'heal',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'placeholder', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'not-applicable', wiki: 'level-by-template-default' },
    adaptiveRule: null,
    blockers: ['ally-only'],
    ddAnchor: 'restores @BaseHeal@ Health to you',
    wikiAnchor: '{{tip|heals}} you and the nearest and most wounded allied champion',
    note: 'Second Data Dragon placeholder: @BaseHeal@ states no value. The wiki states the progression and the ranged reduction.',
  },
  {
    name: 'Shield Bash',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'adaptive', wiki: 'adaptive' },
    axis: { ddragon: 'range-no-axis', wiki: 'level-explicit' },
    adaptiveRule: 'adaptive-damage-tip',
    blockers: ['adaptive-type-unresolved', 'ratio-owner-unstated', 'needs-shield-amount'],
    ddAnchor: 'deals 5 - 30 (+2.5% Bonus Health)',
    wikiAnchor: "{{pp|5 + (30-5)/17*(x-1)|1 to 20 by 1}} {{as|(+ {{fd|2.5}}% '''bonus''' health)}}",
    note: 'The ONLY damaging rune carrying a fact no source states: "+2.5% bonus health" names the pool and, in BOTH sources, never says whose. Its second term is a percentage of a shield the contract cannot hold.',
  },
  {
    name: 'Conditioning',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'After 12 min gain +8 Armor and +8 Magic Resist',
    wikiAnchor: 'After 12 minutes, gain',
    note: 'Armor and magic resistance on the holder — damage-relevant when the holder is the defender.',
  },
  {
    name: 'Second Wind',
    role: 'heal',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: ['needs-elapsed-time'],
    ddAnchor: 'heal for 4% of your missing health over 10s',
    wikiAnchor: "{{as|4% of your '''missing''' health}}",
    note: 'Healing spread over ten seconds — the sequence model has no way to say how much of it landed.',
  },
  {
    name: 'Bone Plating',
    role: 'damage-reduction',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'level-stated', wiki: 'level-explicit' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'deal 30-60 (based on level) less damage',
    wikiAnchor: '{{pp|30 + (60-30)/17*(x-1)|1 to 20 by 1}} less damage',
    note: 'FLAT damage reduction on the defender, and the wiki adds that it applies to true damage too. This is a first-step term in the fixed four-step resistance order, and it is fully stated by both sources.',
  },
  {
    name: 'Overgrowth',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: ['needs-stack-count'],
    ddAnchor: 'permanently gaining 3 maximum health for every 8',
    wikiAnchor: "Each stack grants {{as|3 '''bonus''' health}}",
    note: 'Maximum health per stack — damage-relevant, and needs a stack count the user states.',
  },
  {
    name: 'Revitalize',
    role: 'heal',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Gain 5% Heal and Shield Power',
    wikiAnchor: 'Grants {{sti|heal and shield power',
    note: 'Heal and shield power — a multiplier on healing, which §42.2 put in Result.sustain.',
  },
  {
    name: 'Unflinching',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Gain 10 Armor and Magic Resist when crowd controlled',
    wikiAnchor: 'armorunflinching',
    note: 'Conditional armor and magic resistance on the holder.',
  },

  // ---- Sorcery ----------------------------------------------------------------------------
  {
    name: 'Summon Aery',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-stated', wiki: 'adaptive' },
    axis: { ddragon: 'level-stated', wiki: 'level-explicit' },
    adaptiveRule: 'adaptive-damage-tip',
    blockers: ['adaptive-type-unresolved'],
    ddAnchor: 'dealing 10 - 50 based on level',
    wikiAnchor: '{{pp|10 + (40/17)*(x-1)|1 to 20 by 1}}',
    note: 'The one rune whose Data Dragon text names NO damage type at all — it just says "dealing 10 - 50". The wiki fills the gap and calls it adaptive.',
  },
  {
    name: 'Arcane Comet',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'labelled-line', wiki: 'templated' },
    damageType: { ddragon: 'adaptive', wiki: 'variable' },
    axis: { ddragon: 'level-stated', wiki: 'level-explicit' },
    adaptiveRule: 'variable-damage-inline',
    blockers: ['adaptive-type-unresolved', 'sources-disagree-on-tiebreak', 'needs-position'],
    // The label sits in its own element, so the stripped text reads "Adaptive Damage : 15 - 100".
    ddAnchor: 'Adaptive Damage : 15 - 100 based on level',
    wikiAnchor: '{{pp|15 + (100-15)/17*(x-1)|1 to 20 by 1}}',
    note: 'Both sources state a distance-based amplification up to 100% at 750 range. The scenario has no geometry, so the number that reaches the defender is a choice nobody has made.',
  },
  {
    name: "Stormraider's Surge",
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: ['needs-elapsed-time'],
    ddAnchor: 'grants 48% Move Speed and 50% Slow Resistance',
    wikiAnchor: "{{as|25% of their '''maximum''' health}}",
    note: 'Movement speed, on a trigger that reads 25% of the target\'s maximum health within 3 seconds.',
  },
  {
    name: 'Deathfire Touch',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'magic', wiki: 'magic' },
    axis: { ddragon: 'level-stated', wiki: 'level-by-template-default' },
    adaptiveRule: null,
    blockers: ['needs-elapsed-time'],
    ddAnchor: 'burns them for 3 - 12 based on level',
    wikiAnchor: '{{pp|(3/2) + ((12/2)-(3/2))/17*(x-1) for 20|color=magic damage}}',
    note: 'Damage over time. THE TWO SOURCES STATE THE SAME BURN IN DIFFERENT UNITS: Data Dragon per second, the wiki per half-second tick. Reading either as "the damage" is the exact per-tick defect gate 5 found in abilities.',
  },
  {
    name: 'Axiom Arcanist',
    role: 'damage-amplifier',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Your Ultimate has 12% increased damage',
    wikiAnchor: 'Your ultimate has 12% increased damage',
    note: 'An amplifier on the ultimate only, reduced to 8% for area abilities — so it needs to know which of the two an ability is.',
  },
  {
    name: 'Manaflow Band',
    role: 'resource',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'permanently increases your maximum mana by 25',
    wikiAnchor: "'''maximum''' mana by 25",
    note: 'Maximum mana, attributed to the holder by both sources. Matters only to the mana-ratio abilities.',
  },
  {
    name: 'Nimbus Cloak',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'range-no-axis', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'gain a Move Speed increase that lasts for 2s',
    wikiAnchor: 'type=summoner spell cooldown',
    note: 'Movement speed. Its wiki progression names a basis this project has met nowhere else — "summoner spell cooldown".',
  },
  {
    name: 'Transcendence',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'Level 5: +5 Ability Haste',
    wikiAnchor: "Gain '''bonuses''' upon reaching the following levels",
    note: 'Ability haste at level thresholds.',
  },
  {
    name: 'Celerity',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'in-sentence' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'All movement bonuses are 7% more effective',
    wikiAnchor: 'increase in effectiveness by 7%',
    note: 'Movement speed.',
  },
  {
    name: 'Absolute Focus',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'level-stated', wiki: 'level-explicit' },
    adaptiveRule: 'adaptive-force-stat',
    blockers: ['sources-disagree-on-tiebreak'],
    ddAnchor: 'gain an adaptive bonus of up to 18 Attack Damage or 30 Ability Power',
    wikiAnchor: '{{adaptive|3 + (30-3)/17*(x-1)|20}}',
    note: 'Adaptive FORCE, conditional on the holder being above 70% maximum health. Its own template says the tie "defaults to the first listed"; the Adaptive force article says the tie follows the champion\'s adaptive type. Those are different rules.',
  },
  {
    name: 'Scorch',
    role: 'damage-instance',
    dealsDamage: { ddragon: true, wiki: true },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'magic', wiki: 'magic' },
    axis: { ddragon: 'level-stated', wiki: 'level-explicit' },
    adaptiveRule: null,
    blockers: [],
    ddAnchor: 'dealing 20 - 40 bonus magic damage based on level',
    wikiAnchor: '{{pp|20 + (40-20)/17*(x-1)|1 to 20 by 1}}',
    note: 'Complete in both sources: holdable type, stated value, stated axis, no ratio to attribute. The single cleanest damaging rune there is.',
  },
  {
    name: 'Waterwalking',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'level-stated', wiki: 'level-explicit' },
    adaptiveRule: 'adaptive-force-stat',
    blockers: ['sources-disagree-on-tiebreak'],
    ddAnchor: 'Gain 10 Move Speed and 13 - 30 Adaptive Force (based on level)',
    wikiAnchor: '{{adaptive|13 + (30-13)/17*(x-1)|20}}',
    note: 'Adaptive force while in the river — a map condition the scenario does not model.',
  },
  {
    name: 'Gathering Storm',
    role: 'stat',
    dealsDamage: { ddragon: false, wiki: false },
    reach: { ddragon: 'in-sentence', wiki: 'templated' },
    damageType: { ddragon: 'not-applicable', wiki: 'not-applicable' },
    axis: { ddragon: 'no-progression', wiki: 'no-progression' },
    adaptiveRule: 'adaptive-force-stat',
    blockers: ['needs-elapsed-time', 'sources-disagree-on-tiebreak'],
    ddAnchor: 'Every 10 min gain AP or AD, adaptive',
    wikiAnchor: 'type=minutes',
    note: 'Adaptive force whose axis is ELAPSED MINUTES, stated as such by both sources. The engine models sequence, not time.',
  },
];

/**
 * What the sources say about turning "adaptive" into a damage type the contract can hold.
 * Three DIFFERENT rules are stated and they are not interchangeable — recorded here verbatim
 * from the pages named, because conflating them is how one champion gets another's damage.
 */
const ADAPTIVE_RULE_SOURCES: Record<
  Exclude<AdaptiveRule, null>,
  { page: string; appliesTo: string; input: string; tiebreak: string }
> = {
  'adaptive-damage-tip': {
    page: 'Template:Tip data/Adaptive damage',
    appliesTo: 'runes whose wiki text tags the damage {{tip|adaptive damage}}',
    input: 'whether the holder has more BONUS ATTACK DAMAGE or more ABILITY POWER',
    tiebreak: "the champion's adaptive type — the `adaptivetype` field already in public/data/champions.json",
  },
  'variable-damage-inline': {
    page: 'Template:Rune data Electrocute / Template:Rune data Arcane Comet, "Variable Damage"',
    appliesTo: 'Electrocute and Arcane Comet, which spell the rule out in their own text',
    input: "the damage CONTRIBUTION of the effect's own AD and AP ratios, not the raw stats",
    tiebreak: 'magic damage',
  },
  'adaptive-force-stat': {
    page: 'Adaptive force (article) — and each rune template\'s own "Adaptive:" line',
    appliesTo: 'Conqueror, Absolute Focus, Waterwalking, Gathering Storm, Jack of All Trades',
    input: 'higher bonus AD or higher AP; 1 point grants 0.6 bonus AD or 1 AP',
    tiebreak:
      "CONTESTED: the article says the champion's adaptive type; the rune templates say \"defaults to the first listed\" (attack damage)",
  },
};

// ---------------------------------------------------------------------------------------------
// Mechanical parts: quote extraction, and the two-source endpoint cross-check.
// ---------------------------------------------------------------------------------------------

/** A tiny arithmetic evaluator for the wiki's progression formulas. Numbers, + - * /, parens, x. */
export function evalFormula(expr: string, x: number): number {
  let i = 0;
  const src = expr.replace(/\s+/g, '');
  function peek(): string {
    return src[i] ?? '';
  }
  function expression(): number {
    let value = term();
    for (;;) {
      const op = peek();
      if (op !== '+' && op !== '-') return value;
      i++;
      const rhs = term();
      value = op === '+' ? value + rhs : value - rhs;
    }
  }
  function term(): number {
    let value = factor();
    for (;;) {
      const op = peek();
      if (op !== '*' && op !== '/') return value;
      i++;
      const rhs = factor();
      value = op === '*' ? value * rhs : value / rhs;
    }
  }
  function factor(): number {
    if (peek() === '-') {
      i++;
      return -factor();
    }
    if (peek() === '(') {
      i++;
      const value = expression();
      if (peek() !== ')') throw new Error(`unbalanced parenthesis in "${expr}"`);
      i++;
      return value;
    }
    if (peek() === 'x') {
      i++;
      return x;
    }
    const match = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (!match) throw new Error(`cannot read a number at position ${i} of "${expr}"`);
    i += match[0].length;
    return Number(match[0]);
  }
  const result = expression();
  if (i !== src.length) throw new Error(`trailing input in "${expr}" at position ${i}`);
  return result;
}

/** Pull the first parameter of the first `{{pp|…}}` occurring at or after `from`. */
function firstProgression(wikitext: string, from: number): string | null {
  const start = wikitext.indexOf('{{pp|', from);
  if (start === -1) return null;
  let depth = 0;
  for (let j = start; j < wikitext.length - 1; j++) {
    if (wikitext[j] === '{' && wikitext[j + 1] === '{') {
      depth++;
      j++;
    } else if (wikitext[j] === '}' && wikitext[j + 1] === '}') {
      depth--;
      j++;
      if (depth === 0) {
        const inner = wikitext.slice(start + 5, j - 1);
        const bar = inner.indexOf('|');
        return (bar === -1 ? inner : inner.slice(0, bar)).trim();
      }
    }
  }
  return null;
}

export type CrossCheckVerdict =
  | 'endpoints-agree'
  | 'endpoints-disagree'
  | 'not-comparable-split-value'
  | 'not-comparable-no-progression'
  | 'not-comparable-no-range-in-ddragon';

/**
 * Do the two sources agree on the endpoints of a damaging rune's base value?
 *
 * Data Dragon states endpoints ("70 - 240"); the wiki states either endpoints ("25 to 120") or a
 * formula in `x`. Where it is a formula we read it at x=1 and x=18 — 18 being the level cap, and
 * `Template:Passive progression` documenting that in-line display stops there.
 * NOTHING COMPUTED HERE IS STORED. Only the verdict is.
 */
export const ENDPOINT_TOLERANCE = 0.51;

/**
 * THE MARKUP GUARD, as a pure function so it can be proved to say NO.
 *
 * Every other anchor in this census is matched against text `stripHtml` has already removed the
 * tags from — and the tag name is where Data Dragon states the damage type. So before 2026-08-15
 * the source could have changed `<truedamage>` to `<magicdamage>`, the one place it keeps the
 * fact, and every anchor would still have matched.
 *
 * Returns null when the live markup still says what the reading recorded, or the reason it does
 * not. Checked for every rune, including the 59 asserting nothing: `null` is a claim too.
 */
export function markupGuardFailure(
  reading: Pick<Reading, 'name' | 'markupType' | 'ddMarkupAnchor'>,
  longDesc: string,
): string | null {
  const live = dataDragonTypeFromMarkup(longDesc);
  const expected = reading.markupType ?? null;
  const show = (t: string | null) => (t === null ? 'none' : `"${t}"`);
  if (live !== expected) {
    return (
      `${reading.name}: Data Dragon's MARKUP now asserts damage type ${show(live)} where the ` +
      `reading recorded ${show(expected)}. The stripped text cannot show this; re-read the rune ` +
      `before this row is trusted.`
    );
  }
  if (reading.ddMarkupAnchor !== undefined && !longDesc.includes(reading.ddMarkupAnchor)) {
    return (
      `${reading.name}: the RAW markup anchor "${reading.ddMarkupAnchor}" is no longer in the ` +
      `live longDesc — the tags around the damage phrase have changed`
    );
  }
  return null;
}

function crossCheckEndpoints(
  ddText: string,
  ddAnchorIndex: number,
  wikiText: string,
  wikiAnchorIndex: number,
  anchorLength: number,
): { verdict: CrossCheckVerdict; detail: string; gap?: { low: number; high: number } } {
  // A melee/ranged split is two different values, so a pair of endpoints cannot describe it.
  // Checked BEFORE the range test, or a split rune is mislabelled as "no range stated".
  if (wikiText.slice(wikiAnchorIndex, wikiAnchorIndex + anchorLength).includes('{{rd|')) {
    return {
      verdict: 'not-comparable-split-value',
      detail:
        'The wiki states two different values, one for melee and one for ranged. Endpoints alone ' +
        'cannot compare them, and collapsing them to one pair would invent a value.',
    };
  }
  const ddWindow = ddText.slice(ddAnchorIndex, ddAnchorIndex + 120);
  const ddRange = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(ddWindow);
  if (!ddRange) {
    return {
      verdict: 'not-comparable-no-range-in-ddragon',
      detail: 'Data Dragon states one value or a percentage here, so there are no endpoints to compare.',
    };
  }
  const formula = firstProgression(wikiText, wikiAnchorIndex);
  if (formula === null) {
    return {
      verdict: 'not-comparable-no-progression',
      detail: 'The wiki states this value without a progression template.',
    };
  }
  const stripped = formula.replace(/\s+for\s+\d+\s*$/, '').trim();
  let low: number;
  let high: number;
  const plainRange = /^(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)$/.exec(stripped);
  if (plainRange) {
    low = Number(plainRange[1]);
    high = Number(plainRange[2]);
  } else if (stripped.includes(';')) {
    return {
      verdict: 'not-comparable-split-value',
      detail: 'The wiki progression is piecewise; endpoints alone do not describe it.',
    };
  } else {
    low = evalFormula(stripped, 1);
    high = evalFormula(stripped, 18);
  }
  const lowGap = Math.abs(low - Number(ddRange[1]));
  const highGap = Math.abs(high - Number(ddRange[2]));
  const agree = lowGap < ENDPOINT_TOLERANCE && highGap < ENDPOINT_TOLERANCE;
  return {
    verdict: agree ? 'endpoints-agree' : 'endpoints-disagree',
    detail: agree
      ? 'Read at level 1 and level 18, the wiki formula lands on the two numbers Data Dragon prints.'
      : 'The two sources do NOT land on the same endpoints. Surfaced, not reconciled — see the report.',
    // THE GAP IS PUBLISHED, THE ENDPOINTS ARE NOT. A gap answers "how much of the tolerance is
    // actually being used", which is the only way to say whether 0.51 hides anything; an endpoint
    // would be a rune value, and this file stores none.
    gap: { low: Number(lowGap.toFixed(4)), high: Number(highGap.toFixed(4)) },
  };
}

// ---------------------------------------------------------------------------------------------
// Fetching.
// ---------------------------------------------------------------------------------------------

interface DdragonRune {
  id: number;
  key: string;
  name: string;
  shortDesc: string;
  longDesc: string;
}
interface DdragonTree {
  id: number;
  name: string;
  slots: { runes: DdragonRune[] }[];
}

interface WikiPage {
  title: string;
  missing?: boolean;
  revisions?: { slots: { main: { content: string } } }[];
}

/** Every fetch failure, reported rather than skipped. */
const fetchFailures: { what: string; detail: string }[] = [];

async function fetchWikiTemplates(titles: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < titles.length; i += 30) {
    const batch = titles.slice(i, i + 30);
    const body = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      titles: batch.join('|'),
      rvslots: 'main',
      rvprop: 'content',
      format: 'json',
      formatversion: '2',
    });
    const response = await fetch(WIKI_API, {
      method: 'POST',
      headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      fetchFailures.push({
        what: `wiki template batch starting "${batch[0]}"`,
        detail: `HTTP ${response.status} ${response.statusText}`,
      });
      for (const title of batch) out.set(title, null);
      continue;
    }
    const payload = (await response.json()) as { query: { pages: WikiPage[] } };
    for (const page of payload.query.pages) {
      out.set(page.title, page.missing ? null : (page.revisions?.[0]?.slots.main.content ?? null));
      if (page.missing) {
        fetchFailures.push({ what: page.title, detail: 'the wiki has no such page' });
      }
    }
    // Be a courteous API client: one batch per second and a named user agent.
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return out;
}

/** Count every page in the Module namespace, to re-test the "no rune data module" claim. */
async function countModulePages(): Promise<{ total: number; runeNamed: string[] }> {
  const titles: string[] = [];
  let cont: string | undefined;
  for (;;) {
    const query = new URLSearchParams({
      action: 'query',
      list: 'allpages',
      apnamespace: '828',
      aplimit: '500',
      format: 'json',
      formatversion: '2',
    });
    if (cont) query.set('apcontinue', cont);
    const response = await fetch(`${WIKI_API}?${query}`, { headers: { 'user-agent': USER_AGENT } });
    if (!response.ok) {
      fetchFailures.push({
        what: 'Module namespace enumeration',
        detail: `HTTP ${response.status} ${response.statusText}`,
      });
      break;
    }
    const payload = (await response.json()) as {
      query: { allpages: { title: string }[] };
      continue?: { apcontinue: string };
    };
    titles.push(...payload.query.allpages.map((p) => p.title));
    if (!payload.continue) break;
    cont = payload.continue.apcontinue;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { total: titles.length, runeNamed: titles.filter((t) => /rune/i.test(t)) };
}

// ---------------------------------------------------------------------------------------------
// The runner.
// ---------------------------------------------------------------------------------------------

interface CensusRow {
  id: number;
  name: string;
  tree: string;
  slot: 'keystone' | 'minor';
  role: RuneRole;
  dealsDamage: { ddragon: boolean; wiki: boolean };
  valueReach: { ddragon: ValueReach; wiki: ValueReach };
  damageType: { ddragon: StatedDamageType; wiki: StatedDamageType };
  scalingAxis: { ddragon: StatedAxis; wiki: StatedAxis };
  adaptiveRule: AdaptiveRule;
  blockers: string[];
  crossCheck: { verdict: CrossCheckVerdict; detail: string; gap?: { low: number; high: number } } | null;
  reading: string;
  /**
   * `ddragon` is the STRIPPED window, which is what every earlier reader saw. `ddragonMarkup` is
   * the raw markup where it asserts a damage type — published because a file that only shows the
   * stripped form hides the very fact this census got wrong once.
   */
  sourceText: { ddragon: string; ddragonMarkup: string | null; wiki: string | null };
  /** What Data Dragon's raw tags assert, measured live rather than assumed. */
  markupDamageType: 'physical' | 'magic' | 'true' | null;
  correctedFrom?: Reading['correctedFrom'];
}

function windowAround(text: string, index: number, anchorLength: number): string {
  const start = Math.max(0, index - QUOTE_WINDOW);
  const end = Math.min(text.length, index + anchorLength + QUOTE_WINDOW);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

async function main(): Promise<void> {
  const versions = await fetchJson<string[]>(VERSIONS_URL);
  const patch = versions[0]!;
  const trees = await fetchJson<DdragonTree[]>(ddragonRunesUrl(patch));

  const runes: { rune: DdragonRune; tree: string; slot: 'keystone' | 'minor' }[] = [];
  for (const tree of trees) {
    tree.slots.forEach((slot, index) => {
      for (const rune of slot.runes) {
        runes.push({ rune, tree: tree.name, slot: index === 0 ? 'keystone' : 'minor' });
      }
    });
  }

  const modules = await countModulePages();

  const titleFor = new Map<string, string>();
  for (const reading of READINGS) {
    titleFor.set(reading.name, `Template:Rune data ${reading.wikiTitle ?? reading.name}`);
  }
  const templates = await fetchWikiTemplates([...titleFor.values()]);

  const rows: CensusRow[] = [];
  const anchorFailures: string[] = [];
  const markupGuardFailures: string[] = [];

  for (const { rune, tree, slot } of runes) {
    const reading = READINGS.find((r) => r.name === rune.name);
    if (!reading) {
      anchorFailures.push(`${rune.name}: no hand reading exists for this rune`);
      continue;
    }
    const ddText = stripHtml(rune.longDesc);
    const ddIndex = ddText.indexOf(reading.ddAnchor);
    if (ddIndex === -1) {
      anchorFailures.push(
        `${rune.name}: the Data Dragon anchor "${reading.ddAnchor}" is no longer in the live longDesc`,
      );
      continue;
    }

    // ---- THE MARKUP GUARD (added 2026-08-15) -------------------------------------------------
    // The anchor above is matched against text stripHtml has already been over, so it cannot see
    // the tag names — and the tag name is where Data Dragon states the damage type. Without this,
    // <truedamage> could become <magicdamage> and every anchor in this file would still match.
    // Checked for all 62, not only the 3 that carry a tag: a tag APPEARING is a change too.
    const liveMarkupType = dataDragonTypeFromMarkup(rune.longDesc);
    const markupFailure = markupGuardFailure(reading, rune.longDesc);
    if (markupFailure !== null) {
      anchorFailures.push(markupFailure);
      markupGuardFailures.push(rune.name);
      continue;
    }
    const wikiText = templates.get(titleFor.get(rune.name)!) ?? null;
    let wikiIndex = -1;
    if (wikiText === null) {
      anchorFailures.push(`${rune.name}: the wiki template was not fetched`);
    } else {
      wikiIndex = wikiText.indexOf(reading.wikiAnchor);
      if (wikiIndex === -1) {
        anchorFailures.push(
          `${rune.name}: the wiki anchor "${reading.wikiAnchor}" is no longer in the live template`,
        );
      }
    }

    const crossCheck =
      reading.dealsDamage.wiki && wikiText !== null && wikiIndex !== -1
        ? crossCheckEndpoints(ddText, ddIndex, wikiText, wikiIndex, reading.wikiAnchor.length)
        : null;

    rows.push({
      id: rune.id,
      name: rune.name,
      tree,
      slot,
      role: reading.role,
      dealsDamage: reading.dealsDamage,
      valueReach: reading.reach,
      damageType: reading.damageType,
      scalingAxis: reading.axis,
      adaptiveRule: reading.adaptiveRule,
      blockers: reading.blockers,
      crossCheck,
      reading: reading.note,
      sourceText: {
        ddragon: windowAround(ddText, ddIndex, reading.ddAnchor.length),
        ddragonMarkup:
          reading.ddMarkupAnchor !== undefined
            ? windowAround(
                rune.longDesc,
                rune.longDesc.indexOf(reading.ddMarkupAnchor),
                reading.ddMarkupAnchor.length,
              )
            : null,
        wiki:
          wikiText !== null && wikiIndex !== -1
            ? windowAround(wikiText, wikiIndex, reading.wikiAnchor.length)
            : null,
      },
      markupDamageType: liveMarkupType,
      ...(reading.correctedFrom ? { correctedFrom: reading.correctedFrom } : {}),
    });
  }

  // ---- counts ------------------------------------------------------------------------------
  const damagingDd = rows.filter((r) => r.dealsDamage.ddragon);
  const damagingWiki = rows.filter((r) => r.dealsDamage.wiki);
  const reachesAChampion = damagingWiki.filter((r) => !r.blockers.includes('turret-only'));
  const holdable = new Set<StatedDamageType>(['physical', 'magic', 'true']);

  const tally = <T extends string>(list: CensusRow[], pick: (r: CensusRow) => T): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const row of list) out[pick(row)] = (out[pick(row)] ?? 0) + 1;
    return out;
  };

  const counts = {
    runes: rows.length,
    trees: trees.length,
    byRole: tally(rows, (r) => r.role),
    dealsDamage: {
      byDataDragon: damagingDd.length,
      byWiki: damagingWiki.length,
      bothAgree: rows.filter((r) => r.dealsDamage.ddragon === r.dealsDamage.wiki && r.dealsDamage.wiki)
        .length,
      sourcesDisagree: rows
        .filter((r) => r.dealsDamage.ddragon !== r.dealsDamage.wiki)
        .map((r) => r.name),
      canReachAnEnemyChampion: reachesAChampion.length,
      outOfChampionScope: damagingWiki.filter((r) => r.blockers.includes('turret-only')).map((r) => r.name),
    },
    valueReachOfDamagingRunes: {
      ddragon: tally(damagingWiki, (r) => r.valueReach.ddragon),
      wiki: tally(damagingWiki, (r) => r.valueReach.wiki),
    },
    damageTypeOfDamagingRunes: {
      ddragon: tally(damagingWiki, (r) => r.damageType.ddragon),
      wiki: tally(damagingWiki, (r) => r.damageType.wiki),
      contractHoldable: {
        ddragon: damagingWiki.filter((r) => holdable.has(r.damageType.ddragon)).length,
        wiki: damagingWiki.filter((r) => holdable.has(r.damageType.wiki)).length,
      },
      adaptiveOrVariable: {
        ddragon: damagingWiki.filter((r) => r.damageType.ddragon === 'adaptive').length,
        wiki: damagingWiki.filter(
          (r) => r.damageType.wiki === 'adaptive' || r.damageType.wiki === 'variable',
        ).length,
      },
      typeNotStatedAtAll: {
        ddragon: damagingWiki.filter((r) => r.damageType.ddragon === 'not-stated').map((r) => r.name),
        wiki: damagingWiki.filter((r) => r.damageType.wiki === 'not-stated').map((r) => r.name),
      },
    },
    scalingAxisOfDamagingRunes: {
      ddragon: tally(damagingWiki, (r) => r.scalingAxis.ddragon),
      wiki: tally(damagingWiki, (r) => r.scalingAxis.wiki),
      rangeWithNoAxisNamed: {
        ddragon: damagingWiki.filter((r) => r.scalingAxis.ddragon === 'range-no-axis').map((r) => r.name),
        wiki: damagingWiki.filter((r) => r.scalingAxis.wiki === 'range-no-axis').map((r) => r.name),
      },
    },
    adaptiveRuleUse: tally(
      rows.filter((r) => r.adaptiveRule !== null),
      (r) => r.adaptiveRule!,
    ),
    blockers: Object.fromEntries(
      Object.keys(BLOCKER_CLASSES).map((cls) => [
        cls,
        {
          bucket: BLOCKER_CLASSES[cls]!.bucket,
          runes: rows.filter((r) => r.blockers.includes(cls)).map((r) => r.name),
        },
      ]),
    ),
    permanentlyUnreachable: {
      definition:
        'Blockers in the `source-silent` bucket only. A fact NO source states, so nobody can ever ' +
        'supply it (SPECIFICATION §8). Everything else on this page is a decision someone can take.',
      runes: rows
        .filter((r) =>
          r.blockers.some((b) => BLOCKER_CLASSES[b]?.bucket === 'source-silent'),
        )
        .map((r) => r.name),
    },
    twoSourceCrossCheck: tally(
      rows.filter((r) => r.crossCheck !== null),
      (r) => r.crossCheck!.verdict,
    ),
    dataDragonPlaceholders: rows.filter((r) => r.valueReach.ddragon === 'placeholder').map((r) => r.name),
  };

  // ---- audit of the claim this census was sent to check ------------------------------------
  // A prior note recorded: "of 5 damaging runes stating a value structurally, 3 deal damage the
  // source calls adaptive and 2 state a range whose axis is never named." Re-measured, not trusted.
  const structural = damagingWiki.filter((r) => r.valueReach.ddragon === 'labelled-line');
  const structuralAdaptive = structural.filter((r) => r.damageType.ddragon === 'adaptive');
  const structuralUnaxed = structural.filter((r) => r.scalingAxis.ddragon === 'range-no-axis');
  const structuralComplete = structural.filter(
    (r) => holdable.has(r.damageType.ddragon) && r.scalingAxis.ddragon !== 'range-no-axis',
  );
  const priorClaimAudit = {
    claim:
      'Of 5 damaging runes stating a value structurally, 3 deal damage the source calls "adaptive" ' +
      'and 2 state a range whose axis is never named.',
    measuredAgainst: "Data Dragon's wording, which is the source that note was written from.",
    structuralCount: structural.length,
    structuralRunes: structural.map((r) => r.name),
    adaptiveCount: structuralAdaptive.length,
    adaptiveRunes: structuralAdaptive.map((r) => r.name),
    rangeWithNoAxisCount: structuralUnaxed.length,
    rangeWithNoAxisRunes: structuralUnaxed.map((r) => r.name),
    overlap: structural.filter((r) => structuralAdaptive.includes(r) && structuralUnaxed.includes(r)).map((r) => r.name),
    verdict:
      structural.length === 5 && structuralAdaptive.length === 3 && structuralUnaxed.length === 3
        ? 'HALF CONFIRMED. The count of 5 and the 3 adaptive are exact. The "2" is not: THREE of the ' +
          'five state a range with no axis. The note reads as though the two groups partition the ' +
          'five, and they do not — Electrocute is in both. Reading it as a partition understates the ' +
          'unaxed group by one and hides that no rune is short of only one thing.'
        : 'The claim no longer describes the source. Re-read before relying on it.',
    theHarderFinding: {
      completeStructuralRunes: structuralComplete.map((r) => r.name),
      statement:
        structuralComplete.length === 0
          ? 'NOT ONE of the five is complete in Data Dragon. Every one is missing either a damage ' +
            'type the contract can hold or an axis for the range it prints. Counting the two ' +
            'problems separately obscured that they cover the whole set.'
          : `${structuralComplete.length} of the five state both a holdable type and an axis.`,
    },
  };

  const census = {
    provenance: {
      source:
        'Riot Data Dragon runesReforged.json (which runes exist, and prose values); ' +
        'League of Legends Wiki Template:Rune data <Name>, one page per rune (values in {{as}}/{{pp}} markup)',
      patch,
      fetched: new Date().toISOString(),
      urls: {
        patch: VERSIONS_URL,
        runes: ddragonRunesUrl(patch),
        wikiTemplates: `${WIKI_API}?action=query&prop=revisions&titles=Template:Rune+data+<Name>&rvslots=main&rvprop=content&format=json&formatversion=2`,
        adaptiveDamageTip: `${WIKI_API}?action=query&prop=revisions&titles=Template:Tip+data/Adaptive+damage&rvslots=main&rvprop=content&format=json&formatversion=2`,
        adaptiveForceArticle: 'https://wiki.leagueoflegends.com/en-us/Adaptive_force',
        progressionTemplateDoc: 'https://wiki.leagueoflegends.com/en-us/Template:Passive_progression/doc',
      },
      fetchFailures,
    },
    whatThisIs:
      'A CENSUS of what the sources STATE about rune damage. It authors no rune value and is not ' +
      'curated data. Every count is given per source, because the two sources do not agree about ' +
      'which runes deal damage or what type that damage is. Each row carries a verbatim window of ' +
      'the live source text it was judged from; a row whose anchor no longer appears in the source ' +
      'is refused rather than reported stale.',
    theSecondSource: {
      finding:
        'DATA-SOURCES §6 recorded that no wiki rune data MODULE exists and concluded rune numbers ' +
        'must be curated by hand. The first half is still true and was re-measured here. The second ' +
        'half does not follow: the wiki states rune values in TEMPLATE space, one page per rune, in ' +
        'the same {{as|…}} / {{pp|…}} markup as Module:ItemData/data — which this project already parses.',
      modulePagesEnumerated: modules.total,
      moduleNamesContainingRune: modules.runeNamed,
      runeTemplatesFound: [...templates.values()].filter((v) => v !== null).length,
      runeTemplatesMissing: [...templates.entries()].filter(([, v]) => v === null).map(([k]) => k),
      caution:
        'Reachable is not the same as read. Every base value sits inside a progression template ' +
        'whose first parameter is a FORMULA in x, not a number, and several use {{rd|melee|ranged}} ' +
        'to state two different values. Nothing here says those shapes are stored correctly today.',
    },
    definitions: {
      population:
        'The 62 runes across 5 trees in runesReforged.json. Stat shards are excluded: they appear ' +
        'in no source at all (DATA-SOURCES §7).',
      dealsDamage:
        "The rune's own text says it causes damage to a unit — an added damage instance. A rune " +
        'that only changes the size of damage another source deals is an amplifier or a reduction, ' +
        'not a damage instance, and is counted separately.',
      valueReach:
        'labelled-line = Data Dragon puts the value on its own "Damage:"-style line a parser can key ' +
        'on. in-sentence = the number is in ordinary prose. templated = the wiki wraps it in markup ' +
        'this project already reads. placeholder = the source ships an unexpanded token and states ' +
        'no value at all.',
      damageType:
        "The type the source names. `physical`/`magic`/`true` are the three arms of DamageType " +
        '(src/types/data.ts:4). `adaptive` and `variable` are NOT arms of it — they name a rule, not ' +
        'a type. `not-stated` means the text names no type at all.',
      scalingAxis:
        'What the source says moves the base value. level-stated = the words "based on level" appear. ' +
        'level-explicit = the wiki progression carries a written basis parameter. ' +
        'level-by-template-default = the progression has no basis and Template:Passive progression ' +
        'documents the default as level, rendering "(based on level)". range-no-axis = two endpoints ' +
        'and nothing saying what moves between them. no-progression = one value or a percentage.',
      permanentlyUnreachable:
        'A fact NO source states. Distinguished sharply from a fact the contract or the engine model ' +
        'cannot yet hold: the first can never be supplied by anybody, the second is a decision ' +
        'waiting to be taken. Only the first is permanent.',
      twoSourceCrossCheck:
        'For each damaging rune, do Data Dragon and the wiki land on the same two endpoints? The ' +
        "wiki's formula is read at level 1 and level 18. The computed numbers are DISCARDED; only " +
        'the verdict is stored, because this file stores no rune values.',
    },
    adaptiveRules: ADAPTIVE_RULE_SOURCES,
    blockerClasses: BLOCKER_CLASSES,
    priorClaimAudit,
    counts,
    integrity: {
      rowsWritten: rows.length,
      anchorFailures,
      note:
        'An anchor failure means the live source no longer contains the text a person read. The row ' +
        'is dropped, never guessed. A non-empty list here means this census needs re-reading.',
      markupGuard: {
        whatItChecks:
          "Data Dragon states damage type in TAG NAMES, and every other anchor in this census is " +
          'matched against text stripHtml has already removed them from. So until 2026-08-15 the ' +
          'source could have changed <truedamage> to <magicdamage> — the one place it keeps the ' +
          'type — and no anchor would have moved. This guard reads the RAW longDesc.',
        howItIsMeasured:
          'For every rune, the type its raw markup asserts is compared against the type the hand ' +
          'reading recorded. Recorded for all 62, including the ones that assert none: a tag ' +
          'appearing where a person recorded none fails just as loudly as a tag changing type. ' +
          'Where a type IS asserted, a verbatim raw substring including the tags must also still ' +
          'be present, so the exact spelling is pinned and not merely the presence of a tag.',
        runesCheckedAgainstRawMarkup: runes.length,
        runesWhoseMarkupAssertsAType: rows
          .filter((r) => r.markupDamageType !== null)
          .map((r) => `${r.name} (${r.markupDamageType})`),
        failures: markupGuardFailures,
      },
      corrections: rows
        .filter((r) => r.correctedFrom)
        .map((r) => ({ rune: r.name, ...r.correctedFrom! })),
      endpointToleranceReviewed: {
        tolerance: ENDPOINT_TOLERANCE,
        question:
          'The two-source endpoint cross-check calls the sources agreed when both endpoints are ' +
          'within 0.51. The normaliser sweep flagged that as reading half a point of genuine ' +
          'disagreement as "endpoints-agree". Is it defensible?',
        whatTheTwoSidesActuallyAre:
          'Not two measurements of one quantity. The wiki side is a FORMULA this census evaluates ' +
          'at level 1 and level 18 (e.g. "2 + (20-2)/17*(x-1)"); the Data Dragon side is the ' +
          'number Riot PRINTS after rounding it for display. A tolerance was put there to absorb ' +
          'that rounding.',
        answer:
          'DEFENSIBLE, AND MEASURED RATHER THAN ARGUED — the tolerance is currently deciding ' +
          'NOTHING. Every rune the check calls "endpoints-agree" agrees EXACTLY: the largest gap ' +
          'among them is 0. The one rune that disagrees, Deathfire Touch, is out by 1.5 at the low ' +
          'end and 6 at the high end — an order of magnitude above the tolerance, so no plausible ' +
          'tightening would change its verdict either. Nothing in the live population sits in the ' +
          'band between 0 and 0.51, which is the band the sweep was worried about.',
        theRecommendation:
          'A DECISION FOR THE LEAD, NOT TAKEN HERE. Because no gap uses any of it, the tolerance ' +
          'could be dropped to near zero today with no verdict moving — and a future half-point ' +
          'disagreement would then be SURFACED instead of absorbed. The cost is the opposite ' +
          'error: a display-rounding artifact would be reported as a source disagreement and ' +
          'someone would have to read it. Since this census surfaces rather than reconciles, that ' +
          'is a cheap error and the tighter tolerance is probably right — but it changes what "the ' +
          'sources agree" means, so it is raised rather than made.',
        // MEASURED, NOT ARGUED. If any live gap sits near the tolerance, the tolerance is load-
        // bearing and the argument above is worthless.
        measuredGaps: rows
          .filter((r) => r.crossCheck?.gap)
          .map((r) => ({
            rune: r.name,
            verdict: r.crossCheck!.verdict,
            low: r.crossCheck!.gap!.low,
            high: r.crossCheck!.gap!.high,
          }))
          .sort((a, b) => Math.max(b.low, b.high) - Math.max(a.low, a.high)),
        largestGapAmongAgreeing: Math.max(
          0,
          ...rows
            .filter((r) => r.crossCheck?.verdict === 'endpoints-agree' && r.crossCheck.gap)
            .map((r) => Math.max(r.crossCheck!.gap!.low, r.crossCheck!.gap!.high)),
        ),
        headroom:
          'The verdict to read off `largestGapAmongAgreeing`: how much of the 0.51 any agreeing ' +
          'rune actually uses. A figure near 0 means the tolerance decides nothing and could be ' +
          'tightened at no cost; a figure near 0.5 means it is deciding outcomes and must be ' +
          're-argued from the source rather than kept.',
        notChanged:
          'Left at 0.51 in this run. Changing a tolerance is changing what "the sources agree" ' +
          'means, and it should be done against the measurement above rather than because the ' +
          'number looks untidy. The gaps are now published so that decision has data behind it.',
      },
    },
    rows,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(joinPath(OUT_DIR, 'rune-census.json'), JSON.stringify(census, null, 2) + '\n');

  // ---- the printed report ------------------------------------------------------------------
  console.log(`\nRUNE CENSUS — patch ${patch}`);
  console.log(`  runes read                      ${rows.length} of ${runes.length} across ${trees.length} trees`);
  console.log(`  Module: pages enumerated        ${modules.total} (rune data modules found: ${modules.runeNamed.length === 0 ? 'none' : modules.runeNamed.join(', ')})`);
  console.log(`  wiki rune templates fetched     ${[...templates.values()].filter(Boolean).length} of ${templates.size}`);
  console.log(`\n  DEALS DAMAGE`);
  console.log(`    by Data Dragon's wording      ${damagingDd.length}`);
  console.log(`    by the wiki's wording         ${damagingWiki.length}`);
  console.log(`    sources disagree about        ${counts.dealsDamage.sourcesDisagree.join(', ') || 'nothing'}`);
  console.log(`    can reach an enemy champion   ${reachesAChampion.length}`);
  console.log(`\n  DAMAGE TYPE (over the ${damagingWiki.length} damaging runes)`);
  console.log(`    contract-holdable  Data Dragon ${counts.damageTypeOfDamagingRunes.contractHoldable.ddragon}   wiki ${counts.damageTypeOfDamagingRunes.contractHoldable.wiki}`);
  console.log(`    adaptive/variable  Data Dragon ${counts.damageTypeOfDamagingRunes.adaptiveOrVariable.ddragon}   wiki ${counts.damageTypeOfDamagingRunes.adaptiveOrVariable.wiki}`);
  console.log(`    no type stated     Data Dragon ${counts.damageTypeOfDamagingRunes.typeNotStatedAtAll.ddragon.length}   wiki ${counts.damageTypeOfDamagingRunes.typeNotStatedAtAll.wiki.length}`);
  console.log(`\n  VALUE REACH (over the ${damagingWiki.length} damaging runes)`);
  console.log(`    Data Dragon  ${JSON.stringify(counts.valueReachOfDamagingRunes.ddragon)}`);
  console.log(`    wiki         ${JSON.stringify(counts.valueReachOfDamagingRunes.wiki)}`);
  console.log(`\n  SCALING AXIS (over the ${damagingWiki.length} damaging runes)`);
  console.log(`    Data Dragon  ${JSON.stringify(counts.scalingAxisOfDamagingRunes.ddragon)}`);
  console.log(`    wiki         ${JSON.stringify(counts.scalingAxisOfDamagingRunes.wiki)}`);
  console.log(`\n  TWO-SOURCE CROSS-CHECK  ${JSON.stringify(counts.twoSourceCrossCheck)}`);
  console.log(`\n  PERMANENTLY UNREACHABLE (no source states it)  ${counts.permanentlyUnreachable.runes.join(', ') || 'none'}`);
  console.log(`\n  PRIOR CLAIM AUDIT`);
  console.log(`    structural damaging runes     ${priorClaimAudit.structuralCount} — ${priorClaimAudit.structuralRunes.join(', ')}`);
  console.log(`    of those, adaptive            ${priorClaimAudit.adaptiveCount} — ${priorClaimAudit.adaptiveRunes.join(', ')}`);
  console.log(`    of those, range with no axis  ${priorClaimAudit.rangeWithNoAxisCount} — ${priorClaimAudit.rangeWithNoAxisRunes.join(', ')}`);
  console.log(`    in BOTH groups                ${priorClaimAudit.overlap.join(', ') || 'none'}`);
  console.log(`    complete (holdable + axed)    ${priorClaimAudit.theHarderFinding.completeStructuralRunes.join(', ') || 'NONE'}`);
  console.log(`\n  fetch failures  ${fetchFailures.length === 0 ? 'none' : JSON.stringify(fetchFailures)}`);
  console.log(`  anchor failures ${anchorFailures.length === 0 ? 'none' : '\n    ' + anchorFailures.join('\n    ')}`);
  console.log(`\n  MARKUP GUARD (reads the RAW longDesc, which every other anchor cannot see)`);
  console.log(`    runes checked against raw markup   ${runes.length}`);
  console.log(
    `    markup asserts a damage type       ${census.integrity.markupGuard.runesWhoseMarkupAssertsAType.join(', ') || 'none'}`,
  );
  console.log(`    failures                           ${markupGuardFailures.join(', ') || 'none'}`);
  console.log(
    `\n  ENDPOINT TOLERANCE ${ENDPOINT_TOLERANCE} — largest gap among agreeing runes: ` +
      `${census.integrity.endpointToleranceReviewed.largestGapAmongAgreeing}`,
  );
  console.log(`\n  written to public/data/rune-census.json\n`);
}

// Only fetch when run directly. Importing this file — the tests of `evalFormula` do — must never
// put another request on the wiki.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
