// Barrel for the calculation engine.
//
// TWO LAYERS LIVE HERE.
//
// 1. The FORMULA LAYER — the deterministic arithmetic primitives of SPECIFICATION §3.6 and
//    §3.7: resistances, the fixed four-step modifier order, adaptive force, crit, execute,
//    per-level champion statistics, the component evaluator, and rounding.
//
// 2. The SEQUENTIAL COMBO RUNNER of SPECIFICATION §3.1 — `runCombo(plan) -> Result`, plus the
//    state model it runs against. This is what makes the engine a simulator rather than a
//    calculator: instances resolve in order against state the preceding ones produced.
//
// 3. THE PUBLIC ENTRY POINT — `simulate(scenario, catalogue) -> Result` (simulate.ts, added
//    2026-08-14). It turns a Scenario into a ComboPlan by looking up champions, items and
//    abilities. It STILL reads no data file: the data arrives as a `Catalogue` the caller
//    builds, so the rule that the engine opens nothing is kept.
//
// What is NOT modelled, and why, is written up beside each item. The authoritative list is
// ENGINE_EXCLUSIONS in combo.ts, which is attached to every Result (SPECIFICATION §11):
//   - Lifesteal, omnivamp, spell vamp and healing — the frozen `Result` has no field to report
//     sustain in, so a figure for it would be one no user ever sees. RAISED TO THE LEAD.
//   - Ability ratios reading MANA or BONUS HEALTH — the frozen `StatBlock` carries neither.
//     RAISED TO THE LEAD. Ratios on the health pools, armor, magic resistance and stack
//     counters ARE modelled.
//   - The four-step breakdown for an instance dealing both physical and magic — two chains,
//     one `resistanceSteps` field. The damage itself is fully modelled.
//   - A minimum damage floor (SPECIFICATION §3.7 lists one) — no game-wide rule for it
//     could be found in the wiki's damage or mechanics articles, so nothing is implemented
//     rather than guessing a plausible number. Raised to the lead.

export { roundDamage } from './rounding';

export {
  resistanceMultiplier,
  applyResistance,
  effectiveResistance,
  resolveResistanceSteps,
  type ResistanceModifiers,
  type SplitResistance,
} from './resistances';

// Damage amplification, in the two forms SPECIFICATION §3.7 asks to be kept distinct: the
// attacker's modifiers stack ADDITIVELY on the raw figure, the defender's MULTIPLICATIVELY on
// the mitigated one. Two mechanics, not two settings.
export {
  dealtModifierMultiplier,
  receivedModifierMultiplier,
  type DamageDealtModifier,
  type DamageReceivedModifier,
} from './amplification';

// Shields — general, physical and magic. A shield is not a damage reduction: it absorbs true
// damage, which no flat reduction touches.
export {
  absorbsDamageType,
  applyShields,
  totalShieldRemaining,
  type ShieldKind,
  type ShieldOutcome,
  type ShieldPool,
} from './shields';

export {
  resolveAdaptiveForce,
  ADAPTIVE_BONUS_AD_PER_POINT,
  ADAPTIVE_AP_PER_POINT,
  type AdaptiveComparison,
  type AdaptiveResolution,
} from './adaptive';

export {
  BASE_CRITICAL_STRIKE_MULTIPLIER,
  criticalStrikeMultiplier,
  applyCriticalStrike,
  averageDamageWithCrit,
} from './crit';

export { isExecuted, healthThresholdFromMaxHealth } from './execute';

// The component model: one stored AbilityComponent -> one pre-mitigation damage figure.
// It resolves a flat base plus any number of caster-only ratios (base/bonus/total attack
// damage and ability power) on either the rank or the champion-level axis, and multiplies by
// the component's own hit count. Anything it cannot resolve it REFUSES; `unsupportedReasons`
// gives the same answer without throwing, so the exclusion can be counted across a data set.
export {
  evaluateComponent,
  evaluateComponents,
  unsupportedReasons,
  isCoreRatioStat,
  CORE_RATIO_STATS,
  ComponentEvaluationError,
  type CasterStats,
  type ComponentContext,
  type ComponentDamage,
  type CoreRatio,
  type CoreRatioStat,
  type OwnedStats,
  type RatioContribution,
} from './component';

// Per-level champion statistics. League's growth is not linear; the formula and the level-18
// identity it is checked against are documented in champion-stats.ts.
export {
  championStatAtLevel,
  growthMultiplier,
  resolveBaseStats,
  type ChampionBaseStats,
} from './champion-stats';

// Variable hit counts: the user's stated count becomes instances (DATA-SOURCES §38). The
// default is the MINIMUM and is not a tuning knob.
export { resolveVariableHits, MINIMUM_STATED_COUNT, type ResolvedHits } from './variable-hits';

// ---------------------------------------------------------------------------------------
// The sequential layer (SPECIFICATION §3.1, §3.3)
// ---------------------------------------------------------------------------------------

// The state model. Persistent accumulations and combat state are two objects with two
// lifetimes, because §3.3 says they behave differently and collapsing them is a real
// modelling error.
export {
  applyStateEffect,
  applyStateEffects,
  combinedPercentReduction,
  emptyShred,
  foldPersistentAccumulations,
  seedCombatState,
  seedFromConfigs,
  snapshotCombatState,
  totalFlatReduction,
  type CombatState,
  type PersistentState,
  type ResistanceShred,
  type SequenceState,
  type SideState,
  type StateEffect,
} from './state';

// Post-mitigation damage reduction on the defender, including the instance-window form that
// SPECIFICATION §5 names (Bone Plating).
export {
  applyDamageReductions,
  reductionApplies,
  type DefenderDamageReduction,
} from './damage-reduction';

// The combo runner itself.
export {
  runCombo,
  ENGINE_EXCLUSIONS,
  type ComboPlan,
  type PlannedDamage,
  type PlannedDot,
  type PlannedExecute,
  type PlannedInstance,
  type PreMitigationReduction,
  type StaticPenetration,
} from './combo';

// The public entry point. A Scenario and a Catalogue in; a Result, or a refusal that names the
// thing that is missing, out.
export {
  simulate,
  buildStatBlock,
  SIMULATION_EXCLUSIONS,
  type Catalogue,
  type SimulationRefusal,
  type SimulationResult,
} from './simulate';
