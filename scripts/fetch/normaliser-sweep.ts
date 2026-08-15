// EVERY PLACE THIS PIPELINE ALTERS TEXT BEFORE COMPARING IT — the sweep, as data plus checks.
//
// WHY THIS FILE EXISTS. On 2026-08-15 the contested-rune investigation found that First Strike
// was not contested at all. Both sources said "true damage"; Data Dragon said it in MARKUP
// (`<truedamage>7%</truedamage> extra <truedamage> damage</truedamage>`), this pipeline strips
// tags before comparing texts, and the comparison then reported a conflict it had created
// itself. That is a CLASS, not one rune:
//
//   A NORMALISER RUNNING BEFORE A COMPARISON CAN INVENT A DISAGREEMENT OUT OF AN AGREEMENT,
//   AND IT LOOKS EXACTLY LIKE A REAL ONE. It can also do the inverse — hide a real one.
//
// WHAT IS HERE.
//   1. `SITES` — the enumerated population. One entry per place where text or a value is
//      stripped, lowercased, trimmed, collapsed, rounded, parsed or coerced BEFORE something is
//      compared against it. Each entry records what is removed, whether the removal can carry
//      meaning, what the comparison is between, and both failure directions.
//   2. `classifySite` — the danger verdict is DERIVED from those fields, never written by hand,
//      for the same reason `classifyDisagreement` in rune-contested.ts is: change a field and
//      the verdict moves with it, so nobody can quietly downgrade a site by asserting it is fine.
//   3. Two mechanical checks, each of which is a finding turned into something that runs over the
//      whole population offline:
//        - `damageTypeOnlyInMarkup` (the First Strike class, generalised from runes to any
//          Data Dragon markup, items included)
//        - `namedArgumentsCarryingMeaning` (the class this sweep found: the wiki states WHOSE
//          stat inside a NAMED template argument, and `plainText` deletes named arguments)
//
// WHAT IS NOT HERE. No verdict about an entry. `damageTypeOnlyInMarkup` firing means the tag is
// the ONLY place the type is stated — measured live on 2026-08-15, that is true of 3 texts across
// items and runes, and in 2 of the 3 the tag is a COLOUR on a stat grant, not a damage type
// (Staff of Flowing Water tags "40 Ability Power", Hubris tags "12 Attack Damage"). Reading the
// tag as the type would therefore be wrong two times in three. These checks PROPOSE; a person
// confirms (CLAUDE.md).
//
// Pure: no network, no filesystem. Tested by normaliser-sweep.test.ts.

// The ELEVEN, not the ten: `level` became owner-required on 2026-08-15 (src/types/data.ts), and a
// detector that does not know about a stat cannot propose the entries carrying it. Before this,
// `type=target's level` on three items reported "stat: none" — the detector was quieter than the
// census it feeds, which is the wrong direction for something whose job is to find candidates.
import { TYPE_ARGUMENT_PHRASES } from './effect-census.ts';
import { dataDragonTypeFromMarkup, dataDragonTypeLostByStripping } from './rune-contested.ts';

// ---------------------------------------------------------------------------------------------
// The inventory.
// ---------------------------------------------------------------------------------------------

/** What the other side of the comparison is. This decides how bad a manufactured result is. */
export type ComparisonKind =
  /** Two independent sources. A normaliser here can invent a conflict between Riot and Riot. */
  | 'source-vs-source'
  /** A source against a pattern that stands in for what we expect the source to say. */
  | 'source-vs-pattern'
  /** A source against a figure we already stored (curated file, snapshot, hand reading). */
  | 'source-vs-stored'
  /** Two runs of our own pipeline. No source is being characterised. */
  | 'run-vs-run';

export type SiteVerdict = 'dangerous' | 'watched' | 'safe';

