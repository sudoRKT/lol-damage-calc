// A CENSUS of item and rune effects — a measurement, not a harvest.
//
// Nothing here produces a damage number or a curated value. It counts what the effect
// population consists of, so the harvesting work can be sized against observed numbers
// instead of an estimate. Every count it produces carries its own definition, because
// "a count without a definition is not a count" (DATA-SOURCES §19).
//
// WHAT IS COUNTED, AND AGAINST WHAT
//
//  - Items: the 209 distinct classic Summoner's Rift items of DATA-SOURCES §5 — the
//    corrected pool, AFTER the `id < 200000` cutoff. NOT 222; 222 is the count of distinct
//    names the BROKEN three-part filter leaves, before the cutoff (§5, "The corrected pool
//    is 209 distinct items — NOT 222").
//  - An ITEM EFFECT is one keyed entry under an item's `effects` table in
//    `Module:ItemData/data` — `pass`, `pass2`, `pass3`, `act` or `consume`. Its text is
//    `description`, plus `description2`/`description3` where present, joined; those are
//    rider clauses on the same effect, not separate effects.
//  - Runes: all 62 runes of `runesReforged.json` (§6). A RUNE EFFECT is one rune, and its
//    text is `longDesc` with HTML stripped. Stat shards are NOT here: they appear in no
//    source at all (§7) and are hand-entry.
//
// Pure: no network, no filesystem. Tested by effect-census.test.ts.

import { crossReferenceTarget, findBlocks, plainText, type Block } from './effect-text.ts';

// ---------------------------------------------------------------------------
// The population
// ---------------------------------------------------------------------------

export interface EffectRecord {
  source: 'item' | 'rune';
  /** Item name or rune name. */
  ownerName: string;
  /** Data Dragon item id, or rune id. */
  id: number;
  /** 'pass' / 'pass2' / 'pass3' / 'act' / 'consume' for items; 'rune' for runes. */
  key: string;
  /** The effect's own name where the source gives one ("Carve"), else null. */
  effectName: string | null;
  /** Wikitext for items; HTML-stripped prose for runes. */
  text: string;
}

// ---------------------------------------------------------------------------
// Vocabulary. Every list below is stated in full so a reader can audit what a count means.
// The damage vocabulary deliberately mirrors `scripts/extract/prose.ts`, which was tuned
// against 937 ability pages; it is restated rather than imported because these are separate
// partitioned areas and one must not break the other.
// ---------------------------------------------------------------------------

/** "physical damage", "bonus magic damage", "true damage". */
const DAMAGE_NOUN = /\b(physical|magic|true|adaptive)\s+damage\b/i;

/**
 * Text about damage that is not an instance of damage being dealt. The first four are
 * lifted from the ability path's `NOT_A_DAMAGE_ROW`; the rest are item/rune-specific and
 * were each observed in the live corpus.
 */
// `critical strike` is NOT in this list, and that is deliberate. Adding it disqualified
// Essence Reaver — whose run reads `{{as|(+ … based on critical strike chance)}}` beside a
// real `{{as|'''bonus''' physical damage}}` — so a genuine damage instance vanished because
// one of its ratios happens to scale off a crit stat. Two effects were lost that way before
// it was caught. Crit amplification is handled by `increased damage` instead.
const NOT_A_DAMAGE_INSTANCE =
  /damage reduction|damage reduc|damage amp|damage taken|damage cap|increased (?:\w+ )?damage|extra (?:\w+ )?damage|damage dealt as|of bonus damage/i;

/**
 * Verbs that make a value following them a shield, a heal or a restore rather than damage.
 * Looked for in the 80 characters BEFORE a run, because the wiki writes
 * "a {{tip|shield}} that absorbs {{pp|100 to 200}} {{as|physical damage}}" — a run that
 * names damage, carries a number, and deals none (Armored Advance, Chainlaced Crushers).
 */
// VERBS ONLY. The bare noun "shield" was in this list and cost Shield Bash, whose real
// damage line reads "(+15.0% New Shield Amount) bonus adaptive damage" — the noun sat in the
// window and disqualified the instance. "a shield that absorbs …" is still caught, by
// `absorbs`.
const ABSORBS_RATHER_THAN_DEALS =
  /\b(shielded|shielding|absorbs?|heals?|healing|restores?|restoring|convert|converts|blocks?|reduces?|reduce|reduced|reduction)\b/i;

