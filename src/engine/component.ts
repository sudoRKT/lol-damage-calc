// The component model: turning ONE stored `AbilityComponent` into a pre-mitigation damage
// number (SPECIFICATION §3.6 — the figure that later meets armor, magic resistance and the
// damage modifiers of §3.7).
//
// WHAT THIS FILE DOES
// -------------------
//   perHit = base + Σ (ratioPercent / 100) × statValue
//   raw    = perHit × hits
//
// and it refuses, loudly, anything it cannot resolve from the caster's attack damage and
// ability power alone.
//
// WHERE THE TWO RULES COME FROM
// -----------------------------
// The progression rule — how `X to Y` becomes a number at a given rank or champion level —
// is NOT reimplemented here. It lives once, in src/types/scaling.ts, read from
// `Module:Ability progression` on wiki.leagueoflegends.com. This file calls `valueAt`, for
// the reason that file gives: two implementations of an interpolation rule are two chances
// to disagree.
//
// The composition rule is the wiki's own description of what a ratio is. Read 2026-08-13:
//   https://wiki.leagueoflegends.com/en-us/Attack_damage
//     "Effects may benefit from (scale off of) a percentage/ratio, of base AD, bonus AD, or
//      total AD."   "Total attack damage refers to base plus bonus attack damage."
//   https://wiki.leagueoflegends.com/en-us/Ability_power
//     "Effects may benefit from (scale off of) a percentage/ratio, of the total amount of AP."
//     "Ability power stacks additively."
// Ratios are therefore summed with the base, never multiplied together.
//
// THE UNIT OF A RATIO'S MAGNITUDE — RAISED WITH THE LEAD
// -----------------------------------------------------
// A ratio's magnitude is stored in PERCENTAGE POINTS: `(+ 75% AP)` is stored as 75, not 0.75.
// The frozen `Ratio` type does not say so. The convention is established by two things in the
// project that do:
//   - the harvester's own unit test, scripts/extract/classify.test.ts: parsing "(+ 75% AP)"
//     yields `{ stat: 'AP', scaling: 'linear', from: 75, to: 75 }`;
//   - the frozen `RatioMultiplier.per100`, documented as "Percentage points added to the
//     parent ratio per 100 of `per`" — the same unit, on the same quantity.
// Reading it the other way is a factor-of-100 error on 634 components, so the division by 100
// below happens in exactly one place and is commented. **This should be stated in the frozen
// contract rather than inferred; it is raised, not changed here.**
//
// WHAT THIS FILE DOES NOT DO
// --------------------------
//   - It does not round. Rounding happens once, in rounding.ts (SPECIFICATION §3.7).
//   - It does not mitigate, crit, execute, shield or amplify — those are separate functions.
//   - It does not decide which of several components apply. `relation` ('adds' versus
//     'alternativeTo') is an ABILITY-level question and needs a decision that has not been
//     made: nothing in the frozen Scenario maps a user's choice ("sweetspot", "blade or
//     handle") onto a component id. Raised, not guessed.
//   - It resolves no stat that belongs to the target, and none that comes from scenario
//     state. Those need a wider context than this function is given, and inventing one here
//     would let a health-pool ratio be read off the wrong champion (DATA-SOURCES §16).

import type { AbilityComponent, DamageType, Ratio, RatioStat } from '../types';
import { ScalingError, valueAt } from '../types';

/**
 * The caster's attack damage and ability power — the only stats this evaluator reads.
 *
 * The frozen `StatBlock` (src/types/result.ts) carries exactly these fields with exactly
 * these names, so a resolved StatBlock can be passed straight in. This is a narrower view of
 * the same data, not a second definition of it.
 */
export interface CasterStats {
  /** Base, bonus and total attack damage, as three separate figures the wiki treats as three
   *  separate ratio targets. */
  attackDamage: { base: number; bonus: number; total: number };
  abilityPower: number;
}

