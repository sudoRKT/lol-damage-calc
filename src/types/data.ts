// Fetched and curated data shapes — the on-disk contract for every data file.
// See DATA-SOURCES.md and the technical-foundation plan §2. LEAD-owned; frozen.

export type DamageType = 'physical' | 'magic' | 'true';
export type RangeType = 'Melee' | 'Ranged';
export type AdaptiveType = 'Physical' | 'Magic';
export type VerificationStatus = 'verified' | 'derived' | 'incomplete';
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
 *  (DATA-SOURCES §5). The pool is the corrected 222 distinct items. */
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
  /** A persistent accumulation the user enters up front (SPECIFICATION §3.3) — Nasus Q
   *  stacks, Veigar stacks, Cho'Gath Feast stacks. Requires `Ratio.counter`. */
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
export type RatioOwner = 'caster' | 'target' | 'unresolved';

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
   *  Absent means 1. */
  hits?: number;
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
  damageType: DamageType;
  maxRank: number;
  components: AbilityComponent[];
  modifiers?: Record<string, number>;
  stackYields?: StackYields;
  verification: VerificationStatus;
  notes?: string;
  provenance: Provenance;
  /** Set when this entry belongs to a form that is its own roster entry (SPECIFICATION §6,
   *  plan §4) — e.g. 'Kayn (Rhaast)'. Absent for the champion's base form. */
  form?: string;
  /** The wiki revision id the numbers were read from. Makes a stale entry identifiable
   *  after a patch rather than merely suspected (DATA-SOURCES §15). */
  sourceRevision?: number;
}

/** A curated item passive or active. Data Dragon carries the flat stats; the VALUES inside a
 *  passive live only in description text (DATA-SOURCES §5), so they are curated here. */
export interface CuratedItemEffect {
  itemId: number;
  itemName: string;
  /** 'pass' / 'pass2' / 'act' — matches the keys in Module:ItemData/data/<Item Name>. */
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
  itemEffects: CuratedItemEffect[];
  runes: CuratedRune[];
  shards: StatShard[];
  exclusions: CuratedExclusion[];
}