const ABSORB_LOOKBACK = 80;

/** What may sit between two `{{as}}` blocks for them to still be one figure (§26.3 R1/R2). */
const ADJACENT = /^[\s,]*$/;
const ONE_CONNECTIVE = /^[\s,]*(?:as|of|equal to)[\s,]*$/i;

/** A value the existing parsers can read: a bare number, or one of the wiki value templates. */
const VALUE_TEMPLATE = /\{\{\s*(ap|pp|pplevel|rd|fd|as|g)\s*\|/i;
const BARE_NUMBER = /\d/;

/**
 * The ten stats DATA-SOURCES §16 refuses without an owner, as item and rune prose writes
 * them. Order matters: the longest phrasing is tried first, so "bonus health" is not
 * counted as a bare "health".
 */
export const OWNER_REQUIRED_PHRASES: { stat: string; pattern: RegExp }[] = [
  { stat: 'bonusHP', pattern: /\bbonus\s+health\b/gi },
  { stat: 'maxHP', pattern: /\b(?:maximum|max)\s+health\b/gi },
  { stat: 'currentHP', pattern: /\bcurrent\s+health\b/gi },
  { stat: 'missingHP', pattern: /\bmissing\s+health\b/gi },
  { stat: 'bonusArmor', pattern: /\bbonus\s+armou?r\b/gi },
  { stat: 'armor', pattern: /\barmou?r\b/gi },
  {
    stat: 'bonusMagicResist',
    pattern: /\bbonus\s+magic\s+resist(?:ance)?\b/gi,
  },
  { stat: 'magicResist', pattern: /\bmagic\s+resist(?:ance)?\b/gi },
  { stat: 'maxMana', pattern: /\b(?:maximum|max|bonus)\s+mana\b/gi },
  { stat: 'currentMana', pattern: /\bcurrent\s+mana\b/gi },
];

/**
 * A bare `health` or `mana` with no qualifier. Counted SEPARATELY from the ten stats,
 * because "restores 4 health" names an amount, not a pool, and folding the two together is
 * how a count stops meaning anything.
 */
const BARE_POOL = /\b(health|mana)\b/gi;

/**
 * Words that turn a stat name into a DIFFERENT stat, so the match is not one of the ten.
 *
 * "bonus health regeneration" is not the bonus-health pool, "10% armor penetration" is not
 * armor, and "bonus mana regeneration" is not maximum mana. Found by auditing the first run
 * of this census: 7 of the 98 item references it produced were one of these three compounds,
 * every one of them counted as an owner-bearing pool reference it is not. The check runs over
 * the whole population, not over the items that surfaced it.
 */
const NOT_THE_SAME_STAT = /^\s*(regeneration|regen|penetration|pen\b|shard|from items)/i;

/**
 * Possessives that STATE the stat belongs to the item's holder / the rune's owner.
 *
 * `its` is deliberately ABSENT. It reads as the holder about as often as it reads as a third
 * party: World Atlas says "a minion below 30% of its maximum health", which is neither
 * champion. An ambiguous pronoun is not a source statement.
 */
const HOLDER_POSSESSIVE =
  /\b(your|yours|you|his|her|the holder'?s?|holder'?s|wielder'?s|yourself)\s*$/i;

/** Possessives that STATE the stat belongs to the other champion. */
const OPPONENT_POSSESSIVE =
  /\b(target'?s|targets'|the target'?s|enemy'?s|enemies'?|their|them|victim'?s)\s*$/i;

/**
 * A verb whose implied subject is the holder — "gain 10 Armor", "grants bonus health".
 *
 * This is COUNTED AND NOT ACTED ON. It is the same shape of argument DATA-SOURCES §16
 * rejected for abilities: a convention that holds until the one case where it does not, and
 * that case then ships a confident wrong number. The count exists so the size of the
 * judgement is visible to whoever decides it — it is not a licence to resolve it here.
 */
const HOLDER_VERB = /\b(gain|gains|grant|grants|granting|increase|increases)\b[^.]{0,30}$/i;

const POSSESSIVE_LOOKBACK = 40;

/**
 * Stats whose value changes a damage number or the survival verdict. Movement speed,
 * attack speed, ability haste, cooldowns, tenacity, gold and vision are NOT here: the
 * engine models sequence, not elapsed time (CLAUDE.md), so nothing derived from a rate can
 * reach a damage figure.
 */
const DAMAGE_RELEVANT_STAT =
  /\b(attack damage|\bAD\b|ability power|\bAP\b|lethality|armou?r penetration|magic penetration|armou?r|magic resist(?:ance)?|health|mana|critical strike|crit(?:ical)? (?:chance|damage)|life ?steal|omnivamp|spell ?vamp|heal and shield power|adaptive force|damage amp|increased damage|damage reduction)\b/i;

/** Any stat at all — the broad reading of SPECIFICATION §4's "a stat modification". */
const ANY_STAT =
  /\b(attack damage|\bAD\b|ability power|\bAP\b|lethality|armou?r|magic resist(?:ance)?|health|mana|movement speed|move speed|attack speed|ability haste|haste|tenacity|critical strike|crit|life ?steal|omnivamp|slow resist|heal and shield power|adaptive force|regeneration|size|gold|experience)\b/i;

/** Verbs that mean a stat is being granted, increased or reduced. */
const STAT_CHANGE_VERB =
  /\b(grants?|granting|gain|gains?|gaining|increase[sd]?|increasing|reduce[sd]?|reducing|reduction|inflicts?|steals?|converts?|bonus|empower(?:s|ed|ing)?|amplif\w*)\b/i;

/**
 * A stated trigger or state the effect depends on. An effect with none of these applies
 * simply because the item is held — SPECIFICATION §5 calls that "always-active", and it can
 * be baked into a resolved stat block instead of exposed as a toggle.
 */
const TRIGGER =
  /(^|[.;]\s*)(dealing|deal |taking|take |hitting|hit |striking|killing|damaging|damage to|scoring|when |while |after |upon |if |against |each time|every time|immobilizing|slowing|consuming|casting|using|basic attacks?|your next|the next|becoming|entering|for each|per )/i;
const STATEFUL = /\b(stacks?|stacking|for \d|\d+ second|cooldown|charges?|until|below \d|above \d|per \d)\b/i;

// ---------------------------------------------------------------------------
// Per-effect classification
// ---------------------------------------------------------------------------

export type Reach = 'R1' | 'R2' | 'H1' | 'H2';
export type OwnerVerdict = 'holder' | 'opponent' | 'unstated';

/** HOW the owner was established — so a reader can weigh the verdict, not just read it. */
export type OwnerEvidence =
  /** A possessive sits directly before the stat: "of the target's maximum health". */
  | 'possessive'
  /** A possessive governs a coordinated pair: "increase your Armor and Magic Resist". */
  | 'coordination'
  /** Nothing states it. A verb may IMPLY the holder; see `verbImpliesHolder`. */
  | 'none';

export interface OwnerRef {
  stat: string;
  /** The words matched, e.g. "bonus health". */
  phrase: string;
  owner: OwnerVerdict;
  evidence: OwnerEvidence;
  /**
   * True when the only thing pointing at an owner is a verb whose subject is implied
   * ("gain 10 Armor"). `owner` is still 'unstated'. Counted, never acted on — see
   * HOLDER_VERB.
   */
  verbImpliesHolder: boolean;
  /** The text immediately around the match, so a reader can check the verdict. */
  quote: string;
  /** True when the phrase sits inside an `{{as|…}}` block (items only). */
  inAsBlock: boolean;
}

export interface EffectClassification extends EffectRecord {
  /** Points at another item's effect ("=>Plated Steelcaps") rather than stating one. */
  crossReferenceTo: string | null;
  /** 'instance' = the source states damage AND its value. 'candidate' = a person must read it. */
  damage: DamageVerdict;
  modifiesStat: boolean;
  modifiesDamageRelevantStat: boolean;
  conditional: boolean;
  /** In scope for the engine at all: damage instance OR damage-relevant stat modification. */
  inScope: boolean;
  reach: Reach;
  /** Why the reach verdict came out as it did, in plain English. */
  reachReason: string;
  ownerRefs: OwnerRef[];
  /** Bare "health"/"mana" mentions with no pool qualifier. Counted, never merged in. */
  barePoolMentions: number;
}

/** Group `{{as|…}}` blocks into runs, the way the ability prose path does (§26.3).
 *  Exported so `effect-values.ts` reads the SAME runs the census counted — two implementations
 *  of "what is one figure" are two chances to disagree about which effects were measured. */
export function asRuns(text: string): { blocks: Block[]; connective: boolean }[] {
  const blocks = findBlocks(text, 'as');
  const runs: { blocks: Block[]; connective: boolean }[] = [];
  for (const block of blocks) {
    const last = runs.at(-1);
    const previous = last?.blocks.at(-1);
    if (previous) {
      const between = text.slice(previous.end, block.start);
      if (ADJACENT.test(between)) {
        last!.blocks.push(block);
        continue;
      }
      if (ONE_CONNECTIVE.test(between)) {
        last!.blocks.push(block);
        last!.connective = true;
        continue;
      }
    }
    runs.push({ blocks: [block], connective: false });
  }
  return runs;
}

function hasValue(body: string): boolean {
  return VALUE_TEMPLATE.test(body) || BARE_NUMBER.test(plainText(body));
}

/**
 * A verb that makes the damage phrase after it damage BEING DEALT, rather than the trigger
 * that fires the effect.
 *
 * This distinction is the single largest defect this census found in its own first run.
 * "Dealing {{as|physical damage}} to an enemy champion applies a stack of Carve" (Black
 * Cleaver) and "Dealing {{as|physical damage}} grants you movement speed" (Black Cleaver
 * again) both name a damage type and deal none — the damage is the CONDITION. 20 of 85 item
 * effects flagged as dealing damage in the first run were this shape or the shield shape.
 */
const DEALT_NOT_TRIGGERED = /\b(deal|deals|dealt|to deal|inflict|inflicts|to take|to damage|explode|explodes|burn|burns|strikes?)\b/i;

/**
 * The SAME gerund is a trigger at the head of a clause and a result inside one.
 *
 * "Dealing physical damage to an enemy champion applies a stack" — trigger, no damage.
 * "sets champions on fire dealing 20 - 40 bonus magic damage"    — result, real damage.
 *
 * Found by auditing this census's own output: Scorch and Summon Aery both read as dealing no
 * damage because the only verb attached to their number is a mid-clause gerund. Position is
 * the whole distinction, so it is tested rather than the word.
 */
function midClauseGerundDealsDamage(sentence: string): boolean {
  // EVERY gerund is checked, not the first. Summon Aery reads "Damaging enemy champions …
  // sends Aery to them, dealing 10 - 50" — the first gerund is the trigger and the second is
  // the damage, and stopping at the first lost the rune entirely.
  const re = /\b(dealing|damaging|burning|inflicting)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sentence)) !== null) {
    if (/\S/.test(sentence.slice(0, match.index))) return true;
  }
  return false;
}

