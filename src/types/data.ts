// Fetched and curated data shapes — the on-disk contract for every data file.
// See DATA-SOURCES.md and the technical-foundation plan §2. LEAD-owned; frozen.

export type DamageType = 'physical' | 'magic' | 'true';

/**
 * A damage type as a RESULT reports it, which needs two arms the data does not.
 *
 * - `'mixed'` — one instance dealt more than one type at once. **13 abilities do this**
 *   (DEFINITION: an entry whose additive components carry more than one distinct damage type;
 *   measured over 937 pages, 2026-08-13): Akshan P, Gangplank R, K'Sante W, Katarina R,
 *   Lucian P, Rek'Sai E, Shyvana Q, Syndra W, Tristana E, Yone P/W/R, Zaahen E. Picking one
 *   would send damage through the wrong resistance, so the engine refused the whole instance.
 *   A mixed instance MUST carry `byType`, and the interface shows it the way every other
 *   multi-type figure is shown: bone, untagged, with a tagged composition bar (DESIGN.md §8).
 * - `'none'` — the instance dealt nothing. Previously such an instance was given `'true'`,
 *   which applies no mitigation and so could not be mis-mitigated, but it is the wrong WORD
 *   for "this dealt nothing" and a reader of the result could not tell the two apart.
 */
export type ReportedDamageType = DamageType | 'mixed' | 'none';
export type RangeType = 'Melee' | 'Ranged';
export type AdaptiveType = 'Physical' | 'Magic';
/**
 * How much an ability's damage figures can be trusted — plus one state that says there are none.
 *
 * 'verified'   expected value established from a documented formula or a published worked
 *              example, and confirmed by a passing test
 * 'derived'    extracted from source, not independently confirmed
 * 'incomplete' known to have unmodelled components
 * 'no-damage'  THE ABILITY DEALS NO DAMAGE. Not a statement about numbers — a statement that
 *              there are none to make one about.
 *
 * WHY THE FOURTH EXISTS. 239 entries stored nothing and read 'derived', which claims they were
 * "extracted from source, not independently confirmed" when there was nothing to extract. It
 * inflated the derived count by a third and made the roster look better modelled than it is.
 * Silence about damage and unconfirmed damage are different facts and must not share a word.
 *
 * 'no-damage' is a CLAIM, and it is only made when two sources are silent together: the
 * ability's own template declares no `damagetype`, AND `Module:DamageData/data` states no
 * damage instance for it. Where those two disagree — 21 abilities, Jinx Q and Zed W among them,
 * where the module states a type the template omits — the entry is `incomplete`, because
 * asserting "no damage" against a source that says otherwise is the confident wrong answer this
 * project exists to prevent.
 */
export type VerificationStatus = 'verified' | 'derived' | 'incomplete' | 'no-damage';

/**
 * A fact an entry needs and that NO SOURCE STATES, so no amount of work will supply it.
 *
 * This is the difference between an entry nobody has got to yet and one nobody can ever finish.
 * The 22 abilities carrying an unresolved ratio owner are the second kind: Malphite W reads
 * `(+ 15% armor)` and the source never says whose armor, so a human reading the page would be
 * guessing exactly as a parser would (DATA-SOURCES §16). Putting those on a worklist implies
 * someone will get to them. Nobody can.
 *
 * An entry carrying one of these is `incomplete` and stays `incomplete` until the SOURCE
 * changes. The interface must present it differently from work in progress (SPECIFICATION §8).
 */
export interface Unresolvable {
  /** What is missing, e.g. "components[0].ratios[0].owner (armor)". */
  field: string;
  /** Why no source settles it, in plain English, for the user-facing note. */
  why: string;
}
export type AbilitySlot = 'P' | 'Q' | 'W' | 'E' | 'R';

/** Where a value came from and when — surfaced to the user (SPECIFICATION §7, §8). */
export interface Provenance {
  source: string;
  url?: string;
  patch: string;
  fetched?: string;
}

// ---------------------------------------------------------------------------
// Fetched sources
// ---------------------------------------------------------------------------

/**
 * WHICH RESOURCE A CHAMPION SPENDS. Added 2026-08-14; DATA-SOURCES §43.
 *
 * **`ChampionBaseStats.mp_base` HOLDS WHATEVER THE RESOURCE IS, NOT MANA.** Measured over all
 * 175 entries of `Module:ChampionData/data` on 2026-08-13: every entry carries `resource`, 145
 * say `Mana`, and **19 state a NON-MANA resource with a NON-ZERO `mp_base`** — Shen's 400 is
 * energy, Yone's 500 is flow, Rumble's 150 is heat, Rengar's 4 is ferocity. Nothing in the pool
 * figure distinguishes them.
 *
 * Without this field the product cannot tell a mana pool from an energy pool, so `StatBlock`'s
 * mana had to stay absent for everyone and `RatioStat.maxMana` was unresolvable — Ryze Q reads
 * the caster's maximum mana. **This field is the whole of what Ryze Q was waiting on.**
 *
 * IT IS A FREE STRING, deliberately. 15 distinct values were observed and Riot adds more with
 * new champions; a closed union would make the fetch throw on the next release, which is a worse
 * failure than carrying a word nothing reads. Only the exact value `'Mana'` licenses populating
 * a mana figure, and every other value — including one this project has never seen — correctly
 * produces no mana.
 */
export type ChampionResource = string;

/** Champion base + per-level stats, from the wiki module — never Data Dragon
 *  (DATA-SOURCES §3, the AD-per-level gap). */
export interface ChampionBaseStats {
  hp_base: number;
  hp_lvl: number;
  mp_base?: number;
  mp_lvl?: number;
  arm_base: number;
  arm_lvl: number;
  mr_base: number;
  mr_lvl: number;
  ad_base: number;
  ad_lvl: number;
  as_base: number;
  as_lvl: number;
  as_ratio: number;
  range: number;
  rangetype: RangeType;
  adaptivetype: AdaptiveType;
}