export interface NormaliserSite {
  /** Stable id, used by the tests and by the published report. */
  id: string;
  /** file:line of the normaliser itself. */
  where: string;
  /** file:line of the comparison it runs before. */
  comparedAt: string;
  /** What the normaliser removes or changes, in plain English. */
  removes: string;
  /**
   * Can anything it removes CARRY MEANING? First Strike's damage type lived inside a tag, so
   * the tag was not decoration. Answered from a measurement, never from an impression.
   */
  removalCanCarryMeaning: boolean;
  comparison: ComparisonKind;
  /**
   * True when an EXACT, un-normalised comparison decides the outcome first and the normalised
   * form is used only to CLASSIFY a miss. `rework.ts` is built this way, which is why its
   * normaliser cannot decide anything.
   */
  strictComparisonFirst: boolean;
  /** Could this site report a disagreement that the sources do not actually have? */
  canInventADisagreement: boolean;
  /** Could this site hide a disagreement the sources DO have? */
  canHideADisagreement: boolean;
  /** What was actually measured here, with numbers. Never "this should be fine". */
  measured: string;
  /** Live defect, or null. Present tense means it is still in a published file. */
  liveDefect: string | null;
  /**
   * What was done about it, where a defect this sweep found has since been corrected.
   *
   * The defect text is NOT deleted when it is fixed — it moves here, with what was published
   * before, how the fix works, and what is still true afterwards. A sweep that quietly loses its
   * own findings as they are closed cannot be audited, and the last field is the one that matters:
   * every one of these fixes is narrower than the class that produced it.
   */
  fixed?: {
    date: string;
    what: string;
    how: string;
    whatIsStillTrue: string;
  };
}

/**
 * THE POPULATION. Every site found by reading all 60 modules in scripts/fetch/ on 2026-08-15.
 *
 * Membership rule, stated so the count means something: a site is here when a value is altered
 * — markup stripped, case folded, whitespace collapsed, templates peeled, a number rounded or
 * parsed — AND the altered value is then the operand of an equality test, a substring or regex
 * test, or a numeric tolerance test. A normaliser whose output is only ever PRINTED is not a
 * site; `bounds.ts`'s `round()` is the example and is deliberately absent.
 */