/**
 * True when the word "damage" in this sentence is governed by an absorb/heal/reduce verb
 * rather than by a dealing verb.
 *
 * Position matters, and testing the whole sentence does not work: Redemption's one sentence
 * both HEALS allies and DEALS true damage, and Eclipse both deals damage and grants a shield.
 * Testing the sentence flatly dropped four real damage instances. The window is 30 characters
 * back from the word "damage" itself — the span a governing verb actually occupies.
 */
/**
 * Finite verbs that make the quantity after them damage being dealt or taken. Separate from
 * `DEALT_NOT_TRIGGERED` because it includes "take/takes", which is a dealing verb in
 * "enemy champions within take 10% of target's maximum health as true damage" (Redemption)
 * and a TRIGGER in "Taking magic damage from champions grants you a shield" (Armored
 * Advance). The difference is the gerund, so the gerund forms are excluded here.
 */
const FINITE_DAMAGE_VERB = /\b(deals?|dealt|inflicts?|takes?|receives?|suffers?|strikes?)\b/gi;

/**
 * Does an absorb/heal/reduce verb govern this window, or has a dealing verb taken over since?
 *
 * A flat "does the window contain 'heal'" test loses Redemption, whose single sentence heals
 * allies and then deals true damage to enemies. Comparing the LAST occurrence of each keeps
 * both readings: whichever verb is nearer the quantity is the one governing it.
 */
