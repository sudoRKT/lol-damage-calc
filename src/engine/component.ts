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

import type {
  AbilityComponent,
  DamageType,
  Ratio,
  RatioMultiplier,
  RatioOwner,
  RatioStat,
} from '../types';
import { requiresOwner, ScalingError, valueAt } from '../types';

/**
 * The caster's attack damage and ability power — the four stats that belong to whoever cast the
 * ability and have no second reading.
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

/**
 * ONE CHAMPION'S STATS AS A RATIO MAY READ THEM — the four core stats above, plus the ten a
 * ratio must name an owner for (`OWNER_REQUIRED_STATS` in src/types/data.ts).
 *
 * EVERY OWNED FIELD IS OPTIONAL, AND THAT IS THE POINT. The frozen `StatBlock` does not carry
 * all ten: it has no mana at all, and no bonus-health figure. A caller building this view from
 * a StatBlock simply leaves those out, and a ratio that needs one is REFUSED by name rather
 * than being resolved against an invented zero. A zero here would be a wrong number that looks
 * like a right one, which is the failure this project exists to prevent.
 *
 * `missingHP` is not a field: it is derived as `maxHP - currentHP`, and needs both.
 */
export interface OwnedStats extends CasterStats {
  maxHP?: number;
  currentHP?: number;
  /** Maximum health above the champion's base at this level. NOT derivable from maxHP alone. */
  bonusHP?: number;
  armor?: number;
  bonusArmor?: number;
  magicResist?: number;
  bonusMagicResist?: number;
  maxMana?: number;
  currentMana?: number;
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
  caster: OwnedStats;
  /**
   * The champion being hit. ABSENT IS A REAL STATE: a caller that has not supplied a target
   * cannot resolve `owner: 'target'`, and gets a named refusal instead of the caster's figure.
   */
  target?: OwnedStats;
  /**
   * Which champion's build this effect was found on, for `owner: 'holder'` (item and rune text
   * written from the wearer's point of view — src/types/data.ts, RatioOwner). Absent means
   * nothing states it, and a holder ratio is refused.
   */
  holderIs?: 'caster' | 'target';
  /**
   * Persistent accumulations the user entered up front (SPECIFICATION §3.3), keyed exactly as
   * `Ratio.counter` names them. A counter that is ABSENT is refused rather than read as zero —
   * "the user has none" and "nobody wired this up" are different claims.
   */
  stacks?: Record<string, number>;
  /**
   * THE HOLDER'S RANGE TYPE, for a `byRangeType` value. Added 2026-08-14.
   *
   * Absent is a real state and is NOT a default: `valueAt` refuses a range-split value without
   * one rather than picking an arm, because either arm is wrong for half the roster.
   */
  rangeType?: 'Melee' | 'Ranged';
}

