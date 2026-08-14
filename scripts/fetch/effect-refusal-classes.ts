// THE REFUSAL CENSUS — every in-scope item and rune effect that is NOT stored, and why.
//
// WHY THIS FILE EXISTS. DATA-SOURCES §39 grouped the refusals it met, but it met them over ONE
// population: the 63 effects whose damage value the source states structurally. That is 63 of
// the 168 the census calls in scope. The other 105 were never put through anything, so "25
// refused" was true and answered a much smaller question than it looked like it answered.
//
// THIS FILE'S DENOMINATOR IS THE WHOLE IN-SCOPE POPULATION. Every effect that is in scope and
// not stored carries at least one named class, every class carries a definition, and every class
// sits in exactly one BUCKET saying whose problem it is. A count without a definition is not a
// count (CLAUDE.md), and "35 refusals, 33 of them the contract" is not comparable to anything
// unless the population it was measured over is stated with it.
//
// Pure: no network, no filesystem. Tested by effect-refusal-classes.test.ts.

import type { EffectClassification } from './effect-census.ts';
import type { RefusalReason } from './effect-values.ts';

// ---------------------------------------------------------------------------
// Buckets — whose problem is it?
// ---------------------------------------------------------------------------

export type RefusalBucket =
  | 'contract'
  | 'source-silent'
  | 'out-of-champion-scope'
  | 'not-actually-in-scope'
  | 'not-yet-read'
  | 'parser';

export const BUCKET_DEFINITIONS: Record<RefusalBucket, string> = {
  contract:
    'The source states the fact plainly and the frozen contract in src/types/ has no shape that ' +
    'can hold it. Adding the shape would release the effects blocked by that shape ALONE — ' +
    'DATA-SOURCES §41.3 overstated a release by 90% by counting reasons instead of effects, so ' +
    'every population here is counted as effects with NO other blocker as well as in total.',
  'source-silent':
    'No source states the fact. Nobody can supply it and it is not a worklist (SPECIFICATION ' +
    '§8). This is the bucket §39 found only two members of.',
  'out-of-champion-scope':
    'The source states the effect in full and it cannot reach the defender in a two-champion ' +
    'fight (SPECIFICATION §1) — it damages minions, wards or turrets, or enemies OTHER than the ' +
    'one attacked, or an ally, or it needs a third unit to exist. Storing it would be storing ' +
    'damage this product can never deal.',
  'not-actually-in-scope':
    'The in-scope test fired and a reading of the sentence says the effect cannot change a ' +
    'damage number or the survival verdict after all. REPORTED AS A PROPOSED CORRECTION TO THE ' +
    'IN-SCOPE FIGURE, never silently removed from the denominator — a count that shrinks because ' +
    'someone quietly redefined it is not comparable to anything.',
  'not-yet-read':
    'Nobody has read the sentence. This is the only bucket that is WORK, and it is this ' +
    "pipeline's work. An effect here is reported, never stored (CLAUDE.md).",
  parser:
    "This pipeline's own limitation, not the contract's and not the source's. The shape exists " +
    'and the words are there; the parser in scripts/fetch/ does not read them yet.',
};

// ---------------------------------------------------------------------------
// The classes
// ---------------------------------------------------------------------------

export interface RefusalClass {
  bucket: RefusalBucket;
  /** What the class means, in the terms a reader of the source would recognise. */
  definition: string;
  /** For `contract` classes only: the shape that would release it, named. */
  shapeNeeded?: string;
}

/**
 * Every class an in-scope effect can be refused under.
 *
 * The first group are the reasons the gate itself emits (`RefusalReason`). The second are
 * classes that apply to effects the gate never saw, because a value extraction was never
 * attempted on them at all.
 */
