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
  DamageTotals,
  IncompleteReason,
  InstanceResult,
  ResistanceSteps,
  Result,
  StatBlock,
  SurvivalVerdict,
  SustainSource,
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
import { roundDamage, roundSplit } from './rounding';
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
  /**
   * THE HOLDER'S RANGE TYPE, for a value stated as two numbers chosen by who holds it. Added
   * 2026-08-14 with the on-hit riders.
   *
   * `byRangeType` says "12 for melee holders, 8 for ranged" and `valueAt` REFUSES it unless a
   * range type is supplied — it never picks one, because either choice is wrong for half the
   * roster (DATA-SOURCES §39). Blade of the Ruined King's on-hit is the live case.
   *
   * Absent is a real state: nothing states it, and a range-split value is then refused rather
   * than resolved to a guess.
   */
  rangeType?: 'Melee' | 'Ranged';
}

/**
 * HEALTH RESTORED, as the layer above states it (SPECIFICATION §3.7).
 *
 * `restoresTo` decides which side's total it lands in and whether it can touch the verdict at
 * all: the ATTACKER's sustain changes whether the attacker lives, which this product does not
 * ask about. Only the defender's healing enters the verdict.
 */
export interface PlannedSustain {
  label: string;
  icon?: string | null;
  kind: 'lifesteal' | 'omnivamp' | 'spell-vamp' | 'heal';
  restoresTo: 'attacker' | 'defender';
  /** Health restored, unrounded. Rounded once at the totals, exactly as damage is (§41.1). */
  amount: number;
  verification: VerificationStatus;
  incompleteReason?: IncompleteReason;
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
  /** The instance this one rode on, by `stepId`. Presentational only — see InstanceResult. */
  carriedBy?: string;
  /**
   * Health this instance restores, to either champion. PLACED healing: it resolves immediately
   * after this instance's damage, in this instance's position, because that is the only place
   * the source supports — the heal arose from this instance.
   */
  sustain?: PlannedSustain[];
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
  /**
   * Healing the sequence CANNOT PLACE — a defensive kit heal that is not a response to any hit,
   * so no instance owns it and §3.2 gives the engine no axis on which to put it between two.
   *
   * IT IS TREATED AS AVAILABLE FROM THE START, which is the most generous reading for the
   * defender and therefore the one that says "your combo kills" LESS often. That is the same
   * safe direction §38.4 chose for variable hit counts, and it is a stated assumption rather
   * than a fact: `ENGINE_EXCLUSIONS` discloses it on every result.
   */
  unplacedSustain?: PlannedSustain[];
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

  // THE REASON CHANGED TWICE. First from "nowhere to put it" to "nothing to put there"; now the
  // runner MODELS it and what is disclosed is the one assumption inside the model.
  'Healing the sequence cannot place — a defensive effect that is not a response to any hit, so ' +
    'no instance owns it. It is treated as available from the START of the combo, which is the ' +
    'reading most generous to the defender and therefore says "this kills" less often than a ' +
    'later placement would. Healing that IS owned by an instance resolves at that instance, and ' +
    'healing after the kill does not resurrect',

