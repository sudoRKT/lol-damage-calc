// Are the six "contested" runes actually contested? — the pure half.
//
// WHY THIS FILE EXISTS. `public/data/rune-census.json` marks six runes contested: five
// under `sources-disagree-on-tiebreak` (Electrocute, Arcane Comet, Absolute Focus,
// Waterwalking, Gathering Storm) and one under `sources-disagree-on-kind` (First Strike).
// DATA-SOURCES §15 says authority is TIME-dependent as well as field-dependent: the wiki's
// hand-maintained text can sit a patch — or, as it turns out here, nine years — behind,
// while Data Dragon ships with the patch. A conflict where one side is simply older is not
// a conflict at all. This project has already found that kind twice (§14.1 marksman magic
// resistance, §3 the stale module), so before anyone tries to RESOLVE the six, the question
// is what the disagreement actually IS, per rune.
//
// Everything here is pure so it can be tested without a network call. `rune-contested-run.ts`
// does the fetching and feeds the measured facts in. The fixtures the tests run against are
// verbatim excerpts of the live pages, in `fixtures/rune-contested.ts`.
//
// THE FOUR VERDICTS, and why there are four rather than two:
//
//   genuinely-contested          Two CURRENT texts, same scope, flatly disagreeing, with
//                                nothing to settle them. Use the value that ships with the
//                                patch, flag it, surface it (§15 rule 3). Pick neither.
//   stale-on-one-side            Both texts are in scope and disagree, but one is a
//                                preserved older revision of the same source. Not contested;
//                                the current text wins.
//   not-contested-scope-misread  The two texts do not describe the same thing, and the
//                                source itself says which applies where. Nothing disagrees.
//   not-contested-markup-stripped
//                                The fact WAS stated by both sources; this pipeline's own
//                                text normalisation deleted it before anyone compared them.
//                                The disagreement was manufactured downstream of the source.
//
// The fourth is not a hypothetical category invented to be tidy — it is what First Strike
// turned out to be, and the same normalisation runs over every rune (see
// `dataDragonTypeLostByStripping`, which is the roster-wide check that finding became).

import { stripHtml } from './effect-text.ts';

// ---------------------------------------------------------------------------------------------
// Data Dragon states damage type in TAG NAMES, and `stripHtml` deletes them.
// ---------------------------------------------------------------------------------------------

/**
 * The damage type Data Dragon's markup asserts, or null when it asserts none.
 *
 * Data Dragon's rune `longDesc` is client display markup. Where it wants a phrase drawn in
 * the true/magic/physical damage colour it wraps the phrase in `<trueDamage>`,
 * `<magicDamage>` or `<physicalDamage>`. That TAG NAME is frequently the only place the
 * damage type is stated — First Strike's text reads, verbatim:
 *
 *   causing you to deal <truedamage>7%</truedamage> extra <truedamage> damage</truedamage>
 *
 * Strip the tags and the sentence says "7% extra damage", with no type in it at all.
 *
 * Tag case is NOT consistent in the live file: Hail of Blades and Sudden Impact ship
 * `<trueDamage>`, First Strike ships `<truedamage>`. Matching case-sensitively finds two of
 * the three, which is the worst possible outcome — it looks like it worked.
 */
export function dataDragonTypeFromMarkup(longDesc: string): 'physical' | 'magic' | 'true' | null {
  const found = new Set<'physical' | 'magic' | 'true'>();
  for (const match of longDesc.matchAll(/<(true|magic|physical)damage>/gi)) {
    found.add(match[1]!.toLowerCase() as 'physical' | 'magic' | 'true');
  }
  // Two different type tags in one description is a statement about two different effects,
  // not about one. Refuse it rather than picking the first.
  if (found.size !== 1) return null;
  return [...found][0]!;
}

/**
 * THE ROSTER-WIDE CHECK the First Strike finding became.
 *
 * True when Data Dragon's markup states a damage type that survives nowhere in the stripped
 * text — i.e. reading the stripped text alone loses a fact the source did state. Any rune
 * this fires on has been mis-read by anything downstream of `stripHtml`.
 *
 * It is deliberately not "does the markup state a type": Hail of Blades says "bonus true
 * damage" in words INSIDE the tag, so stripping keeps the fact and nothing is lost.
 */
export function dataDragonTypeLostByStripping(longDesc: string): boolean {
  const fromMarkup = dataDragonTypeFromMarkup(longDesc);
  if (!fromMarkup) return false;
  return !new RegExp(`\\b${fromMarkup}\\s+damage\\b`, 'i').test(stripHtml(longDesc));
}

// ---------------------------------------------------------------------------------------------
// The two competing wiki tiebreak texts, each read from the live page rather than assumed.
// ---------------------------------------------------------------------------------------------

/**
 * The 2017 line: "Grants bonuses based on which stat you already have the most bonuses for.
 * *Defaults to the first listed.*"
 *
 * `{{adaptive|…}}` always renders "… bonus Attack Damage or … Ability Power" in that order
 * (Template:Adaptive, read 2026-08-15), so "the first listed" means attack damage.
 */
export function carriesLegacyAdaptiveTiebreak(wikitext: string): boolean {
  return wikitext.includes('Defaults to the first listed');
}

/** The tiebreak the Adaptive force ARTICLE states today, read from the article itself. */
export function adaptiveForceTiebreakFromArticle(
  articleWikitext: string,
): 'champion-adaptive-type' | 'first-listed' | null {
  const equalClause = /are '''equal''',[\s\S]{0,200}?'''adaptive type''' of the champion/;
  if (equalClause.test(articleWikitext)) return 'champion-adaptive-type';
  if (carriesLegacyAdaptiveTiebreak(articleWikitext)) return 'first-listed';
  return null;
}