export interface Champion {
  apiname: string;
  name: string;
  id: number;
  stats: ChampionBaseStats;
  /**
   * The word the wiki module states for this champion's resource — "Mana", "Energy", "Fury",
   * "None", "Blood Well", … See `ChampionResource` for why it exists and why it is a string.
   *
   * OPTIONAL only so a champions.json written before 2026-08-14 stays valid. Every entry in the
   * source states it, so an absent value means the file predates the field, never that the
   * source was silent. A stat-block builder reading an absent value must produce NO mana figure,
   * which is the same answer it gives for every non-mana resource.
   */
  resource?: ChampionResource;
  /**
   * Every ability name the wiki module lists for each slot, in module order — NOT just the
   * first.
   *
   * A slot really can hold more than one ability, and taking only `[0]` lost 69 abilities:
   * all five of Aphelios's weapons, all ten of Hwei's subjects, the whole of Jayce's second
   * form, Elise's spider form, Nidalee's cougar form, Kha'Zix's four evolutions, Lee Sin's
   * second casts, Riven's Wind Slash (which is her ultimate's damage), Swain's Demonflare,
   * Quinn's Skystrike.
   *
   * CAUTION, and the reason this is a list rather than a set of separate entries: 128 of the
   * 208 non-first names are ALIASES. "The Darkin Blade 2" and "The Darkin Blade 3" resolve to
   * the same wiki page as "The Darkin Blade" — they name extra cast rows inside one template,
   * not extra abilities. Harvesting every name blindly stores Aatrox Q three times and triples
   * its damage. The harvester must deduplicate by the page's revision id, which is what
   * `sourceRevision` on CuratedAbility records. See DATA-SOURCES §18.
   */
  abilityNames: Partial<Record<AbilitySlot, string[]>>;
  /**
   * How many ranks each ability slot actually has, from Data Dragon's per-champion `maxrank`.
   *
   * NEVER inferred. The old rule — 5 for Q/W/E, 3 for R — is wrong for 21 abilities across 8
   * champions: Udyr's four stances rank to 6 because he has no ultimate, Jayce's two forms to
   * 6, and Karma, Nidalee and Elise have 4-rank ultimates. A wrong rank count does not fail
   * loudly; it silently moves every middle value, because `X to Y` interpolates across the
   * count (DATA-SOURCES §11, §22).
   *
   * Absent for a slot Data Dragon does not describe (the passive, which does not rank).
   */
  abilityMaxRanks: Partial<Record<AbilitySlot, number>>;
  /** Data Dragon portrait filename, e.g. "Aatrox.png" — matches Item.icon and Rune.icon.
   *  A champion is only in the roster once this asset exists (DATA-SOURCES §1). */
  icon: string;
  provenance: Provenance;
}

/** Item, from Data Dragon. Only structured stats live here; passive VALUES are curated
 *  (DATA-SOURCES §5). The pool is the corrected **209** distinct items — NOT 222, which is the
 *  count under the broken filter before the id cutoff. Corrected 2026-08-13. */
export interface Item {
  id: number;
  name: string;
  gold: { total: number; purchasable: boolean };
  stats: Record<string, number>;
  icon: string;
  provenance: Provenance;
}

export type RuneTree =
  | 'Domination'
  | 'Inspiration'
  | 'Precision'
  | 'Resolve'
  | 'Sorcery';

/** Rune, from runesReforged.json — structural fields only. Numeric values are curated
 *  (they are prose in the source — DATA-SOURCES §6). */
export interface Rune {
  id: number;
  key: string;
  name: string;
  icon: string;
  tree: RuneTree;
  slot: number; // 0 = keystone row, 1..3 = minor rows
}

export type ShardSlot = 'offense' | 'flex' | 'defense';

/** Stat shard — present in NO fetched source; hand-entered (DATA-SOURCES §7). */
export interface StatShard {
  id: string;
  slot: ShardSlot;
  name: string;
  effect: { stat: string; value?: number; perLevel?: number };
}

/** Instance classification from Module:DamageData/data — no numbers (DATA-SOURCES §11). */
export interface DamageClassification {
  champion: string;
  ability: string;
  instance: string;
  damageType: DamageType;
  appliesOnHit: boolean;
  appliesLifesteal: boolean;
  isProc: boolean;
}

// ---------------------------------------------------------------------------
// The curated override file — the irreplaceable asset (plan §2 F / §2 G)
// ---------------------------------------------------------------------------

/**
 * A scaling value is stored in ONE of four ways — never by guessing the middle steps
 * (DATA-SOURCES §11, "The X to Y interpolation rule").
 *
 * Two scale by ABILITY RANK:
 *   - `linear`   : the wiki's `X to Y` shorthand, expanded with the documented linear rule
 *                  value(rank) = from + (to - from) / (ranks - 1) * (rank - 1).
 *   - `explicit` : a literal per-rank list, used verbatim, for any ability whose ranks are
 *                  not an even linear progression (e.g. Kayle R 675/675/775).
 *
 * Two scale by CHAMPION LEVEL. These exist because 95 measured damage sources — almost all
 * of them innate passives, including Caitlyn Headshot, Darius Hemorrhage and Ziggs Short
 * Fuse — do not scale by ability rank at all, and could not otherwise be represented:
 *   - `byLevel`         : the wiki's `{{pp|X to Y for N|L1 to L2}}` shorthand.
 *   - `byLevelExplicit` : `{{pp|v1;v2;…|l1;l2;…}}` — literal values at literal levels.
 *
 * AUTHORITY FOR THE LEVEL RULE: it is the SAME linear rule, on a different axis.
 * `Module:Ability progression` expands both `{{ap}}` (rank) and `{{pp}}` (level) through one
 * shared helper, `string_to_formula`:
 *     value(x) = start + (finish - start) / (times - 1) * (x - 1)
 * `ap` walks ranks; `pp` walks levels, taking its step count from a `for N` suffix and its
 * level positions from a second argument. Read from the module source on 2026-08-12 at
 * https://wiki.leagueoflegends.com/en-us/api.php?action=query&prop=revisions&titles=Module:Ability%20progression&rvslots=main&rvprop=content&format=json&formatversion=2
 * We read this rule; we do not invent one. Worked example — Caitlyn Headshot
 * `{{pp|60 to 100 for 3|1 to 13}}` → 60 / 80 / 100 at levels 1 / 7 / 13.
 */