  // SAME KIND OF CHANGE. `StatBlock` now carries `maxHpBase`/`maxHpBonus` and optional mana, so
  // a bonus-health ratio resolves. Mana waits on ONE fetched field, named here rather than
  // described vaguely, because a reader can act on a named field.
  'Ability ratios that read MANA — the stat block carries mana only for a champion whose ' +
    'resource IS mana, and the champion fetch does not yet carry the wiki module\'s `resource` ' +
    'field. 19 of its 175 entries state a non-mana resource with a non-zero `mp_base` (Shen 400 ' +
    'energy, Yone 500 flow), so the pool alone cannot be read as mana. Ratios on the health ' +
    'pools including BONUS health, armor, magic resistance and stack counters ARE modelled',

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
  const runningTotal: DamageTotals[] = [];
  const incompleteContributors: Result['incompleteContributors'] = [];
  const burstByType: DamageByType = { physical: 0, magic: 0, true: 0 };
  const dotByType: DamageByType = { physical: 0, magic: 0, true: 0 };
  const dotSources: Result['dot']['sources'] = [];
  const statuses: VerificationStatus[] = [];
  /** Damage each instance ACTUALLY applied to health, unrounded, for the survival verdict. */
  const appliedPerInstance: number[] = [];
  /** Health the DEFENDER regained AT each instance, unrounded, in the same positions. Placed
   *  healing resolves after its own instance's damage, so index i pairs with index i above. */
  const defenderHealedAtInstance: number[] = [];
  const sustainSources: SustainSource[] = [];
  // Healing no instance owns (`ComboPlan.unplacedSustain`). It is reported on the sustain line
  // with `fromInstance: null` — the field exists precisely to say "this has no position" — and
  // is available from the start of the verdict's walk.
  let unplacedDefenderHealing = 0;
  for (const source of plan.unplacedSustain ?? []) {
    const amount = source.verification === 'incomplete' ? 0 : source.amount;
    if (source.restoresTo === 'defender') unplacedDefenderHealing += amount;
    sustainSources.push({
      label: source.label,
      icon: source.icon ?? null,
      kind: source.kind,
      restoresTo: source.restoresTo,
      amount,
      fromInstance: null,
      verification: source.verification,
      ...(source.incompleteReason ? { incompleteReason: source.incompleteReason } : {}),
    });
  }

  // The defender's shields, spent as the sequence runs. They are combat state in every sense,
  // and they live here rather than in `CombatState` because state.ts holds a deliberately small
  // vocabulary of counters and shreds; a shield is a pool with a kind, not a counter.
  let shields: ShieldPool[] = (plan.defenderShields ?? []).map((s) => ({ ...s }));

  // Every instance, in order. Nothing here looks ahead.
  // A DOT APPLICATION IS NOT A BURST INSTANCE (added 2026-08-14).
  //
  // An item burn registers damage over time and lands no burst damage of its own. It must not
  // occupy a numbered position in the sequence, because that would put a zero-damage row in the
  // breakdown and a zero-height column in the burndown for something that never hit at that
  // moment — and §3.8 keeps the DoT out of the burst total entirely.
  //
  // The DoT loop below reads `plan.instances` directly, so these are still resolved in full.
  // A NON-DAMAGING ABILITY IS NOT AFFECTED: it has no dot, still occupies its position (§3.4).
  const burstInstances = plan.instances.filter(
    (i) => !(i.instanceType === 'dot-application' && i.damage === undefined),
  );