/** Everything one component needs in order to resolve to a number. */
export interface ComponentContext {
  /** The rank the caster has in this ability, 1-based. Ignored by a level-scaled value. */
  rank: number;
  /** The ability's OWN rank count (`CuratedAbility.maxRank`) — never assumed to be 5 or 3.
   *  A wrong rank count silently moves every middle value (DATA-SOURCES §11, §22). */
  maxRank: number;
  /** The caster's champion level, 1..18. Ignored by a rank-scaled value. */
  level: number;
  caster: CasterStats;
}

/** One ratio's contribution, kept itemised so a breakdown can show its working. */
export interface RatioContribution {
  stat: RatioStat;
  /** The magnitude as stored: PERCENTAGE POINTS. 75 means 75%. */
  percent: number;
  /** The caster stat the percentage was taken of. */
  statValue: number;
  /** percent / 100 × statValue. */
  damage: number;
}

/** What one component is worth, with its working shown. Pre-mitigation and unrounded. */
export interface ComponentDamage {
  componentId: string;
  damageType: DamageType;
  /** The flat base at this rank or level. */
  base: number;
  ratios: RatioContribution[];
  /** base + every ratio contribution — the value of ONE landing. */
  perHit: number;
  /** How many times this component lands in one cast. 1 unless the component says otherwise. */
  hits: number;
  /** perHit × hits. Pre-mitigation, unrounded. */
  raw: number;
}

/** Thrown when a component cannot be resolved. Carries every reason, not just the first. */
export class ComponentEvaluationError extends Error {
  readonly reasons: string[];
  constructor(componentId: string, reasons: string[]) {
    super(`component '${componentId}' cannot be evaluated: ${reasons.join('; ')}`);
    this.name = 'ComponentEvaluationError';
    this.reasons = reasons;
  }
}

/**
 * The four stats that belong to the caster by definition and need no owner.
 *
 * The frozen contract states it: `OWNER_REQUIRED_STATS` deliberately excludes
 * "baseAD / bonusAD / totalAD / AP, which belong to whoever cast the ability and have no
 * second reading" (src/types/data.ts).
 */
export const CORE_RATIO_STATS = ['baseAD', 'bonusAD', 'totalAD', 'AP'] as const;
export type CoreRatioStat = (typeof CORE_RATIO_STATS)[number];

export function isCoreRatioStat(stat: RatioStat): stat is CoreRatioStat {
  return (CORE_RATIO_STATS as readonly string[]).includes(stat);
}

/** The caster stat a core ratio reads. */
function coreStatValue(stat: CoreRatioStat, caster: CasterStats): number {
  switch (stat) {
    case 'baseAD':
      return caster.attackDamage.base;
    case 'bonusAD':
      return caster.attackDamage.bonus;
    case 'totalAD':
      return caster.attackDamage.total;
    case 'AP':
      return caster.abilityPower;
  }
}

/**
 * Every reason this evaluator cannot take a component — in plain English, all of them, and an
 * empty array when it can.
 *
 * This is deliberately available WITHOUT evaluating anything, so the same rule can be run
 * across a whole ability list to measure the population it excludes. It takes the component
 * as an argument; the engine reads no data file of its own.
 *
 * It is NOT the shape classifier of DATA-SOURCES §19. That classifier lives in the harvester
 * and answers a different question ("which library shape is this row"). This answers "can this
 * function resolve it", which is the only question the engine needs. Two implementations of
 * one rule would be two chances to disagree, so this does not attempt to be the other one.
 */