export const REFUSAL_CLASSES: Record<string, RefusalClass> = {
  // ---- classes the gate emits -------------------------------------------
  'non-champion-target-only': {
    bucket: 'out-of-champion-scope',
    definition:
      'The source restricts this damage to minions, monsters, wards or turrets. Doran\'s Helm ' +
      'reads "against minions" in so many words.',
  },
  'other-enemies-only': {
    bucket: 'out-of-champion-scope',
    definition:
      'The damage reaches enemies OTHER than the one attacked — the cleave family. A ' +
      'two-champion scenario has no other enemy, so it can never touch the defender.',
  },
  'ally-only': {
    bucket: 'out-of-champion-scope',
    definition: 'The damage is granted to an allied champion. A two-champion scenario has no ally.',
  },
  'trigger-needs-a-third-unit': {
    bucket: 'out-of-champion-scope',
    definition:
      'The effect fires only on killing or taking down a unit the scenario does not contain. ' +
      'Where that unit IS the defender, it fires after the survival verdict is already settled.',
  },
  retaliation: {
    bucket: 'contract',
    definition:
      'The holder does not deal this damage; it is dealt back at whoever struck the holder. ' +
      'Thornmail and Bramble Vest. Every damage shape in the contract flows from the champion ' +
      'executing the combo to the other one, and there is no way to say "and this much comes ' +
      'back".',
    shapeNeeded:
      'A direction on an item effect — damage dealt BY the holder TO whoever attacked them, ' +
      'reported separately from the combo (it changes no survival verdict this product gives).',
  },
  'scales-on-lethality': {
    bucket: 'contract',
    definition: 'The value is a share of the holder\'s lethality. `RatioStat` has no lethality arm.',
    shapeNeeded: "`RatioStat` gains 'lethality', and `StatBlock` carries it.",
  },
  'scales-on-crit-chance': {
    bucket: 'contract',
    definition:
      "The value is a share of the holder's critical strike chance. `RatioStat` has no arm for it.",
    shapeNeeded: "`RatioStat` gains 'critChance'.",
  },
  'critical-strike-modifier': {
    bucket: 'contract',
    definition:
      'The number is a critical-strike DAMAGE PERCENTAGE, not an amount of damage — it changes ' +
      'what a critical strike multiplies by. Putting it in `base` would hand the holder that ' +
      'many points of flat damage.',
    shapeNeeded:
      'A field on `CuratedItemEffect` that modifies the critical multiplier rather than adding ' +
      'a component.',
  },
  'scales-on-stacks': {
    bucket: 'contract',
    definition:
      'The BASE walks a stack counter the effect itself accumulates. `Scaling` walks ability ' +
      'rank or champion level and neither is a stack count. NARROWER THAN IT WAS: a stack ' +
      'counter as the axis of a RATIO has been expressible since §42.1 fixed the unit, so an ' +
      'effect refused only for a stack-scaled ratio is no longer refused for this.',
    shapeNeeded: "A `Scaling` arm that walks a named counter, mirroring `Ratio`'s 'stacks'.",
  },
  'adaptive-damage-type': {
    bucket: 'contract',
    definition:
      'The source calls the damage "adaptive": physical or magic, decided at evaluation time ' +
      "from the holder's own bonus attack damage and ability power. `DamageType` is " +
      'physical | magic | true.',
    shapeNeeded:
      "`DamageType` gains 'adaptive', resolved by the engine from the holder's stat block. " +
      "`Champion.stats.adaptivetype` is already fetched and already carries the tie-break.",
  },
  'range-with-unstated-axis': {
    bucket: 'source-silent',
    definition:
      'The source states a range ("70 - 240") and never says what varies across it. All three ' +
      'are runes, whose only fetched source is Data Dragon `longDesc`.',
  },
  'conditional-additional-damage': {
    bucket: 'contract',
    definition:
      'The effect multiplies its OWN damage by a quantity the scenario knows — Kraken Slayer by ' +
      "the target's missing health, Luden's Echo by how many stacks found no second target. " +
      'Neither is a ratio: a ratio adds to a base, and these scale the whole component.',
    shapeNeeded: 'A multiplier on a whole `AbilityComponent`, with the quantity that drives it.',
  },
  'value-stated-only-by-reference': {
    bucket: 'contract',
    definition:
      "The value is a multiple of ANOTHER effect's figure — \"200% of Immolate's damage\". The " +
      'number exists one indirection away, and nothing in the contract can point at it.',
    shapeNeeded:
      '`CuratedDefensiveEffect.valueByReference` exists for exactly this; `CuratedItemEffect` ' +
      'has no equivalent.',
  },
  'range-split-has-named-arguments': {
    bucket: 'parser',
    definition:
      'The melee and ranged arms are each a LEVEL PROGRESSION written as a formula. The ' +
      'contract already holds it — every arm of `byRangeType` is itself a `Scaling` — and this ' +
      'parser does not read the formula.',
  },
  'no-structural-damage-run': {
    bucket: 'not-yet-read',
    definition: 'The parser found no run naming a damage type and carrying a value.',
  },
  'dot-total-disagrees-with-tick': {
    bucket: 'parser',
    definition:
      'The source states a per-instance figure and a total, and they do not reconcile. One of ' +
      'the numbers is being misread and none may be trusted until someone looks.',
  },
  'parser-disagrees-with-reading': {
    bucket: 'parser',
    definition:
      'The parser and the recorded hand reading both produced a value and the values differ. ' +
      'The loudest outcome the gate has: one of the two is wrong.',
  },
  'not-in-read-population': {
    bucket: 'not-yet-read',
    definition: 'Nobody has read this sentence. Reported for reading, never stored.',
  },
  'unparsed-token': {
    bucket: 'parser',
    definition: 'A token inside the damage run this parser does not recognise. Always quoted.',
  },
  'ambiguous-damage-type': {
    bucket: 'parser',
    definition: 'The run names two damage types and nothing says which value carries which.',
  },
  'melee-ranged-split': {
    bucket: 'contract',
    definition:
      'HISTORICAL. `Scaling.byRangeType` closed this on 2026-08-13 and the parser no longer ' +
      'emits it; it survives only as a co-reason on five recorded readings.',
  },
  'damage-over-time': {
    bucket: 'contract',
    definition:
      'HISTORICAL. `CuratedItemEffect.overTime` closed this on 2026-08-13 and the parser no ' +
      'longer emits it; it survives only as a co-reason on one recorded reading.',
  },
  'range-split-arms-differ-in-shape': {
    bucket: 'parser',
    definition:
      'The melee arm and the ranged arm read to different shapes. Merging them would invent a ' +
      'value for whichever half came up short.',
  },

  // ---- classes for effects the gate never saw ---------------------------
  'damage-in-prose-nobody-has-read': {
    bucket: 'not-yet-read',
    definition:
      'THE EFFECT DEALS DAMAGE AND ITS VALUE IS NOT STATED STRUCTURALLY. The census classifies ' +
      'it a `candidate` and the hand audit in effect-census-audit.ts confirms it deals damage, ' +
      'but no value extraction has been attempted and no reading of the numbers is recorded. ' +
      'The 63-effect structural population never contained these.',
  },
  'rune-prose-has-no-structure-to-confirm-a-reading': {
    bucket: 'not-yet-read',
    definition:
      'A RUNE whose damage is stated only in Data Dragon prose, with no labelled "Damage:" line ' +
      'for the census to find. Nobody has read these sentences, AND the second reading a store ' +
      'requires has nowhere to come from yet: there is no wiki rune data module (confirmed by ' +
      'enumerating all 683 Module: pages, DATA-SOURCES §6), so the parser that would confirm a ' +
      'hand reading would have to read the same prose the person read. A reading alone never ' +
      'stores a value. Several of the ten carry a second, known blocker as well — three deal ' +
      '"adaptive" damage and Demolish damages turrets only.',
  },
  'grants-healing-not-a-stat': {
    bucket: 'contract',
    definition:
      'The effect restores health, or amplifies healing, rather than moving a damage stat. ' +
      '`Result.sustain` exists for this (§42.2); `CuratedRune` and `CuratedItemEffect` carry ' +
      'only `grants`, a map of stat names to numbers, and health restored is not a stat.',
    shapeNeeded: 'A healing field on `CuratedItemEffect` and `CuratedRune`, feeding `Result.sustain`.',
  },
  'flat-stat-grant-nothing-blocks': {
    bucket: 'not-yet-read',
    definition:
      'AN ALWAYS-ACTIVE, FLAT GRANT OF A DAMAGE-RELEVANT STAT — the one shape `grants: ' +
      'Record<string, number>` already holds. No extraction has been attempted, so it is ' +
      'reported, not stored.',
  },
  'the-damage-relevant-stat-is-an-input-not-an-output': {
    bucket: 'not-actually-in-scope',
    definition:
      'The damage-relevant stat drives the effect; what the effect GRANTS is not damage-relevant. ' +
      'Endless Hunger grants ABILITY HASTE scaled by bonus AD, and ability haste is filtered out ' +
      'of "damage-relevant" because the engine models sequence and not elapsed time ' +
      '(SPECIFICATION §3.2). The in-scope test sees the bonus AD and calls it in scope.',
  },
  'regeneration-is-not-modelled': {
    bucket: 'not-actually-in-scope',
    definition:
      'The stat is health or mana REGENERATION — a rate per second. The engine models sequence, ' +
      'not elapsed time, so there is no number of seconds for a rate to act over.',
  },
  'scales-on-elapsed-time': {
    bucket: 'not-actually-in-scope',
    definition:
      'The value is a function of how long the game has been running — Gathering Storm grants ' +
      'adaptive force every ten minutes. The engine has no clock (SPECIFICATION §3.2).',
  },
  'stat-grant-is-conditional': {
    bucket: 'contract',
    definition:
      'The stat only applies while something is true — in combat, above a health threshold, ' +
      'after a takedown. `CuratedItemEffect` carries `grants: Record<string, number>` and NO ' +
      'activation or condition field, so anything written into it applies always. ' +
      '`CuratedDefensiveEffect` has both `activation` and `condition`; the item shape does not.',
    shapeNeeded:
      "`CuratedItemEffect` gains `activation: 'always-active' | 'conditional' | 'not-stated'` " +
      'and `condition`, exactly as `CuratedDefensiveEffect` carries them.',
  },
  'stat-grant-is-a-share-of-another-stat': {
    bucket: 'contract',
    definition:
      '"Grants ability power equal to 1% bonus mana", "bonus attack damage equal to 50% base ' +
      'AD". `grants` is a map to a plain number and cannot express a share of anything. This is ' +
      'the single largest shape among the stat modifiers.',
    shapeNeeded:
      '`CuratedItemEffect.grants` becomes a list of { stat, value?: Scaling, ratios?: Ratio[] } ' +
      'rather than a flat number map — the same shape ability damage already uses.',
  },
  'stat-grant-multiplies-a-stat': {
    bucket: 'contract',
    definition:
      "Rabadon's Deathcap increases ability power BY 30%, and Spirit Visage increases healing " +
      'received by 25%. A flat map cannot say "multiply", and 30 in a field an engine reads as ' +
      'points is a different number rather than an imprecise one.',
    shapeNeeded: 'A unit on a granted stat, mirroring `CuratedDefensiveEffect.unit`.',
  },
  'grants-a-shield': {
    bucket: 'contract',
    definition:
      'An ITEM that grants a shield. `CuratedDefensiveEffect` holds a shield, and it is keyed ' +
      'by champion, slot and ability name — an item has none of those, so an item shield has ' +
      'nowhere at all to go.',
    shapeNeeded:
      '`CuratedItemEffect` gains the defensive fields, or `CuratedDefensiveEffect` is allowed ' +
      'to be sourced from an item.',
  },
  'amplifies-damage-or-reduces-it': {
    bucket: 'contract',
    definition:
      '"Deal 4% increased damage", "take 8% reduced damage". It multiplies a figure computed ' +
      'elsewhere in the combo rather than contributing one of its own.',
    shapeNeeded:
      'A damage amplifier and a damage taken multiplier on `CuratedItemEffect`, applied at a ' +
      'stated point in the four-step resistance order (SPECIFICATION §3.6).',
  },
  'the-stat-is-a-threshold-not-a-grant': {
    bucket: 'not-actually-in-scope',
    definition:
      'The damage-relevant stat is a CONDITION the effect tests, not something it changes — ' +
      '"Transforms into Muramana at 360 bonus mana". Nothing about the damage number moves. ' +
      'MEASURED AS A FALSE POSITIVE OF THE IN-SCOPE TEST, and reported rather than silently ' +
      'removed from the denominator.',
  },
  'the-stat-belongs-to-a-ward-or-a-minion': {
    bucket: 'not-actually-in-scope',
    definition:
      'The health or resistance word belongs to a ward, a minion or a structure, not to either ' +
      'champion — Deep Ward\'s "+1 extra Health", Hullbreaker\'s armor for allied siege minions. ' +
      'Same family as §37.4 defect 7, where the pronoun "its" was read as the holder.',
  },
  'out-of-scope-before-anything-else': {
    bucket: 'out-of-champion-scope',
    definition:
      'The effect is not damage-relevant at all and is in this census only because a shape test ' +
      'found it. Recorded so the population is what the tests find, not what someone thought ' +
      'they should find.',
  },
};