export type Scaling =
  | { scaling: 'linear'; from: number; to: number }
  | { scaling: 'explicit'; perRank: number[] }
  | {
      scaling: 'byLevel';
      from: number;
      to: number;
      /** Inclusive champion levels of the first and last step, e.g. [1, 13]. */
      atLevels: [number, number];
      /** How many distinct values across that span (the `for N` suffix). */
      steps: number;
    }
  | {
      scaling: 'byLevelExplicit';
      values: number[];
      /** Champion level at which each value takes effect; same length as `values`. */
      atLevels: number[];
    }
  | {
      /**
       * TWO VALUES, CHOSEN BY THE HOLDER'S RANGE TYPE. Added 2026-08-13.
       *
       * The wiki writes these as `{{rd|melee|ranged}}` and they are not a scaling axis at all —
       * nothing varies with rank or level. The source states two numbers and says which champion
       * gets which, and a single-valued field cannot hold that. **12 item effects are refused for
       * this reason alone** (DATA-SOURCES §39), and they are refused rather than stored at one of
       * the two values, because storing the melee figure understates every ranged champion and
       * vice versa.
       *
       * Each arm is itself a `Scaling`, because a range-split value may ALSO scale — an item
       * whose melee figure grows with level and whose ranged figure does not is expressible.
       *
       * `valueAt` REFUSES this arm unless it is given a range type. It never picks one: the
       * champion's `rangetype` is a fact the scenario knows and the data does not.
       */
      scaling: 'byRangeType';
      melee: Scaling;
      ranged: Scaling;
    };

/** Stats an ability ratio can scale from. */
export type RatioStat =
  | 'baseAD'
  | 'bonusAD'
  | 'totalAD'
  | 'AP'
  | 'maxHP'
  | 'bonusHP'
  | 'currentHP'
  | 'missingHP'
  | 'armor'
  | 'bonusArmor'
  | 'magicResist'
  | 'bonusMagicResist'
  | 'maxMana'
  | 'currentMana'
  /**
   * A persistent accumulation the user enters up front (SPECIFICATION §3.3) — Nasus Q
   * stacks, Veigar stacks, Cho'Gath Feast stacks. Requires `Ratio.counter`.
   *
   * **THE UNIT IS PERCENTAGE POINTS OF THE STACK COUNT, EXACTLY AS EVERY OTHER RATIO.
   * "+1 damage per stack" is stored as `100`, NOT as `1`. Decided 2026-08-13; see `Ratio`.**
   */
  | 'stacks';

/**
 * WHOSE stat a ratio reads.
 *
 * WHY THIS EXISTS. `maxHP` on its own names a pool but not a champion, and the two readings
 * are not close: Bel'Veth R is `20% of target's missing health`, and an engine that read the
 * caster's missing health instead would return a confident, itemised, entirely wrong number
 * with nothing on screen to say so. A scan of all 865 ability templates on 2026-08-13 found
 * 176 health-pool ratios — 104 stating the target, 24 stating the caster, 48 stating neither.
 * A default would have silently decided those 48; there is no majority safe enough to guess
 * with, and the minority case is exactly where the error is largest.
 *
 * 'unresolved' is therefore a real, storable state, not a placeholder to be filled in later
 * by whoever notices. It means: the source names a health pool and does not say whose. An
 * entry carrying one is forced to `verification: 'incomplete'` by gate 6, so it can never be
 * presented to a user as though it were settled.
 */
/**
 * `'holder'` — ADDED 2026-08-13, and it is not a synonym for `'caster'`.
 *
 * Ability text names a champion. Item and rune text does not: it is written from the point of
 * view of whoever is wearing the item. "Gain 8 armor", "deals damage equal to 3% of your
 * maximum health" — the subject is the holder, and the holder is the ATTACKER only when the
 * item sits on the attacker. SPECIFICATION §5 requires the defender modelled in full, with
 * their own complete item build, so a defensive item's effect reads off the DEFENDER while an
 * identical expression on the attacker's item reads off the attacker.
 *
 * Mapping holder→caster at harvest time would therefore invert every defender-side item.
 * Measured 2026-08-13 (DATA-SOURCES §37.3): 27 of the 120 owner-bearing item and rune
 * references resolve to the holder, against 11 that name the other champion.
 *
 * HOW THE ENGINE RESOLVES IT. `'holder'` is resolved at EVALUATION time, not at harvest time,
 * from which champion's build the effect was found on — the one fact the data cannot carry
 * because it is a property of the scenario rather than of the item. The engine already walks
 * each champion's items and runes to build their stat block; an effect reached through the
 * attacker's build resolves `'holder'` to the attacker, and one reached through the defender's
 * build resolves it to the defender. There is no default and no fallback: an effect that is
 * not reached through some champion's build is not in the scenario at all.
 *
 * This is deliberately NOT the same as leaving it `'unresolved'`. `'unresolved'` means the
 * SOURCE does not state whose stat it is, and no work will ever supply the fact. `'holder'`
 * means the source states it precisely — it is whoever holds this — and the scenario supplies
 * the rest. The first is permanently incomplete; the second is fully modelled.
 */
export type RatioOwner = 'caster' | 'target' | 'holder' | 'unresolved';

/** The health pools. */
export const HEALTH_POOL_STATS = ['maxHP', 'bonusHP', 'currentHP', 'missingHP'] as const;
export type HealthPoolStat = (typeof HEALTH_POOL_STATS)[number];

export function isHealthPoolStat(stat: RatioStat): stat is HealthPoolStat {
  return (HEALTH_POOL_STATS as readonly string[]).includes(stat);
}

