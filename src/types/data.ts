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
  abilityNames: Partial<Record<AbilitySlot, string>>;
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
 * A per-rank value is stored ONE of two ways — never by guessing the middle ranks
 * (DATA-SOURCES §11, "The X to Y interpolation rule"):
 *   - `linear`  : the wiki's `X to Y` shorthand, expanded with the documented linear rule
 *                 value(rank) = from + (to - from) / (ranks - 1) * (rank - 1).
 *   - `explicit`: a literal per-rank list, used verbatim, for any ability whose ranks are
 *                 not an even linear progression (e.g. Kayle R 675/675/775).
 */
export type Scaling =
  | { scaling: 'linear'; from: number; to: number }
  | { scaling: 'explicit'; perRank: number[] };

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
  | 'currentMana';

export type Ratio = { stat: RatioStat } & Scaling;

export interface AbilityComponent {
  id: string;
  label?: string;
  damageType: DamageType;
  base: Scaling;
  ratios: Ratio[];
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
}