export function bucketOf(className: string): RefusalBucket {
  const entry = REFUSAL_CLASSES[className];
  if (!entry) throw new Error(`no refusal class named "${className}"`);
  return entry.bucket;
}

/** Every gate reason is a class here — a reason with no definition is a count with no meaning. */
export function everyGateReasonHasAClass(reasons: readonly RefusalReason[]): string[] {
  return reasons.filter((r) => !(r in REFUSAL_CLASSES));
}

// ---------------------------------------------------------------------------
// The shape tests for effects the gate never saw
// ---------------------------------------------------------------------------

/**
 * "Grants X equal to a share of Y", and the near neighbours that mean the same thing.
 *
 * "based on" is included because Overlord's Bloodmail writes its conversion that way. "for
 * every" catches Dawncore and Mejai's, which grant per unit of something.
 */
export const SHARE_OF_ANOTHER_STAT = /\bequal to\b|\bfor every\b|\bper 100\b|\bbased on\b/i;

/** A stat MULTIPLIED rather than added to. The `{{as}}` wrapper sits between the verb and the
 *  stat name, so the stat name itself cannot be part of the pattern. */
export const MULTIPLIES_A_STAT =
  /\bincrease[sd]?\s+(?:your|all)\b[^.]{0,120}\bby\s+\d+(?:\.\d+)?%/i;