function absorbGovernsWindow(window: string): boolean {
  const lastIndexOf = (re: RegExp): number => {
    const copy = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let last = -1;
    let match: RegExpExecArray | null;
    while ((match = copy.exec(window)) !== null) last = match.index;
    return last;
  };
  const absorb = lastIndexOf(ABSORBS_RATHER_THAN_DEALS);
  if (absorb === -1) return false;
  return lastIndexOf(FINITE_DAMAGE_VERB) < absorb;
}

function absorbGovernsTheDamage(sentence: string): boolean {
  let governed = 0;
  let total = 0;
  const re = /\bdamage\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sentence)) !== null) {
    total++;
    const window = sentence.slice(Math.max(0, match.index - 30), match.index);
    if (absorbGovernsWindow(window)) governed++;
  }
  return total > 0 && governed === total;
}

export type DamageVerdict =
  /** The source wraps a damage type together with a value. Machine-readable. */
  | 'instance'
  /** The source is about damage but does not state a value the way it states an instance.
   *  A person must read the sentence to say whether damage is dealt and how much. */
  | 'candidate'
  /** No damage. */
  | 'none';

/** Items: a damage instance is an `{{as}}` run that names damage AND carries a number. */
function classifyItemDamage(text: string): {
  verdict: DamageVerdict;
  reach: Reach | null;
  why: string;
} {
  const runs = asRuns(text);
  for (const run of runs) {
    const whole = plainText(run.blocks.map((b) => b.body).join(' '));
    if (!DAMAGE_NOUN.test(whole)) continue;
    if (NOT_A_DAMAGE_INSTANCE.test(whole)) continue;
    const before = text.slice(
      Math.max(0, run.blocks[0]!.start - ABSORB_LOOKBACK),
      run.blocks[0]!.start,
    );
    if (absorbGovernsWindow(plainText(before))) continue;
    // THE VALUE REQUIREMENT IS WHAT SEPARATES AN INSTANCE FROM A TRIGGER. A trigger phrase
    // never carries a number; "Deal {{as|15 magic damage}}" always does.
    if (!run.blocks.some((b) => hasValue(b.body))) continue;
    return {
      verdict: 'instance',
      reach: run.connective ? 'R2' : 'R1',
      why: run.connective
        ? 'an {{as}} run joined by one bounded connective names the damage and carries its value'
        : 'adjacent {{as}} blocks name the damage and carry its value',
    };
  }

  // Nothing structural. Is the source nonetheless talking about damage it deals?
  const flat = plainText(text);
  const sentences = flat.split(/(?<=[.;])\s+/);
  for (const sentence of sentences) {
    if (!DAMAGE_NOUN.test(sentence) && !/\bdamage\b/i.test(sentence)) continue;
    if (NOT_A_DAMAGE_INSTANCE.test(sentence)) continue;
    if (!DEALT_NOT_TRIGGERED.test(sentence) && !midClauseGerundDealsDamage(sentence)) continue;
    if (absorbGovernsTheDamage(sentence)) continue;
    return {
      verdict: 'candidate',
      reach: BARE_NUMBER.test(sentence) ? 'H1' : 'H2',
      why: BARE_NUMBER.test(sentence)
        ? 'damage and a number sit in one sentence with nothing structural joining them — a person must read it'
        : 'the source says damage is dealt and states no value for it in this text',
    };
  }
  return { verdict: 'none', reach: null, why: '' };
}

