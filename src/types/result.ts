// The Result — the full output of the engine. Every field maps to a SPECIFICATION §11
// output. LEAD-owned; frozen part of the engine contract.

import type { DamageType, InstanceType, VerificationStatus } from './data';
import type { Scenario } from './scenario';

export interface DamageByType {
  physical: number;
  magic: number;
  true: number;
}

export interface DamageTotals {
  total: number;
  byType: DamageByType;
}

/** A champion's fully resolved stat block (SPECIFICATION §2, step 9). */
export interface StatBlock {
  level: number;
  hp: number; // current hp at entry (may be below maxHp — a "moment in time", §3.3)
  maxHp: number;
  armor: number;
  magicResist: number;
  attackDamage: { base: number; bonus: number; total: number };
  abilityPower: number;
  critChance: number; // 0..1
  /** Total critical-strike damage as a multiplier of normal damage. BASE IS 2.0 (200%),
   *  raised from 1.75 in patch V26.01, 2026-01-08. Item bonuses add to it rather than
   *  multiplying, so 2.0 + 0.35 + 0.10 = 2.45.
   *  https://wiki.leagueoflegends.com/en-us/Critical_strike (read 2026-08-12) */
  critDamage: number;
  attackSpeed: number;
  adaptiveType: 'physical' | 'magic';
}

export interface InstanceResult {
  index: number; // 1-based position in the combo
  stepId: string;
  sourceLabel: string; // e.g. "Q — The Darkin Blade (1st cast)"
  icon: string | null; // Data Dragon icon filename for the chip, or null
  instanceType: InstanceType;
  damageType: DamageType;
  raw: number; // pre-mitigation
  afterResistances: number;
  afterReductions: number;
  final: number; // rounded damage actually applied
  crit: boolean;
  stateSnapshot: Record<string, number | boolean>; // shred / stacks that applied here
  verification: VerificationStatus;
}

export interface DotSource {
  label: string;
  icon: string | null;
  damageType: DamageType;
  total: number; // full-duration total (SPECIFICATION §3.8)
  verification: VerificationStatus;
}

/** Damage over time — reported separately, never folded into burst (SPECIFICATION §3.8). */
export interface DotResult {
  total: number;
  byType: DamageByType;
  sources: DotSource[];
}

export interface SurvivalVerdict {
  defenderHp: number; // hp the damage was measured against
  damageApplied: number;
  lethal: boolean;
  lethalAtInstance: number | null; // 1-based instance where cumulative >= hp, else null
  remainingHp: number; // >= 0
}

export interface Result {
  patch: string; // shown adjacent to the result (SPECIFICATION §8)
  scenario: Scenario; // echoed for report / sharing
  attackerStats: StatBlock;
  defenderStats: StatBlock;
  perInstance: InstanceResult[];
  runningTotal: number[]; // cumulative damage after each instance
  burst: DamageTotals;
  dot: DotResult;
  /** The survival verdict, given twice (SPECIFICATION §3.8): burst alone, and burst + DoT. */
  verdict: { burstOnly: SurvivalVerdict; burstPlusDot: SurvivalVerdict };
  excludedMechanics: string[]; // stated visibly, never silently omitted (§11, §15)
  verificationSummary: VerificationStatus; // worst status among contributing abilities
}
