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
// THREE CONTRACT LIMITS THIS FILE HITS AND DOES NOT WORK AROUND. Each is raised to the lead
// rather than papered over, and each shows up to the user rather than vanishing:
//   A. `InstanceResult` carries ONE `damageType`. An instance whose components disagree cannot
//      be represented, so it is REFUSED (`incomplete`, zero damage, named in
//      `incompleteContributors`) rather than having a type picked for it.
//   B. `InstanceResult` has no field between `raw` and `afterResistances`, so PRE-MITIGATION
//      flat damage reduction has nowhere honest to go. Not modelled; named in
//      `ENGINE_EXCLUSIONS`.
//   C. `StatBlock` carries no base/bonus armor split, so percentage BONUS armor penetration
//      cannot be resolved. Not modelled; named in `ENGINE_EXCLUSIONS`.

import type { AbilityComponent, DamageType, InstanceType, VerificationStatus } from '../types';
import type {
  DamageByType,
  IncompleteReason,
  InstanceResult,
  Result,
  StatBlock,
  SurvivalVerdict,
} from '../types/result';
import type { Scenario } from '../types/scenario';

import { applyCriticalStrike } from './crit';
import { ComponentEvaluationError, evaluateComponent } from './component';
import { applyDamageReductions, type DefenderDamageReduction } from './damage-reduction';
import { applyResistance, effectiveResistance } from './resistances';
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
 * Penetration the ATTACKER'S BUILD supplies. Constant for the whole sequence.
 *
 * Steps 3 and 4 of the fixed order in §3.6. It lives here rather than in state because it does
 * not accumulate: a champion's lethality does not grow because they landed an ability.
 * Reduction (shred), which does accumulate, lives in `CombatState`.
 *
 * NOT ON `StatBlock`: the frozen contract carries no penetration fields, so it is passed
 * beside it. Raised to the lead.
 */
export interface StaticPenetration {
  /** Fraction of 1: 40% penetration is 0.4. */
  percentPenetration?: number;
  /** Flat penetration — lethality on the armor side. */
  flatPenetration?: number;
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
}

export interface ComboPlan {
  patch: string;
  /** Echoed into the Result for sharing, and read for the two champions' entry state. */
  scenario: Scenario;
  /** Both stat blocks, ALREADY folded with persistent accumulations (§3.3). */
  attacker: StatBlock;
  defender: StatBlock;
  /** Steps 3 and 4 of §3.6, from the attacker's build. */
  attackerPenetration?: { armor?: StaticPenetration; magicResist?: StaticPenetration };
  /** The defender's post-mitigation reductions (§3.7, §5). */
  defenderReductions?: DefenderDamageReduction[];
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
  'Pre-mitigation flat damage reduction (for example Amumu Tantrum, Fizz Nimble Fighter) — ' +
    'the result has no field for it between raw damage and resistances',
  'Percentage BONUS armor penetration — the stat block carries no base/bonus armor split',
  'Shields, of any of the three kinds',
  'Damage amplification, additive or multiplicative',
  'Lifesteal, omnivamp and spell vamp on the attacker, and healing on the defender',
  'Execute thresholds',
  'Ability ratios that read health, resistances, mana or a stack counter — an instance ' +
    'carrying one contributes no damage and is listed as incomplete',
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
  const perInstance: InstanceResult[] = [];
  const runningTotal: number[] = [];
  const incompleteContributors: Result['incompleteContributors'] = [];
  const burstByType: DamageByType = { physical: 0, magic: 0, true: 0 };
  const dotByType: DamageByType = { physical: 0, magic: 0, true: 0 };
  const dotSources: Result['dot']['sources'] = [];
  const statuses: VerificationStatus[] = [];