/**
 * The runes the Adaptive force article EXEMPTS from the adaptive-damage formula.
 *
 * Parsed from the article rather than hard-coded, because the whole point is that the source
 * states the scope itself. The live sentence reads:
 *
 *   Despite also having variable damage types, {{ri|Arcane Comet}} and {{ri|Electrocute}} do
 *   not utilize the {{tip|adaptive damage|nolink=true}} formula to determine their damage types.
 */
export function runesExemptFromAdaptiveDamageFormula(articleWikitext: string): string[] {
  const sentence = articleWikitext.match(/([^.]*?do not utilize the[^.]*?formula[^.]*)\./);
  if (!sentence) return [];
  return [...sentence[1]!.matchAll(/\{\{ri\|([^}|]+)/g)].map((m) => m[1]!.trim());
}

/** True when a rune template carries its own "Variable Damage:" block. */
export function carriesVariableDamageBlock(wikitext: string): boolean {
  return wikitext.includes('{{sbc|Variable Damage:}}');
}

/**
 * The tiebreak a template's own Variable Damage block states, read from the block.
 * Electrocute and Arcane Comet both end theirs: "…the damage type defaults to magic damage."
 */
export function variableDamageTiebreak(wikitext: string): 'physical' | 'magic' | null {
  if (!carriesVariableDamageBlock(wikitext)) return null;
  const tail = wikitext.match(/zero or otherwise equal, the damage type defaults to \{\{as\|(\w+)/);
  const named = tail?.[1]?.toLowerCase();
  return named === 'magic' || named === 'physical' ? named : null;
}

// ---------------------------------------------------------------------------------------------
// The classifier.
// ---------------------------------------------------------------------------------------------

export type ContestVerdict =
  | 'genuinely-contested'
  | 'stale-on-one-side'
  | 'not-contested-scope-misread'
  | 'not-contested-markup-stripped';

/** One side of a disagreement, with the dates that decide whether it is current. */
export interface SourceStatement {
  /** Which page or file, e.g. "wiki Template:Rune data Absolute Focus". */
  source: string;
  /** Verbatim, so nothing here rests on a paraphrase. */
  text: string;
  /** ISO date this wording entered the source, where the history states it. */
  introduced: string | null;
  /** ISO date the page itself was last edited at all. */
  pageLastEdited: string | null;
}

/** Everything the classifier is allowed to look at. Every field is measured, not judged. */
export interface DisagreementEvidence {
  rune: string;
  /** The census blocker this evidence is being weighed against. */
  censusBlocker: string;
  /** What the two texts are supposed to disagree ABOUT, in one clause. */
  claim: string;
  sideA: SourceStatement;
  sideB: SourceStatement;
  /** The source itself states that the two texts govern different populations. */
  exemptedBySourceItself: boolean;
  /** The fact was present in raw source markup and destroyed by our own normalisation. */
  factSurvivesInRawMarkup: boolean;
  /** Side A's wording is reproduced verbatim in the wiki's patch note that introduced it. */
  sideAReproducedInItsLaunchNote: boolean;
  /** How many CURRENT runes still carry side A's wording, out of how many exist. */
  sideACarriers: { carriers: number; outOf: number };
  /** Any patch note in the sampled window that documents a change to this rule. */
  patchNoteDocumentsChange: boolean;
}

export interface ContestFinding {
  rune: string;
  censusBlocker: string;
  claim: string;
  verdict: ContestVerdict;
  /** Plain English, for a reader who will never open this file. */
  why: string;
  /** The value that stands once the verdict is applied, or null when nothing stands. */
  valueThatStands: string | null;
  /** What this finding does NOT establish. Never empty when it matters. */
  residual: string | null;
  evidence: DisagreementEvidence;
}

/**
 * Classify one disagreement. The order of the tests is the argument:
 *
 * 1. If our own normalisation destroyed the fact, there was never a disagreement to have.
 *    This is checked FIRST because it is a defect in this pipeline, and diagnosing it as
 *    anything else would leave the defect in place while declaring the rune resolved.
 * 2. If the source states that the two texts govern different populations, they cannot
 *    disagree — a rule and its stated exception are not two answers to one question.
 * 3. Staleness is a CONJUNCTION of measurables, not an impression: side A's wording is
 *    verbatim launch-note text, side B has been edited since, and side A survives on a
 *    minority of the current population. Any one of those alone proves nothing.
 * 4. Otherwise it is genuinely contested, and stays that way.
 */
export function classifyDisagreement(evidence: DisagreementEvidence): ContestVerdict {
  if (evidence.factSurvivesInRawMarkup) return 'not-contested-markup-stripped';
  if (evidence.exemptedBySourceItself) return 'not-contested-scope-misread';

  const sideAIsOlder =
    evidence.sideA.introduced !== null &&
    evidence.sideB.pageLastEdited !== null &&
    evidence.sideA.introduced < evidence.sideB.pageLastEdited;
  const sideAIsAMinority =
    evidence.sideACarriers.carriers * 2 < evidence.sideACarriers.outOf;

  if (evidence.sideAReproducedInItsLaunchNote && sideAIsOlder && sideAIsAMinority) {
    return 'stale-on-one-side';
  }
  return 'genuinely-contested';
}
