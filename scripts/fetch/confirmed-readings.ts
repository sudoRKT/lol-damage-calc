// THE POPULATION A PERSON HAS READ — and the only population either correction is applied to.
//
// WHY THIS FILE EXISTS. Two normalisers were found on 2026-08-15 to be deleting facts the
// sources DO state (DATA-SOURCES §37, `normaliser-sweep.ts`):
//
//   1. `stripHtml` deletes Data Dragon's tag NAMES, and First Strike states its damage type
//      nowhere else — `<truedamage>7%</truedamage> extra <truedamage> damage</truedamage>`.
//   2. `plainText` deletes named template arguments, and the wiki's `type=` argument states
//      WHICH stat a progression reads and, sometimes, WHOSE.
//
// Neither finding licenses a RULE. Measured live on 2026-08-15, three texts across all 62 runes
// and all 209 items state a type only in markup, and in TWO of them the tag is a colour on a
// stat grant rather than a damage type (Hubris tags "12 Attack Damage", Staff of Flowing Water
// tags "40 Ability Power"). Reading the tag as the type would be wrong two times in three.
//
// And the `type=` argument is worse, because the two readings look identical:
//
//   Kraken Slayer  `type=target's missing health`  — the effect DAMAGES, so "target" is the enemy
//   Locket         `type=target's level`           — the effect SHIELDS, so "target" is an ALLY
//
// One regular expression matches both. Attributing the second to the enemy champion would scale
// an item off the wrong champion's level, and in a real matchup that gap is routinely five levels.
//
// So this file is the CONFIRMED POPULATION, per CLAUDE.md: a detector proposes, a person
// confirms, and storage is gated on what the person read. An entry that trips a detector and is
// NOT here is reported for someone to read, never attributed.
//
// Every entry records what the source says verbatim, what a person concluded, and — where the
// entry corrects something already published — what the published file said before.
//
// Pure: no network, no filesystem. Tested by confirmed-readings.test.ts.

// ---------------------------------------------------------------------------------------------
// 1. Damage types stated ONLY inside Data Dragon markup.
// ---------------------------------------------------------------------------------------------

export interface ConfirmedMarkupReading {
  /** Rune or item name, as both censuses record it. */
  subject: string;
  source: 'rune' | 'item';
  /** Data Dragon id, so the match never rests on a name. */
  id: number;
  /** Effect key: 'rune' for runes, the module key for items. */
  key: string;
  /** The type the tag asserts, confirmed by a person as a DAMAGE type and not a colour. */
  type: 'physical' | 'magic' | 'true';
  /** Verbatim raw markup, so nothing here rests on a paraphrase. */
  markup: string;
  /** What `stripHtml` leaves — i.e. what every downstream reader saw instead. */
  strippedReads: string;
  /** The other source's wording for the same fact, verbatim. */
  otherSourceSays: string;
  /** Where the person's reading is recorded, in full, with its evidence. */
  confirmedBy: string;
  confirmedOn: string;
  /**
   * What the CENSUS should say once the correction is applied, and why that verdict and not a
   * stronger one. `candidate` is deliberate: the type is settled, the VALUE is not — "7% of
   * post-mitigation damage dealt" is not a figure any parser here can read.
   */
  censusDamageVerdict: 'instance' | 'candidate';
  censusReachReason: string;
  /** What each published file said before this correction. Kept so the record is auditable. */
  publishedBefore: { file: string; field: string; was: string }[];
}

