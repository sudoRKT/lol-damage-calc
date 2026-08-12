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
}

export interface Scenario {
  version: number; // URL schema version (SPECIFICATION §12)
  attacker: ChampionConfig;
  defender: ChampionConfig;
  combo: ComboStep[];
}
