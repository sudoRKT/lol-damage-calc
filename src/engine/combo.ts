// THE SEQUENTIAL COMBO RUNNER (SPECIFICATION §3.1).
//
// "The engine is a sequential simulator, not a stat calculator. A combo is an ordered list of
//  discrete instances. Each instance resolves against the state produced by all preceding
//  instances, then mutates that state for those that follow. Order is significant."
//
// This file is that loop. It takes a fully resolved PLAN — stat blocks, ability components,
// and the state changes each instance makes — and returns the frozen `Result` of
// src/types/result.ts.
//
// WHAT IT DELIBERATELY DOES NOT DO
// --------------------------------
// It reads no data file, ever. Champion, item and rune values reach it only as arguments, so
// the calculation layer can be tested entirely on hand-authored fixtures. Turning a Scenario
// into a ComboPlan — looking up the curated abilities, resolving the stat blocks, deciding
// which item passives fire — is a separate job for a layer above this one.
//
// THE PIPELINE FOR ONE INSTANCE, IN ORDER
// ---------------------------------------
//   1. Read the state left by every preceding instance.
//   2. Evaluate the ability's components against the caster's stats     -> `raw`
//   3. Apply crit, if the plan says this instance crits.
//   4. Meet the defender's resistances, through the FIXED four-step
//      order of §3.6 with the accumulated shred as steps 1-2 and the
//      attacker's penetration as steps 3-4                             -> `afterResistances`
//   5. Apply the defender's post-mitigation damage reductions          -> `afterReductions`
//   6. Round, ONCE, for display                                        -> `final`
//   7. Apply this instance's state effects, for the instances that follow.
//
// Step 7 is after step 2 on purpose: AN INSTANCE DOES NOT SHRED ARMOR FOR ITSELF. A user who
// means "the shred was already there when I started" says so in entry state, which is exactly
// what §3.3 provides entry state for.
//
// NO TIME (§3.2). There is not a timestamp, duration or decay anywhere in this file. The only
// ordering facts are two counters.
//
// THE PIPELINE IS RUN ONCE PER DAMAGE TYPE THE INSTANCE CARRIES, and that is the whole reason
// a mixed instance can be modelled at all. 13 abilities deal more than one type in ONE cast
// (src/types/data.ts, `ReportedDamageType`) — Yone W is physical and magic together — and
// sending the whole figure through one resistance would be a confident wrong number. Each type
// meets its own resistance, its own type-specific reductions and its own shields, and the
// instance reports the split in `byType`.
//
// CONTRACT LIMITS THIS FILE STILL HITS AND DOES NOT WORK AROUND. Each is raised to the lead
// rather than papered over, and each shows up to the user in `ENGINE_EXCLUSIONS`:
//   A. `InstanceResult.resistanceSteps` is ONE four-step breakdown. An instance that deals both
//      physical and magic meets TWO, so it is given none rather than one presented as the
//      instance's.
//   B. `DotSource.damageType` is a `DamageType` and has no 'mixed' arm, so a damage-over-time
//      source whose components disagree is refused rather than reported under one type.
//   C. `StatBlock` carries no mana and no bonus-health figure, so a ratio reading one is
//      refused by the component evaluator and the instance is named as incomplete.
//   D. `Result` has nowhere to report healing, lifesteal, omnivamp or spell vamp, so none of
//      them is modelled: a figure with nowhere to go is a figure a user never sees.

import type { AbilityComponent, DamageType, InstanceType, VerificationStatus } from '../types';
import type {
  DamageByType,
  IncompleteReason,
  InstanceResult,
  ResistanceSteps,
  Result,
  StatBlock,
  SurvivalVerdict,
} from '../types/result';
import type { Scenario } from '../types/scenario';

import {
  dealtModifierMultiplier,
  type DamageDealtModifier,
  type DamageReceivedModifier,
} from './amplification';
import { applyCriticalStrike } from './crit';
import { ComponentEvaluationError, evaluateComponent, type ComponentContext, type OwnedStats } from './component';
import { applyDamageReductions, type DefenderDamageReduction } from './damage-reduction';
import { isExecuted } from './execute';
import { resistanceMultiplier, resolveResistanceSteps } from './resistances';
import { applyShields, totalShieldRemaining, type ShieldPool } from './shields';
import { roundDamage } from './rounding';
import { resolveVariableHits } from './variable-hits';
import {
  applyStateEffects,
  combinedPercentReduction,
  foldPersistentAccumulations,
  seedCombatState,
  snapshotCombatState,
  totalFlatReduction,
  type CombatState,
  type PersistentState,
  type ResistanceShred,
  type StateEffect,
} from './state';

// ---------------------------------------------------------------------------------------
// The plan: what the layer above hands the runner
// ---------------------------------------------------------------------------------------

/**
 * Penetration the ATTACKER'S BUILD supplies, stated BESIDE the stat block rather than on it.
 *
 * Steps 3 and 4 of the fixed order in §3.6. It does not accumulate — a champion's lethality
 * does not grow because they landed an ability — so it never belonged in `CombatState`.
 *
 * THE STAT BLOCK IS NOW THE HOME FOR THIS. `StatBlock.penetration` carries all five figures,
 * including percentage BONUS armor penetration, which this shape cannot express. This field is
 * kept for callers that have not moved yet, and where it is present for a side it REPLACES the
 * stat block's figures for that side rather than adding to them — two sources for one number
 * that were summed would double every attacker's penetration.
 */
export interface StaticPenetration {
  /** Fraction of 1: 40% penetration is 0.4. */
  percentPenetration?: number;
  /** Flat penetration — lethality on the armor side. */
  flatPenetration?: number;
}