  // Every instance, in order. Nothing here looks ahead.
  plan.instances.forEach((instance, position) => {
    const instanceNumber = combat.instancesResolved + 1;
    const damagingInstanceNumber = combat.damagingInstancesResolved + 1;

    const resolved = resolveDamage(instance.damage, plan.attacker, instance);
    const damageType: DamageType = resolved.damageType ?? NO_DAMAGE_TYPE;

    const afterResistances =
      resolved.raw === 0
        ? 0
        : mitigate(resolved.raw, damageType, plan.defender, combat.defenderShred, plan.attackerPenetration);

    const afterReductions =
      resolved.raw === 0
        ? 0
        : applyDamageReductions(afterResistances, reductions, damagingInstanceNumber, damageType);

    const snapshot = {
      ...snapshotCombatState(combat, persistent, instanceNumber, damagingInstanceNumber),
      defenderEffectiveArmor: effectiveResistanceFor('physical', plan.defender, combat.defenderShred, plan.attackerPenetration),
      defenderEffectiveMagicResist: effectiveResistanceFor('magic', plan.defender, combat.defenderShred, plan.attackerPenetration),
    };

    perInstance.push({
      index: position + 1,
      stepId: instance.stepId,
      sourceLabel: instance.sourceLabel,
      icon: instance.icon ?? null,
      instanceType: instance.instanceType,
      damageType,
      raw: resolved.raw,
      afterResistances,
      afterReductions,
      // THE ONE ROUNDING CALL for an instance. Never fed back into the arithmetic below.
      final: roundDamage(afterReductions),
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
    burstByType[damageType] += afterReductions;
    combat = {
      ...combat,
      cumulativeBurst: combat.cumulativeBurst + afterReductions,
      defenderCurrentHp: combat.defenderCurrentHp - afterReductions,
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
    const resolved = resolveDamage(dot.damage, plan.attacker, dot);
    const damageType: DamageType = resolved.damageType ?? NO_DAMAGE_TYPE;
    const afterResistances =
      resolved.raw === 0
        ? 0
        : mitigate(resolved.raw, damageType, plan.defender, combat.defenderShred, plan.attackerPenetration);
    const afterReductions =
      resolved.raw === 0
        ? 0
        : applyDamageReductions(afterResistances, reductions, null, damageType);

    dotByType[damageType] += afterReductions;
    dotSources.push({
      label: dot.label,
      icon: dot.icon ?? null,
      damageType,
      total: roundDamage(afterReductions),
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
      burstOnly: verdict(plan.defender.hp, burstTotalUnrounded, perInstance),
      burstPlusDot: verdict(
        plan.defender.hp,
        burstTotalUnrounded + dotTotalUnrounded,
        perInstance,
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

/**
 * The damage type an instance carries when it has none of its own — a non-damaging ability,
 * or one refused before its type could be read.
 *
 * The frozen `InstanceResult.damageType` is required and has no "none" member. `'true'` is
 * chosen because it is the type that applies no mitigation, so a zero figure carrying it
 * cannot be silently mis-mitigated by anything downstream. RAISED TO THE LEAD: the contract
 * has no way to say "this instance dealt no damage of any type".
 */
const NO_DAMAGE_TYPE: DamageType = 'true';

interface ResolvedDamage {
  damageType: DamageType | null;
  /** Pre-mitigation, unrounded. Zero whenever the instance was refused (§8). */
  raw: number;
  status: VerificationStatus;
  reason?: IncompleteReason;
  /** True when the runner refused it, as opposed to the plan already calling it incomplete. */
  refused: boolean;
}

function resolveDamage(
  damage: PlannedDamage | undefined,
  attacker: StatBlock,
  planned: { verification: VerificationStatus; incompleteReason?: IncompleteReason },
): ResolvedDamage {
  // SPECIFICATION §8: an incomplete ability contributes NO damage. That is the status's whole
  // meaning — a figure is absent rather than wrong. `result.ts` adds the fallback rule: an
  // incomplete entry with no stated reason is 'pending', never 'permanent'.
  if (planned.verification === 'incomplete') {
    return {
      damageType: damage ? soleDamageType(damage) : null,
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
    return { damageType: null, raw: 0, status: planned.verification, refused: false };
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

  // One instance carries exactly one damage type (limit A in the header).
  const types = Array.from(new Set(selected.map((c) => c.damageType))).sort();
  if (types.length > 1) {
    reasons.push(
      `its components carry more than one damage type (${types.join(', ')}), and one instance ` +
        'in the result carries exactly one',
    );
  }
  const damageType: DamageType | null = types.length === 1 ? types[0] : null;

  // Evaluate each selected component.
  let raw = 0;
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
      value = evaluateComponent(component, {
        rank: damage.rank,
        maxRank: damage.maxRank,
        level: attacker.level,
        caster: attacker,
      }).raw;
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
    raw += value;
  }

  if (reasons.length > 0) {
    return {
      damageType,
      raw: 0,
      status: 'incomplete',
      reason: { kind: 'pending', note: reasons.join('; ') },
      refused: true,
    };
  }

  // Crit is a decision the combo makes, not a dice roll (crit.ts).
  if (damage.crit) raw = applyCriticalStrike(raw, true, attacker.critDamage);

  return { damageType, raw, status: planned.verification, refused: false };
}

/** The single damage type of a payload, or null when its components disagree or it has none. */
function soleDamageType(damage: PlannedDamage): DamageType | null {
  const types = Array.from(new Set(damage.components.map((c) => c.damageType)));
  return types.length === 1 ? types[0] : null;
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

/** The defender's effective resistance for a damage type, through the fixed order of §3.6. */
function effectiveResistanceFor(
  damageType: 'physical' | 'magic',
  defender: StatBlock,
  shred: { armor: ResistanceShred; magicResist: ResistanceShred },
  penetration: ComboPlan['attackerPenetration'],
): number {
  const isPhysical = damageType === 'physical';
  const base = isPhysical ? defender.armor : defender.magicResist;
  const accumulated = isPhysical ? shred.armor : shred.magicResist;
  const pen = (isPhysical ? penetration?.armor : penetration?.magicResist) ?? {};

  return effectiveResistance(base, {
    // Steps 1 and 2 — REDUCTION, which accumulates as the combo runs.
    flatReduction: totalFlatReduction(accumulated),
    percentReduction: combinedPercentReduction(accumulated),
    // Steps 3 and 4 — PENETRATION, from the attacker's build, constant for the sequence.
    percentPenetration: pen.percentPenetration,
    flatPenetration: pen.flatPenetration,
  });
}

function mitigate(
  raw: number,
  damageType: DamageType,
  defender: StatBlock,
  shred: { armor: ResistanceShred; magicResist: ResistanceShred },
  penetration: ComboPlan['attackerPenetration'],
): number {
  // True damage bypasses both resistances (§3.6).
  if (damageType === 'true') return raw;
  return applyResistance(
    raw,
    damageType,
    effectiveResistanceFor(damageType, defender, shred, penetration),
  );
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
  perInstance: InstanceResult[],
): SurvivalVerdict {
  let lethalAtInstance: number | null = null;
  let cumulative = 0;
  for (const instance of perInstance) {
    cumulative += instance.afterReductions;
    if (cumulative >= defenderHp) {
      lethalAtInstance = instance.index;
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