/**
 * Every stat both champions in a fight possess, and which therefore MUST say whose it is.
 * A ratio on one of these without an `owner` is rejected by gate 1.
 *
 * Health was enforced first because it is where the damage is. Armor, magic resistance and
 * mana carry the identical ambiguity and are enforced from 2026-08-13: Malphite W reads the
 * CASTER's armor, Taric E the caster's bonus armor, Ryze Q the caster's maximum mana — while
 * a shred or a resistance-scaling nuke could as easily read the target's. The source says
 * neither for most of them, which is why nearly all of them land on 'unresolved'. That is
 * the finding, not a failure of the rule.
 *
 * NOT here: baseAD / bonusAD / totalAD / AP, which belong to whoever cast the ability and
 * have no second reading; and 'stacks', which is named by its `counter` key instead.
 */
export const OWNER_REQUIRED_STATS = [
  ...HEALTH_POOL_STATS,
  'armor',
  'bonusArmor',
  'magicResist',
  'bonusMagicResist',
  'maxMana',
  'currentMana',
] as const;
export type OwnerRequiredStat = (typeof OWNER_REQUIRED_STATS)[number];

export function requiresOwner(stat: RatioStat): stat is OwnerRequiredStat {
  return (OWNER_REQUIRED_STATS as readonly string[]).includes(stat);
}

/**
 * A MULTIPLIER on a ratio's magnitude: "add `per100` percentage points to this ratio for every
 * 100 of `per`".
 *
 * Malzahar R is `10–20% (+ 2.5% per 100 AP) of target's maximum health`. The 2.5 is not a 2.5%
 * AP ratio — it raises the percentage-of-health the ability deals. Stored as an ordinary ratio
 * it is simply wrong, and the shapes it corrupts are not marginal: Kled W came out as a
 * percentage of the target's BONUS health when the source says MAXIMUM, and Pantheon W lost its
 * entire payload and dealt nothing.
 *
 * `owner` follows the same rule as the payload ratio: required when `per` is a stat both
 * champions possess, never defaulted. This is what lets the two-owner cases be expressed at
 * last — Kled W is a payload on the target's maximum health with a multiplier on the caster's
 * bonus health, and each says whose it is.
 *
 * Measured 2026-08-13: 34 abilities, 53 damage rows. See DATA-SOURCES §17.
 */
export interface RatioMultiplier {
  /** The stat that drives the increase, e.g. 'AP' for "per 100 AP". */
  per: RatioStat;
  /** Whose `per` stat. Required when `per` is in OWNER_REQUIRED_STATS. */
  owner?: RatioOwner;
  /** Percentage points added to the parent ratio per 100 of `per`. */
  per100: Scaling;
}

/**
 * A ratio: a share of one stat, added to a component's base.
 *
 * THE UNIT OF THE MAGNITUDE IS PERCENTAGE POINTS, NOT A FRACTION. `(+ 75% AP)` is stored as
 * **75**, never 0.75. The engine divides by 100 at exactly one place when it applies the ratio.
 *
 * This was written down nowhere until 2026-08-13, and an engine session had to establish it by
 * inference from a neighbouring field. Reading it the other way is a hundred-fold error on the
 * 634 components that carry a single core ratio — not a near miss, a different product. It is
 * stated here because the type is the only place a reader of the contract will look.
 *
 * `RatioMultiplier.per100` uses the same unit, on the same quantity.
 *
 * ---
 *
 * **`stacks` USES THE SAME UNIT, WITH NO EXCEPTION. DECIDED 2026-08-13, BEFORE ANY DATA EXISTS.**
 *
 * A stack counter is the one `RatioStat` whose stat has no unit of its own — 200 ability power is
 * a quantity of ability power, but 25 Nasus stacks is a count. So "75% of it" is a strange
 * sentence, and the temptation is to give `stacks` its own unit of damage-per-stack, where
 * "+1 damage per stack" would store as `1`.
 *
 * **It does not. "+1 damage per stack" is stored as `100`.** The magnitude is percentage points
 * of the counter, and the engine's single division by 100 applies to it unchanged:
 * `(100 / 100) x 25 stacks = 25 damage`. A half-point-per-stack ability stores `50`.
 *
 * WHY THE UNIFORM RULE WON, stated so it is not relitigated from scratch:
 *   1. **One rule, no per-stat exception.** The alternative is a rule a reader must remember an
 *      exception to, and the exception is invisible at the call site — a `Ratio` on `stacks`
 *      looks exactly like a `Ratio` on `AP`.
 *   2. **`RatioMultiplier.per100` would otherwise split.** A multiplier on a `stacks` ratio adds
 *      percentage points to its parent. If the parent were damage-per-stack, one field would
 *      carry two units depending on what it was attached to.
 *   3. **Nothing has been harvested yet**, so there is no migration cost either way and the
 *      decision is purely about which rule is easier to state, check and remember.
 *
 * THE COST IS REAL AND IS NAMED: a curated entry reading `from: 100, to: 100` for "1 damage per
 * stack" is not self-evident to someone reading the file. That is why it is written here, why the
 * validator refuses the other unit rather than accepting it, and why the refusal message names
 * both readings.
 *
 * **THE GUARD.** Gate 1 refuses a `stacks` ratio whose magnitude is below
 * `MIN_STACKS_RATIO_POINTS` at every rank or level, because such a value means less than
 * 0.1 damage per stack — a quantity no ability in the game states, and the exact signature of a
 * harvester writing damage-per-stack. It is a REFUSAL, never a silent conversion: converting
 * would guess which unit the author meant, and the entry becoming `incomplete` is this project's
 * promise working (SPECIFICATION §8).
 */