/**
 * FLAT DAMAGE REDUCTION APPLIED BEFORE RESISTANCES (SPECIFICATION §3.7).
 *
 * https://wiki.leagueoflegends.com/en-us/Damage_modifier, read 2026-08-13, lists exactly four:
 * Fizz's Nimble Fighter, Leona's Eclipse, Amumu's Tantrum and Guardian's Horn. It is a
 * different mechanic from the post-mitigation kind in damage-reduction.ts, not a variant:
 * "Some flat damage reductions are factored in AFTER armor or magic resistance. This makes it
 * significantly better the more resistances you have." Being pre-mitigation therefore makes
 * these WEAKER against a resistant defender, and the two cannot be modelled as one thing.
 *
 * "Flat damage reduction does not work against true damage" governs both kinds.
 */
export interface PreMitigationReduction {
  /** Shown to the user, e.g. "Guardian's Horn". */
  label: string;
  /** Points removed from the raw figure. Additive across sources; floored at zero damage. */
  flat: number;
  /** Damage types this rule touches. Absent means physical and magic (never true). */
  damageTypes?: DamageType[];
}

/** An execute threshold an instance carries (SPECIFICATION §3.7). See `applyExecute` below. */
export interface PlannedExecute {
  /** Shown to the user, e.g. "R — Death from Below". */
  label: string;
  /**
   * The threshold in POINTS of health, not a percentage. A "below 15% of maximum health"
   * execute is converted by the caller with `healthThresholdFromMaxHealth`, because the
   * percentage may be of maximum or of missing health depending on the ability, and this
   * engine does not guess which.
   */
  thresholdHealth: number;
}

/** One damaging payload: the stored components plus everything needed to resolve them. */
export interface PlannedDamage {
  components: AbilityComponent[];
  /** The caster's rank in this ability, and the ability's OWN rank count. */
  rank: number;
  maxRank: number;
  /**
   * Which components apply, by id. REQUIRED whenever any component is `alternativeTo`
   * another: Darius Q hits with the blade OR the handle, and summing them is the plausible
   * wrong number data.ts warns about. Absent with no alternatives present means "all of them".
   */
  chosenComponentIds?: string[];
  /** The user's stated counts for components carrying `variableHits`, keyed by component id
   *  (`ComboStep.hitCounts`). Absent means the documented minimum. */
  hitCounts?: Record<string, number>;
  /** Whether this instance critically strikes. A decision, never a dice roll (crit.ts). */
  crit?: boolean;
  /**
   * WHOSE BUILD THIS EFFECT CAME OFF, for a ratio marked `owner: 'holder'`.
   *
   * Item and rune text is written from the wearer's point of view (src/types/data.ts,
   * `RatioOwner`), and the same stored effect reads the attacker's stats on the attacker's
   * build and the defender's on the defender's. Absent means nothing states it, and a holder
   * ratio is then refused rather than assumed to be the attacker's.
   */
  holder?: 'attacker' | 'defender';
}

/** A damage-over-time source registered by an instance. Reported separately (§3.8). */
export interface PlannedDot {
  label: string;
  icon?: string | null;
  verification: VerificationStatus;
  incompleteReason?: IncompleteReason;
  /** The components stating the FULL-DURATION total, not one tick. */
  damage: PlannedDamage;
}

/** One resolved position in the combo. */
export interface PlannedInstance {
  /** Matches `ComboStep.id`. */
  stepId: string;
  /** Shown to the user, e.g. "Q — The Darkin Blade (1st cast)". */
  sourceLabel: string;
  icon?: string | null;
  instanceType: InstanceType;
  verification: VerificationStatus;
  incompleteReason?: IncompleteReason;
  /** Absent for a non-damaging ability, which still occupies a position (§3.4). */
  damage?: PlannedDamage;
  /** A DoT this instance registers. */
  dot?: PlannedDot;
  /** What this instance does to combat state, applied AFTER its own damage resolves. */
  effects?: StateEffect[];
  /**
   * Damage-dealt amplifiers that apply to THIS instance only, on top of any the plan states for
   * the whole sequence. Additive with them (amplification.ts).
   */
  amplifiers?: DamageDealtModifier[];
  /** An execute threshold this instance carries. */
  execute?: PlannedExecute;
}

export interface ComboPlan {
  patch: string;
  /** Echoed into the Result for sharing, and read for the two champions' entry state. */
  scenario: Scenario;
  /** Both stat blocks, ALREADY folded with persistent accumulations (§3.3). */
  attacker: StatBlock;
  defender: StatBlock;
  /** Steps 3 and 4 of §3.6. An OVERRIDE of `attacker.penetration`, per the note on
   *  `StaticPenetration`; absent means the stat block's own figures are used. */
  attackerPenetration?: { armor?: StaticPenetration; magicResist?: StaticPenetration };
  /** Damage-dealt amplifiers in force for the whole sequence (§3.7). Additive (amplification.ts). */
  attackerAmplifiers?: DamageDealtModifier[];
  /** Flat reductions applied BEFORE resistances (§3.7). */
  defenderPreMitigationReductions?: PreMitigationReduction[];
  /** The defender's post-mitigation reductions (§3.7, §5). */
  defenderReductions?: DefenderDamageReduction[];
  /** Damage-RECEIVED modifiers on the defender (§3.7). Multiplicative (amplification.ts). */
  defenderReceivedModifiers?: DamageReceivedModifier[];
  /**
   * Shields on the defender, SPENT IN THIS ORDER (§3.7). The game spends the shield that
   * expires soonest and this engine has no time dimension (§3.2), so list order — the user's
   * own — is what is used, and it is disclosed in `ENGINE_EXCLUSIONS`. See shields.ts.
   */
  defenderShields?: ShieldPool[];
  /** The combo, in order. */
  instances: PlannedInstance[];
  /** Instances delivered before this sequence begins (§5, a fight joined part-way). */
  instancesAlreadyResolved?: number;
  /** Of those, how many delivered damage. Defaults to `instancesAlreadyResolved`. */
  damagingInstancesAlreadyResolved?: number;
  /** Anything the CALLER knows it left out. The engine adds its own list to it. */
  excludedMechanics?: string[];
}

