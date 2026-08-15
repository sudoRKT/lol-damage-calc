// DOES THE OTHER SOURCE SAY WHOSE STAT IT IS?
//
// DATA-SOURCES §37.3 measures 82 owner references across item and rune effects that "the source
// never attributes", and §37.3 calls the 56 effects carrying one **unresolvable** — a property
// of the source, not a worklist. That measurement was taken over the wiki's `Module:ItemData/data`
// alone, because §37.1 established that the wiki governs item effect PROSE.
//
// WHAT THIS FILE MEASURES, AND WHY IT IS NOT THE SAME QUESTION. §12's rule is that authority is
// established per FIELD, by evidence, and never inherited from a neighbouring field. "How the
// effect is worded" and "whose stat it reads" are two fields. §37.1's evidence was about the
// first: Data Dragon's wording had drifted from the wiki's. It says nothing about which source
// is right when one of them ATTRIBUTES a stat and the other is silent.
//
// And Data Dragon does attribute them. Its Black Cleaver description reads "the target's Armor",
// which is the reading §16 uses as its own worked example of a stat the wiki leaves bare — and
// §16 uses Black Cleaver precisely to prove that guessing the holder would read backwards.
//
// THIS FILE RESOLVES NOTHING. It counts, names the effects, and quotes the words. Deciding
// whether a Data Dragon attribution outranks wiki silence is a source-policy decision for the
// lead (DATA-SOURCES §15), not something a fetch script may settle by measuring it.
//
// Pure: no network, no filesystem. Tested by effect-values.test.ts.

/**
 * DOES DATA DRAGON RESTATE THE SAME NUMBERS?
 *
 * A second source is the only cross-check available for an item passive value — in-client
 * verification is not available on this project (CLAUDE.md), and no worked example exists for
 * "Wit's End deals 45". So each stored number is looked for in Data Dragon's own item
 * description, which is written by Riot independently of the wiki.
 *
 * IT IS NOT AVAILABLE FOR MOST OF THEM, AND THAT IS THE RESULT. Data Dragon's current
 * descriptions state the effect without its numbers — Wit's End reads "Attacks deal bonus magic
 * damage", with no 45 anywhere. Where the numbers ARE present they agree, and where they are
 * absent nothing is claimed. Absence is reported as absence, never as agreement.
 */
export function ddragonRestatesNumbers(
  prose: string,
  numbers: number[],
): { restated: number[]; absent: number[] } {
  const restated: number[] = [];
  const absent: number[] = [];
  for (const n of numbers) {
    const re = new RegExp(`(^|[^0-9.])${String(n).replace('.', '\\.')}([^0-9]|$)`, 'g');
    let found = false;
    let m: RegExpExecArray | null;
    while ((m = re.exec(prose)) !== null) {
      // PROXIMITY IS PART OF THE TEST, and it is not fussiness. Terminus deals 30 (+10% bonus
      // AD) (+10% AP), and Data Dragon's description happens to contain "10% Armor Penetration"
      // from a different passive. A bare presence test called that corroboration of the ratio.
      // A coincidence counted as agreement is worse than no cross-check, because it reads as
      // evidence.
      const window = prose.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
      if (/\bdamage\b/i.test(window)) {
        found = true;
        break;
      }
    }
    (found ? restated : absent).push(n);
  }
  return { restated, absent };
}

/** How each of the ten owner-required stats is written in Data Dragon's display prose. */
const POOL_PHRASING: Record<string, string> = {
  bonusHP: 'bonus health',
  maxHP: 'max(?:imum)? health',
  currentHP: 'current health',
  missingHP: 'missing health',
  bonusArmor: 'bonus armou?r',
  armor: 'armou?r',
  bonusMagicResist: 'bonus magic resist(?:ance)?',
  magicResist: 'magic resist(?:ance)?',
  maxMana: 'max(?:imum)? mana',
  currentMana: 'current mana',
};

const HOLDER_WORDS = /^(your|his|her|yours)$/i;
const OTHER_WORDS = /^(their|the target's|target's|enemy's|enemies')$/i;