export type Ratio = {
  stat: RatioStat;
  /**
   * Multipliers on this ratio's magnitude. Absent on the overwhelming majority of ratios —
   * the field is additive, and a ratio without it behaves exactly as before.
   */
  multipliers?: RatioMultiplier[];
  /** Required when `stat` is 'stacks'. Names the counter, and must match a key the scenario
   *  supplies in ChampionConfig.persistent (e.g. 'nasusQ'). */
  counter?: string;
  /**
   * Whose stat this reads. REQUIRED on every stat in `OWNER_REQUIRED_STATS` — the four health
   * pools, armor and bonus armor, magic resistance and bonus magic resistance, maximum and
   * current mana — and rejected by gate 1 if absent.
   *
   * Meaningless, and therefore left off, on attack damage and ability power: those are the
   * caster's by definition, and inventing an owner for them would suggest a choice exists.
   */
  owner?: RatioOwner;
} & Scaling;

/**
 * How a component combines with the others on the same ability.
 *
 * This exists because 94 measured components are ALTERNATIVES, not additions: Darius Q hits
 * with the blade OR the handle, Zed Q deals full OR reduced damage, Aatrox Q has a normal and
 * a sweetspot value for each of three casts. A plain list gives an engine no way to know that,
 * and summing them would hand Aatrox six casts' worth of Q damage — a plausible wrong number,
 * which is the exact failure this project exists to prevent.
 *
 * Default is 'adds'. The validator REQUIRES this field to be stated explicitly on every
 * component of any ability carrying two or more components, so the intent is always recorded
 * rather than inferred from a default.
 */
/**
 * HOW MANY TIMES THIS COMPONENT LANDS ON ONE CHAMPION, when the source does not fix a number.
 * Added 2026-08-13; DATA-SOURCES §38.
 *
 * `hits` states a count the ABILITY fixes: Riven Q activates three times, and three is three for
 * everyone. But for some abilities the count is a property of the SITUATION — how many of Ziggs's
 * mines a champion contacts, how many of Yuumi's waves catch them before they walk out, how many
 * of Zac's bounces reach them. **No number exists to store, and storing one is a guess dressed as
 * data.** So the shape records what the source actually says — the ceiling and the rate — and the
 * count itself arrives from the scenario, exactly as entry state does (SPECIFICATION §3.3).
 *
 * TWO SHAPES, because forcing one into the other invents a reduction that is not there:
 *
 * - **`repeatsAtReducedRate`** (17 abilities measured). The first instance deals full damage and
 *   every later one deals `rate` of it. The user states how many ADDITIONAL instances land, 0 to
 *   `maxAdditional`. Ziggs E: rate 0.4, maxAdditional 10.
 * - **`repeatsAtFullRate`** (Xayah Q, and an unmeasured population — see §38.3). Every instance
 *   deals full damage; the user states how many land, 0 to `maxInstances`. There is no reduction.
 *
 * THE DEFAULT IS THE MINIMUM AND MAY NOT BE RAISED: one full instance, zero repeats. It is the
 * only count that is true whenever the ability connects at all. Any higher default asserts
 * positioning the user never stated, and this product's promise is that a figure is absent rather
 * than wrong. The interface shows the maximum beside the control and the result states which count
 * produced it (SPECIFICATION §3.3, §11).
 */
export type VariableHitCount =
  | {
      kind: 'repeatsAtReducedRate';
      /** Fraction of the full value each repeat deals, as the source states it. 0.4 = 40%. */
      rate: number;
      /** The most repeats the source says are possible, BEYOND the first instance. */
      maxAdditional: number;
      /** What the source says, quoted, so the ceiling is traceable to a sentence. */
      sourceSays: string;
    }
  | {
      kind: 'repeatsAtFullRate';
      /** The most instances the source says can land on one champion, including the first. */
      maxInstances: number;
      sourceSays: string;
    };

export type ComponentRelation =
  | { kind: 'adds' }
  | { kind: 'alternativeTo'; componentId: string };

export interface AbilityComponent {
  id: string;
  label?: string;
  damageType: DamageType;
  base: Scaling;
  ratios: Ratio[];
  relation?: ComponentRelation;
  /** Number of times this component lands in one cast — for the 131 measured components
   *  labelled "per tick / per spin / per bolt". One entry with a count, not N copies.
   *  Absent means 1.
   *
   *  ONLY FOR A COUNT THE ABILITY FIXES. If the count depends on where the target stands or
   *  whether they stay there, `hits` MUST be absent and `variableHits` carries the shape
   *  instead — see VariableHitCount and DATA-SOURCES §38. Gate 1 refuses an entry that sets
   *  both, because a fixed count beside a variable one is two answers to the same question. */
  hits?: number;
  /** Present when the count is a property of the SITUATION rather than the ability. Mutually
   *  exclusive with `hits`. The count itself comes from the scenario, never from here. */
  variableHits?: VariableHitCount;
}

/** The seven instance types the combo parser distinguishes (SPECIFICATION §3.4). */
export type InstanceType =
  | 'basic-attack'
  | 'damaging-ability'
  | 'non-damaging-ability'
  | 'empowered-attack'
  | 'item-active'
  | 'on-hit'
  | 'dot-application';

/**
 * Per-ability stack yields (SPECIFICATION §3.5). A number is a fixed stack count; a string
 * marker such as 'onPhysical' means the effect accumulates on any instance of that type
 * (e.g. Black Cleaver on any physical instance).
 */
export interface StackYields {
  conqueror?: number;
  blackCleaver?: 'onPhysical';
  [key: string]: number | string | undefined;
}