/**
 * Mechanics this runner does not model, stated in every Result.
 *
 * SPECIFICATION §11: "Every excluded mechanic is stated visibly in the result rather than
 * silently omitted." These are unconditional properties of this version of the engine, so
 * they are added to every result rather than left to a caller to remember.
 */
export const ENGINE_EXCLUSIONS: readonly string[] = [
  // AN ASSUMPTION, NOT AN EXCLUSION, AND IT IS SHOWN ON EVERY RESULT. Decided 2026-08-13.
  //
  // The wiki's damage-reduction article states that reductions stack multiplicatively and that
  // some flat reductions apply after resistances, but NEVER states whether percentage or flat
  // goes first. On 200 damage with a 25% and a 30-point reduction the two readings give 120 and
  // 127.5 — a 6% difference, not a rounding artefact. The engine applies percentage first.
  //
  // It is listed here rather than hidden because a user is owed the knowledge that one ordering
  // in their result rests on a convention rather than a source. It is settled by cross-checking a
  // public calculator (CLAUDE.md's third source of authority), and a disagreement there is a
  // FINDING TO SURFACE, never something to quietly reconcile.
  'The order of percentage against flat damage reduction — the engine applies percentage first, ' +
    'which no source states. Awaiting a cross-check against a public calculator',

  // A SECOND ASSUMPTION OF THE SAME KIND. The wiki states that resistances mitigate damage
  // "before being absorbed by shielding" and says nothing about where a post-mitigation flat
  // reduction sits relative to the shield. The engine reduces first and lets the shield absorb
  // what is left, which is the reading that treats a shield as standing in front of health.
  'The order of a shield against post-mitigation flat damage reduction — the engine reduces ' +
    'first and the shield absorbs what remains, which no source states',

  // NOT AN ASSUMPTION BUT A MISSING DIMENSION, and it is disclosed for the same reason.
  'Which shield absorbs first when several are up at once — the game spends the one that ' +
    'expires soonest, and this engine models sequence rather than elapsed time (§3.2), so it ' +
    'spends them in the order the scenario lists them',

  'Lifesteal, omnivamp and spell vamp on the attacker, and healing on the defender — the ' +
    'Result has no field to report sustain in, so a figure for it would be one the user never ' +
    'sees. Raised to the lead rather than computed and discarded',

  'Ability ratios that read MANA or BONUS HEALTH — the frozen StatBlock carries neither, so an ' +
    'instance carrying one contributes no damage and is listed as incomplete. Ratios on the ' +
    'health pools, armor, magic resistance and stack counters ARE modelled',

  'The four-step resistance breakdown for an instance that deals BOTH physical and magic ' +
    'damage — it meets two, and the result carries one, so it is given none rather than one ' +
    'shown as though it were the instance’s. The damage itself is fully modelled',

  'An execute threshold on an instance that deals more than one damage type — the execute ' +
    'delivers the target’s remaining health and nothing states which type that is, so the ' +
    'instance is refused rather than attributed by guess',

  'A damage-over-time source whose components carry more than one damage type — the Result’s ' +
    'DoT line carries one type and has no mixed arm',

  'Shield strength raised by heal and shield power, shield reduction (Serpent’s Fang) and ' +
    'shield destruction other than by an execute — the scenario states each shield’s remaining ' +
    'strength directly',
];

// ---------------------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------------------

/**
 * Run a combo, in order, against state that changes as it goes.
 *
 * Deterministic: the same plan always returns the same Result. Nothing is randomised and
 * nothing is read from disk.
 */