/** Runes: `longDesc` has no wrappers, but it does have `Label: value` lines. */
const RUNE_LABEL_LINE = /(^|\s)([A-Z][A-Za-z' -]{2,30})\s*:\s*([^:]*?\d[^:]*?)(?=(?:[A-Z][A-Za-z' -]{2,30}\s*:)|$)/g;

export function runeLabelledLines(text: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  RUNE_LABEL_LINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RUNE_LABEL_LINE.exec(text)) !== null) {
    out.push({ label: match[2]!.trim(), value: match[3]!.trim() });
  }
  return out;
}

function classifyRuneDamage(text: string): {
  verdict: DamageVerdict;
  reach: Reach | null;
  why: string;
} {
  const labelled = runeLabelledLines(text);
  // The label must BE a damage label, not merely mention damage. "Cooldown for damage
  // restoration: 8s" (Presence of Mind) mentions it and states a cooldown — reading that as
  // a damage value would have handed a mana rune an 8-point damage instance.
  const damageLabel = labelled.find(
    (l) =>
      /damage$/i.test(l.label.trim()) &&
      !/cooldown|heal|shield|restor/i.test(l.label) &&
      !NOT_A_DAMAGE_INSTANCE.test(l.label),
  );
  if (damageLabel) {
    return {
      verdict: 'instance',
      reach: 'R1',
      why: `a labelled line states the value: "${damageLabel.label}: ${damageLabel.value.slice(0, 60)}"`,
    };
  }
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    // Data Dragon rune prose sometimes never says the word: Summon Aery reads "sends Aery to
    // them, dealing 10 - 50 based on level" and names no damage type anywhere. The number is
    // stated and the noun is not, which is exactly DATA-SOURCES §26.3's hard case.
    if (!/\bdamage\b/i.test(sentence) && !midClauseGerundDealsDamage(sentence)) continue;
    if (NOT_A_DAMAGE_INSTANCE.test(sentence)) continue;
    if (!DEALT_NOT_TRIGGERED.test(sentence) && !midClauseGerundDealsDamage(sentence)) continue;
    if (absorbGovernsTheDamage(sentence)) continue;
    return {
      verdict: 'candidate',
      reach: BARE_NUMBER.test(sentence) ? 'H1' : 'H2',
      why: BARE_NUMBER.test(sentence)
        ? 'damage and a number sit in one sentence with nothing structural joining them — a person must read it'
        : 'the rune says it deals damage and states no number for it here',
    };
  }
  return { verdict: 'none', reach: null, why: '' };
}