/** Every possessive either detector recognises, in one place so the two cannot drift apart. */
const POSSESSIVES = "(your|yours|his|her|their|the target's|target's|enemy's|enemies')";

export interface OwnerCrossCheck {
  stat: string;
  /** What Data Dragon says, quoted — e.g. "the target's Armor". */
  says: string;
  /** Which champion Data Dragon's wording names. */
  ddragonSays: 'holder' | 'other champion';
}

/**
 * Strip Data Dragon's display HTML to words, dropping the `<stats>` block.
 *
 * The stats block is the item's flat stat list ("45 Magic Resist"), not its effect prose. Left
 * in, it matches a stat name that has nothing to do with the effect.
 */
export function ddragonEffectProse(description: string): string {
  return description
    .replace(/<stats>[\s\S]*?<\/stats>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does Data Dragon's prose attribute `stat` to somebody?
 *
 * Only a POSSESSIVE counts, exactly as `effect-census.ts` requires for the wiki. "its" is
 * deliberately absent for the same reason it is there: World Atlas's "a minion below 30% of its
 * maximum health" is neither champion.
 */
export function ddragonAttributes(prose: string, stat: string): OwnerCrossCheck | null {
  const phrasing = POOL_PHRASING[stat];
  if (!phrasing) return null;
  const re = new RegExp(
    `\\b${POSSESSIVES}\\s+` + `(?:current |max(?:imum)? |bonus |missing |total )?(?:${phrasing})\\b`,
    'i',
  );
  const match = re.exec(prose);
  if (!match) return null;
  const possessive = /^(the target's|target's|enemies'|enemy's|their|your|yours|his|her)/i
    .exec(match[0])?.[0]
    ?.trim();
  if (!possessive) return null;
  const normalised = possessive.replace(/^the\s+/i, '');
  return {
    stat,
    says: match[0],
    ddragonSays: HOLDER_WORDS.test(normalised)
      ? 'holder'
      : OTHER_WORDS.test(normalised)
        ? 'other champion'
        : 'other champion',
  };
}

/**
 * THE SAME QUESTION ASKED LOOSELY, AND ITS ANSWER IS A CANDIDATE, NEVER AN ATTRIBUTION.
 *
 * `ddragonAttributes` requires the possessive to sit directly against the stat phrase, give or
 * take one of five qualifiers. That is the right rule for something that DECIDES an owner — but
 * it means a single interposed word hides a reference the source really does attribute, and one
 * did: Overlord's Bloodmail reads **"based on your percent missing Health"**, and "percent" was
 * enough for the strict detector to report nothing while the source plainly says "your".
 *
 * So this reports what the strict one cannot see: a possessive, then one to three words that are
 * not themselves a possessive, then the stat. **It resolves nothing.** Its output is a list of
 * sentences for a person to read, exactly as CLAUDE.md requires — widening the strict detector
 * instead would have decided references nobody had read, which is the move that rule forbids.
 *
 * MEASURED OVER ALL 209 ITEMS on 2026-08-15: it finds ONE reference the strict detector misses,
 * and that one is Overlord's Bloodmail [pass2], now read and adopted. A hit that is not in the
 * adopted table is an unread candidate and is published as one.
 */
export function ddragonPossessiveNearStat(
  prose: string,
  stat: string,
): { stat: string; says: string; wordsBetween: string } | null {
  const phrasing = POOL_PHRASING[stat];
  if (!phrasing) return null;
  // `\w+` three times at most: far enough to cross "percent", short enough that the possessive
  // and the stat are still recognisably in one phrase rather than two clauses.
  const re = new RegExp(`\\b${POSSESSIVES}\\s+((?:\\w+\\s+){1,3})(?:${phrasing})\\b`, 'i');
  const match = re.exec(prose);
  if (!match) return null;
  // A second possessive in between means the phrase has moved on to a different champion's
  // stat, and joining them would attribute one champion's stat to another.
  const between = match[2]!.trim();
  if (new RegExp(`\\b${POSSESSIVES}\\b`, 'i').test(between)) return null;
  return { stat, says: match[0].replace(/\s+/g, ' ').trim(), wordsBetween: between };
}