export function runCombo(plan: ComboPlan): Result {
  // The two categories of entry state (§3.3), kept in two objects with two lifetimes.
  const persistent: PersistentState = foldPersistentAccumulations(
    plan.scenario.attacker.persistent,
    plan.scenario.defender.persistent,
  );
  let combat: CombatState = seedCombatState({
    attackerEntryState: plan.scenario.attacker.entryState,
    defenderEntryState: plan.scenario.defender.entryState,
    defenderCurrentHp: plan.defender.hp,
    instancesAlreadyResolved: plan.instancesAlreadyResolved,
    damagingInstancesAlreadyResolved: plan.damagingInstancesAlreadyResolved,
  });

  const reductions = plan.defenderReductions ?? [];
  const received = plan.defenderReceivedModifiers ?? [];
  const perInstance: InstanceResult[] = [];
  const runningTotal: number[] = [];
  const incompleteContributors: Result['incompleteContributors'] = [];
  const burstByType: DamageByType = { physical: 0, magic: 0, true: 0 };
  const dotByType: DamageByType = { physical: 0, magic: 0, true: 0 };
  const dotSources: Result['dot']['sources'] = [];
  const statuses: VerificationStatus[] = [];
  /** Damage each instance ACTUALLY applied to health, unrounded, for the survival verdict. */
  const appliedPerInstance: number[] = [];

  // The defender's shields, spent as the sequence runs. They are combat state in every sense,
  // and they live here rather than in `CombatState` because state.ts holds a deliberately small
  // vocabulary of counters and shreds; a shield is a pool with a kind, not a counter.
  let shields: ShieldPool[] = (plan.defenderShields ?? []).map((s) => ({ ...s }));

  // Every instance, in order. Nothing here looks ahead.
  plan.instances.forEach((instance, position) => {
    const instanceNumber = combat.instancesResolved + 1;
    const damagingInstanceNumber = combat.damagingInstancesResolved + 1;
    const healthBefore = combat.defenderCurrentHp;
    const shieldBefore = totalShieldRemaining(shields);

    let resolved = resolveDamage(instance.damage, plan, combat, persistent, instance);

    // An execute delivers the target's remaining health, and the result must say which damage
    // type that was. On an instance carrying two, nothing states which — so it is refused
    // rather than attributed by guess. Named in ENGINE_EXCLUSIONS.
    if (instance.execute && resolved.status !== 'incomplete' && resolved.types.length > 1) {
      resolved = {
        ...resolved,
        rawByType: { physical: 0, magic: 0, true: 0 },
        raw: 0,
        status: 'incomplete',
        reason: {
          kind: 'pending',
          note:
            'this instance carries an execute threshold AND deals more than one damage type; ' +
            'an execute delivers the target’s remaining health and nothing states which type ' +
            'that damage is',
        },
        refused: true,
      };
    }

    // ------- the pipeline, run once per damage type this instance carries -------
    const amplifiers = [...(plan.attackerAmplifiers ?? []), ...(instance.amplifiers ?? [])];
    const rawByType = amplify(resolved.rawByType, amplifiers);
    const preByType = applyPreMitigation(rawByType, plan.defenderPreMitigationReductions ?? []);
    const stepsByType = resistanceStepsByType(plan, combat);
    const resByType = mitigateByType(preByType, stepsByType);
    const redByType = reduceByType(resByType, reductions, received, damagingInstanceNumber);

    // Shields absorb what is left, unless the instance executes — the wiki lists executes among
    // the effects that "fully destroy any shields before applying their damage".
    const executed =
      instance.execute !== undefined &&
      resolved.status !== 'incomplete' &&
      isExecuted(healthBefore, instance.execute.thresholdHealth);

    let appliedByType: DamageByType;
    let absorbed = 0;
    if (executed) {
      shields = shields.map((s) => ({ ...s, remaining: 0 }));
      appliedByType = applyExecute(redByType, resolved.types, healthBefore);
    } else {
      const absorption = absorbThroughShields(redByType, shields);
      shields = absorption.pools;
      absorbed = absorption.absorbed;
      appliedByType = absorption.appliedByType;
    }

    const raw = total(rawByType);
    const applied = total(appliedByType);

    const snapshot: Record<string, number | boolean> = {
      ...snapshotCombatState(combat, persistent, instanceNumber, damagingInstanceNumber),
      defenderEffectiveArmor: stepsByType.physical.afterFlatPenetration,
      defenderEffectiveMagicResist: stepsByType.magic.afterFlatPenetration,
      // The shield this instance MET, and — an outcome rather than a state — what it took.
      defenderShieldRemaining: shieldBefore,
      shieldAbsorbed: absorbed,
      ...(instance.execute
        ? { executed, executeThreshold: instance.execute.thresholdHealth }
        : {}),
    };

    const reported = reportedDamageType(resolved);
    const steps = soleMitigatedSteps(resolved, stepsByType);

    perInstance.push({
      index: position + 1,
      stepId: instance.stepId,
      sourceLabel: instance.sourceLabel,
      icon: instance.icon ?? null,
      instanceType: instance.instanceType,
      damageType: reported,
      ...(reported === 'mixed' ? { byType: roundByType(appliedByType) } : {}),
      raw,
      afterPreMitigationReduction: total(preByType),
      afterResistances: total(resByType),
      ...(steps ? { resistanceSteps: steps } : {}),
      afterReductions: total(redByType),
      // THE ONE ROUNDING CALL for an instance. Never fed back into the arithmetic below.
      // It is the damage that reached HEALTH: what a shield absorbed did not.
      final: roundDamage(applied),
      crit: instance.damage?.crit === true,
      stateSnapshot: snapshot,
      verification: resolved.status,
      ...(resolved.reason ? { incompleteReason: resolved.reason } : {}),
    });

    if (resolved.status === 'incomplete') {
      incompleteContributors.push({ sourceLabel: instance.sourceLabel, reason: resolved.reason! });
    }
    statuses.push(resolved.status);

    // Accumulate UNROUNDED. rounding.ts: rounded output is never fed back into arithmetic,
    // so rounding cannot accumulate across a combo.
    burstByType.physical += appliedByType.physical;
    burstByType.magic += appliedByType.magic;
    burstByType.true += appliedByType.true;
    appliedPerInstance.push(applied);
    combat = {
      ...combat,
      cumulativeBurst: combat.cumulativeBurst + applied,
      defenderCurrentHp: combat.defenderCurrentHp - applied,
      instancesResolved: instanceNumber,
      damagingInstancesResolved: countsAsDamaging(instance, resolved)
        ? damagingInstanceNumber
        : combat.damagingInstancesResolved,
    };
    runningTotal.push(roundDamage(combat.cumulativeBurst));

    // Step 7: this instance's effects, for the instances that follow it.
    if (instance.effects && instance.effects.length > 0) {
      combat = applyStateEffects(combat, instance.effects);
    }
  });

  // Damage over time, resolved LAST, against the state the sequence finished in.
  // §3.8: "DoT contributions are reported as a separate line stating the total damage
  // delivered over the effect's full duration FOLLOWING the combo." So the resistances it
  // meets are the shredded ones the combo left behind, and reduction rules stated as an
  // instance window do not reach it — a DoT is not an instance. `null` says so.
  for (const instance of plan.instances) {
    if (!instance.dot) continue;
    const dot = instance.dot;
    let resolved = resolveDamage(dot.damage, plan, combat, persistent, dot);

    // `DotSource.damageType` has no 'mixed' arm, so a multi-type DoT cannot be reported.
    // Refused rather than filed under one of its types. Named in ENGINE_EXCLUSIONS.
    if (resolved.status !== 'incomplete' && resolved.types.length > 1) {
      resolved = {
        ...resolved,
        rawByType: { physical: 0, magic: 0, true: 0 },
        raw: 0,
        status: 'incomplete',
        reason: {
          kind: 'pending',
          note:
            `this damage-over-time source carries more than one damage type ` +
            `(${resolved.types.join(', ')}), and the result's DoT line carries exactly one`,
        },
        refused: true,
      };
    }

    const rawByType = amplify(resolved.rawByType, plan.attackerAmplifiers ?? []);
    const preByType = applyPreMitigation(rawByType, plan.defenderPreMitigationReductions ?? []);
    const stepsByType = resistanceStepsByType(plan, combat);
    const resByType = mitigateByType(preByType, stepsByType);
    const redByType = reduceByType(resByType, reductions, received, null);
    const absorption = absorbThroughShields(redByType, shields);
    shields = absorption.pools;

    const applied = total(absorption.appliedByType);
    dotByType.physical += absorption.appliedByType.physical;
    dotByType.magic += absorption.appliedByType.magic;
    dotByType.true += absorption.appliedByType.true;

    dotSources.push({
      label: dot.label,
      icon: dot.icon ?? null,
      // One type, or 'true' when there is none at all — a DoT that dealt nothing meets no
      // resistance, so the label cannot mis-mitigate anything downstream. `DotSource` has no
      // 'none' arm; raised to the lead.
      damageType: resolved.types.length === 1 ? resolved.types[0] : 'true',
      total: roundDamage(applied),
      verification: resolved.status,
      ...(resolved.reason ? { incompleteReason: resolved.reason } : {}),
    });
    if (resolved.status === 'incomplete') {
      incompleteContributors.push({ sourceLabel: dot.label, reason: resolved.reason! });
    }
    statuses.push(resolved.status);
  }

  const burstTotalUnrounded = burstByType.physical + burstByType.magic + burstByType.true;
  const dotTotalUnrounded = dotByType.physical + dotByType.magic + dotByType.true;

  return {
    patch: plan.patch,
    scenario: plan.scenario,
    attackerStats: plan.attacker,
    defenderStats: plan.defender,
    perInstance,
    runningTotal,
    burst: { total: roundDamage(burstTotalUnrounded), byType: roundByType(burstByType) },
    dot: {
      total: roundDamage(dotTotalUnrounded),
      byType: roundByType(dotByType),
      sources: dotSources,
    },
    // The verdict, twice (§3.8): burst alone, and burst plus full DoT resolution.
    verdict: {
      burstOnly: verdict(plan.defender.hp, burstTotalUnrounded, appliedPerInstance),
      burstPlusDot: verdict(
        plan.defender.hp,
        burstTotalUnrounded + dotTotalUnrounded,
        appliedPerInstance,
      ),
    },
    excludedMechanics: [...ENGINE_EXCLUSIONS, ...(plan.excludedMechanics ?? [])],
    verificationSummary: worstStatus(statuses),
    incompleteContributors,
  };
}

