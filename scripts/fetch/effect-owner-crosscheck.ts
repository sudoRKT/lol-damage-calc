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
    `\\b(your|yours|his|her|their|the target's|target's|enemy's|enemies')\\s+` +
      `(?:current |max(?:imum)? |bonus |missing |total )?(?:${phrasing})\\b`,
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