export interface CuratedAbility {
  champion: string;
  slot: AbilitySlot;
  abilityName: string;
  instanceType: InstanceType;
  /**
   * The ability's damage type, where a source states one.
   *
   * OPTIONAL, and absent is a real state rather than a gap to fill with a default. An ability
   * whose template leaves `damagetype` blank and which `Module:DamageData/data` does not
   * classify has no type this project may assert, and it therefore stores no components either —
   * a figure without a type is a figure without a resistance, which is a different number rather
   * than an imprecise one. Gate 1 requires it whenever components are present.
   */
  damageType?: DamageType;
  maxRank: number;
  components: AbilityComponent[];
  modifiers?: Record<string, number>;
  stackYields?: StackYields;
  verification: VerificationStatus;
  /** Facts this entry needs that no source states. Present means permanently incomplete, not
   *  pending — see `Unresolvable`. Gate 6 requires `verification: 'incomplete'` alongside it. */
  unresolvable?: Unresolvable[];
  notes?: string;
  provenance: Provenance;
  /** Set when this entry belongs to a form that is its own roster entry (SPECIFICATION §6,
   *  plan §4) — e.g. 'Kayn (Rhaast)'. Absent for the champion's base form. */
  form?: string;
  /** The wiki revision id the numbers were read from. Makes a stale entry identifiable
   *  after a patch rather than merely suspected (DATA-SOURCES §15). */
  sourceRevision?: number;
  /**
   * THE EVIDENCE BEHIND THIS ENTRY'S STATUS, CARRIED BY THE ENTRY. Added 2026-08-14.
   *
   * A claim that cannot travel with the thing it is about will get separated from it. Until this
   * field existed, an entry marked `verified` said so on its own authority and the evidence lived
   * in `verification/gate5-passes.json` and a batch report — so validating the override file
   * ALONE failed every verified entry it contained, on a file with nothing wrong with it. That is
   * a validator that punishes the honest state, and it would have taught whoever met it to skip
   * gate 6.
   *
   * The ledger remains the thing that WRITES this. It is no longer the thing that PROVES it.
   *
   * This is not self-certification. Hand-editing this field is hand-editing the override file,
   * which is the same trust boundary the damage figures themselves sit behind — guarded by the
   * read-only directory and its hook, not by the validator.
   */
  evidence?: VerificationEvidence;
}

/**
 * What was actually checked about an entry, and by which gate.
 *
 * Gate 6 (`gateStatusHonesty`) accepts either this or the external sets it has always taken. An
 * entry carrying its own record needs no ledger; one without it falls back to the ledger exactly
 * as before, so no existing caller changes.
 */
export interface VerificationEvidence {
  /**
   * GATE 2 — the round-trip. The stored scaling was re-rendered and compared against the source's
   * own expansion, value by value at the precision the wiki prints.
   *
   * `kind` names WHICH round-trip agreed, because the three reach different entries: `template`
   * re-renders the ability box's leveling row, `prose` re-reads a damage sentence, `level`
   * re-renders a level-scaled progression. `rowsCompared` is how many values were actually
   * compared — a round-trip that compared zero rows is not a pass, and recording the count is
   * what makes that visible rather than assumed.
   */
  roundTrip?: { kind: 'template' | 'prose' | 'level'; rowsCompared: number };
  /**
   * GATE 5 — independent re-derivation by a reader who did not see the stored value.
   *
   * `ledger` names the file the pass was recorded in, so the claim stays traceable to the run
   * that made it. `recordedOn` is the date of that run, not of this file.
   */
  independentCheck?: { ledger: string; recordedOn: string };
}

/** A curated item passive or active. Data Dragon carries the flat stats; the VALUES inside a
 *  passive live only in description text (DATA-SOURCES §5), so they are curated here. */
/**
 * A DEFENSIVE KIT EFFECT — something a champion's own kit does to damage they RECEIVE.
 * Added 2026-08-13. This is the shape the entire defender model was blocked on.
 *
 * SPECIFICATION §5 requires the defender modelled in full, never by generic or averaged values,
 * and splits these by activation. A census over all 937 ability pages (DATA-SOURCES §40) measured
 * what the shape actually has to hold, and two of its findings changed the design:
 *
 * 1. **§5's two-way split needs THREE buckets.** 6 effects are always-active, 210 are
 *    conditional, and 2 state a condition this engine cannot represent (Xin Zhao R's is a
 *    DISTANCE; Kayn P's is a location outside combat). A two-way field would force those two to
 *    be guessed one way or the other. `'not-stated'` is a real answer, not a placeholder.
 * 2. **A value may be absent or stated only by reference.** 17 effects have no value at all — a
 *    spell shield blocks one ability, an invulnerability blocks everything — and 5 state theirs
 *    as "the same amount" or "equal to the health cost". The source states the value; it does not
 *    state a figure. Forcing a number here would mean inventing one.
 *
 * THE HEADLINE FOR THE INTERFACE, corrected 2026-08-13. **210 of 218 are toggles roster-wide,
 * and a scenario has ONE defender.** DEFINITION: one toggle is one conditional defensive ability
 * of the chosen champion, measured over all 173 champions including those with none — minimum 0,
 * median 1, mean 1.23, maximum 4. **The panel shows at most four rows.** This comment previously
 * concluded "the defender panel needs on the order of two hundred controls"; that does not follow
 * from the measurement, and DATA-SOURCES §40.1 struck it through in place.
 *
 * ---
 *
 * **THE SIX SHAPE FIELDS, ADDED 2026-08-13.** `defensive-propose.ts` reads the defender's kit off
 * the wiki and REFUSES any row stating a fact the entry could not carry, with a named class. Six
 * of those classes are one missing field each, and the proposer measured what they cost together:
 *
 * > **44 pairs.** DEFINITION: a refused (page, kind) pair is released by a set of classes when
 * > EVERY class blocking it is in that set — measured over 226 confirmed pages / 282 pairs, of
 * > which 88 were proposed and 194 refused. A released pair still has to parse, still obeys the
 * > owner rule, and is `derived` at best.
 *
 * The six are `label`, `id` + `relation`, `grantedStat`, `appliesToDamageType`, `overTime` and
 * `unit`. Each below names the row it was refusing and what storing it wrong would have claimed.
 */