/** One ratio's contribution, kept itemised so a breakdown can show its working. */
export interface RatioContribution {
  stat: RatioStat;
  /**
   * The magnitude actually applied, in PERCENTAGE POINTS. 75 means 75%.
   *
   * This is the stored magnitude PLUS anything a `RatioMultiplier` added to it, because that is
   * what was used. Malzahar R's "10-20% (+ 2.5% per 100 AP)" at rank 3 with 400 ability power
   * reports 25, not 15.
   */
  percent: number;
  /** The stat value the percentage was taken of. */
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

// ---------------------------------------------------------------------------------------
// Resolving WHICH stat, off WHICH champion (src/types/data.ts, RatioStat and RatioOwner)
// ---------------------------------------------------------------------------------------

/** Either the number a ratio reads, or the plain-English reason it cannot be read. */
type StatResolution = { ok: true; value: number } | { ok: false; reason: string };

/**
 * The champion a ratio reads, resolved from its stated owner.
 *
 * There is no default and no fallback anywhere in here. data.ts spells out the cost of one:
 * Bel'Veth R reads the TARGET's missing health, and reading the caster's instead "would return
 * a confident, itemised, entirely wrong number with nothing on screen to say so".
 */
function resolveOwner(
  stat: RatioStat,
  owner: RatioOwner | undefined,
  context: ComponentContext,
  what: string,
): { ok: true; side: OwnedStats } | { ok: false; reason: string } {
  if (owner === undefined) {
    return {
      ok: false,
      reason: `${what} on '${stat}' names no owner, and both champions have that stat, so ` +
        `nothing says whose it is`,
    };
  }
  if (owner === 'unresolved') {
    return {
      ok: false,
      reason: `${what} on '${stat}' is marked 'unresolved': the source does not say whose stat ` +
        `it is, so no amount of work can supply the fact`,
    };
  }

  let side: 'caster' | 'target';
  if (owner === 'holder') {
    if (!context.holderIs) {
      return {
        ok: false,
        reason: `${what} on '${stat}' reads the HOLDER's stat, and nothing states which ` +
          `champion's build this effect was found on`,
      };
    }
    side = context.holderIs;
  } else {
    side = owner;
  }

  if (side === 'target') {
    if (!context.target) {
      return {
        ok: false,
        reason: `${what} on '${stat}' reads the TARGET's stat and no target stat block was supplied`,
      };
    }
    return { ok: true, side: context.target };
  }
  return { ok: true, side: context.caster };
}

/** One owned stat's value off one champion, or the reason the stat block does not carry it. */
function ownedStatValue(stat: RatioStat, side: OwnedStats, what: string): StatResolution {
  const missing = (field: string, note: string): StatResolution => ({
    ok: false,
    reason: `${what} on '${stat}' reads ${field}, which the stat block the engine was given ` +
      `does not carry (${note})`,
  });

  switch (stat) {
    case 'maxHP':
      return side.maxHP === undefined ? missing('maximum health', 'no maxHp figure') : { ok: true, value: side.maxHP };
    case 'currentHP':
      return side.currentHP === undefined
        ? missing('current health', 'no hp figure')
        : { ok: true, value: side.currentHP };
    case 'missingHP':
      // Derived, because the frozen StatBlock carries maximum and current and not the gap.
      if (side.maxHP === undefined || side.currentHP === undefined) {
        return missing('missing health', 'it is maximum minus current, and one of the two is absent');
      }
      return { ok: true, value: side.maxHP - side.currentHP };
    case 'bonusHP':
      return side.bonusHP === undefined
        ? missing(
            'bonus health (bonusHP)',
            'the frozen StatBlock has hp and maxHp only, and bonus health is maximum minus the ' +
              "champion's base at this level, which it does not carry either",
          )
        : { ok: true, value: side.bonusHP };
    case 'armor':
      return side.armor === undefined ? missing('armor', 'no armor figure') : { ok: true, value: side.armor };
    case 'bonusArmor':
      return side.bonusArmor === undefined
        ? missing('bonus armor', 'no armorBonus figure')
        : { ok: true, value: side.bonusArmor };
    case 'magicResist':
      return side.magicResist === undefined
        ? missing('magic resistance', 'no magicResist figure')
        : { ok: true, value: side.magicResist };
    case 'bonusMagicResist':
      return side.bonusMagicResist === undefined
        ? missing('bonus magic resistance', 'no magicResistBonus figure')
        : { ok: true, value: side.bonusMagicResist };
    case 'maxMana':
      return side.maxMana === undefined
        ? missing('maximum mana', 'the frozen StatBlock carries no mana at all — RAISED TO THE LEAD')
        : { ok: true, value: side.maxMana };
    case 'currentMana':
      return side.currentMana === undefined
        ? missing('current mana', 'the frozen StatBlock carries no mana at all — RAISED TO THE LEAD')
        : { ok: true, value: side.currentMana };
    default:
      return { ok: false, reason: `${what} on '${stat}' is not a stat this evaluator knows` };
  }
}

/**
 * The value one ratio (or one ratio multiplier) reads, or the reason it cannot be read.
 *
 * `what` is the word used in every message — "ratio" or "multiplier" — so a refusal names which
 * part of the component failed.
 */
function resolveRatioStat(
  stat: RatioStat,
  owner: RatioOwner | undefined,
  counter: string | undefined,
  context: ComponentContext,
  what: string,
): StatResolution {
  // The four stats that belong to the caster by definition.
  if (isCoreRatioStat(stat)) {
    if (owner === 'target') {
      return {
        ok: false,
        reason: `${what} on '${stat}' is marked as reading the TARGET's stat, but the contract ` +
          `states these four stats belong to the caster and have no second reading`,
      };
    }
    return { ok: true, value: coreStatValue(stat, context.caster) };
  }

  // A persistent accumulation the user entered up front (§3.3). Named by its counter key
  // rather than by an owner — data.ts: "'stacks', which is named by its `counter` key instead".
  if (stat === 'stacks') {
    if (!counter) {
      return {
        ok: false,
        reason: `${what} on 'stacks' names no counter, and the contract requires one so the ` +
          `scenario knows which accumulation to supply`,
      };
    }
    if (!context.stacks || !(counter in context.stacks)) {
      return {
        ok: false,
        reason: `${what} on 'stacks' needs the counter '${counter}', which the scenario did not ` +
          `state; absent and zero are different claims, so it is refused rather than read as 0`,
      };
    }
    return { ok: true, value: context.stacks[counter] };
  }

  // Everything else is a stat both champions possess, so it must say whose.
  if (requiresOwner(stat)) {
    const side = resolveOwner(stat, owner, context, what);
    if (!side.ok) return side;
    return ownedStatValue(stat, side.side, what);
  }

  return { ok: false, reason: `${what} on '${stat}' is not a stat this evaluator knows` };
}

/**
 * A ratio's magnitude in percentage points, with every `RatioMultiplier` folded in, or the
 * reasons it could not be resolved.
 *
 * data.ts: a multiplier means "add `per100` percentage points to this ratio for every 100 of
 * `per`". Malzahar R is "10-20% (+ 2.5% per 100 AP) of target's maximum health" — the 2.5 is
 * NOT a 2.5% AP ratio, it raises the percentage-of-health the ability deals.
 */
function multiplierPoints(
  multipliers: RatioMultiplier[] | undefined,
  context: ComponentContext,
  at: { rank: number; maxRank: number; level: number },
): { ok: true; points: number } | { ok: false; reasons: string[] } {
  if (!multipliers || multipliers.length === 0) return { ok: true, points: 0 };

  const reasons: string[] = [];
  let points = 0;
  for (const multiplier of multipliers) {
    const resolved = resolveRatioStat(
      multiplier.per,
      multiplier.owner,
      undefined,
      context,
      'multiplier',
    );
    if (!resolved.ok) {
      reasons.push(resolved.reason);
      continue;
    }
    let per100: number;
    try {
      per100 = valueAt(multiplier.per100, at);
    } catch (error) {
      if (error instanceof ScalingError) {
        reasons.push(`multiplier on '${multiplier.per}': ${error.message}`);
        continue;
      }
      throw error;
    }
    // The same "per 100" the field is named for: 2.5 points per 100 ability power, at 400
    // ability power, is 2.5 x 4 = 10 points added to the parent ratio.
    points += (per100 * resolved.value) / 100;
  }

  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, points };
}