/**
 * A SHIELD IS GRANTED — and the wiki's own markup is what tells it from the verb.
 *
 * A flat test for the word "shield" fired on 17 effects and only 9 grant one. The other 8 are
 * heal-and-shield-POWER items and "healing and shielding received" amplifiers: Dawncore, Spirit
 * Visage, Staff of Flowing Water, Whispering Circlet, Moonstone Renewer, Immortal Path, and the
 * runes Glacial Augment and Revitalize. Every one of them would have been counted as needing a
 * shield shape it does not need, which inflates a contract request by 89%.
 *
 * The discriminator is in the source: `{{tip|shield}}` with one argument is the NOUN, "a
 * shield"; `{{tip|shield|shielding}}` with two is the VERB, the act of shielding an ally. The
 * rune prose carries no templates at all, so it gets the plain phrase instead.
 */
export const GRANTS_A_SHIELD =
  /\{\{\s*tip\s*\|\s*shield\s*\}\}|\bgains? a shield\b|\bshield that absorbs\b/i;

export const AMPLIFIES_DAMAGE =
  /\bincreased damage\b|\bdeal\s+\d+(?:\.\d+)?%\s+(?:more|increased)\b|\bdamage\s+(?:is\s+)?increased\b|\btake\s+\d+(?:\.\d+)?%\s+(?:less|reduced)\b/i;