export const SITES: NormaliserSite[] = [
  {
    id: 'rune-records-are-stored-html-stripped',
    where: 'effect-population.ts:122 — buildRuneEffectRecords stores stripHtml(longDesc)',
    comparedAt:
      'effect-census.ts:444/534 — every damage, stat and owner regex in the census runs on that stored text',
    removes:
      "every HTML tag and entity from Data Dragon's rune prose, including the tag NAMES " +
      '<truedamage> / <magicDamage> / <physicalDamage>',
    removalCanCarryMeaning: true,
    comparison: 'source-vs-pattern',
    strictComparisonFirst: false,
    canInventADisagreement: true,
    canHideADisagreement: true,
    measured:
      'Of 62 runes, 3 wrap text in exactly one damage-type tag; in 2 the stripped words state the ' +
      'same type and nothing is lost; in 1 (First Strike) the tag is the only statement. Run ' +
      'through classifyEffect on 2026-08-15: the sentence "causing you to deal 7% extra damage ' +
      'against champions" classifies as damage "none"; restore the word the tag carried ("7% bonus ' +
      'true damage") and the same sentence classifies as "candidate", inScope true.',
    liveDefect: null,
    fixed: {
      date: '2026-08-15',
      what:
        'public/data/effect-census.json recorded First Strike as damage:"none", inScope:false — ' +
        'outside the damaging population entirely, while both sources say it deals true damage. It ' +
        'now reads damage:"candidate", inScope:true, and the row carries `correctedFromMarkup` ' +
        'with the machine verdict it overrides, the markup, and what the file said before.',
      how:
        'NOT by teaching the classifier to read tags. The correction is applied to the one entry a ' +
        'person read, listed in confirmed-readings.ts, because 2 of the 3 tagged texts in the live ' +
        'data colour a stat grant rather than a damage type. The normaliser itself is unchanged: ' +
        'the stripped sentence still classifies as "none", which is asserted in the tests so the ' +
        'defect cannot quietly return.',
      whatIsStillTrue:
        'Stripping was one of TWO causes and the second is untouched. The full rune text also ends ' +
        '"granting 50% … of bonus damage dealt as gold", which the classifier refuses separately ' +
        'and rightly. Any other rune whose type lives only in a tag would still be misread.',
    },
  },
  {
    id: 'rune-census-anchors-and-source-text-are-html-stripped',
    where: 'rune-census.ts:1359 — ddText = stripHtml(rune.longDesc)',
    comparedAt:
      'rune-census.ts:1360 (anchor indexOf), 1428-1456 (dealsDamage and damageType, ddragon vs wiki)',
    removes: 'as above, before the two sources are counted against each other',
    removalCanCarryMeaning: true,
    comparison: 'source-vs-source',
    strictComparisonFirst: false,
    canInventADisagreement: true,
    canHideADisagreement: true,
    measured:
      'The hand READING was written against the stripped text: First Strike carried ddAnchor ' +
      '"causing you to deal 7% extra damage against champions", which is the stripped form, and ' +
      'damageType.ddragon "not-stated". Corrected 2026-08-15 to dealsDamage true / damageType ' +
      '"true", with the raw markup pinned beside the stripped anchor.',
    liveDefect: null,
    fixed: {
      date: '2026-08-15',
      what:
        'public/data/rune-census.json published dealsDamage.sourcesDisagree = ["First Strike"] and ' +
        'typeNotStatedAtAll.ddragon = ["First Strike", "Summon Aery"]. Both entries were ' +
        'manufactured by stripHtml. The reading is corrected, the row carries `correctedFrom` with ' +
        'every superseded value, and the blocker class `sources-disagree-on-kind` is now empty.',
      how:
        'THE ANCHOR GUARD NOW READS THE RAW longDesc. Each reading records `markupType` — the ' +
        'damage type the raw tags assert, or null — for ALL 62 runes, and a verbatim raw anchor ' +
        'including the tags wherever a type is asserted. A tag changing type, or appearing where a ' +
        'person recorded none, now fails the guard and the row is refused rather than published.',
      whatIsStillTrue:
        'stripHtml still runs before the two sources are compared. What changed is that the ' +
        'stripped text is no longer the only thing a guard can see.',
    },
  },
  {
    id: 'plaintext-deletes-named-template-arguments',
    where: 'effect-text.ts:89 — plainText filters out every `name=value` template argument',
    comparedAt:
      'effect-census.ts:498 findOwnerRefs, then values.ts:370-386 where a wiki "unstated" is put ' +
      "to Data Dragon's item prose",
    removes:
      'named arguments of wiki templates. The comment calls them "formatting, never words" — but ' +
      "`type=` on {{pp}} is the wiki's own statement of WHICH stat the progression reads and WHOSE",
    removalCanCarryMeaning: true,
    comparison: 'source-vs-source',
    strictComparisonFirst: false,
    canInventADisagreement: false,
    canHideADisagreement: true,
    measured:
      'Over the 229 item effect texts in public/data/effect-census.json, and 17 of them use ' +
      '`type=` at all. Measured against the TEN owner-required stats, as the check stood when ' +
      'this site was written: 10 effects carry a meaning-bearing named argument, 5 name one of ' +
      'the ten, 2 attribute an owner — and every one of the 5 was recorded with ownerRefs: []. ' +
      'Re-measured 2026-08-15 against the ELEVEN, level included: 12 effects, 12 naming a stat, ' +
      '7 attributing an owner. AN EARLIER DRAFT OF THIS SENTENCE SAID 12 AND 22 for the first ' +
      'pair; those figures were never produced by the check beside it, which computed 10 and 5 ' +
      'from the day it was written (public/data/normaliser-sweep.json, ' +
      '`meaningInsideANamedTemplateArgument`). The prose was wrong, not the check — which is the ' +
      "same defect class this sweep exists to catch, in this file's own commentary.",
    liveDefect: null,
    fixed: {
      date: '2026-08-15',
      what:
        "Kraken Slayer [pass] states `type=target's missing health` and Lord Dominik's Regards " +
        "[pass] states `type=target's bonus health`; both were recorded as having no owner-bearing " +
        'reference at all. `findOwnerRefs` now reads `type=` arguments. 12 references appear that ' +
        'nothing counted before — 8 of them attributed — and the census total moves from 120 to 132.',
      how:
        'The STAT is read mechanically; the OWNER is not. Each possessive is looked up in the ' +
        'population a person has read (confirmed-readings.ts), because "target" means the enemy on ' +
        'Kraken Slayer and an ALLY on Locket of the Iron Solari, and the words are identical. An ' +
        'unread possessive is flagged `needsReading` and left unstated.',
      whatIsStillTrue:
        '`plainText` still deletes named arguments, and every other reader of it is still blind to ' +
        'them — including values.ts, where a wiki "unstated" is put to Data Dragon. Only the owner ' +
        'census was taught to look.',
    },
  },
  {
    id: 'ddragon-item-prose-is-html-stripped-before-corroboration',
    where: 'effect-owner-crosscheck.ts:95 — ddragonEffectProse drops <stats> then every tag',
    comparedAt:
      'effect-owner-crosscheck.ts:44 (numbers) and :119 (possessives), driven from values.ts:306/369',
    removes:
      'the flat stat block, and every tag name including the <passive> / <active> boundary between ' +
      "one item's separate effects",
    removalCanCarryMeaning: true,
    comparison: 'source-vs-source',
    strictComparisonFirst: false,
    canInventADisagreement: false,
    canHideADisagreement: true,
    measured:
      'Over the 209-item pool: 64 items wrap text in exactly one damage-type tag; in 62 the ' +
      'stripped words state the same type; in 2 the tag is the only claim and in BOTH the tag is a ' +
      'colour on a stat grant, not a damage type. Possessives are never inside tag names, so the ' +
      'owner half cannot be changed by stripping.',
    liveDefect: null,
  },
  {
    id: 'patch-note-templates-unwrapped-before-the-number-is-read',
    where: 'patch-notes.ts:103 unwrapTemplates, :132 toLowerCase, :140 the to/from number regex',
    comparedAt: 'overrides.ts:130 — Math.abs(note.to - dataDragonValue) < 1e-9',
    removes:
      'single-argument display templates ({{fd|1.1}} -> 1.1) and case. A line the regex cannot ' +
      'read is dropped silently, and a dropped note turns a `confirmed` override into a `contested` one',
    removalCanCarryMeaning: true,
    comparison: 'source-vs-source',
    strictComparisonFirst: false,
    canInventADisagreement: true,
    canHideADisagreement: false,
    measured:
      'Measured live against V26.16 on 2026-08-15: 125 bullet lines, 57 start with a known stat ' +
      'phrase, 57 parsed into a change, 0 dropped, and 0 lines contain a stat phrase without ' +
      'starting with one. The site is dangerous by shape and is not firing today.',
    liveDefect: null,
  },
  {
    id: 'patch-note-champion-name-matched-exactly',
    where: 'patch-notes.ts:124 — championName is section[1].trim(), nothing more',
    comparedAt: 'overrides.ts:87 — change.championName === champion.wikiName',
    removes:
      'nothing but surrounding whitespace. Listed because the ABSENCE of a normaliser here has the ' +
      'same failure mode: a name the notes spell differently finds no note, and the override is ' +
      'then contested rather than confirmed',
    removalCanCarryMeaning: false,
    comparison: 'source-vs-source',
    strictComparisonFirst: true,
    canInventADisagreement: true,
    canHideADisagreement: false,
    measured:
      'All 35 distinct {{ci|…}} names in V26.16 match a roster name exactly. 0 mismatches. Keeping ' +
      'it exact is also correct: folding names would silently accept a genuine rename.',
    liveDefect: null,
  },
  {
    id: 'rune-endpoint-crosscheck-tolerance',
    where:
      'rune-census.ts:1058 evalFormula strips whitespace; :1177 strips a trailing "for N" clause',
    comparedAt:
      'rune-census.ts — Math.abs(low - ddLow) < ENDPOINT_TOLERANCE && Math.abs(high - ddHigh) < ' +
      'ENDPOINT_TOLERANCE, where ENDPOINT_TOLERANCE is 1e-9 (it was 0.51 until 2026-08-15)',
    removes:
      'whitespace and a duration clause — neither carries a value. The risk here WAS the TOLERANCE, ' +
      'not the text: at 0.51, half a point of genuine disagreement between the two sources read as ' +
      'agreement. At 1e-9 no difference either source can express survives the comparison',
    removalCanCarryMeaning: false,
    comparison: 'source-vs-source',
    strictComparisonFirst: true,
    canInventADisagreement: false,
    canHideADisagreement: false,
    measured:
      'THIS SWEEP\'S FINDING WAS ACTED ON. The tolerance was 0.51, chosen to absorb Data Dragon ' +
      'rounding its own printed endpoints, and it was absorbing nothing: all 10 agreeing runes ' +
      'agree at a raw gap of exactly 0, and the 1 disagreeing rune is out by 1.5 and 6. It is now ' +
      '1e-9 and no verdict moved. Not 0, because the wiki side is arithmetic this pipeline ' +
      'performs: over 25,000,000 one-decimal linear progressions, 16.78% carry a non-zero IEEE 754 ' +
      'error, largest 7.99e-14 — so exact equality would INVENT a disagreement in about one case ' +
      'in six. 1e-9 is ~12,500x that error and ~1,000,000x below the finest difference either ' +
      'source can state.',
    liveDefect: null,
  },
  {
    id: 'bridge-reduces-to-equal-to',
    where: 'effect-values-reach.ts:302 — links, bold, object pronouns and commas removed, lowercased',
    comparedAt: 'effect-values-reach.ts:309 — stripped === "equal to"',
    removes:
      'a wiki link, "to them/him/her/it", bold and italic markers. A wiki link could in principle ' +
      'carry a qualifier',
    removalCanCarryMeaning: true,
    comparison: 'source-vs-pattern',
    strictComparisonFirst: false,
    canInventADisagreement: false,
    canHideADisagreement: true,
    measured:
      'Bounded by construction: the bridge must be under 40 characters and any digit in it refuses ' +
      'outright, so no number can be swallowed. The two links it exists for are [[on-hit]] and ' +
      "Eclipse's \"to them\".",
    liveDefect: null,
  },
  {
    id: 'ability-name-normalised-only-to-classify',
    where: 'rework.ts:82 — normaliseAbilityName folds NFC, apostrophes, dashes, spacing and case',
    comparedAt: 'rework.ts:164 exact match decides; :172 the folded form only names the KIND of miss',
    removes: 'apostrophe style, dash style, spacing and case — from an ability NAME',
    removalCanCarryMeaning: true,
    comparison: 'source-vs-stored',
    strictComparisonFirst: true,
    canInventADisagreement: false,
    canHideADisagreement: false,
    measured:
      'Run against the real curated file and the current snapshot on 2026-08-15: 919 curated ' +
      'abilities, 919 matched EXACTLY, 0 matched only after folding, and all 152 findings are ' +
      '`source-ability-uncurated` reviews. The normaliser decided nothing at all. A fold-only hit ' +
      'is reported as `ability-name-formatting` for a person, never accepted. This is the shape ' +
      'every other site should be measured against.',
    liveDefect: null,
  },
  {
    id: 'snapshot-numbers-rounded-before-diff',
    where: 'diff.ts:58 — normaliseNumber rounds to 6 decimal places',
    comparedAt: 'diff.ts:65 — Object.is on the rounded pair',
    removes: 'anything below 1e-6, and joins ability-name lists with " | " before comparing them',
    removalCanCarryMeaning: false,
    comparison: 'run-vs-run',
    strictComparisonFirst: false,
    canInventADisagreement: false,
    canHideADisagreement: true,
    measured:
      'No champion statistic in the wiki module carries more than three decimals, so 1e-6 is far ' +
      'below any figure the source states. Both operands are our own snapshots.',
    liveDefect: null,
  },
  {
    id: 'template-name-lowercased-before-matching',
    where: 'effect-text.ts:57 — findBlocks lowercases the template name',
    comparedAt: 'effect-text.ts:58 — templateName === name.toLowerCase()',
    removes: "case from a MediaWiki template name, which MediaWiki itself treats as insignificant",
    removalCanCarryMeaning: false,
    comparison: 'source-vs-pattern',
    strictComparisonFirst: false,
    canInventADisagreement: false,
    canHideADisagreement: false,
    measured:
      "This is the source's own rule, not ours: {{As}} and {{as}} are one template. Measured over " +
      'the 229 item effect texts — 25 distinct template names as written, 25 after lowercasing, so ' +
      'the fold collapses nothing. 1 of the 25 carries an uppercase letter at all.',
    liveDefect: null,
  },
  {
    id: 'mediawiki-title-normalisation-applied-as-given',
    where: 'roster-abilities.ts:144 and cache-drift.ts:206 — the API\'s own `normalized` map',
    comparedAt: 'cache-drift.ts:289 — checkVerbatimSurvival uses raw includes(), no folding at all',
    removes:
      "nothing of ours. MediaWiki reports how it normalised a title and both names are recorded, so " +
      'a lookup can go either way',
    removalCanCarryMeaning: false,
    comparison: 'source-vs-stored',
    strictComparisonFirst: true,
    canInventADisagreement: false,
    canHideADisagreement: false,
    measured:
      'The verbatim-survival check compares raw wikitext to raw wikitext. It can raise a false ' +
      'alarm on a whitespace edit and can never fall silent on a real one — the safe direction. ' +
      'Over the last run recorded in state/cache-drift.json: 937 titles resolved, 0 missing, 11 ' +
      'moved, 0 reading impacts. No title was lost to a folding rule of ours.',
    liveDefect: null,
  },
  {
    id: 'owner-lookback-strips-quantifiers',
    where: "effect-census.ts:466 — strip() removes a trailing bonus/max/current/missing/total/own",
    comparedAt: 'effect-census.ts:470-487 — the possessive tests',
    removes:
      'the quantifier sitting between the possessive and the stat, so "the target\'s bonus health" ' +
      "can be seen as the target's",
    removalCanCarryMeaning: false,
    comparison: 'source-vs-pattern',
    strictComparisonFirst: false,
    canInventADisagreement: false,
    canHideADisagreement: false,
    measured:
      'The removed words are quantifiers; WHICH pool is captured separately by ' +
      'OWNER_REQUIRED_PHRASES, so nothing about the stat identity rests on this strip. 23 of the ' +
      '92 item owner references are attributed (22 by possessive, 1 by coordination) and 22 of ' +
      'those carry a quantifier this strip has to step over to see the possessive at all.',
    liveDefect: null,
  },
  {
    id: 'effect-id-slugged',
    where: "effect-values-gate.ts:345 — `${ownerName} ${key}` lowercased with runs of non-alphanumerics collapsed to '-'",
    comparedAt: 'the id is the key two effects would collide on if the fold made them equal',
    removes: "case and punctuation from an item name — \"Doran's Blade\" and \"Dorans Blade\" fold alike",
    removalCanCarryMeaning: true,
    comparison: 'source-vs-stored',
    strictComparisonFirst: false,
    canInventADisagreement: false,
    canHideADisagreement: true,
    measured:
      'Measured over all 291 item and rune effect records: 291 distinct slugs, 0 collisions. ' +
      'Nothing asserts that, which is the gap — a future item whose name differs from an existing ' +
      'one only in punctuation would merge with it silently.',
    liveDefect: null,
  },
];