export interface CuratedDefensiveEffect {
  champion: string;
  slot: AbilitySlot;
  abilityName: string;
  /**
   * Stable identity within one ability, so `relation` has something to point at.
   *
   * Optional because the overwhelming majority of abilities carry one effect per kind and need
   * no discriminator. Gate 1 requires it — and requires it unique within
   * (champion, slot, abilityName) — as soon as any entry on that ability carries a `relation`,
   * for the same reason `AbilityComponent.relation` is required once there are two components:
   * the intent is recorded rather than inferred.
   */
  id?: string;
  /**
   * The source's OWN label for the row this came from — "Armor", "Magic Resistance",
   * "Minimum Damage Reduction".
   *
   * REFUSAL CLASS `multiple-values-one-field`, 27 pairs blocked. **Leona W grants 20–50 armor
   * AND 20–50 magic resistance from two separate rows on one page.** With one unlabelled value
   * per entry the two are indistinguishable, so the proposer stored neither — picking one row
   * silently drops the other, and which one it drops decides whether the defender mitigates
   * physical or magic damage.
   */
  label?: string;
  /**
   * Whether this entry ADDS to its siblings on the same ability or REPLACES one of them.
   *
   * REFUSAL CLASS `needs-relation`, 14 pairs blocked. The refused rows are Minimum/Maximum pairs
   * and base/empowered variants — two numbers for one effect, of which only one applies at a
   * time. Ability components have carried `relation` since the contract was frozen, for exactly
   * this reason and with exactly this failure mode: summing two alternatives hands the defender
   * both, and a defender who mitigated twice as much as they should is a plausible wrong number.
   *
   * Same type, same default, same rule as `AbilityComponent.relation`: absent means `adds`, and
   * gate 1 requires it to be stated explicitly once an ability carries two entries of one kind.
   * `componentId` names the sibling's `id`.
   */
  relation?: ComponentRelation;
  /** The nine kinds the census measured. Each is a different thing to do to incoming damage. */
  kind:
    | 'damage-reduction'
    | 'type-specific-reduction'
    | 'resistance-grant'
    | 'shield'
    | 'spell-shield'
    | 'immunity'
    | 'execute-threshold'
    | 'heal'
    | 'max-health-grant';
  /**
   * §5's split, with the third bucket the census proved is needed.
   *
   * `'always-active'` bakes into the defender's resolved stat block. `'conditional'` is exposed
   * as a toggle. `'not-stated'` is neither: the source states a condition this engine has no way
   * to represent, and the effect is NOT applied — refusing is the honest outcome, and it says why.
   */
  activation: 'always-active' | 'conditional' | 'not-stated';
  /** Present when `activation` is 'conditional' or 'not-stated'. What has to be true, in the
   *  source's own terms, so the interface can label the toggle with the real condition. */
  condition?: string;
  /**
   * WHICH RESISTANCE a `resistance-grant` grants.
   *
   * REFUSAL CLASS `needs-granted-stat`, 13 pairs blocked, 8 of them blocked by this alone — the
   * single largest release of the six. `kind: 'resistance-grant'` plus the number 7 cannot
   * distinguish 7 armor from 7 magic resistance, **and that is the difference between mitigating
   * physical damage and mitigating magic damage.** The source's row label says which; the entry
   * could not.
   *
   * `'both'` is a real answer and not a shorthand for "we did not look": some rows grant one
   * figure to both resistances in one statement. It is NOT how Leona W is stored — Leona W is two
   * separately-valued rows and belongs in two entries distinguished by `label`.
   *
   * Gate 1 requires it when `kind` is `'resistance-grant'`, and refuses it on every other kind.
   */
  grantedStat?: 'armor' | 'magicResist' | 'both';
  /**
   * THE ONE DAMAGE TYPE this effect applies to, when it applies to one.
   *
   * REFUSAL CLASS `needs-damage-type`, 3 pairs blocked. A magic-only shield and a
   * physical-damage-only reduction were unstorable: with no type on the entry, **a magic shield
   * absorbs physical damage too**, which silently mitigates damage the game does not mitigate.
   *
   * ABSENT MEANS "ALL TYPES", which is the ordinary case — a general shield, a flat reduction.
   * It does not mean "unknown"; a row whose type could not be read is refused, not stored blank.
   * Gate 1 requires it when `kind` is `'type-specific-reduction'`, whose whole meaning is the
   * type.
   */
  appliesToDamageType?: DamageType;
  /**
   * THIS EFFECT RECURS. Same shape and same meaning as `CuratedItemEffect.overTime`.
   *
   * REFUSAL CLASS `needs-over-time`, 14 pairs blocked. The refused rows state a per-tick or
   * whole-channel figure — a heal spread over a channel rather than delivered at once.
   * SPECIFICATION §3.8 keeps damage over time out of the burst total precisely because a figure
   * delivered over a duration and a figure delivered now are different facts, and that is as
   * true of a heal as of a burn. Stored without this, a channelled heal restores its whole
   * duration's health at one point in the sequence.
   *
   * `totalInstances` is how many times it lands over the full duration, WHERE THE SOURCE STATES
   * IT; absent means the source does not, and no count may be invented (§38). No interval is
   * recorded, because the engine models sequence and not time (§3.2).
   */
  overTime?: { totalInstances?: number; sourceSays: string };
  /**
   * WHAT THE NUMBER IN `value` MEANS. Required by gate 1 whenever `value` is present.
   *
   * REFUSAL CLASSES `unit-not-expressible` and `not-an-amount`, 7 pairs blocked by the second.
   * Two distinct failures, one field, because both are the same question — "a number, of what?":
   *
   * - `'flat'` — points. Health restored, health of a shield, points of armor, points off each
   *   instance.
   * - `'percent'` — a percentage of whatever the kind is about: damage received for a
   *   `damage-reduction`, maximum health for a `max-health-grant`. **Damage reduction is written
   *   both ways in the source and nothing on the entry said which — 25 could mean 25% of every
   *   instance or 25 points off it**, and those are not close.
   * - `'percent-of-damage-dealt'` — a RATE, not an amount: life steal, omnivamp, the wiki's
   *   "healing percentage" rows. Put in a field an engine reads as health restored, a rate
   *   restores its own number as health — 12 becomes 12 health rather than 12% of what landed.
   * - `'healing-multiplier'` — an AMPLIFIER on other healing ("increased healing"). It restores
   *   no health at all by itself, and an engine that added it would invent health from nothing.
   *
   * The last two are why this is one field rather than a plain flat/percent pair: `not-an-amount`
   * is a unit question, and giving it a separate field would have made two fields that must agree.
   */
  unit?: 'flat' | 'percent' | 'percent-of-damage-dealt' | 'healing-multiplier';
  /**
   * The value, when the source states a figure. Absent for the 17 with none.
   * A `byRangeType` scaling is permitted here for the same reason it is on ability damage.
   *
   * REQUIRES `unit` — see above. A number with no unit is not a value.
   */
  value?: Scaling;
  /** What the value is a share OF, when it is a share. Requires an owner on the same ten stats
   *  §16 refuses without one — a "15% armor" reduction is meaningless until someone says whose. */
  ratios?: Ratio[];
  /**
   * Set INSTEAD of `value` when the source states the amount only by reference to another
   * quantity — "heals for the same amount", "equal to the health cost". The source HAS stated
   * it; there is simply no figure to store, and this records what it pointed at.
   */
  valueByReference?: string;
  /** Facts no source states — the 24 confirmed effects carrying an unattributed stat. */
  unresolvable?: Unresolvable[];
  verification: VerificationStatus;
  provenance: Provenance;
}