/**
 * The damage-relevant stat is a THRESHOLD the effect tests, not one it changes.
 *
 * DELIBERATELY NARROW, and the narrowing cost one member. `\bif you have at least\b` on its own
 * caught Mejai's Soulstealer — "If you have at least 10 stacks, also gain 10% bonus movement
 * speed" — whose PREVIOUS clause grants 5 ability power per stack unconditionally. Mejai's is a
 * stack-scaled stat grant, not a threshold, and calling it out of scope would have dropped a
 * real ability-power source. So the threshold has to be a threshold ON A POOL: the phrasing must
 * be followed by mana or health within the same clause.
 */
export const STAT_IS_A_THRESHOLD =
  /\btransforms? into\b[^.]{0,80}\bat\b[^.]{0,40}\b(?:mana|health)\b|\bif you have at least\b[^.]{0,40}\b(?:mana|health)\b/i;

/** The stat word belongs to a ward, a minion or a structure rather than to a champion. */
export const STAT_BELONGS_TO_A_WARD_OR_MINION =
  /\bwards?\s+(?:gain|are|have)\b|\b(?:siege|super|allied)\s+minions?\b[^.]{0,120}\bgain\b/i;

/** The damage-relevant stat drives a grant of something that is not damage-relevant. */
export const STAT_IS_AN_INPUT_ONLY = /\bability haste\b|\bmovement speed\b/i;
export const GRANTS_REGENERATION = /\b(?:health|mana)\s+regeneration\b/i;
export const SCALES_ON_ELAPSED_TIME = /\bevery\s+\d+\s*min\b|\bper\s+minute\b/i;
/** Restores health, or amplifies healing. Both belong to `Result.sustain`, not to a stat map. */
export const AFFECTS_HEALING =
  /\brestores?\b[^.]{0,40}\bhealth\b|\bheals?\s+you\b|\bheal and shield power\b|\bheals? and shields?\b/i;
