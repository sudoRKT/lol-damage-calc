// The Result — the full output of the engine. Every field maps to a SPECIFICATION §11
// output. LEAD-owned; frozen part of the engine contract.

import type { DamageType, InstanceType, Unresolvable, VerificationStatus } from './data';
import type { Scenario } from './scenario';

/**
 * WHY AN ENTRY IS INCOMPLETE — permanent, or merely not yet done. ADDED 2026-08-13.
 *
 * SPECIFICATION §8 requires the interface to distinguish these, and DESIGN.md §6 gives them
 * different glyphs: `○` "Not yet modelled" against `⊘` "Cannot be completed". Until this field
 * existed there was no route for the distinction to reach a Result at all — `Unresolvable`
 * lived on the curated data and stopped there — so all 23 permanently-unreachable entries would
 * have rendered as "not yet modelled", promising work that no amount of effort can deliver.
 *
 * - `'pending'` — the value exists in a source and has not been extracted yet. It will improve.
 * - `'permanent'` — a fact the ability needs is stated by NO source, so nobody can ever supply
 *   it. The clearest case is a ratio whose owner is unstated: the source says an ability scales
 *   with armor and never says whose, so a person reading the page is guessing exactly as a
 *   parser would.
 *
 * `missingFacts` carries the SPECIFIC facts, not a generic warning, so the interface can say
 * "cannot be completed — the source does not record whose armor this reads" and name the field.
 * DESIGN.md §6 requires the accessible name to carry the fact rather than a vague caution.
 *
 * TWO RULES SETTLED 2026-08-13 (SPECIFICATION §8). Neither is to be narrowed later:
 *
 * 1. **BOTH kinds name what is missing.** `note` on a pending entry is not decoration — a user
 *    told only "not yet modelled" cannot tell whether the total in front of them is missing a
 *    rounding error or half the combo. The two kinds differ in what they say about the FUTURE,
 *    never in whether they say anything at all.
 * 2. **An incomplete entry with no reason falls back to `'pending'`, NEVER `'permanent'`.**
 *    Permanent asserts that no source anywhere records the fact and no work will ever supply it.
 *    Inferring that from an unpopulated field would tell a user to stop waiting for something
 *    that might be a day's work away. Pending claims only "not here yet", which is true either
 *    way, so it is the safe direction to fail in.
 */
export interface IncompleteReason {
  kind: 'pending' | 'permanent';
  /** Present when kind is 'permanent'. Each names the missing field and why nothing settles it. */
  missingFacts?: Unresolvable[];
  /** Present when kind is 'pending'. Plain English, e.g. "the damage is stated in prose that
   *  has not been read yet". */
  note?: string;
}

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
  /** Present ONLY when `verification` is 'incomplete'. Says whether the gap will ever close.
   *  An incomplete instance contributes no damage and states why (SPECIFICATION §8). */
  incompleteReason?: IncompleteReason;
}

export interface DotSource {
  label: string;
  icon: string | null;
  damageType: DamageType;
  total: number; // full-duration total (SPECIFICATION §3.8)
  verification: VerificationStatus;
  /** As InstanceResult.incompleteReason. */
  incompleteReason?: IncompleteReason;
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
  /**
   * Every ability excluded from the totals above, with the reason. A permanently incomplete
   * ability is NEVER silently dropped from a result (SPECIFICATION §8) — it is named, and the
   * interface says whether it is waiting on work or on a fact no source records.
   */
  incompleteContributors: Array<{
    sourceLabel: string;
    reason: IncompleteReason;
  }>;
}