/**
 * The verdict, DERIVED from the recorded facts.
 *
 * The argument, in order:
 *
 *  1. If nothing the normaliser removes can carry meaning, it cannot change an answer. Stripping
 *     whitespace before comparing two numbers is fine, and saying so plainly is half the value of
 *     this sweep — a count of "normalisers" with no split is a count of nothing.
 *  2. If an exact comparison decides first and the folded form only classifies the miss, the
 *     normaliser has no vote. rework.ts is the worked example.
 *  3. Otherwise the danger is set by WHAT IS ON THE OTHER SIDE. Two sources, or a pattern
 *     standing in for what a source says, is where a manufactured result is indistinguishable
 *     from a real one — that is First Strike. Our own stored value or our own previous run is a
 *     lesser risk: it is checkable against the source at any time.
 */
export function classifySite(site: NormaliserSite): SiteVerdict {
  if (!site.removalCanCarryMeaning) return 'safe';
  if (site.strictComparisonFirst) return 'safe';
  if (site.comparison === 'source-vs-source' || site.comparison === 'source-vs-pattern') {
    return 'dangerous';
  }
  return 'watched';
}

export interface SweepSummary {
  sites: number;
  dangerous: string[];
  watched: string[];
  safe: string[];
  liveDefects: string[];
  /** Sites whose defect has been corrected. A closed finding is kept, never deleted. */
  fixedDefects: string[];
  canInvent: string[];
  canHide: string[];
}