// ---------------------------------------------------------------------------------------
// One instance's damage
// ---------------------------------------------------------------------------------------

/** The one order the three types are walked in, everywhere in this file. */
const DAMAGE_TYPES: readonly DamageType[] = ['physical', 'magic', 'true'];

function zeroByType(): DamageByType {
  return { physical: 0, magic: 0, true: 0 };
}

function total(byType: DamageByType): number {
  return byType.physical + byType.magic + byType.true;
}

interface ResolvedDamage {
  /** Pre-mitigation damage, per type, unrounded. All zero when the instance was refused (§8). */
  rawByType: DamageByType;
  /**
   * The distinct damage types the SELECTED COMPONENTS carry, in canonical order. Structural:
   * a component whose value happens to be zero still puts its type here, because the ability
   * does deal that type. Empty when there is no payload at all.
   */
  types: DamageType[];
  /** The sum of `rawByType`. */
  raw: number;
  status: VerificationStatus;
  reason?: IncompleteReason;
  /** True when the runner refused it, as opposed to the plan already calling it incomplete. */
  refused: boolean;
}

/**
 * What a payload is worth, per damage type, against the state the sequence has reached.
 *
 * `combat` is passed in because a ratio may read the target's CURRENT or MISSING health, which
 * the preceding instances have changed. §3.1: "Each instance resolves against the state
 * produced by all preceding instances."
 */
