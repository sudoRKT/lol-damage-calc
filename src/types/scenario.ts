// The Scenario — the full input to the engine. Encoded in the URL for sharing
// (SPECIFICATION §12). LEAD-owned; frozen part of the engine contract.

import type { AbilitySlot } from './data';

export type ComboStepKind =
  | 'basic-attack'
  | 'ability'
  | 'empowered-attack'
  | 'item-active'
  | 'on-hit';

export interface RunePage {
  keystone: number | null;
  primary: number[]; // minor rune ids in the primary tree
  secondary: number[]; // minor rune ids in the secondary tree
  shards: string[]; // three stat-shard ids (StatShard.id)
}

export interface ChampionConfig {
  apiname: string;
  level: number; // 1..18
  abilityRanks: Record<Exclude<AbilitySlot, 'P'>, number>; // Q/W/E/R ranks
  items: number[]; // item ids
  runes: RunePage;
  /** Persistent, game-long accumulations folded into the stat block before the sequence
   *  begins (SPECIFICATION §3.3) — e.g. { veigarStacks: 120 }. */
  persistent: Record<string, number>;
  /** Combat state seeded at entry and then mutated by the sequence. For the defender this
   *  also holds already-applied debuffs and conditional-defence toggles (§3.3, §5) —
   *  e.g. { conquerorStacks: 2, bonePlating: true }. */
  entryState: Record<string, number | boolean>;
}

export interface ComboStep {
  id: string; // unique within the combo
  kind: ComboStepKind;
  /** What the step points at: an ability slot ('Q'|'W'|'E'|'R'), an item id as a string,
   *  'basic' for a basic attack, or an on-hit effect key. */
  ref: string;
  /** Step-specific options, e.g. { sweetspot: true, forceCrit: true }. */
  options?: Record<string, unknown>;
  /**
   * HOW MANY TIMES A VARIABLE-COUNT COMPONENT LANDS, stated by the user. Added 2026-08-13.
   *
   * Keyed by component id. Only meaningful for components carrying `variableHits`
   * (`VariableHitCount` in data.ts, DATA-SOURCES §38): abilities where the count depends on
   * where the target stands and whether they stay there, so no number exists in any source.
   *
   * WHAT THE NUMBER MEANS DEPENDS ON THE SHAPE, and the two are not interchangeable:
   *   - `repeatsAtReducedRate` — ADDITIONAL instances beyond the first, 0..maxAdditional. The
   *     first instance is always full and is not counted here.
   *   - `repeatsAtFullRate` — TOTAL instances that land, 0..maxInstances.
   *
   * ABSENT MEANS THE MINIMUM, NOT THE MAXIMUM: one full instance and no repeats. That is the
   * only count true whenever the ability connects at all, and it may not be raised — a higher
   * default would assert positioning the user never stated. This mirrors entry state
   * (SPECIFICATION §3.3): the user describes the situation, the engine does not assume one.
   *
   * A value of 0 for `repeatsAtFullRate` means the ability missed entirely and contributes
   * nothing, which is a legitimate scenario and must not be confused with an absent key.
   */
  hitCounts?: Record<string, number>;
}

export interface Scenario {
  version: number; // URL schema version (SPECIFICATION §12)
  attacker: ChampionConfig;
  defender: ChampionConfig;
  combo: ComboStep[];
}