export function summariseSites(sites: NormaliserSite[] = SITES): SweepSummary {
  const pick = (v: SiteVerdict) => sites.filter((s) => classifySite(s) === v).map((s) => s.id);
  return {
    sites: sites.length,
    dangerous: pick('dangerous'),
    watched: pick('watched'),
    safe: pick('safe'),
    liveDefects: sites.filter((s) => s.liveDefect !== null).map((s) => s.id),
    fixedDefects: sites.filter((s) => s.fixed !== undefined).map((s) => s.id),
    canInvent: sites.filter((s) => s.canInventADisagreement).map((s) => s.id),
    canHide: sites.filter((s) => s.canHideADisagreement).map((s) => s.id),
  };
}

// ---------------------------------------------------------------------------------------------
// CHECK 1 — the First Strike class, generalised beyond runes.
// ---------------------------------------------------------------------------------------------

export interface MarkupOnlyTypeClaim {
  /** Item name or rune name. */
  subject: string;
  /** The type the tag name asserts. */
  type: 'physical' | 'magic' | 'true';
  /** What the tag actually wraps, so a person can see whether it is a damage figure or a colour. */
  wraps: string;
}

/**
 * Does this Data Dragon markup assert a damage type that survives NOWHERE in the stripped text?
 *
 * Reuses the rune check rather than restating it — `dataDragonTypeFromMarkup` and
 * `dataDragonTypeLostByStripping` take a plain string and never knew they were about runes.
 * Restating them here would create a second definition of the same rule, which is the defect
 * DATA-SOURCES §44 is about.
 */