function resolveDamage(
  damage: PlannedDamage | undefined,
  plan: ComboPlan,
  combat: CombatState,
  persistent: PersistentState,
  planned: { verification: VerificationStatus; incompleteReason?: IncompleteReason },
): ResolvedDamage {
  const structuralTypes = damage ? distinctTypes(damage.components) : [];

  // SPECIFICATION §8: an incomplete ability contributes NO damage. That is the status's whole
  // meaning — a figure is absent rather than wrong. `result.ts` adds the fallback rule: an
  // incomplete entry with no stated reason is 'pending', never 'permanent'.
  if (planned.verification === 'incomplete') {
    return {
      rawByType: zeroByType(),
      types: structuralTypes,
      raw: 0,
      status: 'incomplete',
      reason: planned.incompleteReason ?? {
        kind: 'pending',
        note: 'the source records this ability as incomplete and states no reason',
      },
      refused: false,
    };
  }

  if (!damage) {
    return {
      rawByType: zeroByType(),
      types: [],
      raw: 0,
      status: planned.verification,
      refused: false,
    };
  }

  const reasons: string[] = [];

  // Which components apply. Alternatives are NEVER summed.
  let selected = damage.components;
  if (damage.chosenComponentIds) {
    const chosen = damage.chosenComponentIds;
    const missing = chosen.filter((id) => !damage.components.some((c) => c.id === id));
    if (missing.length > 0) {
      reasons.push(`the scenario chose component(s) this ability does not have: ${missing.join(', ')}`);
    }
    selected = damage.components.filter((c) => chosen.includes(c.id));
  } else if (damage.components.some((c) => c.relation?.kind === 'alternativeTo')) {
    reasons.push(
      'this ability has alternative components (one OR the other) and the scenario does not ' +
        'state which applies, so the engine will not add them together',
    );
  }

  // MORE THAN ONE TYPE IS NO LONGER A REFUSAL. 13 abilities deal two types in one cast, and
  // each type is now mitigated by its own resistance further down. What the instance may not
  // do is claim one type for damage of another.
  const types = distinctTypes(selected);
  const context = componentContext(damage, plan, combat, persistent);

  // Evaluate each selected component into its own type's bucket.
  const rawByType = zeroByType();
  for (const component of selected) {
    if (component.hits !== undefined && component.variableHits !== undefined) {
      reasons.push(
        `component '${component.id}' states both a fixed hit count and a variable one, ` +
          'which are two answers to the same question',
      );
      continue;
    }
    let value: number;
    try {
      value = evaluateComponent(component, context).raw;
    } catch (error) {
      if (error instanceof ComponentEvaluationError) {
        reasons.push(...error.reasons);
        continue;
      }
      throw error;
    }
    if (component.variableHits) {
      // The count is a property of the SITUATION and arrives from the scenario, never here.
      value *= resolveVariableHits(component.variableHits, damage.hitCounts?.[component.id]).multiplier;
    }
    rawByType[component.damageType] += value;
  }

  if (reasons.length > 0) {
    return {
      rawByType: zeroByType(),
      types,
      raw: 0,
      status: 'incomplete',
      reason: { kind: 'pending', note: reasons.join('; ') },
      refused: true,
    };
  }

  // Crit is a decision the combo makes, not a dice roll (crit.ts). It multiplies the whole
  // instance, so it is applied to each type's share — the same multiplier, and the same total.
  if (damage.crit) {
    for (const type of DAMAGE_TYPES) {
      rawByType[type] = applyCriticalStrike(rawByType[type], true, plan.attacker.critDamage);
    }
  }

  return { rawByType, types, raw: total(rawByType), status: planned.verification, refused: false };
}

/** The distinct damage types a component list carries, in the canonical order. */
function distinctTypes(components: AbilityComponent[]): DamageType[] {
  const present = new Set(components.map((c) => c.damageType));
  return DAMAGE_TYPES.filter((type) => present.has(type));
}

/**
 * One champion's stats as a ratio may read them (component.ts, `OwnedStats`).
 *
 * WHAT IS DELIBERATELY LEFT OUT: bonus health, maximum mana and current mana. The frozen
 * `StatBlock` carries none of the three, and bonus health cannot be derived from maximum
 * health without the champion's base at that level. A ratio needing one is refused by name.
 */
function statsView(block: StatBlock, currentHp: number): OwnedStats {
  return {
    attackDamage: block.attackDamage,
    abilityPower: block.abilityPower,
    maxHP: block.maxHp,
    currentHP: currentHp,
    armor: block.armor,
    bonusArmor: block.armorBonus,
    magicResist: block.magicResist,
    bonusMagicResist: block.magicResistBonus,
  };
}

/**
 * Everything one payload's components are evaluated against.
 *
 * The TARGET's current health is the LIVE figure the sequence has reached, not the one the
 * scenario started from — that is what makes a missing-health ratio grow as the combo lands.
 * The CASTER's is static: SPECIFICATION §5 says the defender "does not act", so nothing in a
 * combo takes health off the attacker.
 */
function componentContext(
  damage: PlannedDamage,
  plan: ComboPlan,
  combat: CombatState,
  persistent: PersistentState,
): ComponentContext {
  const holderIsDefender = damage.holder === 'defender';
  return {
    rank: damage.rank,
    maxRank: damage.maxRank,
    level: plan.attacker.level,
    caster: statsView(plan.attacker, plan.attacker.hp),
    target: statsView(plan.defender, combat.defenderCurrentHp),
    ...(damage.holder ? { holderIs: holderIsDefender ? ('target' as const) : ('caster' as const) } : {}),
    // A stack counter belongs to whoever the effect is on: the caster for an ability, and the
    // holder for an item or rune reached through the defender's build.
    stacks: holderIsDefender ? persistent.defender : persistent.attacker,
  };
}

/**
 * The type a RESULT reports for this instance (src/types/data.ts, `ReportedDamageType`).
 *
 * 'none' means the instance dealt nothing — a non-damaging ability, or one the engine refused,
 * which contributes no damage by SPECIFICATION §8. A payload that resolved keeps its own type
 * even if the figure came out at zero: that is still a claim about what the ability deals.
 */