export const CONFIRMED_MARKUP_READINGS: ConfirmedMarkupReading[] = [
  {
    subject: 'First Strike',
    source: 'rune',
    id: 8369,
    key: 'rune',
    type: 'true',
    markup:
      'causing you to deal <truedamage>7%</truedamage> extra <truedamage> damage</truedamage> ' +
      'against champions',
    strippedReads: 'causing you to deal 7% extra damage against champions',
    otherSourceSays:
      'wiki Template:Rune data First Strike — "causing all of your post-mitigation damage dealt ' +
      'against champions to deal 7% bonus true damage"',
    confirmedBy:
      'public/data/rune-contested.json, finding "First Strike", verdict ' +
      '"not-contested-markup-stripped". It carries both sources verbatim with their edit dates, ' +
      'and Riot\'s own launch note (V11.23) saying "bonus true damage", with every later note ' +
      'moving only the percentage: 10% → 9% → 8% → 7% → 8% → 7%.',
    confirmedOn: '2026-08-15',
    censusDamageVerdict: 'candidate',
    censusReachReason:
      'the damage type is stated by Data Dragon markup and by the wiki in words; the VALUE is 7% ' +
      'of post-mitigation damage already dealt, which no parser here can read — a person must.',
    publishedBefore: [
      {
        file: 'public/data/effect-census.json',
        field: 'effects[First Strike].damage / .inScope / .reach',
        was: 'damage "none", inScope false, reach "R1" ("a labelled line states the value" — the cooldown line)',
      },
      {
        file: 'public/data/rune-census.json',
        field: 'counts.dealsDamage.sourcesDisagree',
        was: '["First Strike"]',
      },
      {
        file: 'public/data/rune-census.json',
        field: 'counts.dealsDamage.byDataDragon / .bothAgree',
        was: '15 / 15',
      },
      {
        file: 'public/data/rune-census.json',
        field: 'counts.damageTypeOfDamagingRunes.typeNotStatedAtAll.ddragon',
        was: '["First Strike", "Summon Aery"]',
      },
      {
        file: 'public/data/rune-census.json',
        field: 'counts.damageTypeOfDamagingRunes.ddragon',
        was: '{ adaptive 6, true 3, not-stated 2, magic 4, physical 1 }',
      },
      {
        file: 'public/data/rune-census.json',
        field: 'counts.blockers.sources-disagree-on-kind.runes',
        was: '["First Strike"]',
      },
      {
        file: 'public/data/rune-census.json',
        field: 'rows[First Strike].dealsDamage.ddragon / .damageType.ddragon',
        was: 'false / "not-stated"',
      },
    ],
  },
];

/**
 * The other two live hits of the same detector, READ AND REFUSED.
 *
 * They are recorded rather than dropped because they are the reason this is a list and not a
 * rule: two of the three tagged texts do not state a damage type at all.
 */
export const MARKUP_HITS_EXAMINED_AND_REFUSED = [
  {
    subject: 'Hubris',
    source: 'item' as const,
    tag: 'physicalDamage',
    wraps: '12 Attack Damage plus 3 per champion killed',
    why: 'The tag colours a STAT GRANT. Nothing is dealt by the item; the census reads Hubris [pass] as dealing no damage and that reading stands.',
  },
  {
    subject: 'Staff of Flowing Water',
    source: 'item' as const,
    tag: 'magicDamage',
    wraps: '40 Ability Power',
    why: 'The tag colours a stat grant on a heal/shield trigger. Not a damage type.',
  },
];

export function confirmedMarkupReading(
  source: 'rune' | 'item',
  id: number,
  key: string,
): ConfirmedMarkupReading | null {
  return (
    CONFIRMED_MARKUP_READINGS.find((r) => r.source === source && r.id === id && r.key === key) ??
    null
  );
}

// ---------------------------------------------------------------------------------------------
// 2. Whose stat a `type=` argument names.
// ---------------------------------------------------------------------------------------------

/**
 * Who the wiki means by the possessive in a `type=` argument.
 *
 * `holder` and `opponent` are the census's existing verdicts. `ally` is the third, and it exists
 * because three items state "target's" about a champion this engine does not model: the ally
 * being healed or shielded. Folding those into `opponent` because they share a word is exactly
 * the failure CLAUDE.md's variable-hit-count rule was written against.
 */
export type ReadOwner = 'holder' | 'opponent' | 'ally' | 'unstated';

export interface TypeArgumentReading {
  /** Item name, as the census records it. */
  ownerName: string;
  /** Effect key. */
  key: string;
  /** The argument value verbatim, with bold markers removed. Matched exactly. */
  states: string;
  owner: ReadOwner;
  /** The words in the SAME sentence the verdict rests on, quoted from the wiki module. */
  because: string;
  /** Data Dragon's wording for the same effect, or null where it does not describe it. */
  corroboration: string | null;
  readOn: string;
}