  burstInstances.forEach((instance, position) => {
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
      ...(instance.carriedBy ? { carriedBy: instance.carriedBy } : {}),
      sourceLabel: instance.sourceLabel,
      icon: instance.icon ?? null,
      instanceType: instance.instanceType,
      damageType: reported,
      // A MIXED INSTANCE'S SPLIT SUMS TO ITS OWN `final` (roundSplit, 2026-08-13). DESIGN.md §8
      // renders it bone and untagged with a tagged composition bar, so the bar's segments and
      // the number above them have to be the same quantity.
      ...(reported === 'mixed' ? { byType: roundSplit(appliedByType).byType } : {}),
      raw,
      afterPreMitigationReduction: total(preByType),
      afterResistances: total(resByType),
      ...(steps ? { resistanceSteps: steps } : {}),
      afterReductions: total(redByType),
      // THE ONE ROUNDING CALL for an instance. Never fed back into the arithmetic below.
      // It is the damage that reached HEALTH: what a shield absorbed did not.
      // `applied` IS the sum of `appliedByType` (line above), so this and the split's own total
      // are the same figure by construction — the two can never drift apart.
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
    // PLACED HEALING RESOLVES HERE — after this instance's damage, in this instance's position.
    // It is the only placement the source supports: the heal arose from this instance, so it
    // cannot have been available before it.
    let healedHere = 0;
    for (const source of instance.sustain ?? []) {
      // An incomplete sustain source restores NOTHING and says why, exactly as an incomplete
      // damage instance deals nothing and says why (SPECIFICATION §8).
      const amount = source.verification === 'incomplete' ? 0 : source.amount;
      if (source.restoresTo === 'defender') healedHere += amount;
      sustainSources.push({
        label: source.label,
        icon: source.icon ?? null,
        kind: source.kind,
        restoresTo: source.restoresTo,
        amount,
        fromInstance: instanceNumber,
        verification: source.verification,
        ...(source.incompleteReason ? { incompleteReason: source.incompleteReason } : {}),
      });
    }
    // CAPPED AT MAXIMUM. A champion cannot exceed their maximum health, so healing past it is
    // WASTED — a real quantity a theorycrafter wants, reported by the interface from the same
    // two numbers rather than invented here. The cap also stops a missing-health ratio in a
    // later instance going negative.
    const roomToHeal = Math.max(0, plan.defender.maxHp - combat.defenderCurrentHp);
    const effectiveHeal = Math.min(healedHere, roomToHeal);
    defenderHealedAtInstance.push(effectiveHeal);
    combat = { ...combat, defenderCurrentHp: combat.defenderCurrentHp + effectiveHeal };

    // THE POINT CARRIES ITS SPLIT (added 2026-08-13). `burstByType` has just been advanced by
    // this instance, so it is the cumulative split at exactly this point in the sequence.
    // Rounding follows the §41.1 rule everywhere: each figure is rounded ONCE from the running
    // unrounded quantity, never summed from figures already rounded. So the three rounded types
    // may differ from the rounded total by a point — the same deliberate consequence the
    // per-instance column has, and the reason the audit compares them at the unrounded source.
    runningTotal.push(roundSplit(burstByType));

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

  const dotTotalUnrounded = dotByType.physical + dotByType.magic + dotByType.true;

  return {
    patch: plan.patch,
    scenario: plan.scenario,
    attackerStats: plan.attacker,
    defenderStats: plan.defender,
    perInstance,
    runningTotal,
    burst: roundSplit(burstByType),
    dot: {
      ...roundSplit(dotByType),
      sources: dotSources,
    },
    // SUSTAIN (SPECIFICATION §3.7). An empty `sources` list is what distinguishes "we computed
    // nothing" from "we computed that nothing was restored".
    sustain: {
      attackerHealing: roundDamage(
        sustainSources.filter((x) => x.restoresTo === 'attacker').reduce((n, x) => n + x.amount, 0),
      ),
      defenderHealing: roundDamage(
        sustainSources.filter((x) => x.restoresTo === 'defender').reduce((n, x) => n + x.amount, 0),
      ),
      sources: sustainSources,
    },
    // The verdict, twice (§3.8): burst alone, and burst plus full DoT resolution.
    verdict: {
      burstOnly: verdict(
        plan.defender.hp,
        plan.defender.maxHp,
        appliedPerInstance,
        defenderHealedAtInstance,
        unplacedDefenderHealing,
        0,
      ),
      burstPlusDot: verdict(
        plan.defender.hp,
        plan.defender.maxHp,
        appliedPerInstance,
        defenderHealedAtInstance,
        unplacedDefenderHealing,
        dotTotalUnrounded,
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
 * ALL TEN OWNER-BEARING STATS ARE NOW PASSED THROUGH, where the stat block has them (changed
 * 2026-08-13). Bonus health arrives on `maxHpBonus`, because it is maximum health minus the
 * champion's own base at that level and CANNOT be derived from a total; mana arrives only when
 * the champion's resource is mana, which is why both mana fields are optional here and absent
 * rather than zero. A ratio reading a stat the block does not carry is still refused BY NAME,
 * which is the behaviour that must survive: an absent figure produces a named refusal, never a 0.
 */
function statsView(block: StatBlock, currentHp: number): OwnedStats {
  return {
    attackDamage: block.attackDamage,
    abilityPower: block.abilityPower,
    maxHP: block.maxHp,
    currentHP: currentHp,
    bonusHP: block.maxHpBonus,
    armor: block.armor,
    bonusArmor: block.armorBonus,
    magicResist: block.magicResist,
    bonusMagicResist: block.magicResistBonus,
    ...(block.maxMana !== undefined ? { maxMana: block.maxMana } : {}),
    ...(block.mana !== undefined ? { currentMana: block.mana } : {}),
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
    ...(damage.rangeType ? { rangeType: damage.rangeType } : {}),
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
  /** The defender's maximum. Healing is capped at it; a verdict may never report more health
   *  remaining than the champion can hold. */
  defenderMaxHp: number,
  /** What each instance ACTUALLY applied to health, in order, unrounded. A shield stands
   *  between the damage and the health, so this is not the same as `afterReductions`. */
  appliedPerInstance: number[],
  /** What the defender regained AT each instance, in the same positions, already capped at
   *  maximum health. Index i resolves AFTER `appliedPerInstance[i]`. */
  healedPerInstance: number[],
  /** Healing no instance owns. Available from the start — see `ComboPlan.unplacedSustain`. */
  unplacedHealing: number,
  /** Damage delivered AFTER the whole sequence, with no healing behind it: the DoT line, or 0
   *  for the burst-only verdict. */
  trailingDamage: number,
): SurvivalVerdict {
  // THE WALK, AND WHY IT IS A WALK. Healing used to be added to the defender's health in one
  // lump before the first instance, which is wrong in one direction that matters: A HEAL THAT
  // ARRIVES AFTER THE KILL CANNOT RESURRECT. Dead is dead at the crossing, so the loop STOPS
  // there and every later heal is simply not counted. Corrected 2026-08-14.
  //
  // Unplaced healing is the exception, and it is an exception on purpose: no instance owns it,
  // so there is nowhere honest to put it, and treating it as available from the start is the
  // reading most generous to the defender — the one that says "your combo kills" LESS often.
  // Stated in ENGINE_EXCLUSIONS rather than assumed silently.
  let pool = Math.min(defenderMaxHp, defenderHp + unplacedHealing);
  let healingCounted = Math.min(defenderMaxHp - defenderHp, unplacedHealing);
  let lethalAtInstance: number | null = null;

  for (let index = 0; index < appliedPerInstance.length; index += 1) {
    pool -= appliedPerInstance[index]!;
    if (pool <= 0) {
      lethalAtInstance = index + 1;
      break;
    }
    // Only reached when the defender survived this instance, which is what makes a later heal
    // unable to undo an earlier kill.
    const healed = healedPerInstance[index] ?? 0;
    const room = Math.max(0, defenderMaxHp - pool);
    const effective = Math.min(healed, room);
    pool += effective;
    healingCounted += effective;
  }

  // The trailing line lands on whatever survived the sequence. Nothing heals after it: §3.8 puts
  // damage over time "following the combo", and there is no instance left to carry a heal.
  if (lethalAtInstance === null && trailingDamage > 0) pool -= trailingDamage;

  const lethal = lethalAtInstance !== null || pool <= 0;
  const damageUnrounded = appliedPerInstance.reduce((n, d) => n + d, 0) + trailingDamage;

  return {
    defenderHp,
    damageApplied: roundDamage(damageUnrounded),
    // What actually entered THIS verdict's arithmetic, which is not always everything the
    // sustain line reports: healing beyond the kill, and healing past maximum, did not happen.
    healingApplied: roundDamage(healingCounted),
    lethal,
    lethalAtInstance,
    remainingHp: lethal ? 0 : roundDamage(Math.max(0, pool)),
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