function reportedDamageType(resolved: ResolvedDamage): InstanceResult['damageType'] {
  if (resolved.status === 'incomplete' || resolved.types.length === 0) return 'none';
  return resolved.types.length === 1 ? resolved.types[0] : 'mixed';
}

/**
 * Whether this instance spends a place in a reduction window (§5).
 *
 * It does when the plan gave it a damage payload AND that payload either resolved to
 * something or was refused. The two exclusions are deliberate:
 *   - a non-damaging ability occupies a position without delivering damage (§3.4);
 *   - an ability the user said landed zero times "missed entirely and contributes nothing"
 *     (scenario.ts), and a miss does not consume a defensive charge.
 * An instance refused by the engine DOES count, because in the game it did deal damage — the
 * engine simply cannot say how much.
 */
function countsAsDamaging(instance: PlannedInstance, resolved: ResolvedDamage): boolean {
  if (!instance.damage) return false;
  return resolved.refused || resolved.status === 'incomplete' || resolved.raw > 0;
}

// ---------------------------------------------------------------------------------------
// Mitigation
// ---------------------------------------------------------------------------------------

/** The physical and magic breakdowns of §3.6, for the state the sequence has reached. */
interface StepsByType {
  physical: ResistanceSteps;
  magic: ResistanceSteps;
}

/**
 * The defender's two four-step breakdowns, against the shred accumulated so far.
 *
 * THE BASE/BONUS SPLIT IS TAKEN AS (total, bonus), NOT (base, bonus). `StatBlock` carries all
 * three and a validator rule requires base + bonus to equal the total, but the total is the
 * figure every existing caller sets and the one the multiplier has always been taken against.
 * Deriving base as total - bonus therefore cannot silently lose armor if the split is only
 * half filled in, while still resolving percentage BONUS penetration correctly.
 */
function resistanceStepsByType(plan: ComboPlan, combat: CombatState): StepsByType {
  return {
    physical: stepsFor('physical', plan, combat.defenderShred),
    magic: stepsFor('magic', plan, combat.defenderShred),
  };
}

function stepsFor(
  damageType: 'physical' | 'magic',
  plan: ComboPlan,
  shred: { armor: ResistanceShred; magicResist: ResistanceShred },
): ResistanceSteps {
  const isPhysical = damageType === 'physical';
  const defender = plan.defender;
  const totalResistance = isPhysical ? defender.armor : defender.magicResist;
  const bonus = isPhysical ? defender.armorBonus : defender.magicResistBonus;
  const accumulated = isPhysical ? shred.armor : shred.magicResist;

  // The attacker's build, from the stat block — or from the plan-level override, which REPLACES
  // it for that side rather than adding to it (see `StaticPenetration`).
  const built = plan.attacker.penetration;
  const override = isPhysical ? plan.attackerPenetration?.armor : plan.attackerPenetration?.magicResist;
  const percentPenetration =
    override?.percentPenetration ?? (isPhysical ? built.percentArmor : built.percentMagic);
  const flatPenetration = override?.flatPenetration ?? (isPhysical ? built.flatArmor : built.flatMagic);

  return resolveResistanceSteps(
    { base: totalResistance - bonus, bonus },
    {
      // Steps 1 and 2 — REDUCTION, which accumulates as the combo runs.
      flatReduction: totalFlatReduction(accumulated),
      percentReduction: combinedPercentReduction(accumulated),
      // Steps 3 and 4 — PENETRATION, from the attacker's build, constant for the sequence.
      percentPenetration,
      // Percentage BONUS armor penetration has no magic-resistance counterpart, so it is only
      // ever read on the physical side. `StatBlock.penetration` carries no magic equivalent.
      ...(isPhysical ? { percentBonusPenetration: built.percentBonusArmor } : {}),
      flatPenetration,
    },
  );
}

/**
 * The ONE breakdown this instance may report, or undefined.
 *
 * Absent for true damage, which meets no resistance — src/types/result.ts: "an absent breakdown
 * and a breakdown of zeroes are different claims". Absent too for an instance that deals BOTH
 * physical and magic, which meets two breakdowns where the contract carries one; showing either
 * would present one chain as though it were the instance's. Named in ENGINE_EXCLUSIONS.
 */
function soleMitigatedSteps(
  resolved: ResolvedDamage,
  stepsByType: StepsByType,
): ResistanceSteps | undefined {
  if (resolved.status === 'incomplete') return undefined;
  const mitigated = resolved.types.filter((type) => type !== 'true');
  if (mitigated.length !== 1) return undefined;
  return mitigated[0] === 'physical' ? stepsByType.physical : stepsByType.magic;
}

/** Attacker-side amplification, applied to the raw figure of each type. Additive (§3.7). */
function amplify(rawByType: DamageByType, amplifiers: DamageDealtModifier[]): DamageByType {
  if (amplifiers.length === 0) return { ...rawByType };
  const out = zeroByType();
  for (const type of DAMAGE_TYPES) {
    out[type] = rawByType[type] * dealtModifierMultiplier(amplifiers, type);
  }
  return out;
}

/**
 * Flat reduction applied BEFORE resistances, per type.
 *
 * "Flat damage reduction does not work against true damage" (wiki, Damage modifier), so the
 * true share is never touched. Sources are summed, and the result floors at zero rather than
 * turning damage into healing.
 */