/**
 * Every `type=` argument carrying a possessive, read once by a person on 2026-08-15 against the
 * live `Module:ItemData/data` text stored in public/data/effect-census.json.
 *
 * THE READING THAT MATTERS: "target" means whoever the effect APPLIES TO, and the sentence says
 * which champion that is. In two of the five it is the enemy, because the effect damages them.
 * In three it is an ally, because the effect heals or shields them.
 */
export const TYPE_ARGUMENT_READINGS: TypeArgumentReading[] = [
  {
    ownerName: 'Kraken Slayer',
    key: 'pass',
    states: "target's missing health",
    owner: 'opponent',
    because:
      'the argument governs "the next basic attack … to deal bonus physical damage on-hit, ' +
      'increased by …" — the unit hit is the enemy champion.',
    corroboration:
      'Data Dragon item 6672: "Every third Attack deals bonus physical damage On-Hit, increased ' +
      'based on their missing Health." The sources agree.',
    readOn: '2026-08-15',
  },
  {
    ownerName: "Lord Dominik's Regards",
    key: 'pass',
    states: "target's bonus health",
    owner: 'opponent',
    because: 'the sentence ends "increased damage against enemy champions".',
    corroboration:
      'Data Dragon item 3036: "Deal up to 15% bonus damage against champions based on their ' +
      'bonus Health." The sources agree.',
    readOn: '2026-08-15',
  },
  {
    ownerName: 'Locket of the Iron Solari',
    key: 'act',
    states: "target's level",
    owner: 'ally',
    because:
      'the sentence is "Grants you and allied champions within 850 units a shield for …". The ' +
      'shield recipients are the holder and allies; no enemy is in the sentence at all.',
    corroboration:
      'Data Dragon item 3190: "Grant nearby allies a 290 - 360 Shield that decays over 2.5 ' +
      'seconds." Allies, and Data Dragon names no level axis.',
    readOn: '2026-08-15',
  },
  {
    ownerName: "Mikael's Blessing",
    key: 'act',
    states: "target's level",
    owner: 'ally',
    because:
      'the sentence is "Remove all crowd control debuffs … from yourself or the target allied ' +
      'champion and heal the target for …". The source defines "the target" two clauses earlier ' +
      'as the allied champion.',
    corroboration:
      'Data Dragon item 3222: "Remove all crowd control debuffs … from an ally champion and ' +
      'restore 100 - 250 Health."',
    readOn: '2026-08-15',
  },
  {
    ownerName: 'Redemption',
    key: 'act',
    states: "target's level",
    owner: 'ally',
    because:
      'the argument sits inside "Allies within the area are healed for …", and the enemy clause ' +
      'that follows carries its own separate figure ("enemy champions within take 10% of ' +
      "target's maximum health as true damage\"), which the census already reads as the " +
      'opponent\'s. One sentence, two targets, and only the second is the enemy.',
    corroboration:
      'Data Dragon item 3107: "Restore 150 - 350 Health to allied units and deal 10% max Health ' +
      'true damage to enemy champions after 2.5 seconds." The split is stated by both sources.',
    readOn: '2026-08-15',
  },
  {
    ownerName: 'Dream Maker',
    key: 'pass',
    states: 'your level',
    owner: 'holder',
    because:
      'the possessive is "your" and the holder is the item\'s owner, even though the bubbles are ' +
      'granted to an ally: the progression reads the GRANTER\'s level, which is what the source says.',
    corroboration: null,
    readOn: '2026-08-15',
  },
  {
    ownerName: 'Solstice Sleigh',
    key: 'pass',
    states: 'your level',
    owner: 'holder',
    because:
      'the possessive is "your", in "causes you and the most wounded allied champion … to gain … ' +
      'bonus health".',
    corroboration: null,
    readOn: '2026-08-15',
  },
];

export function typeArgumentReading(
  ownerName: string,
  key: string,
  states: string,
): TypeArgumentReading | null {
  return (
    TYPE_ARGUMENT_READINGS.find(
      (r) => r.ownerName === ownerName && r.key === key && r.states === states,
    ) ?? null
  );
}