/** Owner verdict for one stat mention, from the words immediately before it. */
function ownerOf(
  flat: string,
  index: number,
): { owner: OwnerVerdict; evidence: OwnerEvidence; verbImpliesHolder: boolean } {
  const before = flat.slice(Math.max(0, index - POSSESSIVE_LOOKBACK), index);
  // Strip trailing filler the possessive may sit behind: "of the target's '''bonus''' health".
  const strip = (s: string) =>
    s.replace(/\b(bonus|maximum|max|current|missing|total|own)\b\s*$/i, '').trimEnd();
  const trimmed = strip(before);

  if (OPPONENT_POSSESSIVE.test(trimmed)) {
    return { owner: 'opponent', evidence: 'possessive', verbImpliesHolder: false };
  }
  if (HOLDER_POSSESSIVE.test(trimmed)) {
    return { owner: 'holder', evidence: 'possessive', verbImpliesHolder: false };
  }

  // Coordination: "increase your Armor and Magic Resist by 3%". The possessive governs both
  // halves of the pair — that is reading the sentence's grammar, not guessing its intent.
  const coordinated = /\band\s*$/i.test(trimmed);
  if (coordinated) {
    const head = strip(trimmed.replace(/\s*and\s*$/i, '').replace(/\b[\w'-]+\s*$/, ''));
    if (OPPONENT_POSSESSIVE.test(head)) {
      return { owner: 'opponent', evidence: 'coordination', verbImpliesHolder: false };
    }
    if (HOLDER_POSSESSIVE.test(head)) {
      return { owner: 'holder', evidence: 'coordination', verbImpliesHolder: false };
    }
  }

  return {
    owner: 'unstated',
    evidence: 'none',
    verbImpliesHolder: HOLDER_VERB.test(trimmed),
  };
}

export function findOwnerRefs(record: EffectRecord): OwnerRef[] {
  const flat = plainText(record.text);
  const asText = new Set(
    record.source === 'item'
      ? findBlocks(record.text, 'as').map((b) => plainText(b.body))
      : [],
  );
  const refs: OwnerRef[] = [];
  const claimed: [number, number][] = [];
  for (const { stat, pattern } of OWNER_REQUIRED_PHRASES) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(flat)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      // A longer phrase already claimed these words ("bonus health" over "health").
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      // "bonus health regeneration" and "armor penetration" are different stats entirely.
      if (NOT_THE_SAME_STAT.test(flat.slice(end))) continue;
      claimed.push([start, end]);
      const phrase = match[0];
      refs.push({
        stat,
        phrase,
        ...ownerOf(flat, start),
        quote: flat.slice(Math.max(0, start - 45), Math.min(flat.length, end + 25)),
        inAsBlock: [...asText].some((t) => t.includes(phrase)),
      });
    }
  }
  return refs.sort((a, b) => flat.indexOf(a.phrase) - flat.indexOf(b.phrase));
}

export function classifyEffect(record: EffectRecord): EffectClassification {
  const crossReferenceTo = crossReferenceTarget(record.text);
  const flat = plainText(record.text);

  const damage =
    crossReferenceTo !== null
      ? { verdict: 'none' as DamageVerdict, reach: null as Reach | null, why: '' }
      : record.source === 'item'
        ? classifyItemDamage(record.text)
        : classifyRuneDamage(record.text);

  const modifiesStat =
    crossReferenceTo === null && ANY_STAT.test(flat) && STAT_CHANGE_VERB.test(flat);
  const modifiesDamageRelevantStat =
    crossReferenceTo === null && DAMAGE_RELEVANT_STAT.test(flat) && STAT_CHANGE_VERB.test(flat);
  const conditional =
    crossReferenceTo === null && (TRIGGER.test(flat) || STATEFUL.test(flat));

  const inScope = damage.verdict !== 'none' || modifiesDamageRelevantStat;

  let reach: Reach;
  let reachReason: string;
  if (crossReferenceTo !== null) {
    reach = 'R1';
    reachReason = `the source states this effect is the one on "${crossReferenceTo}"`;
  } else if (damage.reach) {
    reach = damage.reach;
    reachReason = damage.why;
  } else if (modifiesDamageRelevantStat || modifiesStat) {
    // A stat modification is reachable when the stat and its value are in one wrapper.
    const runs = record.source === 'item' ? asRuns(record.text) : [];
    const structural = runs.find((run) => {
      const whole = plainText(run.blocks.map((b) => b.body).join(' '));
      return ANY_STAT.test(whole) && run.blocks.some((b) => hasValue(b.body));
    });
    if (structural) {
      reach = structural.connective ? 'R2' : 'R1';
      reachReason = 'an {{as}} run names the stat and carries its value';
    } else if (record.source === 'rune' && runeLabelledLines(record.text).length > 0) {
      reach = 'R1';
      reachReason = 'a labelled line states the value';
    } else if (BARE_NUMBER.test(flat)) {
      reach = 'H1';
      reachReason = 'the stat is named and a number is present, but nothing structural joins them';
    } else {
      reach = 'H2';
      reachReason = 'a stat is named and the source states no number for it here';
    }
  } else {
    reach = 'H2';
    reachReason = 'no damage instance and no stat modification this engine models';
  }

  BARE_POOL.lastIndex = 0;
  const bareMatches = flat.match(BARE_POOL) ?? [];
  const ownerRefs = findOwnerRefs(record);
  const barePoolMentions = Math.max(
    0,
    bareMatches.length - ownerRefs.filter((r) => /health|mana/i.test(r.phrase)).length,
  );

  return {
    ...record,
    crossReferenceTo,
    damage: damage.verdict,
    modifiesStat,
    modifiesDamageRelevantStat,
    conditional,
    inScope,
    reach,
    reachReason,
    ownerRefs,
    barePoolMentions,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface CensusTotals {
  effects: number;
  crossReferences: number;
  /** Source states a damage type AND its value together. */
  damageInstances: number;
  /** Source is about damage it deals but does not state the value structurally. */
  damageCandidates: number;
  modifiesStat: number;
  modifiesDamageRelevantStat: number;
  conditional: number;
  alwaysActive: number;
  /**
   * IN SCOPE AS THE MACHINE CLASSIFIES IT, which counts every `candidate` as damaging. The
   * candidate bucket is a deliberate superset (see effect-census-audit.ts), so this figure is an
   * UPPER BOUND, not the population. Use `inScopeAfterAudit` for the real one.
   *
   * These two disagreed silently until 2026-08-13: the shipped census reported inScope 183 while
   * its own hand audit had already ruled 22 of the candidates non-damaging, and the true figure
   * was 168. The audit was attached to the output and never applied to it. Both numbers are now
   * carried explicitly so neither can be mistaken for the other.
   */
  inScope: number;
  outOfScope: number;
  /** Post-audit figures. Present only when `summarise` is given the audit. */
  damagingAfterAudit?: number;
  inScopeAfterAudit?: number;
  outOfScopeAfterAudit?: number;
  statOnlyInScopeAfterAudit?: number;
  conditionalDamagingAfterAudit?: number;
  reach: Record<Reach, number>;
  reachableInScope: number;
  hardInScope: number;
  ownerRefs: number;
  ownerHolder: number;
  ownerOpponent: number;
  ownerUnstated: number;
  /** Of the resolved ones, how many rest on a coordinated possessive rather than a direct one. */
  ownerByCoordination: number;
  /** Of the UNSTATED ones, how many have a verb whose subject implies the holder. Not resolved. */
  unstatedWithHolderVerb: number;
  ownerRefsByStat: Record<string, number>;
  healthPoolRefs: number;
  resistanceAndManaRefs: number;
  barePoolMentions: number;
}

/**
 * @param audit  The hand audit of the `candidate` bucket. When supplied, the post-audit figures
 *               are computed as well. Optional so the machine classification can still be
 *               summarised on its own — but the census output must always pass it, or it ships
 *               an upper bound labelled as a population.
 */
export function summarise(
  rows: EffectClassification[],
  audit?: ReadonlyArray<{ ownerName: string; key: string; dealsDamage: boolean }>,
): CensusTotals {
  const totals: CensusTotals = {
    effects: rows.length,
    crossReferences: 0,
    damageInstances: 0,
    damageCandidates: 0,
    modifiesStat: 0,
    modifiesDamageRelevantStat: 0,
    conditional: 0,
    alwaysActive: 0,
    inScope: 0,
    outOfScope: 0,
    reach: { R1: 0, R2: 0, H1: 0, H2: 0 },
    reachableInScope: 0,
    hardInScope: 0,
    ownerRefs: 0,
    ownerHolder: 0,
    ownerOpponent: 0,
    ownerUnstated: 0,
    ownerByCoordination: 0,
    unstatedWithHolderVerb: 0,
    ownerRefsByStat: {},
    healthPoolRefs: 0,
    resistanceAndManaRefs: 0,
    barePoolMentions: 0,
  };
  const HEALTH = new Set(['maxHP', 'bonusHP', 'currentHP', 'missingHP']);
  for (const row of rows) {
    if (row.crossReferenceTo) totals.crossReferences++;
    if (row.damage === 'instance') totals.damageInstances++;
    if (row.damage === 'candidate') totals.damageCandidates++;
    if (row.modifiesStat) totals.modifiesStat++;
    if (row.modifiesDamageRelevantStat) totals.modifiesDamageRelevantStat++;
    if (row.conditional) totals.conditional++;
    else totals.alwaysActive++;
    if (row.inScope) {
      totals.inScope++;
      if (row.reach === 'R1' || row.reach === 'R2') totals.reachableInScope++;
      else totals.hardInScope++;
    } else {
      totals.outOfScope++;
    }
    totals.reach[row.reach]++;
    totals.barePoolMentions += row.barePoolMentions;
    for (const ref of row.ownerRefs) {
      totals.ownerRefs++;
      totals.ownerRefsByStat[ref.stat] = (totals.ownerRefsByStat[ref.stat] ?? 0) + 1;
      if (ref.owner === 'holder') totals.ownerHolder++;
      else if (ref.owner === 'opponent') totals.ownerOpponent++;
      else totals.ownerUnstated++;
      if (ref.evidence === 'coordination') totals.ownerByCoordination++;
      if (ref.owner === 'unstated' && ref.verbImpliesHolder) totals.unstatedWithHolderVerb++;
      if (HEALTH.has(ref.stat)) totals.healthPoolRefs++;
      else totals.resistanceAndManaRefs++;
    }
  }

  // POST-AUDIT. A `candidate` deals damage only if the hand audit says the sentence does. An
  // `instance` always does. Anything the audit does not cover stays a candidate and is NOT
  // counted as damaging — an unread sentence is not evidence of damage.
  if (audit) {
    const saysDamage = new Set(
      audit.filter((v) => v.dealsDamage).map((v) => `${v.ownerName}|${v.key}`),
    );
    const damaging = (row: EffectClassification): boolean =>
      row.damage === 'instance' ||
      (row.damage === 'candidate' && saysDamage.has(`${row.ownerName}|${row.key}`));

    const inScopeRows = rows.filter((r) => damaging(r) || r.modifiesDamageRelevantStat);
    totals.damagingAfterAudit = rows.filter(damaging).length;
    totals.inScopeAfterAudit = inScopeRows.length;
    totals.outOfScopeAfterAudit = rows.length - inScopeRows.length;
    totals.statOnlyInScopeAfterAudit = inScopeRows.filter((r) => !damaging(r)).length;
    totals.conditionalDamagingAfterAudit = rows.filter((r) => damaging(r) && r.conditional).length;
  }

  return totals;
}