function applyPreMitigation(
  rawByType: DamageByType,
  rules: PreMitigationReduction[],
): DamageByType {
  if (rules.length === 0) return { ...rawByType };
  const out = zeroByType();
  for (const type of DAMAGE_TYPES) {
    if (type === 'true') {
      out.true = rawByType.true;
      continue;
    }
    const flat = rules
      .filter((rule) => !rule.damageTypes || rule.damageTypes.includes(type))
      .reduce((sum, rule) => sum + rule.flat, 0);
    out[type] = Math.max(0, rawByType[type] - flat);
  }
  return out;
}

/** Each type through ITS OWN resistance (§3.6). True damage bypasses both. */
function mitigateByType(byType: DamageByType, stepsByType: StepsByType): DamageByType {
  return {
    physical: byType.physical * stepsByType.physical.multiplier,
    magic: byType.magic * stepsByType.magic.multiplier,
    // True damage bypasses both resistances (§3.6). `resistanceMultiplier` is called rather
    // than the literal 1 so the rule lives in one place.
    true: byType.true * resistanceMultiplier('true', 0),
  };
}

/** Post-mitigation reductions and damage-received modifiers, per type. */
function reduceByType(
  byType: DamageByType,
  rules: DefenderDamageReduction[],
  received: DamageReceivedModifier[],
  damagingInstanceNumber: number | null,
): DamageByType {
  const out = zeroByType();
  for (const type of DAMAGE_TYPES) {
    out[type] = applyDamageReductions(byType[type], rules, damagingInstanceNumber, type, received);
  }
  return out;
}

/**
 * Shields absorb what is left, one type at a time, in the canonical order.
 *
 * The order matters only when a GENERAL shield meets a mixed instance and cannot cover all of
 * it: whichever type is offered first spends the shield. Physical, magic, true is the order
 * used everywhere else in this file and in `DamageByType`, so it is the order used here.
 */
function absorbThroughShields(
  byType: DamageByType,
  pools: ShieldPool[],
): { appliedByType: DamageByType; absorbed: number; pools: ShieldPool[] } {
  let current = pools;
  const appliedByType = zeroByType();
  let absorbed = 0;
  for (const type of DAMAGE_TYPES) {
    const outcome = applyShields(current, type, byType[type]);
    current = outcome.pools;
    appliedByType[type] = outcome.applied;
    absorbed += outcome.absorbed;
  }
  return { appliedByType, absorbed, pools: current };
}

/**
 * An execute that fired: the instance delivers the target's remaining health.
 *
 * https://wiki.leagueoflegends.com/en-us/Kill (read 2026-08-12, recorded in execute.ts): "An
 * execute is the process of killing a unit by dealing 100% of their CURRENT health through the
 * raw damage source type." So the figure is the health they had, delivered as the type the
 * instance deals — and the caller has already been refused if it deals more than one.
 *
 * The larger of the two figures wins: an ability that would have dealt more than the target had
 * left keeps its own number, so overkill stays visible rather than being trimmed to a kill.
 */
function applyExecute(
  redByType: DamageByType,
  types: DamageType[],
  healthBefore: number,
): DamageByType {
  const out = { ...redByType };
  const type = types[0];
  if (type === undefined) return out;
  out[type] = Math.max(out[type], healthBefore);
  return out;
}

// ---------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------

function roundByType(byType: DamageByType): DamageByType {
  return {
    physical: roundDamage(byType.physical),
    magic: roundDamage(byType.magic),
    true: roundDamage(byType.true),
  };
}

/**
 * The survival verdict against one damage figure.
 *
 * `lethalAtInstance` IS ALWAYS WALKED FROM THE BURST INSTANCES ALONE, in both verdicts, and
 * that is deliberate. A damage-over-time effect is delivered "following the combo" (§3.8) and
 * is not an instance, so it has no instance to point at. The consequences are:
 *   - if the burst alone reaches the defender's health at instance N, both verdicts say N,
 *     because burst plus DoT also reaches it at N;
 *   - if only the DoT tips the total over, the burst-plus-DoT verdict is lethal with a
 *     `lethalAtInstance` of null — nothing in the combo killed, the burn did.
 * Naming an instance in that second case would state a wrong fact confidently.
 */
function verdict(
  defenderHp: number,
  damageUnrounded: number,
  /** What each instance ACTUALLY applied to health, in order, unrounded. A shield stands
   *  between the damage and the health, so this is not the same as `afterReductions`. */
  appliedPerInstance: number[],
): SurvivalVerdict {
  let lethalAtInstance: number | null = null;
  let cumulative = 0;
  for (let index = 0; index < appliedPerInstance.length; index += 1) {
    cumulative += appliedPerInstance[index];
    if (cumulative >= defenderHp) {
      lethalAtInstance = index + 1;
      break;
    }
  }
  return {
    defenderHp,
    damageApplied: roundDamage(damageUnrounded),
    lethal: damageUnrounded >= defenderHp,
    lethalAtInstance,
    remainingHp: roundDamage(Math.max(0, defenderHp - damageUnrounded)),
  };
}

/**
 * The worst verification status among everything that contributed (`Result.verificationSummary`).
 *
 * 'no-damage' is not a claim about numbers — it says there are none to make one about
 * (data.ts) — so it never drags a summary down, and it is the answer when nothing contributed
 * at all. The engine never invents 'verified': that value can only appear here because every
 * contributing entry already carried it.
 */
const STATUS_SEVERITY: Record<VerificationStatus, number> = {
  'no-damage': 0,
  verified: 1,
  derived: 2,
  incomplete: 3,
};

function worstStatus(statuses: VerificationStatus[]): VerificationStatus {
  return statuses.reduce<VerificationStatus>(
    (worst, status) => (STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst),
    'no-damage',
  );
}