export function unsupportedReasons(component: AbilityComponent): string[] {
  const reasons: string[] = [];

  // `hits` is documented as "Number of times this component lands in one cast … Absent means
  // 1." A component that lands zero, negative or fractional times is a defect in the stored
  // data. Coercing it to 1 would silently understate the ability, which is the failure this
  // project exists to prevent, so it is refused instead.
  if (component.hits !== undefined) {
    if (!Number.isInteger(component.hits) || component.hits < 1) {
      reasons.push(
        `hits is ${component.hits}; a component must land a whole number of times, at least once`,
      );
    }
  }

  for (const ratio of component.ratios) {
    if (!isCoreRatioStat(ratio.stat)) {
      reasons.push(
        `ratio on '${ratio.stat}' needs a stat this evaluator is not given ` +
          `(it reads only the caster's base/bonus/total attack damage and ability power)`,
      );
      // No second complaint about this ratio's owner: an owner is REQUIRED on these stats,
      // so its presence is correct, not a defect.
      continue;
    }
    if (ratio.multipliers && ratio.multipliers.length > 0) {
      reasons.push(
        `ratio on '${ratio.stat}' carries a per-100 multiplier, which raises the ratio's own ` +
          `magnitude (DATA-SOURCES §17); this evaluator does not resolve that shape`,
      );
    }
    if (ratio.owner === 'target') {
      reasons.push(
        `ratio on '${ratio.stat}' is marked as reading the TARGET's stat, but the contract ` +
          `states these four stats belong to the caster and have no second reading`,
      );
    }
  }

  return reasons;
}

/**
 * Resolve one component to pre-mitigation damage.
 *
 * Throws `ComponentEvaluationError` rather than returning a partial figure: a component whose
 * ratio was silently dropped returns a number that is itemised, plausible and too small, and
 * nothing downstream can tell.
 */
export function evaluateComponent(
  component: AbilityComponent,
  context: ComponentContext,
): ComponentDamage {
  const reasons = unsupportedReasons(component);
  if (reasons.length > 0) throw new ComponentEvaluationError(component.id, reasons);

  const at = { rank: context.rank, maxRank: context.maxRank, level: context.level };

  // The base, at this rank (linear/explicit) or at this champion level (byLevel/
  // byLevelExplicit). `valueAt` picks the axis; this file does not duplicate that choice.
  const base = expand(component, component.base, at, 'base');

  const ratios: RatioContribution[] = component.ratios.map((ratio) => {
    const percent = expand(component, ratio, at, `ratio on '${ratio.stat}'`);
    const statValue = coreStatValue(ratio.stat as CoreRatioStat, context.caster);
    // THE ONE DIVISION BY 100 IN THE ENGINE. Magnitudes are stored in percentage points;
    // see the header. Multiplying first keeps the arithmetic exact for the whole-number
    // cases that make up almost all of them (110 × 250 / 100 is exactly 275, where
    // 110 / 100 × 250 is not).
    const damage = (percent * statValue) / 100;
    return { stat: ratio.stat, percent, statValue, damage };
  });

  const perHit = ratios.reduce((sum, r) => sum + r.damage, base);

  // Multiplicity. The contract stores a repeating component once with a count, "not N
  // copies", so the whole component — base and ratios together — lands `hits` times.
  const hits = component.hits ?? 1;

  return {
    componentId: component.id,
    damageType: component.damageType,
    base,
    ratios,
    perHit,
    hits,
    raw: perHit * hits,
  };
}

/**
 * `valueAt`, with any structural failure re-thrown as a ComponentEvaluationError naming the
 * component and the part of it that failed. Callers then have one error type to handle, and
 * the underlying ScalingError is kept as the `cause` so nothing is lost.
 */
function expand(
  component: AbilityComponent,
  scaling: Parameters<typeof valueAt>[0],
  at: { rank: number; maxRank: number; level: number },
  what: string,
): number {
  try {
    return valueAt(scaling, at);
  } catch (error) {
    if (error instanceof ScalingError) {
      throw new ComponentEvaluationError(component.id, [`${what}: ${error.message}`]);
    }
    throw error;
  }
}

/** Convenience for the layer above: the same evaluation, for a list of components. Every
 *  component is evaluated on its own; nothing here decides whether they add or replace. */
export function evaluateComponents(
  components: AbilityComponent[],
  context: ComponentContext,
): ComponentDamage[] {
  return components.map((c) => evaluateComponent(c, context));
}

/** The type of a ratio, narrowed for callers that have already checked it. */
export type CoreRatio = Ratio & { stat: CoreRatioStat };