export function damageTypeOnlyInMarkup(subject: string, text: string): MarkupOnlyTypeClaim | null {
  if (!dataDragonTypeLostByStripping(text)) return null;
  const type = dataDragonTypeFromMarkup(text);
  if (!type) return null;
  const wrapped = new RegExp(`<${type}damage>([\\s\\S]*?)</${type}damage>`, 'i').exec(text);
  return { subject, type, wraps: (wrapped?.[1] ?? '').replace(/<[^>]*>/g, ' ').trim() };
}

// ---------------------------------------------------------------------------------------------
// CHECK 2 — the class this sweep found: meaning inside a NAMED template argument.
// ---------------------------------------------------------------------------------------------

/** A possessive the wiki uses to say whose stat it is. Quoted from live item wikitext. */
const POSSESSIVE_IN_ARGUMENT = /\b(your|yours|their|his|her|target's|targets'|enemy's|enemies'|own)\b/i;

export interface NamedArgumentFact {
  /** The argument's name, e.g. "type", "formula". */
  argument: string;
  /** Its value, verbatim, with bold markers removed so it reads. */
  states: string;
  /** Which of the ten owner-required stats it names, if any. */
  ownerRequiredStat: string | null;
  /** True when the value contains a possessive — i.e. the wiki DOES say whose. */
  attributesAnOwner: boolean;
}