export interface CuratedItemEffect {
  itemId: number;
  itemName: string;
  /**
   * Facts this effect needs that NO SOURCE STATES. Added 2026-08-13.
   *
   * **56 item and rune effects carry a stat the source attributes to nobody** (DATA-SOURCES
   * §37.3) — the mana-stacking family, the burn family, the shred family and four runes. They
   * had nowhere to say so, so an interface could only show them as "not yet modelled", which
   * promises work that no effort can deliver. Same shape and same meaning as the ability side.
   */
  unresolvable?: Unresolvable[];
  /**
   * HOW THIS EFFECT REACHES ITS TARGET. Added 2026-08-13.
   *
   * An item effect is not a cast — it fires on a basic attack, on the next ability after one,
   * on an active, or continuously. **20 of the 28 extracted effects are on-hit or Spellblade**
   * (DATA-SOURCES §39 — **observed at 16 on-hit-or-spellblade, or 23 counting item actives, once the
   * field was actually populated; the earlier figure of 20 was an estimate**), and a combo builder
   * cannot sequence them without knowing which: an
   * on-hit rider belongs to the basic attack that carried it, not to a step of its own.
   *
   * `'unstated'` is a real value, not a placeholder. Where the source does not say, it says so.
   */
  appliesAs?: 'on-hit' | 'on-attack' | 'spellblade' | 'active' | 'continuous' | 'periodic' | 'unstated';
  /**
   * DAMAGE OVER TIME. Added 2026-08-13.
   *
   * **7 item effects state that their damage recurs** and had no field to say so (DATA-SOURCES
   * §39) — the burn family, chiefly. SPECIFICATION §3.8 makes this consequential rather than
   * cosmetic: damage over time is NEVER folded into the burst total, it is reported as its own
   * line stating the total across the effect's full duration, and the survival verdict is given
   * twice. An effect marked here contributes to the DoT line and to nothing else.
   *
   * `totalInstances` is how many times it lands over its full duration, WHERE THE SOURCE STATES
   * IT. Absent means the source does not, and the engine may not invent a count — the same rule
   * that governs a variable ability hit count (§38).
   *
   * The engine models sequence and not time (§3.2), so no interval is recorded here. An interval
   * would be a time value the engine has nowhere to put and no way to honour.
   */
  overTime?: { totalInstances?: number; sourceSays: string };
  /** The effect's key in Module:ItemData/data/<Item Name>. Observed live 2026-08-13 across all
   *  209 classic items: 'pass', 'pass2', 'pass3' (8 effects), 'act', 'consume' (7 effects). This
   *  comment listed only 'pass' / 'pass2' / 'act' until then. The field is a plain string, so the
   *  omission broke nothing — it just under-described the source. `description2` is a rider clause
   *  on the same effect and is NOT a separate key. */
  key: string;
  name: string;
  kind: 'passive' | 'active';
  /** Present only when the effect deals damage. Absent for pure stat or utility passives. */
  components?: AbilityComponent[];
  /** Flat stat grants the effect confers, e.g. { critDamage: 0.3 } for Infinity Edge. */
  grants?: Record<string, number>;
  stackYields?: StackYields;
  verification: VerificationStatus;
  notes?: string;
  provenance: Provenance;
}

/** A curated rune value. Every number in runesReforged.json is embedded in prose
 *  (DATA-SOURCES §6), and no wiki rune data module exists — confirmed by enumerating all
 *  683 Module: pages on 2026-08-12. These are hand-authored and cannot be otherwise. */
export interface CuratedRune {
  runeId: number;
  runeName: string;
  tree: RuneTree;
  components?: AbilityComponent[];
  grants?: Record<string, number>;
  stackYields?: StackYields;
  verification: VerificationStatus;
  notes?: string;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// File-level container. Nothing on disk is valid unless it matches this shape and
// passes the runtime validator in src/types/validate-curated.ts.
// ---------------------------------------------------------------------------

/** A champion excluded from the product by decision, not by omission. Surfaced in the
 *  interface as a deliberate state (SPECIFICATION §11, plan §5) — never a silent gap. */
export interface CuratedExclusion {
  champion: string;
  reason: string;
  decidedOn: string;
}

export interface CuratedFile {
  /** Schema version of this file's shape. Bumped only by the lead. */
  version: number;
  /** Data Dragon patch the entries were authored against. */
  patch: string;
  fetched: string;
  abilities: CuratedAbility[];
  /** Defensive kit effects — what a champion's own abilities do to damage they RECEIVE.
   *  Optional so an existing file stays valid; SPECIFICATION §5 needs it populated. */
  defensiveEffects?: CuratedDefensiveEffect[];
  itemEffects: CuratedItemEffect[];
  runes: CuratedRune[];
  shards: StatShard[];
  exclusions: CuratedExclusion[];
}