/**
 * Every reason this evaluator cannot take a component — in plain English, all of them, and an
 * empty array when it can.
 *
 * This is deliberately available WITHOUT evaluating anything, so the same rule can be run
 * across a whole ability list to measure the population it excludes. It takes the component
 * as an argument; the engine reads no data file of its own.
 *
 * THE CONTEXT ARGUMENT IS OPTIONAL, AND ITS ABSENCE IS MEANINGFUL. Called with one argument it
 * answers the narrow question the interface's vertical slice asks — "can this be resolved from
 * the caster's attack damage and ability power alone" — which is the only question a caller
 * holding no stat blocks can ask. Called with a context it answers the real one: "can this be
 * resolved from what I actually have".
 *
 * It is NOT the shape classifier of DATA-SOURCES §19. That classifier lives in the harvester
 * and answers a different question ("which library shape is this row"). This answers "can this
 * function resolve it", which is the only question the engine needs. Two implementations of
 * one rule would be two chances to disagree, so this does not attempt to be the other one.
 */
export function unsupportedReasons(
  component: AbilityComponent,
  context?: ComponentContext,
): string[] {
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
    if (!context) {
      // No context: the caster's four core stats are all that can be resolved.
      if (!isCoreRatioStat(ratio.stat)) {
        reasons.push(
          `ratio on '${ratio.stat}' needs a stat this evaluator is not given ` +
            `(it reads only the caster's base/bonus/total attack damage and ability power)`,
        );
        continue;
      }
      if (ratio.multipliers && ratio.multipliers.length > 0) {
        reasons.push(
          `ratio on '${ratio.stat}' carries a per-100 multiplier, which raises the ratio's own ` +
            `magnitude (DATA-SOURCES §17), and no stats were supplied to resolve it against`,
        );
      }
      if (ratio.owner === 'target') {
        reasons.push(
          `ratio on '${ratio.stat}' is marked as reading the TARGET's stat, but the contract ` +
            `states these four stats belong to the caster and have no second reading`,
        );
      }
      continue;
    }

    const resolved = resolveRatioStat(ratio.stat, ratio.owner, ratio.counter, context, 'ratio');
    if (!resolved.ok) reasons.push(resolved.reason);

    const multiplied = multiplierPoints(ratio.multipliers, context, {
      rank: context.rank,
      maxRank: context.maxRank,
      level: context.level,
    });
    if (!multiplied.ok) reasons.push(...multiplied.reasons);
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
  const reasons = unsupportedReasons(component, context);
  if (reasons.length > 0) throw new ComponentEvaluationError(component.id, reasons);

  const at = {
    rank: context.rank,
    maxRank: context.maxRank,
    level: context.level,
    ...(context.rangeType ? { rangeType: context.rangeType } : {}),
  };

  // The base, at this rank (linear/explicit) or at this champion level (byLevel/
  // byLevelExplicit). `valueAt` picks the axis; this file does not duplicate that choice.
  const base = expand(component, component.base, at, 'base');

  const ratios: RatioContribution[] = component.ratios.map((ratio) => {
    const stored = expand(component, ratio, at, `ratio on '${ratio.stat}'`);

    // A ratio whose own magnitude is scaled (DATA-SOURCES §17). `unsupportedReasons` has
    // already established that every part of this resolves, so the failure arms below cannot
    // be reached; they are written out rather than asserted away.
    const multiplied = multiplierPoints(ratio.multipliers, context, at);
    if (!multiplied.ok) throw new ComponentEvaluationError(component.id, multiplied.reasons);
    const percent = stored + multiplied.points;

    const resolved = resolveRatioStat(ratio.stat, ratio.owner, ratio.counter, context, 'ratio');
    if (!resolved.ok) throw new ComponentEvaluationError(component.id, [resolved.reason]);
    const statValue = resolved.value;

    // THE ONE DIVISION BY 100 FOR A RATIO'S MAGNITUDE. Magnitudes are stored in percentage
    // points; see the header. Multiplying first keeps the arithmetic exact for the whole-number
    // cases that make up almost all of them (110 × 250 / 100 is exactly 275, where
    // 110 / 100 × 250 is not). `multiplierPoints` divides by 100 once more, for the separate
    // "per 100 of a stat" quantity that shape is named for.
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