/**
 * Every named template argument in a piece of wiki item text whose VALUE carries meaning
 * `plainText` deletes.
 *
 * The rule for membership is deliberately narrow: the value must either name one of the ten
 * owner-required stats (DATA-SOURCES §16) or contain a possessive. An argument like
 * `color=health` or `icononly=true` is formatting and is not returned — the point is not that
 * named arguments are dropped, it is that SOME of them are the source speaking.
 *
 * IT PROPOSES. It reports what the argument says; it does not decide the owner. Two of the live
 * hits read "target's", which a person can confirm in one glance — and that is who should.
 */
export function namedArgumentsCarryingMeaning(wikitext: string): NamedArgumentFact[] {
  const out: NamedArgumentFact[] = [];
  const seen = new Set<string>();
  for (const template of wikitext.matchAll(/\{\{([^{}]*)\}\}/g)) {
    for (const part of template[1]!.split('|')) {
      const kv = /^\s*([a-z0-9 _-]+)\s*=([\s\S]*)$/i.exec(part);
      if (!kv) continue;
      const argument = kv[1]!.trim();
      const states = kv[2]!.replace(/'''|''/g, '').replace(/\s+/g, ' ').trim();
      if (states === '') continue;
      const stat =
        TYPE_ARGUMENT_PHRASES.find((entry) => {
          entry.pattern.lastIndex = 0;
          return entry.pattern.test(states);
        })?.stat ?? null;
      const attributesAnOwner = POSSESSIVE_IN_ARGUMENT.test(states);
      if (stat === null && !attributesAnOwner) continue;
      const key = `${argument}=${states}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ argument, states, ownerRequiredStat: stat, attributesAnOwner });
    }
  }
  return out;
}