/**
 * An always-active grant of a flat number of a damage-relevant stat — the one shape
 * `grants: Record<string, number>` already holds.
 *
 * THE `regeneration` LOOKAHEAD IS LOAD-BEARING. Without it, Guardian's Orb's "15 bonus health
 * regeneration" reads as a grant of 15 bonus HEALTH, which is a different stat and a real
 * number the engine would use.
 */
export const FLAT_STAT_GRANT =
  /\b(?:grants?|gain)\b[^.]{0,20}\{\{as\|\s*\d+(?:\.\d+)?\s+'''(?:bonus|base|total)'''\s+(?:attack damage|health|armor|magic resist)(?!\s*regeneration)/i;

/**
 * Every class blocking one in-scope effect that MODIFIES A STAT and deals no damage.
 *
 * An effect is releasable only when this returns nothing but `flat-stat-grant-nothing-blocks`:
 * adding one shape releases only the effects blocked by that shape ALONE (DATA-SOURCES §41.3,
 * learned the hard way when a predicted release of 19 turned out to be 10).
 *
 * ORDER IS REPORTING ORDER, NOT PRECEDENCE. Every class that applies is returned, because an
 * effect blocked twice is released by neither shape on its own and the count has to show it.
 */
export function statModifierBlockers(row: EffectClassification): string[] {
  const out: string[] = [];
  const text = row.text;
  if (STAT_IS_A_THRESHOLD.test(text)) out.push('the-stat-is-a-threshold-not-a-grant');
  if (STAT_BELONGS_TO_A_WARD_OR_MINION.test(text)) {
    out.push('the-stat-belongs-to-a-ward-or-a-minion');
  }
  if (row.conditional) out.push('stat-grant-is-conditional');
  if (SHARE_OF_ANOTHER_STAT.test(text)) out.push('stat-grant-is-a-share-of-another-stat');
  if (MULTIPLIES_A_STAT.test(text)) out.push('stat-grant-multiplies-a-stat');
  if (GRANTS_A_SHIELD.test(text)) out.push('grants-a-shield');
  if (AMPLIFIES_DAMAGE.test(text)) out.push('amplifies-damage-or-reduces-it');
  if (out.length > 0) return out;

  // Nothing structural blocks it. The remainder is small enough to have been read one at a
  // time, and each of these five classes has one or two members named in its definition.
  if (FLAT_STAT_GRANT.test(text)) out.push('flat-stat-grant-nothing-blocks');
  if (SCALES_ON_ELAPSED_TIME.test(text)) out.push('scales-on-elapsed-time');
  if (out.length === 0 && AFFECTS_HEALING.test(text)) out.push('grants-healing-not-a-stat');
  if (out.length === 0 && GRANTS_REGENERATION.test(text)) out.push('regeneration-is-not-modelled');
  if (out.length === 0 && STAT_IS_AN_INPUT_ONLY.test(text)) {
    out.push('the-damage-relevant-stat-is-an-input-not-an-output');
  }
  return out;
}
